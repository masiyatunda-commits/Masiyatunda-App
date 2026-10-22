import { and, eq, desc, isNull, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { liveAlerts, notificationPreferences, pushSubscriptions } from '../db/schema.js';
import { notificationAccount, notificationFailure, validatedSubscription, pushConfiguration, announceLive } from '../lib/live-notifications.js';

export default async function handler(request: Request) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    if (!['GET', 'POST', 'DELETE'].includes(request.method)) notificationFailure('Method not allowed.', 405);
    const { account, query } = await notificationAccount(request);
    const action = new URL(request.url).searchParams.get('action') || 'alerts';
    if (request.method === 'GET') {
      if (action === 'settings') {
        const [preferences] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, account.id));
        const configuration = pushConfiguration();
        return Response.json({ preferences: preferences || { liveEnabled: true, soundEnabled: true, language: 'sw' }, pushAvailable: !!configuration, publicKey: configuration?.publicKey || null }, { headers });
      }
      if (action !== 'alerts') notificationFailure('Invalid notification action.', 400);
      const [unread] = await db.select({ count: count() }).from(liveAlerts).where(and(eq(liveAlerts.recipientId, account.id), isNull(liveAlerts.readAt)));
      const alerts = await db.select().from(liveAlerts).where(eq(liveAlerts.recipientId, account.id)).orderBy(desc(liveAlerts.createdAt)).limit(50);
      return Response.json({ alerts, unread: Number(unread.count) }, { headers });
    }
    const raw = await request.text();
    if (raw.length > 8192) notificationFailure('Request too large.', 413);
    let body;
    try { body = JSON.parse(raw); } catch { notificationFailure('Invalid request.', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) notificationFailure('Invalid request.', 400);
    if (action === 'subscription') {
      const subscription = validatedSubscription(body.subscription);
      if (request.method === 'DELETE') await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.id, subscription.id), eq(pushSubscriptions.userId, account.id)));
      else {
        if (!pushConfiguration()) notificationFailure('Background push is not configured. In-app Live alerts remain available.');
        const [existing] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
        if (existing && existing.userId !== account.id && (existing.p256dh !== subscription.p256dh || existing.auth !== subscription.auth)) notificationFailure('Invalid push subscription.', 409);
        const devices = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, account.id)).limit(20);
        if (!existing && devices.length >= 20) notificationFailure('Too many notification devices. Remove an old subscription first.', 429);
        await db.insert(pushSubscriptions).values({ ...subscription, userId: account.id }).onConflictDoUpdate({ target: pushSubscriptions.id, set: { ...subscription, userId: account.id, updatedAt: new Date() } });
      }
    } else if (request.method !== 'POST') notificationFailure('Method not allowed.', 405);
    else if (action === 'preferences') {
      if (typeof body.liveEnabled !== 'boolean' || typeof body.soundEnabled !== 'boolean' || !['en', 'sw', 'fr', 'zh', 'ar', 'pt', 'hi', 'de'].includes(body.language)) notificationFailure('Invalid notification preferences.', 400);
      const preferences = { liveEnabled: body.liveEnabled, soundEnabled: body.soundEnabled, language: body.language };
      await db.insert(notificationPreferences).values({ userId: account.id, ...preferences }).onConflictDoUpdate({ target: notificationPreferences.userId, set: preferences });
    } else if (action === 'read') {
      if (!Array.isArray(body.rooms) || body.rooms.length > 50 || body.rooms.some((room: unknown) => typeof room !== 'string' || room.length > 150)) notificationFailure('Invalid alert reference.', 400);
      for (const room of body.rooms) await db.update(liveAlerts).set({ readAt: new Date() }).where(and(eq(liveAlerts.recipientId, account.id), eq(liveAlerts.room, room), isNull(liveAlerts.readAt)));
    } else if (action === 'live-started') return Response.json(await announceLive(request, body.room, account.id, query), { headers });
    else notificationFailure('Invalid notification action.', 400);
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const known = error as { safe?: boolean; message?: string; status?: number };
    return Response.json({ error: known.safe ? known.message : 'Live notifications are temporarily unavailable. Retry.' }, { status: known.safe ? known.status : 503, headers });
  }
}
