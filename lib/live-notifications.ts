import { createHash, ECDH } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { liveRooms, liveAlerts, notificationPreferences, pushSubscriptions, pushDeliveries } from '../db/schema.js';
import { supabaseConfig } from './supabase.js';
import { livekitRequest } from './livekit-service.js';

export const notificationFailure = (message: string, status = 503): never => { throw Object.assign(new Error(message), { safe: true, status }); };
export const isAccountId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

export async function notificationAccount(request: Request) {
  const { base, apiKey } = supabaseConfig(request);
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) notificationFailure('Sign in first.', 401);
  if (!base || !apiKey) notificationFailure('Account service is unavailable.');
  const headers = { Authorization: authorization, apikey: apiKey, 'Content-Type': 'application/json' };
  const query = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${base}/${path}`, { ...options, headers, signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) notificationFailure(path === 'auth/v1/user' && [401, 403].includes(response.status) ? 'Your session expired. Sign in again.' : 'Live notification access could not be verified. Check the recipient RPC deployment.', path === 'auth/v1/user' && [401, 403].includes(response.status) ? 401 : 503);
    return response.json();
  };
  const account = await query('auth/v1/user');
  if (!isAccountId(account?.id)) notificationFailure('Sign in first.', 401);
  return { account, query };
}

export function validatedSubscription(value: any) {
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2048) notificationFailure('Invalid push subscription.', 400);
  let address: URL;
  try { address = new URL(value.endpoint); } catch { notificationFailure('Invalid push subscription.', 400); }
  const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(address!.hostname) || address!.hostname.endsWith('.notify.windows.com');
  if (!allowed || address!.protocol !== 'https:' || address!.port || address!.username || address!.password || address!.hash) notificationFailure('Unsupported push service.', 400);
  if (!/^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh || '') || !/^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth || '')) notificationFailure('Invalid push subscription.', 400);
  try {
    const publicKey = Buffer.from(value.keys.p256dh, 'base64url');
    if (publicKey.length !== 65 || publicKey[0] !== 4 || Buffer.from(value.keys.auth, 'base64url').length !== 16) notificationFailure('Invalid push subscription.', 400);
    ECDH.convertKey(publicKey, 'prime256v1');
  } catch { notificationFailure('Invalid push subscription.', 400); }
  return { id: createHash('sha256').update(value.endpoint).digest('hex'), endpoint: value.endpoint, p256dh: value.keys.p256dh, auth: value.keys.auth };
}

export function pushConfiguration() {
  const runtime = globalThis as typeof globalThis & { Netlify?: { env?: { get(name: string): string | undefined } } };
  const read = (name: string) => (runtime.Netlify?.env?.get(name) ?? process.env[name])?.trim();
  const publicKey = read('MW_VAPID_PUBLIC_KEY');
  const privateKey = read('MW_VAPID_PRIVATE_KEY');
  const subject = read('MW_VAPID_SUBJECT');
  return publicKey && privateKey && subject && /^(mailto:|https:\/\/)/.test(subject) ? { publicKey, privateKey, subject } : null;
}

export async function announceLive(request: Request, room: string, identity: string, query: (path: string, options?: RequestInit) => Promise<any>) {
  if (!/^mw-conversation-(audio|video)-[a-f0-9-]{36}$/i.test(room)) notificationFailure('Invalid room.', 400);
  const [record] = await query(`rest/v1/mw_video_live_sessions?room_name=eq.${encodeURIComponent(room)}&select=id,host_id,host_name,title,is_live,scope,started_at&limit=1`);
  if (!record?.is_live || record.host_id !== identity || !['public', 'everyone', 'followers'].includes(record.scope)) notificationFailure('Only the host can announce an active Live.', 403);
  const [settings] = await db.select().from(liveRooms).where(eq(liveRooms.room, room));
  if (!settings || settings.hostId !== identity || settings.endedAt) notificationFailure('This room has ended or is unavailable.', 404);
  if (!settings.startedAt || Date.now() - settings.startedAt.getTime() < 5000) notificationFailure('Live is still starting. Retry notifications after five seconds.', 409);
  if (settings.notificationsComplete) return { ok: true, complete: true };
  const provider = await livekitRequest(request, { action: 'participants', roomName: room });
  const host = provider.participants.find((participant: any) => participant.identity === identity);
  if (!host || !Array.isArray(host.tracks) || !host.tracks.some((track: any) => [1, 2].includes(track.source))) notificationFailure('The host must publish media before announcing Live.', 409);
  const [profile] = await query(`rest/v1/mw_profiles?id=eq.${identity}&select=display_name,avatar_url&limit=1`);
  const recipients = await query('rest/v1/rpc/mw_live_notification_recipients', { method: 'POST', body: JSON.stringify({ host_id: identity, after_id: settings.notificationCursor }) });
  if (!Array.isArray(recipients) || recipients.length > 500 || recipients.some(item => !isAccountId(item?.recipient_id))) notificationFailure('Invalid Live notification recipient response.');
  const recipientIds: string[] = recipients.map((item: { recipient_id: string }) => item.recipient_id);
  await db.transaction(async transaction => {
    const [current] = await transaction.select().from(liveRooms).where(eq(liveRooms.room, room)).for('update');
    if (!current || current.endedAt || current.notificationsComplete || current.notificationCursor !== settings.notificationCursor) return;
    const preferences = recipientIds.length ? await transaction.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, recipientIds)) : [];
    const eligible = recipientIds.filter(recipientId => !preferences.some(preference => preference.userId === recipientId && !preference.liveEnabled));
    if (eligible.length) {
      const avatar = /^https:\/\//.test(profile?.avatar_url || '') || /^\/\.netlify\/functions\/milkyway-account\?action=avatar&key=/.test(profile?.avatar_url || '') ? String(profile.avatar_url).slice(0, 2048) : '';
      await transaction.insert(liveAlerts).values(eligible.map(recipientId => ({ room, recipientId, hostId: identity, hostName: String(profile?.display_name || record.host_name || 'MilkyWay').slice(0, 80), avatar, title: String(record.title || 'Live').slice(0, 100) }))).onConflictDoNothing();
      const subscriptions = await transaction.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, eligible));
      if (subscriptions.length) await transaction.insert(pushDeliveries).values(subscriptions.map(subscription => ({ room, recipientId: subscription.userId, subscriptionId: subscription.id }))).onConflictDoNothing();
    }
    await transaction.update(liveRooms).set({ notificationsComplete: recipients.length < 500, notificationCursor: recipientIds.at(-1) || current.notificationCursor }).where(eq(liveRooms.room, room));
  });
  return { ok: true, complete: recipients.length < 500 };
}
