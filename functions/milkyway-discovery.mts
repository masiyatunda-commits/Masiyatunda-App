import { livekitRequest } from '../lib/livekit-service.js';
import { db } from '../db/index.js';
import { liveRooms } from '../db/schema.js';
import { inArray } from 'drizzle-orm';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export default async function handler(request: Request) {
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers });
  try {
    const { sessions: allowed } = await livekitRequest(request, { action: 'discovery' });
    if (!Array.isArray(allowed)) throw new Error('Invalid discovery response');
    if (!allowed.length) return Response.json({ sessions: [] }, { headers });
    const conversations = allowed.filter((record: { room_name: string }) => record.room_name.startsWith('mw-conversation-'));
    const settings = conversations.length ? await db.select().from(liveRooms).where(inArray(liveRooms.room, conversations.map((record: { room_name: string }) => record.room_name))) : [];
    const verified = allowed.filter((record: { room_name: string }) => !record.room_name.startsWith('mw-conversation-') || settings.some(setting => setting.room === record.room_name && !setting.endedAt));
    return Response.json({ sessions: verified }, { headers });
  } catch (error) {
    const known = error as { safe?: boolean; message?: string; status?: number; reason?: string };
    return Response.json({ error: known.safe ? known.message : 'Active Live sessions could not be verified. Retry.', reason: known.reason || 'discovery_unavailable' }, { status: known.status || 503, headers });
  }
}
