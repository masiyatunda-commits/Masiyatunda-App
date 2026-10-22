import webpush from 'web-push';
import { and, eq, lte, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { liveAlerts, liveRooms, notificationPreferences, pushSubscriptions, pushDeliveries } from '../db/schema.js';
import { pushConfiguration } from './live-notifications.js';

export function livePushPayload(alert: { room: string; hostName: string; title: string }, language: string, soundEnabled: boolean) {
  const labels: Record<string, string> = { en: 'is live', sw: 'yuko Live', fr: 'est en direct', zh: '正在直播', ar: 'يبث الآن', pt: 'está ao vivo', hi: 'लाइव हैं', de: 'ist live' };
  return JSON.stringify({ title: `${alert.hostName} ${labels[language] || labels.en}`, body: alert.title, url: `/milkyway/#live=${encodeURIComponent(alert.room)}`, tag: `mw-live-${alert.room}`, silent: !soundEnabled });
}

export async function dispatchPush() {
  const configuration = pushConfiguration();
  if (!configuration) return { configured: false, processed: 0 };
  const now = new Date();
  await db.update(pushDeliveries).set({ status: 'pending' }).where(and(eq(pushDeliveries.status, 'sending'), lte(pushDeliveries.nextAttemptAt, now)));
  const jobs = await db.select().from(pushDeliveries).where(and(eq(pushDeliveries.status, 'pending'), lte(pushDeliveries.nextAttemptAt, now))).limit(100);
  await Promise.all(jobs.map(async job => {
    const where = and(eq(pushDeliveries.room, job.room), eq(pushDeliveries.subscriptionId, job.subscriptionId));
    const claimed = await db.update(pushDeliveries).set({ status: 'sending', nextAttemptAt: new Date(Date.now() + 60000) }).where(and(where, eq(pushDeliveries.status, 'pending'))).returning();
    if (!claimed.length) return;
    try {
      const [subscription] = await db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.id, job.subscriptionId), eq(pushSubscriptions.userId, job.recipientId)));
      const [alert] = await db.select().from(liveAlerts).where(and(eq(liveAlerts.room, job.room), eq(liveAlerts.recipientId, job.recipientId)));
      const [room] = await db.select().from(liveRooms).where(and(eq(liveRooms.room, job.room), isNull(liveRooms.endedAt)));
      const [preferences] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, job.recipientId));
      if (!subscription || !alert || !room || !room.startedAt || preferences?.liveEnabled === false || Date.now() - alert.createdAt.getTime() > 600000) {
        await db.update(pushDeliveries).set({ status: 'expired' }).where(where);return;
      }
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, livePushPayload(alert, preferences?.language || 'sw', preferences?.soundEnabled !== false), { vapidDetails: configuration, TTL: 300, timeout: 10000, urgency: 'high' });
      await db.update(pushDeliveries).set({ status: 'delivered', attempts: job.attempts + 1 }).where(where);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if ([404, 410].includes(status || 0)) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, job.subscriptionId));
      else await db.update(pushDeliveries).set({ status: job.attempts >= 4 ? 'failed' : 'pending', attempts: job.attempts + 1, nextAttemptAt: new Date(Date.now() + Math.min(600000, 60000 * 2 ** job.attempts)) }).where(where);
    }
  }));
  return { configured: true, processed: jobs.length };
}
