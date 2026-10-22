import { createSign } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { fcmDevices } from '../db/schema.js';

// Firebase Cloud Messaging (HTTP v1). FIREBASE_SERVICE_ACCOUNT holds the service-account JSON downloaded
// from Firebase console → Project settings → Service accounts. Without it, pushes are skipped silently.
type ServiceAccount = { project_id: string; client_email: string; private_key: string };
let cachedToken: { value: string; expires: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
    if (!raw) return null;
    const parsed = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    return parsed.project_id && parsed.client_email && parsed.private_key ? parsed : null;
  } catch { return null; }
}

export const fcmConfigured = () => !!serviceAccount();

// Public Firebase client config for the Android app, so an APK built without google-services.json
// can still start Firebase. FIREBASE_GOOGLE_SERVICES holds that file's contents (raw or base64);
// FIREBASE_ANDROID_APP_ID / FIREBASE_API_KEY / FIREBASE_SENDER_ID work too. These values are not secret.
const ANDROID_PACKAGE = 'com.masiyatunda.milkyway';
export function firebaseClientConfig() {
  let fromFile: { appId?: string; apiKey?: string; projectId?: string; senderId?: string } = {};
  try {
    const raw = process.env.FIREBASE_GOOGLE_SERVICES || '';
    if (raw) {
      const parsed = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
      const clients = Array.isArray(parsed.client) ? parsed.client : [];
      const client = clients.find((entry: any) => entry?.client_info?.android_client_info?.package_name === ANDROID_PACKAGE) || clients[0];
      fromFile = {
        appId: client?.client_info?.mobilesdk_app_id,
        apiKey: client?.api_key?.[0]?.current_key,
        projectId: parsed.project_info?.project_id,
        senderId: parsed.project_info?.project_number,
      };
    }
  } catch {}
  const config = {
    appId: process.env.FIREBASE_ANDROID_APP_ID || fromFile.appId || '',
    apiKey: process.env.FIREBASE_API_KEY || fromFile.apiKey || '',
    projectId: fromFile.projectId || serviceAccount()?.project_id || '',
    senderId: process.env.FIREBASE_SENDER_ID || fromFile.senderId || '',
  };
  return Object.values(config).every(value => typeof value === 'string' && value) ? config : null;
}

async function accessToken(account: ServiceAccount) {
  if (cachedToken && cachedToken.expires > Date.now() + 60000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key.replace(/\\n/g, '\n'), 'base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('FCM authorization failed.');
  const data = await response.json();
  cachedToken = { value: data.access_token, expires: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

async function sendToTokens(tokens: string[], message: PushMessage) {
  const account = serviceAccount();
  if (!account || !tokens.length) return 0;
  const token = await accessToken(account);
  let delivered = 0;
  const stale: string[] = [];
  await Promise.all([...new Set(tokens)].slice(0, 200).map(async device => {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ message: {
        token: device,
        notification: { title: message.title.slice(0, 120), body: message.body.slice(0, 240) },
        data: { url: message.url || '/milkyway/', tag: message.tag || 'milkyway' },
        android: { priority: 'HIGH', notification: { channel_id: 'milkyway_default', tag: message.tag || undefined, sound: 'default', default_vibrate_timings: true } },
      } }),
    }).catch(() => null);
    if (response?.ok) delivered++;
    else if (response && [400, 404].includes(response.status)) {
      const detail = await response.text().catch(() => '');
      if (/UNREGISTERED|INVALID_ARGUMENT|registration-token-not-registered/.test(detail)) stale.push(device);
    }
  }));
  if (stale.length) await db.delete(fcmDevices).where(inArray(fcmDevices.token, stale));
  return delivered;
}

export async function pushToUsers(userIds: string[], message: PushMessage) {
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, 500);
  if (!ids.length || !fcmConfigured()) return 0;
  const devices = await db.select({ token: fcmDevices.token }).from(fcmDevices).where(inArray(fcmDevices.userId, ids));
  return sendToTokens(devices.map(device => device.token), message);
}

export async function pushToAdmins(message: PushMessage) {
  if (!fcmConfigured()) return 0;
  const devices = await db.select({ token: fcmDevices.token }).from(fcmDevices).where(eq(fcmDevices.isAdmin, true));
  return sendToTokens(devices.map(device => device.token), message);
}
