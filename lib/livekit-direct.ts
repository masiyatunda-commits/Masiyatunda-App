import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { livekitConfig } from './livekit.js';
import { supabaseConfig } from './supabase.js';
import { authorizeLiveRoom } from './live-authorize.js';

// The LiveKit room service, answered inside Netlify Functions with the site's existing LiveKit credentials.
// It keeps the response contract of the Supabase livekit-token function, which stays as the fallback.
export type LivekitExchange = { status: number; result: Record<string, any> };
const reply = (result: Record<string, any>, status = 200): LivekitExchange => ({ status, result: { contractVersion: 2, ...result } });
const code = (error: unknown) => (error as { code?: string }).code || '';
const ignoreMissing = (error: unknown) => { if (code(error) !== 'not_found') throw error; };

export async function livekitDirect(request: Request, body?: Record<string, any>): Promise<LivekitExchange> {
  const config = livekitConfig();
  if (!config) return body ? reply({ error: 'The Live service configuration is unavailable.' }, 503) : reply({ available: false, reason: 'configuration_missing', service: 'netlify' });
  const service = new RoomServiceClient(config.serviceUrl, config.apiKey, config.apiSecret, { requestTimeout: 8, failover: false });
  if (!body) {
    try {
      await service.listRooms(['milkyway-health-probe']);
      return reply({ available: true, reason: 'service_ready', service: 'netlify' });
    } catch (error) {
      return reply({ available: false, reason: ['unauthenticated', 'permission_denied'].includes(code(error)) ? 'provider_authentication' : code(error) === 'resource_exhausted' ? 'platform_restricted' : 'provider_unavailable', service: 'netlify' });
    }
  }
  try {
    const roomName = body.roomName || body.room;
    const { target } = body;
    const action = body.action || 'token';
    if (!['token', 'participants', 'sync', 'end', 'discovery'].includes(action)) return reply({ error: 'Invalid room action.' }, 400);
    const authorization = request.headers.get('Authorization') || '';
    const { base, apiKey } = supabaseConfig(request);
    if (!base || !apiKey) return reply({ error: 'The account service is unavailable.' }, 503);
    const queryHeaders = { apikey: apiKey, ...(authorization.startsWith('Bearer ') ? { Authorization: authorization } : {}) };
    const query = async (path: string) => {
      const response = await fetch(`${base}/${path}`, { headers: queryHeaders, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw Object.assign(new Error('Account access denied'), { status: path === 'auth/v1/user' && [401, 403].includes(response.status) ? 401 : [401, 402, 403, 429].includes(response.status) ? response.status : 503 });
      return response.json();
    };
    const account = authorization.startsWith('Bearer ') ? await query('auth/v1/user') : null;
    if (action !== 'discovery' && !account?.id) return reply({ error: 'Sign in first.' }, 401);
    if (action === 'discovery') {
      const records = await query('rest/v1/mw_video_live_sessions?is_live=eq.true&select=id,room_name,host_id,host_name,title,scope,is_live,started_at&order=started_at.desc&limit=100');
      const follows = account ? await query(`rest/v1/mw_follows?follower_id=eq.${account.id}&select=following_id`) : [];
      const allowed = records.filter((record: { scope: string; host_id: string }) => ['public', 'everyone'].includes(record.scope) || record.host_id === account?.id || record.scope === 'followers' && follows.some((follow: { following_id: string }) => follow.following_id === record.host_id));
      if (!allowed.length) return reply({ sessions: [] });
      const rooms = await service.listRooms(allowed.map((record: { room_name: string }) => record.room_name));
      const verified = await Promise.all(allowed.filter((record: { room_name: string }) => rooms.some(room => room.name === record.room_name)).map(async (record: { room_name: string; host_id: string }) => {
        const participants = await service.listParticipants(record.room_name).catch(error => { ignoreMissing(error); return []; });
        return participants.some(participant => participant.identity === record.host_id && participant.tracks.some(track => [TrackSource.CAMERA, TrackSource.MICROPHONE].includes(track.source))) ? { ...record, connectedCount: participants.length } : null;
      }));
      return reply({ sessions: verified.filter(Boolean) });
    }
    if (typeof roomName !== 'string' || !/^mw-[a-zA-Z0-9_-]{3,120}$/.test(roomName)) return reply({ error: 'Invalid room name.' }, 400);
    // Rooms are created up front so the host's settings apply before anyone joins; joining would otherwise create them implicitly.
    const createRoom = () => service.createRoom({ name: roomName, emptyTimeout: 300, departureTimeout: 60, maxParticipants: 500 }).catch(() => null);
    if (!roomName.startsWith('mw-conversation-')) {
      if (action !== 'token' || !['host', 'viewer', 'call'].includes(body.role)) return reply({ error: 'Invalid room action.' }, 400);
      if (body.identity !== account.id) return reply({ error: 'Identity does not match the signed-in account.' }, 403);
      let canPublish = false;
      let audioOnly = roomName.startsWith('mw-audio-live-') || body.mode === 'audio';
      if (body.role === 'call') {
        if (!/^mw-call-[a-f0-9-]{36}$/i.test(roomName)) return reply({ error: 'Invalid call room.' }, 400);
        const [call] = await query(`rest/v1/mw_dm_calls?id=eq.${roomName.slice(8)}&select=caller_id,callee_id,status,offer&limit=1`);
        if (!call || ![call.caller_id, call.callee_id].includes(account.id) || call.status !== 'accepted' || call.offer?.transport !== 'livekit') return reply({ error: 'Only participants in an accepted call can join.' }, 403);
        canPublish = true; audioOnly = call.offer.mode !== 'video';
      } else {
        if (roomName.startsWith('mw-call-')) return reply({ error: 'Call rooms require call authorization.' }, 403);
        const [record] = await query(`rest/v1/mw_video_live_sessions?room_name=eq.${encodeURIComponent(roomName)}&select=host_id,scope,is_live&limit=1`);
        if (!record?.is_live) return reply({ error: 'This Live session is no longer available.' }, 404);
        if (body.role === 'host' && record.host_id !== account.id) return reply({ error: 'Only the host can broadcast.' }, 403);
        if (record.scope === 'followers' && record.host_id !== account.id) {
          const follows = await query(`rest/v1/mw_follows?follower_id=eq.${account.id}&following_id=eq.${record.host_id}&select=follower_id&limit=1`);
          if (!follows.length) return reply({ error: 'This session is for followers only.' }, 403);
        }
        canPublish = body.role === 'host' && record.host_id === account.id;
        if (canPublish) await createRoom();
      }
      const token = new AccessToken(config.apiKey, config.apiSecret, { identity: account.id, name: String(body.name || 'MilkyWay user').slice(0, 80), ttl: '60s' });
      token.addGrant({ roomJoin: true, room: roomName, canSubscribe: true, canPublish, canPublishData: true, canPublishSources: canPublish ? audioOnly ? [TrackSource.MICROPHONE] : [TrackSource.CAMERA, TrackSource.MICROPHONE] : [] });
      return reply({ token: await token.toJwt(), serverUrl: config.serverUrl, roomName, room: roomName });
    }
    if (!/^mw-conversation-(audio|video)-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(roomName)) return reply({ error: 'Invalid conversation room.' }, 400);
    if (action === 'sync' && (typeof target !== 'string' || !/^[a-f0-9-]{36}$/i.test(target))) return reply({ error: 'Invalid participant.' }, 400);
    let grant: Record<string, any>;
    try { grant = await authorizeLiveRoom(request, { roomName, action, target }, account); }
    catch (error) { const status = (error as { status?: number }).status; return reply({ error: 'Live room authorization was denied or unavailable.' }, status && [401, 403, 404].includes(status) ? status : 503); }
    const permissions = action === 'end' ? null : { canSubscribe: true, canPublishData: false, canPublish: grant.permissions.canPublish === true, canPublishSources: grant.permissions.canPublishSources };
    if (action === 'token') {
      if (grant.identity === grant.hostId) await createRoom();
      const token = new AccessToken(config.apiKey, config.apiSecret, { identity: account.id, name: grant.name, metadata: JSON.stringify({ avatar: grant.avatar || '' }), ttl: '60s' });
      token.addGrant({ roomJoin: true, room: roomName, ...permissions });
      return reply({ token: await token.toJwt(), serverUrl: config.serverUrl, roomName });
    }
    if (action === 'participants') {
      try {
        const participants = await service.listParticipants(roomName);
        return reply({ participants: participants.map(participant => ({ identity: participant.identity, permission: participant.permission, tracks: (participant.tracks || []).map(track => ({ source: track.source, muted: track.muted })) })) });
      } catch (error) { ignoreMissing(error); return reply({ participants: [] }); }
    }
    if (action === 'end') {
      if (grant.hostId !== account.id) return reply({ error: 'Only the host can end Live.' }, 403);
      await service.deleteRoom(roomName).catch(ignoreMissing);
    } else if (grant.remove) await service.removeParticipant(roomName, target, { revokeTokenTs: BigInt(Math.ceil(Date.now() / 1000)) }).catch(ignoreMissing);
    else await service.updateParticipant(roomName, target, { permission: permissions! }).catch(ignoreMissing);
    return reply({ ok: true });
  } catch (error) {
    return reply({ error: 'The Live service could not complete this request. Check session access and retry.' }, (error as { status?: number }).status || 503);
  }
}
