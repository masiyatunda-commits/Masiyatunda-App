import { RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { liveRooms, liveMembers } from '../db/schema.js';
import { livekitConfig, roomPermissions } from '../lib/livekit.js';

export default async function handler(request: Request) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (request.method !== 'POST') return new Response(null, { status: 405, headers });
  const configuration = livekitConfig();
  if (!configuration) return new Response(null, { status: 503, headers });
  if (Number(request.headers.get('Content-Length')) > 65536) return new Response(null, { status: 413, headers });
  const body = await request.text();
  if (body.length > 65536) return new Response(null, { status: 413, headers });
  const { apiKey, apiSecret, serviceUrl } = configuration;
  let event;
  try { event = await new WebhookReceiver(apiKey, apiSecret).receive(body, request.headers.get('Authorization') || ''); }
  catch { return new Response(null, { status: 401, headers }); }
  const room = event.room?.name;
  if (!room?.startsWith('mw-conversation-')) return new Response(null, { status: 204, headers });
  try {
    const service = new RoomServiceClient(serviceUrl, apiKey, apiSecret);
    await db.transaction(async transaction => {
      const [settings] = await transaction.select().from(liveRooms).where(eq(liveRooms.room, room)).for('update');
      if (!settings) return;
      if (event.event === 'room_finished' || event.event === 'participant_left' && event.participant?.identity === settings.hostId) {
        if (!settings.endedAt) await transaction.update(liveRooms).set({ endedAt: new Date(), featuredId: null, lifecycleStatus: settings.startedAt ? 'interrupted' : 'failed' }).where(eq(liveRooms.room, room));
        if (event.event === 'participant_left') {
          try { await service.deleteRoom(room); }
          catch (error) { if ((error as { code?: string }).code !== 'not_found') throw error; }
        }
        return;
      }
      if (event.event === 'participant_joined' && event.participant?.identity) {
        const identity = event.participant.identity;
        const [member] = await transaction.select().from(liveMembers).where(and(eq(liveMembers.room, room), eq(liveMembers.userId, identity)));
        if (settings.endedAt || !member || ['banned', 'removed'].includes(member.state)) {
          try { await service.removeParticipant(room, identity, { revokeTokenTs: BigInt(Math.ceil(Date.now() / 1000)) }); }
          catch (error) { if ((error as { code?: string }).code !== 'not_found') throw error; }
        } else {
          try { await service.updateParticipant(room, identity, { permission: roomPermissions({ ...member, state: settings.admission === 'broadcast' && identity !== settings.hostId ? 'viewer' : member.state }, room.startsWith('mw-conversation-audio-')) }); }
          catch (error) { if ((error as { code?: string }).code !== 'not_found') throw error; }
        }
      }
      if (event.event === 'participant_left' && event.participant?.identity && event.participant.identity !== settings.hostId && !settings.endedAt) {
        const participants = await service.listParticipants(room).catch((error: { code?: string }) => { if (error.code === 'not_found') return [];throw error; });
        const identity = event.participant.identity;
        if (!participants.some(participant => participant.identity === identity)) {
          await transaction.update(liveMembers).set({ state: 'viewer' }).where(and(eq(liveMembers.room, room), eq(liveMembers.userId, identity), inArray(liveMembers.state, ['speaker', 'pending'])));
          if (settings.featuredId === identity) await transaction.update(liveRooms).set({ featuredId: null }).where(eq(liveRooms.room, room));
        }
      }
    });
    return new Response(null, { status: 204, headers });
  } catch { return new Response(null, { status: 503, headers }); }
}
