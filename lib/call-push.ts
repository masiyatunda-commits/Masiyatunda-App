import webpush from 'web-push';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { notificationPreferences, pushSubscriptions } from '../db/schema.js';
import { pushConfiguration } from './live-notifications.js';

type CallPush = { kind: 'ring' | 'missed'; id: string; mode: 'audio' | 'video'; callerName: string };

const labels: Record<string, { audio: string; video: string; missed: string; tap: string; answer: string; decline: string }> = {
  en: { audio: 'Incoming voice call', video: 'Incoming video call', missed: 'Missed call', tap: 'Tap to answer on MilkyWay', answer: 'Answer', decline: 'Decline' },
  sw: { audio: 'Simu ya sauti inaingia', video: 'Simu ya video inaingia', missed: 'Simu uliyoikosa', tap: 'Gusa kupokea kwenye MilkyWay', answer: 'Pokea', decline: 'Kataa' },
  fr: { audio: 'Appel vocal entrant', video: 'Appel vidéo entrant', missed: 'Appel manqué', tap: 'Touchez pour répondre sur MilkyWay', answer: 'Répondre', decline: 'Refuser' },
  zh: { audio: '语音来电', video: '视频来电', missed: '未接来电', tap: '点按在 MilkyWay 上接听', answer: '接听', decline: '拒绝' },
  ar: { audio: 'مكالمة صوتية واردة', video: 'مكالمة فيديو واردة', missed: 'مكالمة فائتة', tap: 'اضغط للرد على MilkyWay', answer: 'رد', decline: 'رفض' },
  pt: { audio: 'Chamada de voz recebida', video: 'Chamada de vídeo recebida', missed: 'Chamada perdida', tap: 'Toque para atender no MilkyWay', answer: 'Atender', decline: 'Recusar' },
  hi: { audio: 'आने वाली वॉइस कॉल', video: 'आने वाली वीडियो कॉल', missed: 'मिस्ड कॉल', tap: 'MilkyWay पर जवाब देने के लिए टैप करें', answer: 'जवाब दें', decline: 'अस्वीकार करें' },
  de: { audio: 'Eingehender Sprachanruf', video: 'Eingehender Videoanruf', missed: 'Verpasster Anruf', tap: 'Tippe, um in MilkyWay anzunehmen', answer: 'Annehmen', decline: 'Ablehnen' },
};

export function callPushPayload(push: CallPush, language: string) {
  const text = labels[language] || labels.en;
  const ring = push.kind === 'ring';
  return JSON.stringify({
    title: ring ? `${push.callerName} · ${text[push.mode]}` : `${text.missed} · ${push.callerName}`,
    body: ring ? text.tap : text[push.mode],
    url: `/milkyway/#call=${push.id}`,
    tag: `mw-call-${push.id}`,
    call: { id: push.id, kind: push.kind, mode: push.mode, answer: text.answer, decline: text.decline },
  });
}

// Rings every device the recipient enabled background alerts on. Calls are time-critical,
// so this sends straight away instead of going through the scheduled Live delivery queue.
export async function sendCallPush(recipientId: string, push: CallPush) {
  const configuration = pushConfiguration();
  if (!configuration) return { configured: false, delivered: 0 };
  const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, recipientId)).limit(20);
  if (!subscriptions.length) return { configured: true, delivered: 0 };
  const [preferences] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, recipientId));
  const payload = callPushPayload(push, preferences?.language || 'sw');
  const gone: string[] = [];
  const results = await Promise.allSettled(subscriptions.map(subscription => webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload,
    { vapidDetails: configuration, TTL: push.kind === 'ring' ? 45 : 3600, timeout: 6000, urgency: 'high', topic: `call${push.id.replace(/-/g, '').slice(0, 28)}` },
  ).catch(error => {
    if ([404, 410].includes((error as { statusCode?: number }).statusCode || 0)) gone.push(subscription.id);
    throw error;
  })));
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone)).catch(() => {});
  return { configured: true, delivered: results.filter(result => result.status === 'fulfilled').length };
}
