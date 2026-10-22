import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { AccessToken } from 'livekit-server-sdk';
import { db } from '../db/index.js';
import { directCalls } from '../db/schema.js';
import { supabaseConfig } from '../lib/supabase.js';
import { assertActive } from '../lib/suspensions.js';
import { livekitConfig } from '../lib/livekit.js';
import { sendCallPush } from '../lib/call-push.js';
import { sendCallSignal } from '../lib/call-signal.js';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status }); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ringWindow = 45000;

// Same record shape the client used with the Supabase mw_dm_calls table.
const shape = (call: typeof directCalls.$inferSelect) => ({
  id: call.id, caller_id: call.callerId, callee_id: call.calleeId, status: call.status, created_at: call.createdAt.toISOString(), ended_at: call.endedAt?.toISOString() || null,
  offer: { transport: 'livekit', mode: call.mode }, answer: call.outcome ? { outcome: call.outcome } : null,
});

type CallRecord = typeof directCalls.$inferSelect;
// LiveKit access for one call room; both participants publish audio/video.
async function callAccess(call: CallRecord, identity: string, name: string) {
  const config = livekitConfig();
  if (!config) fail('Calling is not configured.', 503);
  const token = new AccessToken(config!.apiKey, config!.apiSecret, { identity, name, ttl: '2h' });
  token.addGrant({ room: `mw-call-${call.id}`, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false });
  return { token: await token.toJwt(), serverUrl: config!.serverUrl };
}

export default async function handler(request: Request, context?: { waitUntil?: (work: Promise<unknown>) => void }) {
  if (!['GET', 'POST'].includes(request.method)) return Response.json({ error: 'Method not allowed.' }, { status: 405, headers });
  try {
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) fail('Sign in first.', 401);
    const { base, apiKey } = supabaseConfig(request);
    if (!base || !apiKey) fail('Call service is not configured.', 503);
    const authHeaders = { Authorization: authorization, apikey: apiKey! };
    const query = async (path: string) => {
      const response = await fetch(`${base}/${path}`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
      if (!response.ok) fail('Account could not be verified.', response.status === 401 ? 401 : 503);
      return response.json();
    };
    const account = await query('auth/v1/user');
    if (!uuid.test(account.id)) fail('Sign in again.', 401);
    // Tells the other participant's open app about a change straight away; polling stays as the fallback.
    const signal = (call: CallRecord, kind: 'ring' | 'update') => sendCallSignal(base, authHeaders, [call.callerId === account.id ? call.calleeId : call.callerId], { kind, id: call.id }).catch(() => false);
    const background = (work: Promise<unknown>) => { if (context?.waitUntil) context.waitUntil(work); else return work; };
    const displayName = String(account.user_metadata?.display_name || 'MilkyWay').slice(0, 80);
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || '';
    const participantCall = async (id: string) => {
      if (!uuid.test(id)) fail('Invalid call.', 400);
      const [call] = await db.select().from(directCalls).where(and(eq(directCalls.id, id), or(eq(directCalls.callerId, account.id), eq(directCalls.calleeId, account.id))));
      if (!call) fail('Call unavailable.', 404);
      return call;
    };

    if (request.method === 'GET') {
      if (action === 'incoming') {
        // Unanswered rings expire so a stale call never keeps ringing.
        await db.update(directCalls).set({ status: 'ended', outcome: 'missed', endedAt: new Date() }).where(and(eq(directCalls.calleeId, account.id), eq(directCalls.status, 'ringing'), lt(directCalls.createdAt, new Date(Date.now() - ringWindow))));
        const [call] = await db.select().from(directCalls).where(and(eq(directCalls.calleeId, account.id), eq(directCalls.status, 'ringing'))).orderBy(desc(directCalls.createdAt)).limit(1);
        return Response.json({ call: call ? shape(call) : null }, { headers });
      }
      return Response.json({ call: shape(await participantCall(url.searchParams.get('id') || '')) }, { headers });
    }

    const raw = await request.text();
    if (raw.length > 4096) fail('Request too large.', 413);
    const body = JSON.parse(raw || '{}');

    if (action === 'start') {
      await assertActive(account.id);
      const callee = String(body.callee || '');
      if (!uuid.test(callee) || callee === account.id) fail('Choose someone to call.', 400);
      const profiles = await query(`rest/v1/mw_profiles?id=eq.${callee}&select=id&limit=1`);
      if (!profiles.length) fail('That account was not found.', 404);
      await db.update(directCalls).set({ status: 'ended', outcome: 'cancelled', endedAt: new Date() }).where(and(eq(directCalls.callerId, account.id), inArray(directCalls.status, ['ringing', 'accepted'])));
      const [call] = await db.insert(directCalls).values({ callerId: account.id, calleeId: callee, mode: body.mode === 'video' ? 'video' : 'audio' }).returning();
      // An open app rings through its realtime websocket at once. Web Push also rings the phone when MilkyWay
      // is closed; it runs after the response so the caller hears ringback without waiting for push delivery.
      const rang = await signal(call, 'ring');
      await background((async () => {
        const [caller] = await query(`rest/v1/mw_profiles?id=eq.${account.id}&select=display_name,username&limit=1`).catch(() => []);
        const callerName = String(caller?.display_name || caller?.username || displayName).slice(0, 80);
        await sendCallPush(callee, { kind: 'ring', id: call.id, mode: call.mode === 'video' ? 'video' : 'audio', callerName }).catch(() => null);
      })());
      // The caller joins the call room while it rings, so the call connects the moment it is answered.
      const access = await callAccess(call, account.id, String(body.name || displayName).slice(0, 80)).catch(() => null);
      return Response.json({ call: shape(call), signalled: rang, access }, { status: 201, headers });
    }
    if (action === 'accept' || action === 'decline') {
      const call = await participantCall(String(body.id || ''));
      if (call.calleeId !== account.id) fail('Only the person being called can answer.', 403);
      if (call.status !== 'ringing' || Date.now() - call.createdAt.getTime() > ringWindow) fail('This call has already ended.', 409);
      const [updated] = await db.update(directCalls).set(action === 'accept' ? { status: 'accepted' } : { status: 'declined', outcome: 'rejected', endedAt: new Date() })
        .where(and(eq(directCalls.id, call.id), eq(directCalls.status, 'ringing'))).returning();
      if (!updated) fail('This call has already ended.', 409);
      await signal(updated, 'update');
      // Accepting hands back the room access in the same request, saving a round trip before the call connects.
      const access = action === 'accept' ? await callAccess(updated, account.id, String(body.name || displayName).slice(0, 80)).catch(() => null) : null;
      return Response.json({ call: shape(updated), access }, { headers });
    }
    if (action === 'end') {
      const call = await participantCall(String(body.id || ''));
      const outcome = ['ended', 'missed', 'cancelled', 'rejected', 'disconnected'].includes(body.outcome) ? body.outcome : 'ended';
      const [updated] = await db.update(directCalls).set({ status: outcome === 'rejected' ? 'declined' : 'ended', outcome, endedAt: new Date() })
        .where(and(eq(directCalls.id, call.id), inArray(directCalls.status, ['ringing', 'accepted']))).returning();
      if (updated) await signal(updated, 'update');
      // A call that stopped ringing unanswered replaces the ringing notification with a missed-call one.
      if (updated && call.status === 'ringing' && call.callerId === account.id && ['cancelled', 'missed'].includes(outcome)) {
        const [caller] = await query(`rest/v1/mw_profiles?id=eq.${account.id}&select=display_name,username&limit=1`).catch(() => []);
        await sendCallPush(call.calleeId, { kind: 'missed', id: call.id, mode: call.mode === 'video' ? 'video' : 'audio', callerName: String(caller?.display_name || caller?.username || 'MilkyWay').slice(0, 80) }).catch(() => {});
      }
      return Response.json({ call: shape(updated || call) }, { headers });
    }
    if (action === 'token') {
      const call = await participantCall(String(body.id || ''));
      // The caller may wait in the room while it rings; the person being called only gets in by answering.
      const waiting = call.status === 'ringing' && call.callerId === account.id && Date.now() - call.createdAt.getTime() <= ringWindow;
      if (call.status !== 'accepted' && !waiting) fail('The call has not been answered.', 409);
      return Response.json(await callAccess(call, account.id, String(body.name || displayName).slice(0, 80)), { headers });
    }
    return fail('Unknown call action.', 400);
  } catch (error) {
    const known = error as { status?: number; message?: string };
    return Response.json({ error: known.status ? known.message : 'Call service unavailable. Reconnect and retry.' }, { status: known.status || 503, headers });
  }
}
