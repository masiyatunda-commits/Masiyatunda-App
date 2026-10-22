import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { liveRooms, liveMembers } from '../db/schema.js';
import { supabaseConfig } from './supabase.js';
import { roomPermissions } from './livekit.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const deny = (status: number): never => { throw Object.assign(new Error('Live authorization denied.'), { status }); };

// Decides who may join, inspect, sync or end a conversation room. Throws { status } when access is denied.
// A caller that already verified the session passes the account so it is not looked up twice.
export async function authorizeLiveRoom(request: Request, input: { roomName?: unknown; action?: unknown; target?: unknown }, verified?: { id: string }) {
  const { roomName, action, target } = input;
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) deny(401);
  if (typeof roomName !== 'string' || !/^mw-conversation-(audio|video)-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(roomName) || !['token', 'participants', 'sync', 'end'].includes(String(action)) || action === 'sync' && (typeof target !== 'string' || !uuid.test(target))) deny(400);
  const room = roomName as string;
  const { base, apiKey } = supabaseConfig(request);
  if (!base || !apiKey) deny(503);
  const authHeaders = { Authorization: authorization, apikey: apiKey };
  const query = async (path: string) => {
    const response = await fetch(`${base}/${path}`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
    if (!response.ok) deny([401, 403].includes(response.status) ? response.status : 503);
    return response.json();
  };
  const [account, [record], [settings]] = await Promise.all([
    verified || query('auth/v1/user'),
    query(`rest/v1/mw_video_live_sessions?room_name=eq.${encodeURIComponent(room)}&select=host_id,scope,is_live&limit=1`),
    db.select().from(liveRooms).where(eq(liveRooms.room, room)),
  ]);
  if (!record || !settings || record.host_id !== settings.hostId) deny(404);
  const isHost = account.id === record.host_id;
  if (action === 'sync' && !isHost && target !== account.id) deny(403);
  if (action === 'end') return isHost ? { roomName: room, hostId: record.host_id as string } : deny(403);
  if (!record.is_live || settings.endedAt) deny(404);
  if (!isHost && record.scope === 'followers') {
    const follows = await query(`rest/v1/mw_follows?follower_id=eq.${account.id}&following_id=eq.${record.host_id}&select=follower_id&limit=1`);
    if (!follows.length) deny(403);
  }
  const memberWhere = (identity: string) => and(eq(liveMembers.room, room), eq(liveMembers.userId, identity));
  const [self] = await db.select().from(liveMembers).where(memberWhere(account.id));
  if (!self || ['banned', 'removed'].includes(self.state)) deny(403);
  const [member] = action === 'sync' ? await db.select().from(liveMembers).where(memberWhere(target as string)) : [self];
  if (!member) deny(404);
  const permissions = roomPermissions({ ...member, state: settings.admission === 'broadcast' && member.userId !== record.host_id ? 'viewer' : member.state }, room.startsWith('mw-conversation-audio-'));
  return { roomName: room, identity: member.userId as string, name: member.name as string, avatar: member.avatar as string, hostId: record.host_id as string, remove: ['banned', 'removed'].includes(member.state), permissions };
}
