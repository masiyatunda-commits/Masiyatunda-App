import { and, eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { liveRooms, liveMembers, liveMessages } from '../db/schema.js';
import { supabaseConfig } from '../lib/supabase.js';
import { assertActive } from '../lib/suspensions.js';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { livekitConfig, roomPermissions } from '../lib/livekit.js';
import { livekitRequest, livekitService } from '../lib/livekit-service.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status, safe: true }); };
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const validLayout = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 21;
// Multi-guest layouts plus the earlier style names, which older clients and stored rooms still use.
const layoutStyles = ['fullscreen', 'fluid-panel', 'fluid-grid', 'fixed-grid', 'side-by-side', 'spotlight', 'roundtable', 'host-top', 'host-side', 'duo', 'grid', 'focus'];
const pairLayout = (style: string) => style === 'duo' || style === 'side-by-side';
const layoutOptions = (body: Record<string, any>) => ({
  layoutStyle: body.layoutStyle ?? 'fullscreen',
  hostPosition: body.hostPosition ?? 'start',
  mobileLayout: body.mobileLayout ?? 'stack',
});
const validOptions = (options: ReturnType<typeof layoutOptions>) => layoutStyles.includes(options.layoutStyle) && ['start', 'end'].includes(options.hostPosition) && ['stack', 'compact'].includes(options.mobileLayout);

export default async function handler(request: Request) {
  if (request.method === 'GET') {
    try { return Response.json(await livekitRequest(request), { headers }); }
    catch (error) {
      const known = error as { reason?: string; status?: number };
      return Response.json({ available: false, service: 'supabase', reason: known.reason || 'network_error', status: known.status || 503 }, { headers });
    }
  }
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers });
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return Response.json({ error: 'Sign in first.' }, { status: 401, headers });
  try {
    const { base: supabaseUrl, apiKey: anonKey } = supabaseConfig(request);
    const pending: (() => Promise<unknown>)[] = [];
    const service = livekitService(request, pending);
    if (!supabaseUrl || !anonKey) fail('Account service is not configured.', 503);
    const authHeaders = { Authorization: authorization, apikey: anonKey! };
    const query = async (path: string) => {
      const response = await fetch(`${supabaseUrl!.replace(/\/$/, '')}/${path}`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        if (path === 'auth/v1/user' && [401, 403].includes(response.status)) fail('Your session expired. Sign in again.', 401);
        fail('Account or room authorization could not be verified.', [401, 403].includes(response.status) ? response.status : 503);
      }
      return response.json();
    };
    if (Number(request.headers.get('Content-Length')) > 8192) fail('Request too large.', 413);
    const raw = await request.text();
    if (raw.length > 8192) fail('Request too large.', 413);
    let body: Record<string, any> = {};
    try { body = JSON.parse(raw); } catch { fail('Invalid request.', 400); }
    if (!body || typeof body !== 'object') fail('Invalid request.', 400);
    const { room, action, target } = body;
    if (typeof room !== 'string' || !/^mw-conversation-(audio|video)-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(room)) fail('This older broadcast cannot use conversation controls. Start a new room.', 400);
    if (!['token', 'status', 'started', 'title', 'end', 'request', 'leave-stage', 'approve', 'reject', 'mute', 'allow-mic', 'remove', 'ban', 'feature', 'settings', 'message', 'delete-message'].includes(action)) fail('Invalid room action.', 400);
    // The account and the room listing are independent lookups, so they run together.
    const [account, records] = await Promise.all([query('auth/v1/user'), query(`rest/v1/mw_video_live_sessions?room_name=eq.${encodeURIComponent(room)}&select=host_id,scope,is_live&limit=1`)]);
    if (!uuid.test(account.id)) fail('Sign in again.', 401);
    const record = records[0];
    if (!['end', 'leave-stage'].includes(action)) await assertActive(account.id);
    if (!record || !record.is_live && action !== 'end') fail('This room has ended or is unavailable.', 404);
    const isHost = record.host_id === account.id;
    if (action === 'end') {
      if (!isHost) fail('Only the host can moderate this room.', 403);
      await db.transaction(async transaction => {
        await transaction.insert(liveRooms).values({ room, hostId: account.id, endedAt: new Date() }).onConflictDoNothing();
        const [settings] = await transaction.select().from(liveRooms).where(eq(liveRooms.room, room)).for('update');
        await transaction.update(liveRooms).set({ endedAt: settings.endedAt || new Date(), lifecycleStatus: settings.endedAt && ['failed', 'interrupted', 'ended'].includes(settings.lifecycleStatus) ? settings.lifecycleStatus : settings.lifecycleStatus === 'preparing' ? 'failed' : 'ended' }).where(eq(liveRooms.room, room));
      });
      const closed = await fetch(`${supabaseUrl}/rest/v1/mw_video_live_sessions?room_name=eq.${encodeURIComponent(room)}&host_id=eq.${account.id}`, {
        method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_live: false, ended_at: new Date().toISOString() }), signal: AbortSignal.timeout(10000),
      }).then(response => response.ok).catch(() => false);
      if (!closed) fail('Live ended locally. Server cleanup is incomplete; retry Close listing.', 503);
      let disconnected = true;
      try { await service.deleteRoom(room); }
      catch (error) { disconnected = (error as { code?: string }).code === 'not_found'; }
      if (!closed || !disconnected) fail('Live ended locally. Server cleanup is incomplete; retry Close listing.', 503);
      return Response.json({ ok: true }, { headers });
    }
    const [follows, profiles] = await Promise.all([
      !isHost && record.scope === 'followers' ? query(`rest/v1/mw_follows?follower_id=eq.${account.id}&following_id=eq.${record.host_id}&select=follower_id&limit=1`) : null,
      query(`rest/v1/mw_profiles?id=eq.${account.id}&select=display_name,avatar_url&limit=1`),
    ]);
    if (follows && !follows.length) fail('This room is for followers only.', 403);
    const profile = profiles[0];
    const name = String(profile?.display_name || 'MilkyWay user').slice(0, 80);
    const avatar = /^(https:\/\/|\/\.netlify\/functions\/milkyway-account\?action=avatar&key=)/.test(profile?.avatar_url || '') ? String(profile.avatar_url).slice(0, 2048) : '';
    const result = await db.transaction(async transaction => {
      if (isHost) {
        const options = layoutOptions(body);
        if (!validOptions(options)) fail('Invalid room settings.', 400);
        const layout = pairLayout(options.layoutStyle) ? 2 : validLayout(body.layout) ? body.layout : 4;
        await transaction.insert(liveRooms).values({ room, hostId: account.id, lifecycleStatus: 'preparing', admission: body.liveType === 'broadcast' ? 'broadcast' : body.admission === 'direct' ? 'direct' : 'approval', layout, ...options }).onConflictDoNothing({ target: liveRooms.room });
      }
      const [settings] = await transaction.select().from(liveRooms).where(eq(liveRooms.room, room)).for('update');
      if (!settings || settings.hostId !== record.host_id) fail('The host needs to start this conversation room first.', 409);
      if (settings.endedAt) fail('This room has ended or is unavailable.', 404);
      await transaction.insert(liveMembers).values({ room, userId: account.id, name, avatar, state: isHost ? 'speaker' : 'viewer' }).onConflictDoNothing();
      const memberWhere = (identity: string) => and(eq(liveMembers.room, room), eq(liveMembers.userId, identity));
      const [self] = await transaction.select().from(liveMembers).where(memberWhere(account.id));
      if (['banned', 'removed'].includes(self.state)) fail('The host has removed you from this room.', 403);
      const audioOnly = room.startsWith('mw-conversation-audio-');
      const permissions = (member: typeof self) => roomPermissions({ ...member, state: settings.admission === 'broadcast' && member.userId !== record.host_id ? 'viewer' : member.state }, audioOnly);
      const participants = action === 'token' ? [] : await service.listParticipants(room);
      const changePermission = async (member: typeof self) => {
        const participant = participants.find(participant => participant.identity === member.userId);
        const expected = permissions(member);
        if (participant && (participant.permission?.canPublish !== expected.canPublish || participant.permission?.canPublishData !== expected.canPublishData || JSON.stringify([...(participant.permission?.canPublishSources || [])].sort()) !== JSON.stringify([...expected.canPublishSources].sort()))) await service.updateParticipant(room, member.userId, { permission: expected });
      };
      const checkCapacity = async (member: typeof self) => {
        if (member.state === 'speaker') return;
        const speakers = await transaction.select({ id: liveMembers.userId }).from(liveMembers).where(and(eq(liveMembers.room, room), eq(liveMembers.state, 'speaker')));
        const capacity = pairLayout(settings.layoutStyle) ? 2 : settings.layout;
        if (speakers.length >= Math.min(21, capacity)) fail('All configured participant boxes are occupied. The host must increase the layout before admitting another speaker.', 409);
      };
      const system = async (key: string, participant: string) => { await transaction.insert(liveMessages).values({ id: crypto.randomUUID(), room, userId: account.id, name: 'MilkyWay', avatar: '', body: JSON.stringify({ mwSystem: 1, key, name: participant }), kind: 'system' }); };
      if (action === 'token') {
        return { roomName: room, settings, self, permissions: permissions(self) };
      }
      if (action === 'status') {
        const members = await transaction.select().from(liveMembers).where(eq(liveMembers.room, room));
        {
          for (const member of members.filter(member => (isHost || member.userId === account.id) && participants.some(participant => participant.identity === member.userId))) {
            if (['banned', 'removed'].includes(member.state)) await service.removeParticipant(room, member.userId);
            else await changePermission(member);
          }
        }
        const messages = await transaction.select().from(liveMessages).where(eq(liveMessages.room, room)).orderBy(desc(liveMessages.createdAt)).limit(100);
        return { settings, self, connected: participants.map(participant => participant.identity), maxSpeakers: 21, members: members.filter(member => isHost || member.state !== 'banned').map(member => ({ ...member, lastSentAt: undefined })), messages: messages.reverse().map(message => message.deleted ? { ...message, body: 'Message removed by the host' } : message) };
      }
      if (!participants.some(participant => participant.identity === account.id) && action !== 'leave-stage') fail('Connect to the room before using its controls.', 403);
      if (action === 'started') {
        if (!isHost) fail('Only the host can start this room.', 403);
        const published = participants.find(participant => participant.identity === account.id) as { tracks?: { source: number }[] } | undefined;
        if (!published?.tracks?.some(track => [1, 2].includes(track.source))) fail('Publish host media before marking Live started.', 409);
        await transaction.update(liveRooms).set({ startedAt: settings.startedAt || new Date(), lifecycleStatus: 'live' }).where(eq(liveRooms.room, room));
      } else if (action === 'title') {
        if (!isHost) fail('Only the host can change the Live title.', 403);
        if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 100) fail('Use a Live title of 1–100 characters.', 400);
        const updated = await fetch(`${supabaseUrl}/rest/v1/mw_video_live_sessions?room_name=eq.${encodeURIComponent(room)}&host_id=eq.${account.id}&is_live=eq.true`, { method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ title: body.title.trim() }), signal: AbortSignal.timeout(10000) });
        if (!updated.ok || !(await updated.json()).length) fail('The Live title could not be saved.', 503);
      } else if (action === 'request' || action === 'leave-stage') {
        if (settings.admission === 'broadcast') fail('Broadcast viewers cannot join the stage.', 403);
        if (isHost) fail('The host stays on stage until the room ends.', 400);
        if (action === 'request' && ['removed', 'rejected'].includes(self.state)) fail('The host must invite you back to the stage.', 403);
        const state = action === 'leave-stage' ? 'viewer' : settings.admission === 'direct' ? 'speaker' : self.state === 'speaker' ? 'speaker' : 'pending';
        if (state === 'speaker') await checkCapacity(self);
        await changePermission({ ...self, state });
        await transaction.update(liveMembers).set({ state }).where(memberWhere(account.id));
        if (settings.featuredId === account.id && state !== 'speaker') await transaction.update(liveRooms).set({ featuredId: null }).where(eq(liveRooms.room, room));
        if (self.state !== state) await system(state === 'speaker' ? 'joinedStage' : state === 'pending' ? 'requestedToSpeak' : 'leftStage', name);
        // Returned so an auto-accepted guest lands on stage straight from this reply, without waiting for the next refresh.
        return { ok: true, state };
      } else if (action === 'message') {
        if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.message) || !uuid.test(body.id)) fail('Use 1–500 characters and a valid message reference.', 400);
        const [existing] = await transaction.select().from(liveMessages).where(eq(liveMessages.id, body.id));
        if (existing) { if (existing.userId !== account.id || existing.room !== room || existing.body !== body.message.trim()) fail('Invalid message reference.', 409); return { ok: true }; }
        if (self.lastSentAt && Date.now() - self.lastSentAt.getTime() < 1500) fail('Please wait a moment before sending another message.', 429);
        await transaction.insert(liveMessages).values({ id: body.id, room, userId: account.id, name, avatar, body: body.message.trim(), kind: body.reaction === true ? 'reaction' : 'message' });
        await transaction.update(liveMembers).set({ lastSentAt: new Date() }).where(memberWhere(account.id));
      } else {
        if (!isHost) fail('Only the host can moderate this room.', 403);
        if (action === 'settings') {
          const options = layoutOptions({ ...settings, ...body });
          if (!(settings.admission === 'broadcast' ? body.admission === 'broadcast' : ['approval', 'direct'].includes(body.admission)) || !validLayout(body.layout) || !validOptions(options) || pairLayout(options.layoutStyle) && body.layout !== 2) fail('Invalid room settings.', 400);
          const speakers = await transaction.select({ id: liveMembers.userId }).from(liveMembers).where(and(eq(liveMembers.room, room), eq(liveMembers.state, 'speaker')));
          if (speakers.length > body.layout) fail('Remove or release admitted speakers before reducing the number of participant boxes.', 409);
          const previousAdmission = settings.admission;
          await transaction.update(liveRooms).set({ admission: body.admission, layout: body.layout, ...options }).where(eq(liveRooms.room, room));
          // Switching to auto-accept seats viewers who were already waiting while seats remain.
          if (body.admission === 'direct' && previousAdmission !== 'direct') {
            const capacity = Math.min(21, pairLayout(options.layoutStyle) ? 2 : body.layout);
            const waiting = await transaction.select().from(liveMembers).where(and(eq(liveMembers.room, room), eq(liveMembers.state, 'pending')));
            for (const member of waiting.slice(0, Math.max(0, capacity - speakers.length))) {
              await changePermission({ ...member, state: 'speaker' });
              await transaction.update(liveMembers).set({ state: 'speaker' }).where(memberWhere(member.userId));
              await system('joinedStage', member.name);
            }
          }
        } else if (action === 'delete-message') {
          if (!uuid.test(body.id)) fail('Invalid message reference.', 400);
          await transaction.update(liveMessages).set({ deleted: true }).where(and(eq(liveMessages.room, room), eq(liveMessages.id, body.id)));
        } else {
          if (settings.admission === 'broadcast' && action === 'approve') fail('Broadcast viewers cannot publish media.', 403);
          if (!uuid.test(target) || target === record.host_id && action !== 'feature') fail('Choose a guest, not the host.', 400);
          const [member] = await transaction.select().from(liveMembers).where(memberWhere(target));
          if (!member || member.state === 'banned') fail('Participant is unavailable.', 404);
          if (action === 'feature') {
            if (member.state !== 'speaker' || !participants.some(participant => participant.identity === target)) fail('Only a connected speaker can be featured.', 400);
            await transaction.update(liveRooms).set({ featuredId: target }).where(eq(liveRooms.room, room));
          } else {
            const state = action === 'approve' ? 'speaker' : action === 'reject' ? 'rejected' : action === 'remove' ? 'removed' : action === 'ban' ? 'banned' : member.state;
            if (state === 'speaker') await checkCapacity(member);
            const hostMuted = action === 'mute' ? true : action === 'allow-mic' ? false : member.hostMuted;
            if (action === 'ban' || action === 'remove') {
              try { await service.removeParticipant(room, target, { revokeTokenTs: BigInt(Math.ceil(Date.now() / 1000)) }); }
              catch (error) { if ((error as { code?: string }).code !== 'not_found') throw error; }
            } else await changePermission({ ...member, state, hostMuted });
            await transaction.update(liveMembers).set({ state, hostMuted }).where(memberWhere(target));
            if (settings.featuredId === target && state !== 'speaker') await transaction.update(liveRooms).set({ featuredId: null }).where(eq(liveRooms.room, room));
            await system(action === 'mute' ? 'hostMuted' : action === 'allow-mic' ? 'microphoneAllowed' : action === 'approve' ? 'joinedStage' : action === 'ban' ? 'banned' : action === 'remove' ? 'removed' : 'rejected', member.name);
          }
        }
      }
      return { ok: true };
    });
    await Promise.all(pending.map(operation => operation()));
    if (action === 'token') {
      // One round trip: the authorized room state comes back with a signed LiveKit token when the site holds LiveKit credentials.
      const { permissions: grant, ...state } = result as Record<string, any>;
      const config = livekitConfig();
      if (!config) return Response.json(state, { headers });
      const token = new AccessToken(config.apiKey, config.apiSecret, { identity: account.id, name: state.self.name || name, metadata: JSON.stringify({ avatar: state.self.avatar || '' }), ttl: '60s' });
      token.addGrant({ roomJoin: true, room, ...grant });
      // The host's room is created up front so its settings apply before anyone joins.
      const [jwt] = await Promise.all([token.toJwt(), isHost ? new RoomServiceClient(config.serviceUrl, config.apiKey, config.apiSecret, { requestTimeout: 8, failover: false }).createRoom({ name: room, emptyTimeout: 300, departureTimeout: 60, maxParticipants: 500 }).catch(() => null) : null]);
      return Response.json({ ...state, token: jwt, serverUrl: config.serverUrl }, { headers });
    }
    return Response.json(result, { headers });
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string } };
    if (databaseError.code === '23505' || databaseError.cause?.code === '23505') return Response.json({ error: 'End your previous Live before starting another session.' }, { status: 409, headers });
    const known = error as { status?: number; message?: string; safe?: boolean };
    return Response.json({ error: known.safe ? known.message : 'Room service unavailable. Check database access and the Supabase livekit-token deployment, then retry.' }, { status: known.safe ? known.status : 503, headers });
  }
}
