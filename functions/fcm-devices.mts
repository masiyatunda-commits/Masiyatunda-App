import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { fcmDevices } from '../db/schema.js';
import { verifiedAccount } from '../lib/account-check.js';
import { firebaseClientConfig, pushToUsers } from '../lib/fcm.js';

// Registers native Android devices for Firebase Cloud Messaging and relays Supabase events
// (new messages, likes, comments) as pushes. Event relay is authenticated with FCM_WEBHOOK_SECRET.
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status, safe: true }); };
const uuid = /^[a-f0-9-]{36}$/i;

function eventMessage(table: string, record: Record<string, unknown>) {
  const preview = (value: unknown) => String(value || '').slice(0, 140);
  if (table === 'mw_messages') return { userIds: [record.receiver_id], message: { title: 'Ujumbe mpya / New message', body: 'Umepokea ujumbe mpya. / You have a new message.', url: '/milkyway/#messages', tag: `dm-${record.sender_id}` } };
  if (table === 'mw_notifications') {
    const titles: Record<string, string> = { signal: 'Like mpya / New like', echo: 'Maoni mapya / New comment', follow: 'Mfuasi mpya / New follower' };
    return { userIds: [record.recipient_id], message: { title: titles[String(record.type)] || 'MilkyWay', body: preview(record.message), url: '/milkyway/#notifications', tag: `n-${record.id}` } };
  }
  return null;
}

export default async function handler(request: Request) {
  try {
    const action = new URL(request.url).searchParams.get('action') || 'register';
    if (request.method === 'GET' && action === 'config') return Response.json({ firebase: firebaseClientConfig() }, { headers });
    if (request.method !== 'POST' && request.method !== 'DELETE') fail('Method not allowed.', 405);
    const body = await request.json().catch(() => ({}));
    if (action === 'event') {
      const secret = process.env.FCM_WEBHOOK_SECRET || '';
      if (!secret || request.headers.get('x-webhook-secret') !== secret) fail('Unauthorized.', 401);
      if (body.type !== 'INSERT' || typeof body.table !== 'string' || !body.record) return Response.json({ ok: true, skipped: true }, { headers });
      const event = eventMessage(body.table, body.record);
      if (!event) return Response.json({ ok: true, skipped: true }, { headers });
      const delivered = await pushToUsers(event.userIds.filter((id): id is string => typeof id === 'string' && uuid.test(id)), event.message);
      return Response.json({ ok: true, delivered }, { headers });
    }
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!/^[A-Za-z0-9_:\-]{20,4096}$/.test(token)) fail('Invalid device token.');
    if (request.method === 'DELETE') { await db.delete(fcmDevices).where(eq(fcmDevices.token, token)); return Response.json({ ok: true }, { headers }); }
    const account = await verifiedAccount(request);
    const isAdmin = account ? await account.isAdmin().catch(() => false) : false;
    const values = { token, userId: account?.id || null, isAdmin, platform: 'android', updatedAt: new Date() };
    await db.insert(fcmDevices).values(values).onConflictDoUpdate({ target: fcmDevices.token, set: values });
    return Response.json({ ok: true, signedIn: !!account, isAdmin }, { headers });
  } catch (error) {
    const known = error as { safe?: boolean; message?: string; status?: number };
    return Response.json({ error: known.safe ? known.message : 'Push service temporarily unavailable.' }, { status: known.safe ? known.status : 503, headers });
  }
}

export const config = { path: '/api/fcm' };
