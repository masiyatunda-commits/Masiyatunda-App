import { getStore } from '@netlify/blobs';
import { and, eq, desc, inArray, or, isNull, lte, gt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { mediaAssets, campaigns, adDismissals, accountAppeals, storyViews, postWatermarks, liveHistoryArchives, liveRooms, accountSuspensions, accountBalances, accountPreferences, accountPhones, accountCountries, accountDetails } from '../db/schema.js';
import { isCountry, currencyOf } from '../lib/coins.js';
import { supabaseConfig } from '../lib/supabase.js';
import { administratorAccess } from '../lib/admin.js';
import { isOwner, activeSuspension } from '../lib/suspensions.js';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status, safe: true }); };
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const videoTypes = ['video/mp4', 'video/webm'];
const placements = ['feed', 'banner', 'video'];
// Targeting lists are short, lower-case, comma-separated codes ("sw,en", "tz,ke").
const codeList = (value: unknown) => String(value ?? '').toLowerCase().split(/[\s,]+/).filter(code => /^[a-z]{2,3}$/.test(code)).slice(0, 30).join(',');
// Payment and performance details stay in the admin dashboard; viewers only receive what is needed to show the ad.
const publicCampaign = ({ createdBy, deleted, paid, amountPaid, currency, paymentRef, impressions, clicks, targetLanguages, targetCountries, ...campaign }: Record<string, any>) => campaign;
const secureUrl = (value: unknown) => {
  try { const url = new URL(String(value)); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
};

// Phone numbers are kept as international digits. A local number starting with 0 is read as Tanzanian (+255);
// the last nine digits also match numbers typed without any country code.
const phoneNumber = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!/^\+?[\d\s().-]{6,24}$/.test(raw)) return null;
  const international = raw.startsWith('+') || raw.startsWith('00');
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  const local = !international && digits.startsWith('0');
  if (local) digits = `255${digits.slice(1)}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return { phone: digits, tail: digits.slice(-9), exact: international || local };
};

// Date of birth arrives as YYYY-MM-DD and must be a real calendar day for someone aged 13 to 120.
const genders = ['male', 'female', 'other'];
const minimumAge = 13;
const birthDate = (value: unknown) => {
  const text = String(value ?? '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return '';
  const [year, month, day] = match.slice(1).map(Number);
  const when = new Date(Date.UTC(year, month - 1, day));
  if (when.getUTCFullYear() !== year || when.getUTCMonth() !== month - 1 || when.getUTCDate() !== day) return '';
  const today = new Date();
  const age = today.getUTCFullYear() - year - (today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day) ? 1 : 0);
  return age >= minimumAge && age <= 120 ? text : '';
};

type Geo = { geo?: { country?: { code?: string } } };
// Where someone is joining from: their network (IP) location first, then the region their device reports
// (time zone / language), sent by the app as X-MW-Region.
const detectCountry = (request: Request, context?: Geo) => {
  const network = String(context?.geo?.country?.code || '').toUpperCase();
  if (isCountry(network)) return { country: network, source: 'network' };
  const device = String(request.headers.get('X-MW-Region') || '').toUpperCase();
  return isCountry(device) ? { country: device, source: 'device' } : { country: '', source: '' };
};

async function optionalAccount(request: Request) {
  const authorization = request.headers.get('Authorization') || '';
  const { base, apiKey } = supabaseConfig(request);
  if (!authorization.startsWith('Bearer ') || !base || !apiKey) return null;
  const response = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: authorization, apikey: apiKey }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  const account = response?.ok ? await response.json() : null;
  return account && /^[a-f0-9-]{36}$/i.test(account.id) ? account.id as string : null;
}

export default async function handler(request: Request, context?: Geo) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  try {
    if (!['GET', 'POST', 'DELETE'].includes(request.method)) fail('Method not allowed.', 405);
    if (request.method === 'GET' && action === 'advertisements') {
      // Signed-in viewers also receive members-only campaigns and never see campaigns they dismissed within the campaign's dismissal window.
      const viewer = await optionalAccount(request);
      const now = new Date();
      const records = await db.select().from(campaigns).where(and(
        eq(campaigns.status, 'approved'), eq(campaigns.paid, true), eq(campaigns.deleted, false),
        or(isNull(campaigns.startsAt), lte(campaigns.startsAt, now)), or(isNull(campaigns.endsAt), gt(campaigns.endsAt, now)),
        viewer ? inArray(campaigns.audience, ['all', 'members']) : eq(campaigns.audience, 'all'),
      )).orderBy(desc(campaigns.updatedAt)).limit(40);
      // Language comes from the app; country from the visitor's network location.
      const language = (url.searchParams.get('lang') || '').toLowerCase().slice(0, 3);
      const country = (context?.geo?.country?.code || '').toLowerCase();
      const targeted = records.filter(record => {
        const languages = record.targetLanguages ? record.targetLanguages.split(',') : [];
        const countries = record.targetCountries ? record.targetCountries.split(',') : [];
        return (!languages.length || languages.includes(language)) && (!countries.length || countries.includes(country));
      }).slice(0, 12);
      const dismissed = viewer && records.length ? await db.select().from(adDismissals).where(and(eq(adDismissals.userId, viewer), inArray(adDismissals.campaignId, records.map(record => record.id)))) : [];
      const hidden = new Set(dismissed.filter(item => { const campaign = targeted.find(record => record.id === item.campaignId); return campaign && item.dismissedAt.getTime() + campaign.dismissDays * 86400000 > now.getTime(); }).map(item => item.campaignId));
      return Response.json({ campaigns: targeted.filter(record => !hidden.has(record.id)).map(publicCampaign) }, { headers });
    }
    if (request.method === 'POST' && action === 'ad-event') {
      // Anonymous impression and click counters for the advertiser report; only live, paid campaigns are counted.
      const id = url.searchParams.get('id') || '';
      const type = url.searchParams.get('type');
      if (!/^[a-f0-9-]{36}$/i.test(id) || !['impression', 'click'].includes(type || '')) fail('Invalid event.', 400);
      const column = type === 'click' ? campaigns.clicks : campaigns.impressions;
      await db.update(campaigns).set(type === 'click' ? { clicks: sql`${column} + 1` } : { impressions: sql`${column} + 1` })
        .where(and(eq(campaigns.id, id), eq(campaigns.status, 'approved'), eq(campaigns.paid, true), eq(campaigns.deleted, false)));
      return new Response(null, { status: 204, headers });
    }
    // The sign-up form asks for the visitor's country before the account exists, so it is recorded with the account.
    if (request.method === 'GET' && action === 'detect-country') return Response.json(detectCountry(request, context), { headers });
    if (request.method === 'GET' && action === 'watermarks') {
      const ids = (url.searchParams.get('ids') || '').split(',').filter(id => /^[a-f0-9-]{36}$/i.test(id)).slice(0, 60);
      const records = ids.length ? await db.select({ postId: postWatermarks.postId }).from(postWatermarks).where(inArray(postWatermarks.postId, ids)) : [];
      return Response.json({ ids: records.map(record => record.postId) }, { headers: { ...headers, 'Cache-Control': 'public, max-age=30' } });
    }
    if (request.method === 'GET' && action === 'privacy') {
      // Public privacy flags so the feed can hide private accounts and the composer can respect who may send messages.
      const ids = (url.searchParams.get('ids') || '').split(',').filter(id => /^[a-f0-9-]{36}$/i.test(id)).slice(0, 100);
      const records = ids.length ? await db.select({ userId: accountPreferences.userId, isPrivate: accountPreferences.isPrivate, allowMessages: accountPreferences.allowMessages, readReceipts: accountPreferences.readReceipts }).from(accountPreferences).where(inArray(accountPreferences.userId, ids)) : [];
      return Response.json({ accounts: Object.fromEntries(records.map(record => [record.userId, { private: record.isPrivate, messages: record.allowMessages, receipts: record.readReceipts }])) }, { headers: { ...headers, 'Cache-Control': 'public, max-age=20' } });
    }
    if (request.method === 'GET' && action === 'campaign-media') {
      const key = url.searchParams.get('key') || '';
      const mediaUrl = `/.netlify/functions/milkyway-account?action=campaign-media&key=${encodeURIComponent(key)}`;
      const [asset] = await db.select().from(mediaAssets).where(and(eq(mediaAssets.key, key), eq(mediaAssets.purpose, 'campaign'), eq(mediaAssets.deleted, false)));
      if (!asset) fail('Media unavailable.', 404);
      const authorization = request.headers.get('Authorization') || '';
      const { base, apiKey } = supabaseConfig(request);
      let administrator = false;
      let signedIn = false;
      if (authorization.startsWith('Bearer ') && base && apiKey) {
        const authHeaders = { Authorization: authorization, apikey: apiKey };
        const response = await fetch(`${base}/auth/v1/user`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
        if (response.ok) { const account = await response.json();signedIn = /^[a-f0-9-]{36}$/i.test(account.id);administrator = isOwner(account) || await administratorAccess(account, base, authHeaders); }
      }
      if (!administrator) {
        const now = new Date();
        const [published] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.mediaUrl, mediaUrl), eq(campaigns.deleted, false), eq(campaigns.status, 'approved'), eq(campaigns.paid, true), or(isNull(campaigns.startsAt), lte(campaigns.startsAt, now)), or(isNull(campaigns.endsAt), gt(campaigns.endsAt, now)), signedIn ? inArray(campaigns.audience, ['all', 'members']) : eq(campaigns.audience, 'all'))).limit(1);
        if (!published) fail('Media unavailable.', 404);
      }
      const content = await getStore({ name: 'milkyway-campaign-media', consistency: 'strong' }).get(key, { type: 'arrayBuffer' });
      if (!content) fail('Media unavailable.', 404);
      return new Response(content as ArrayBuffer, { headers: { ...headers, 'Content-Type': asset.mime, 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, max-age=60' } });
    }
    if (request.method === 'GET' && action === 'avatar') {
      const key = url.searchParams.get('key') || '';
      const [asset] = await db.select().from(mediaAssets).where(and(eq(mediaAssets.key, key), eq(mediaAssets.purpose, 'avatar'), eq(mediaAssets.deleted, false)));
      if (!asset) fail('Photo unavailable.', 404);
      const image = await getStore({ name: 'milkyway-profile-images', consistency: 'strong' }).get(key, { type: 'arrayBuffer' });
      if (!image) fail('Photo unavailable.', 404);
      return new Response(image as ArrayBuffer, { headers: { ...headers, 'Content-Type': asset.mime, 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'public, max-age=300' } });
    }
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) fail('Sign in first.', 401);
    const { base, apiKey } = supabaseConfig(request);
    if (!base || !apiKey) fail('Account service is not configured.', 503);
    const authHeaders = { Authorization: authorization, apikey: apiKey! };
    const accountResponse = await fetch(`${base}/auth/v1/user`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
    if (!accountResponse.ok) fail([401, 403].includes(accountResponse.status) ? 'Your session expired. Sign in again.' : 'Account verification is temporarily unavailable. Retry after reconnecting.', [401, 403].includes(accountResponse.status) ? 401 : 503);
    const account = await accountResponse.json();
    if (!/^[a-f0-9-]{36}$/i.test(account.id)) fail('Invalid account.', 401);
    // The verified owner is always an administrator, so the in-app Admin screen and the full dashboard agree.
    const owner = isOwner(account);
    const isAdmin = ['admin-status', 'campaigns', 'campaign-media'].includes(action || '') ? owner || await administratorAccess(account, base, authHeaders) : false;
    if (action === 'admin-status' && request.method === 'GET') return Response.json({ isAdmin, owner }, { headers });
    if (action === 'account-status' && request.method === 'GET') {
      const suspension = await activeSuspension(account.id);
      const [appeal] = suspension ? await db.select({ status: accountAppeals.status, createdAt: accountAppeals.createdAt, adminNote: accountAppeals.adminNote }).from(accountAppeals).where(eq(accountAppeals.userId, account.id)).orderBy(desc(accountAppeals.createdAt)).limit(1) : [];
      return Response.json({ suspended: Boolean(suspension), reason: suspension?.reason || '', owner, appeal: appeal && appeal.createdAt >= suspension!.suspendedAt ? appeal : null }, { headers });
    }
    if (action === 'appeal' && request.method === 'POST') {
      const suspension = await activeSuspension(account.id);
      if (!suspension) fail('Your account is not suspended.', 400);
      const raw = await request.text();
      if (raw.length > 4096) fail('Request too large.', 413);
      let body;
      try { body = JSON.parse(raw); } catch { fail('Invalid request.', 400); }
      const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 1500) : '';
      if (message.length < 10) fail('Explain in a few words why the suspension should be lifted.', 400);
      const [pending] = await db.select({ id: accountAppeals.id }).from(accountAppeals).where(and(eq(accountAppeals.userId, account.id), eq(accountAppeals.status, 'pending'))).limit(1);
      if (pending) fail('Your appeal is already waiting for review.', 409);
      await db.insert(accountAppeals).values({ userId: account.id, message });
      return Response.json({ status: 'pending' }, { status: 201, headers });
    }
    if (action === 'preferences') {
      const defaults = { isPrivate: false, allowMessages: 'everyone', notifyFollow: true, notifyEcho: true, notifySignal: true, readReceipts: true, notifyMessages: true, messageSound: true };
      const [saved] = await db.select().from(accountPreferences).where(eq(accountPreferences.userId, account.id));
      const { userId, updatedAt, ...current } = saved || { userId: account.id, updatedAt: null, ...defaults };
      if (request.method === 'GET') return Response.json({ preferences: current }, { headers });
      if (request.method !== 'POST') fail('Method not allowed.', 405);
      const body = await request.json().catch(() => null);
      const valid = body && typeof body === 'object' && ['isPrivate', 'notifyFollow', 'notifyEcho', 'notifySignal'].every(key => typeof body[key] === 'boolean') && ['everyone', 'followers', 'nobody'].includes(body.allowMessages) && ['readReceipts', 'notifyMessages', 'messageSound'].every(key => body[key] === undefined || typeof body[key] === 'boolean');
      if (!valid) fail('Invalid settings.', 400);
      // Message settings are optional so older Settings forms keep the saved values.
      const preferences = { isPrivate: body.isPrivate, allowMessages: body.allowMessages, notifyFollow: body.notifyFollow, notifyEcho: body.notifyEcho, notifySignal: body.notifySignal, readReceipts: body.readReceipts ?? current.readReceipts, notifyMessages: body.notifyMessages ?? current.notifyMessages, messageSound: body.messageSound ?? current.messageSound };
      await db.insert(accountPreferences).values({ userId: account.id, ...preferences }).onConflictDoUpdate({ target: accountPreferences.userId, set: { ...preferences, updatedAt: new Date() } });
      return Response.json({ preferences }, { headers });
    }
    if (action === 'phone') {
      if (request.method === 'GET') {
        const [saved] = await db.select({ phone: accountPhones.phone }).from(accountPhones).where(eq(accountPhones.userId, account.id));
        return Response.json({ phone: saved ? `+${saved.phone}` : '' }, { headers });
      }
      if (request.method !== 'POST') fail('Method not allowed.', 405);
      const body = await request.json().catch(() => null);
      if (!String(body?.phone ?? '').trim()) {
        await db.delete(accountPhones).where(eq(accountPhones.userId, account.id));
        return Response.json({ phone: '' }, { headers });
      }
      const number = phoneNumber(body.phone);
      if (!number) fail('Enter a valid phone number, for example +255712345678.', 400);
      const [owner] = await db.select({ userId: accountPhones.userId }).from(accountPhones).where(eq(accountPhones.phone, number!.phone));
      if (owner && owner.userId !== account.id) fail('This phone number is already linked to another MilkyWay account.', 409);
      await db.insert(accountPhones).values({ userId: account.id, phone: number!.phone, phoneTail: number!.tail }).onConflictDoUpdate({ target: accountPhones.userId, set: { phone: number!.phone, phoneTail: number!.tail, updatedAt: new Date() } });
      return Response.json({ phone: `+${number!.phone}` }, { headers });
    }
    if (action === 'country') {
      // The country is saved once, when the account joins: the one detected on the sign-up form, otherwise where
      // the first signed-in request comes from. It is never replaced by later travel.
      const shape = (row?: { country: string; source: string; detectedAt: Date }) => ({ country: row?.country || '', source: row?.source || '', detectedAt: row?.detectedAt ?? null });
      const fields = { country: accountCountries.country, source: accountCountries.source, detectedAt: accountCountries.detectedAt };
      const [saved] = await db.select(fields).from(accountCountries).where(eq(accountCountries.userId, account.id));
      if (saved || request.method === 'GET') return Response.json(shape(saved), { headers });
      if (request.method !== 'POST') fail('Method not allowed.', 405);
      const signup = String(account.user_metadata?.mw_country || '').toUpperCase();
      const signupSource = ['network', 'device'].includes(account.user_metadata?.mw_country_source) ? account.user_metadata.mw_country_source : 'signup';
      const found = isCountry(signup) ? { country: signup, source: signupSource } : detectCountry(request, context);
      if (!found.country) return Response.json(shape(), { headers });
      // The currency column keeps the country's own currency, exactly as the wallet already records it.
      await db.insert(accountCountries).values({ userId: account.id, country: found.country, currency: currencyOf(found.country), source: found.source }).onConflictDoNothing();
      const [stored] = await db.select(fields).from(accountCountries).where(eq(accountCountries.userId, account.id));
      return Response.json(shape(stored), { status: 201, headers });
    }
    if (action === 'details') {
      // Date of birth and gender: given on the sign-up form (kept with the account until the first sign-in saves
      // them here), and changeable later from the profile. Only the account itself can read them.
      const fields = { birthDate: accountDetails.birthDate, gender: accountDetails.gender };
      const shape = (row?: { birthDate: string; gender: string }) => ({ birthDate: row?.birthDate || '', gender: row?.gender || '' });
      const [saved] = await db.select(fields).from(accountDetails).where(eq(accountDetails.userId, account.id));
      if (request.method === 'GET') return Response.json(shape(saved), { headers });
      if (request.method !== 'POST') fail('Method not allowed.', 405);
      const raw = await request.text();
      if (raw.length > 1024) fail('Request too large.', 413);
      let body: any = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { fail('Invalid request.', 400); }
      const fromSignup = !body?.birthDate && !body?.gender;
      if (fromSignup && saved) return Response.json(shape(saved), { headers });
      const source = fromSignup ? { birthDate: account.user_metadata?.mw_birth_date, gender: account.user_metadata?.mw_gender } : body;
      const details = { birthDate: birthDate(source?.birthDate), gender: genders.includes(source?.gender) ? source.gender : '' };
      if (fromSignup && (!details.birthDate || !details.gender)) return Response.json(shape(), { headers });
      if (!details.birthDate) fail(`Enter a real date of birth. You must be at least ${minimumAge} years old.`, 400);
      if (!details.gender) fail('Choose a gender.', 400);
      await db.insert(accountDetails).values({ userId: account.id, ...details }).onConflictDoUpdate({ target: accountDetails.userId, set: { ...details, updatedAt: new Date() } });
      return Response.json(details, { status: saved ? 200 : 201, headers });
    }
    if (action === 'phone-lookup' && request.method === 'GET') {
      // Exact lookups only: a full number finds its account, nothing is listed or matched partially.
      const number = phoneNumber(url.searchParams.get('q'));
      if (!number) return Response.json({ accounts: [], valid: false }, { headers });
      const records = await db.select({ userId: accountPhones.userId }).from(accountPhones).where(number.exact ? eq(accountPhones.phone, number.phone) : eq(accountPhones.phoneTail, number.tail)).limit(5);
      return Response.json({ accounts: records.map(record => record.userId).filter(id => id !== account.id), valid: true, phone: number.exact ? `+${number.phone}` : '' }, { headers });
    }
    if (action === 'balance' && request.method === 'GET') {
      const [balance] = await db.select({ coins: accountBalances.coins, updatedAt: accountBalances.updatedAt }).from(accountBalances).where(eq(accountBalances.userId, account.id));
      return Response.json({ coins: balance?.coins ?? 0, updatedAt: balance?.updatedAt ?? null }, { headers });
    }
    if (['admin-users', 'admin-suspend', 'admin-restore', 'admin-appeals', 'admin-appeal'].includes(action || '')) {
      // User management is limited to the verified owner email, independent of the advertising administrator role.
      if (!isOwner(account)) fail('Only the MilkyWay owner account can manage users.', 403);
      if (action === 'admin-users' && request.method === 'GET') {
        const offset = Math.max(0, Math.min(100000, Number(url.searchParams.get('offset')) || 0));
        const search = (url.searchParams.get('q') || '').trim().replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 60);
        let filter = search ? `&or=(display_name.ilike.*${encodeURIComponent(search)}*,username.ilike.*${encodeURIComponent(search)}*)` : '';
        if (url.searchParams.get('status') === 'suspended') {
          const suspended = await db.select({ userId: accountSuspensions.userId }).from(accountSuspensions).where(isNull(accountSuspensions.liftedAt)).orderBy(desc(accountSuspensions.suspendedAt)).limit(300);
          if (!suspended.length) return Response.json({ total: 0, offset, suspendedTotal: 0, users: [] }, { headers });
          filter += `&id=in.(${suspended.map(item => item.userId).join(',')})`;
        }
        const response = await fetch(`${base}/rest/v1/mw_profiles?select=id,display_name,username,avatar_url,created_at&order=created_at.desc&limit=50&offset=${offset}${filter}`, { headers: { ...authHeaders, Prefer: 'count=exact' }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) fail('Registered users could not be loaded from Supabase. Retry.', 503);
        const profiles: { id: string; display_name: string; username: string | null; avatar_url: string | null; created_at: string }[] = await response.json();
        const total = Number((response.headers.get('Content-Range') || '').split('/')[1]) || profiles.length + offset;
        const ids = profiles.map(profile => profile.id).filter(id => /^[a-f0-9-]{36}$/i.test(id));
        const suspensions = ids.length ? await db.select().from(accountSuspensions).where(inArray(accountSuspensions.userId, ids)) : [];
        const appeals = ids.length ? await db.select({ userId: accountAppeals.userId }).from(accountAppeals).where(and(inArray(accountAppeals.userId, ids), eq(accountAppeals.status, 'pending'))) : [];
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(accountSuspensions).where(isNull(accountSuspensions.liftedAt));
        return Response.json({
          total, offset, suspendedTotal: count,
          users: profiles.map(profile => {
            const record = suspensions.find(item => item.userId === profile.id);
            const active = record && !record.liftedAt;
            return { id: profile.id, name: profile.display_name, username: profile.username, avatar: profile.avatar_url, createdAt: profile.created_at, self: profile.id === account.id, status: active ? 'suspended' : 'active', reason: active ? record.reason : '', suspendedAt: active ? record.suspendedAt : null, appealPending: Boolean(active && appeals.some(item => item.userId === profile.id)) };
          }),
        }, { headers });
      }
      if (action === 'admin-appeals' && request.method === 'GET') {
        const status = ['pending', 'approved', 'rejected'].includes(url.searchParams.get('status') || '') ? url.searchParams.get('status')! : 'pending';
        const records = await db.select().from(accountAppeals).where(eq(accountAppeals.status, status)).orderBy(desc(accountAppeals.createdAt)).limit(100);
        const ids = [...new Set(records.map(record => record.userId))];
        const profiles: { id: string; display_name: string; username: string | null; avatar_url: string | null }[] = ids.length ? await fetch(`${base}/rest/v1/mw_profiles?select=id,display_name,username,avatar_url&id=in.(${ids.join(',')})`, { headers: authHeaders, signal: AbortSignal.timeout(10000) }).then(response => response.ok ? response.json() : []).catch(() => []) : [];
        const suspensions = ids.length ? await db.select().from(accountSuspensions).where(inArray(accountSuspensions.userId, ids)) : [];
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(accountAppeals).where(eq(accountAppeals.status, 'pending'));
        return Response.json({
          pendingTotal: count,
          appeals: records.map(record => {
            const profile = profiles.find(item => item.id === record.userId);
            const suspension = suspensions.find(item => item.userId === record.userId);
            return { id: record.id, userId: record.userId, name: profile?.display_name || '', username: profile?.username || null, avatar: profile?.avatar_url || null, message: record.message, status: record.status, adminNote: record.adminNote, createdAt: record.createdAt, resolvedAt: record.resolvedAt, suspended: Boolean(suspension && !suspension.liftedAt), reason: suspension && !suspension.liftedAt ? suspension.reason : '' };
          }),
        }, { headers });
      }
      if (request.method !== 'POST') fail('Method not allowed.', 405);
      const raw = await request.text();
      if (raw.length > 2048) fail('Request too large.', 413);
      if (action === 'admin-appeal') {
        let body: any;
        try { body = JSON.parse(raw); } catch { fail('Invalid request.', 400); }
        if (typeof body?.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.id) || !['approve', 'reject'].includes(body.decision)) fail('Choose an appeal and a decision.', 400);
        const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
        const [appeal] = await db.select().from(accountAppeals).where(and(eq(accountAppeals.id, body.id), eq(accountAppeals.status, 'pending')));
        if (!appeal) fail('This appeal was already reviewed.', 409);
        const now = new Date();
        await db.transaction(async transaction => {
          await transaction.update(accountAppeals).set({ status: body.decision === 'approve' ? 'approved' : 'rejected', adminNote: note, resolvedAt: now, resolvedBy: account.id }).where(eq(accountAppeals.id, appeal.id));
          if (body.decision === 'approve') await transaction.update(accountSuspensions).set({ liftedAt: now, liftedBy: account.id }).where(and(eq(accountSuspensions.userId, appeal.userId), isNull(accountSuspensions.liftedAt)));
        });
        return Response.json({ id: appeal.id, userId: appeal.userId, status: body.decision === 'approve' ? 'approved' : 'rejected' }, { headers });
      }
      let body;
      try { body = JSON.parse(raw); } catch { fail('Invalid request.', 400); }
      const target = body?.userId;
      if (typeof target !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(target)) fail('Choose a valid account.', 400);
      if (target === account.id) fail('The owner account cannot suspend itself.', 400);
      if (action === 'admin-suspend') {
        const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
        await db.insert(accountSuspensions).values({ userId: target, reason, suspendedBy: account.id }).onConflictDoUpdate({ target: accountSuspensions.userId, set: { reason, suspendedBy: account.id, suspendedAt: new Date(), liftedAt: null, liftedBy: null } });
        return Response.json({ userId: target, status: 'suspended' }, { headers });
      }
      const now = new Date();
      await db.update(accountSuspensions).set({ liftedAt: now, liftedBy: account.id }).where(and(eq(accountSuspensions.userId, target), isNull(accountSuspensions.liftedAt)));
      // Unblocking directly also settles any appeal the member had waiting.
      await db.update(accountAppeals).set({ status: 'approved', adminNote: 'Unblocked by the owner.', resolvedAt: now, resolvedBy: account.id }).where(and(eq(accountAppeals.userId, target), eq(accountAppeals.status, 'pending')));
      return Response.json({ userId: target, status: 'active' }, { headers });
    }
    if (action === 'campaign-media' && request.method === 'POST') {
      if (!isAdmin) fail('Administrator approval is required to manage advertisements.', 403);
      // Images up to 4 MB; short video ads up to 5 MB (larger videos can be linked by HTTPS address instead).
      if (Number(request.headers.get('Content-Length')) > 5 * 1024 * 1024 + 65536) fail('Advertisement media must be under 5 MB. Link larger videos by HTTPS address.', 413);
      const file = (await request.formData()).get('file');
      const video = file instanceof File && videoTypes.includes(file.type);
      if (!(file instanceof File) || !file.size || file.size > (video ? 5 : 4) * 1024 * 1024 || !(video || imageTypes.includes(file.type))) return fail('Choose a JPEG, PNG or WebP image under 4 MB, or an MP4 or WebM video under 5 MB.', 400);
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const valid = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : file.type === 'image/png' ? bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
        : file.type === 'video/mp4' ? new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp' : file.type === 'video/webm' ? bytes.slice(0, 4).join(',') === '26,69,223,163'
        : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
      if (!valid) fail(video ? 'This file is not a supported video.' : 'This file is not a supported image.', 415);
      const key = `${account.id}/${crypto.randomUUID()}`;
      const store = getStore('milkyway-campaign-media');
      await store.set(key, buffer);
      try { await db.insert(mediaAssets).values({ key, ownerId: account.id, purpose: 'campaign', name: file.name.slice(0, 120), mime: file.type }); }
      catch (error) { await store.delete(key);throw error; }
      return Response.json({ mediaUrl: `/.netlify/functions/milkyway-account?action=campaign-media&key=${encodeURIComponent(key)}`, mediaType: video ? 'video' : 'image' }, { status: 201, headers });
    }
    if (action === 'live-history') {
      const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
      if (request.method === 'GET') {
        const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean);
        if (ids.length > 60 || ids.some(id => !validId(id))) fail('Invalid session reference.', 400);
        const rooms = (url.searchParams.get('rooms') || '').split(',').filter(Boolean);
        if (rooms.length > 60 || rooms.some(room => !/^mw-conversation-(audio|video)-[a-f0-9-]{36}$/i.test(room))) fail('Invalid session reference.', 400);
        const archived = ids.length ? await db.select({ id: liveHistoryArchives.sessionId, source: liveHistoryArchives.source }).from(liveHistoryArchives).where(and(eq(liveHistoryArchives.ownerId, account.id), inArray(liveHistoryArchives.sessionId, ids))) : [];
        const metadata = rooms.length ? await db.select({ room: liveRooms.room, startedAt: liveRooms.startedAt, endedAt: liveRooms.endedAt, lifecycleStatus: liveRooms.lifecycleStatus }).from(liveRooms).where(and(eq(liveRooms.hostId, account.id), inArray(liveRooms.room, rooms))) : [];
        return Response.json({ archived, metadata }, { headers });
      }
      if (request.method !== 'POST') fail('Method not allowed.', 405);
      const raw = await request.text();
      if (raw.length > 16384) fail('Request too large.', 413);
      let body;
      try { body = JSON.parse(raw); } catch { fail('Invalid request.', 400); }
      if (!Array.isArray(body?.sessions) || !body.sessions.length || body.sessions.length > 60 || body.sessions.some((item: any) => !validId(item?.id) || !['audio', 'video'].includes(item?.source))) fail('Invalid session reference.', 400);
      const sessions: { id: string; source: string }[] = body.sessions;
      for (const source of ['video', 'audio']) {
        const ids = [...new Set(sessions.filter(item => item.source === source).map(item => item.id))];
        if (!ids.length) continue;
        const table = source === 'video' ? 'mw_video_live_sessions' : 'mw_audio_live_rooms';
        const ended = source === 'video' ? 'is_live=eq.false' : 'status=eq.ended';
        const response = await fetch(`${base}/rest/v1/${table}?id=in.(${ids.join(',')})&host_id=eq.${account.id}&${ended}&select=id`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
        if (!response.ok) fail('Session ownership could not be verified. Retry after reconnecting.', 503);
        const owned = await response.json();
        if (!Array.isArray(owned) || ids.some(id => !owned.some(item => item.id === id))) fail('Only your own ended sessions can be removed from history.', 403);
      }
      await db.insert(liveHistoryArchives).values(sessions.map(item => ({ ownerId: account.id, sessionId: item.id, source: item.source }))).onConflictDoNothing();
      return Response.json({ ok: true }, { headers });
    }
    if (action === 'privacy-capabilities' && request.method === 'GET') {
      const response = await fetch(`${base}/rest/v1/rpc/mw_privacy_capabilities`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) });
      if (!response.ok) return Response.json({ profileVisibility: false, messagePrivacy: false, blocking: false }, { headers });
      const capabilities = await response.json();
      return Response.json({ profileVisibility: capabilities.profileVisibility === true, messagePrivacy: capabilities.messagePrivacy === true, blocking: capabilities.blocking === true }, { headers });
    }
    if (action === 'deletion-request') {
      if (request.method !== 'POST') fail('Method not allowed.', 405);
      const raw = await request.text();
      if (raw.length > 2048) fail('Request too large.', 413);
      let body;
      try { body = JSON.parse(raw); } catch { fail('Invalid request.', 400); }
      if (!account.email || body.acknowledge !== true || body.confirmation !== account.email) fail('Confirm your signed-in email and the deletion warning.', 400);
      const existing = await fetch(`${base}/rest/v1/mw_account_deletion_requests?user_id=eq.${account.id}&status=eq.pending&select=id,status&limit=1`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
      if (!existing.ok) fail('Account deletion requests require the existing provider table and ownership policies. Contact the administrator.', 503);
      const pending = await existing.json();
      if (!pending.length) {
        const response = await fetch(`${base}/rest/v1/mw_account_deletion_requests?select=id,status`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ user_id: account.id }), signal: AbortSignal.timeout(10000) });
        if (!response.ok || !(await response.json()).some((record: { status: string }) => record.status === 'pending')) fail('The account deletion request was not confirmed. Nothing was reported deleted.', 503);
      }
      return Response.json({ status: 'pending', accountDeleted: false, requiresAdministrator: true }, { status: 202, headers });
    }
    const profileRequest = async (method = 'GET', body?: object, expectedAvatar?: string | null) => {
      const condition = expectedAvatar === undefined ? '' : expectedAvatar === null ? '&avatar_url=is.null' : `&avatar_url=eq.${encodeURIComponent(expectedAvatar)}`;
      const response = await fetch(`${base}/rest/v1/mw_profiles?id=eq.${account.id}&select=id,avatar_url${condition}`, {
        method, headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) fail('Profile could not be saved. Retry.', 503);
      const profiles = await response.json();
      if (!profiles.length) fail(expectedAvatar === undefined ? 'Create your profile before uploading a photo.' : 'Your profile photo changed elsewhere. Reload and retry.', 409);
      return profiles[0];
    };
    const avatarKey = (value: unknown) => {
      if (typeof value !== 'string' || !value.startsWith('/.netlify/functions/milkyway-account?action=avatar&key=')) return null;
      const key = new URL(value, request.url).searchParams.get('key');
      return key?.startsWith(`${account.id}/`) ? key : null;
    };
    const removeAvatarObject = async (key: string) => db.transaction(async transaction => {
      const [asset] = await transaction.select().from(mediaAssets).where(and(eq(mediaAssets.key, key), eq(mediaAssets.ownerId, account.id), eq(mediaAssets.purpose, 'avatar'))).for('update');
      if (!asset || asset.retained || asset.deleted) return Boolean(asset?.deleted);
      await getStore('milkyway-profile-images').delete(key);
      await transaction.update(mediaAssets).set({ deleted: true }).where(eq(mediaAssets.key, key));
      return true;
    });
    if (request.method === 'GET' && action === 'files') {
      const files = await db.select().from(mediaAssets).where(and(eq(mediaAssets.ownerId, account.id), eq(mediaAssets.deleted, false))).orderBy(desc(mediaAssets.createdAt)).limit(100);
      return Response.json({ files }, { headers });
    }
    if (action === 'stories') {
      if (request.method === 'GET') return Response.json({ viewed: await db.select({ storyId: storyViews.storyId }).from(storyViews).where(eq(storyViews.ownerId, account.id)).orderBy(desc(storyViews.viewedAt)).limit(200) }, { headers });
      if (request.method !== 'POST') return fail('Method not allowed.', 405);
      const raw = await request.text();
      if (raw.length > 1024) return fail('Request too large.', 413);
      let body;
      try { body = JSON.parse(raw); } catch { fail('Invalid request.', 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Invalid request.', 400);
      if (!/^[a-f0-9-]{36}$/i.test(body.id)) return fail('Invalid story.', 400);
      const response = await fetch(`${base}/rest/v1/mw_stories?id=eq.${body.id}&select=id&limit=1`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
      if (!response.ok || !(await response.json()).length) return fail('Story unavailable.', 404);
      await db.insert(storyViews).values({ ownerId: account.id, storyId: body.id }).onConflictDoNothing();
      return Response.json({ ok: true }, { headers });
    }
    if (action === 'watermark') {
      const id = url.searchParams.get('id') || '';
      if (!/^[a-f0-9-]{36}$/i.test(id)) fail('Invalid post.', 400);
      if (request.method === 'DELETE') {
        await db.delete(postWatermarks).where(and(eq(postWatermarks.postId, id), eq(postWatermarks.ownerId, account.id)));
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== 'POST') fail('Method not allowed.', 405);
      const response = await fetch(`${base}/rest/v1/mw_posts?id=eq.${id}&author_id=eq.${account.id}&select=id,media_url,media_type&limit=1`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
      if (!response.ok) fail('Post ownership could not be verified.', 503);
      const [post] = await response.json();
      if (!post) fail('Only the author can brand this post.', 403);
      if (!post.media_url) fail('Only image and video posts can carry the watermark.', 409);
      await db.insert(postWatermarks).values({ postId: id, ownerId: account.id }).onConflictDoNothing();
      return Response.json({ ok: true }, { headers });
    }
    if (action === 'dismiss-ad' && request.method === 'POST') {
      const id = url.searchParams.get('id') || '';
      if (!/^[a-f0-9-]{36}$/i.test(id)) fail('Invalid campaign.', 400);
      await db.insert(adDismissals).values({ campaignId: id, userId: account.id }).onConflictDoUpdate({ target: [adDismissals.campaignId, adDismissals.userId], set: { dismissedAt: new Date() } });
      return Response.json({ ok: true }, { headers });
    }
    if (action === 'campaigns') {
      if (!isAdmin) fail('Administrator approval is required to manage advertisements.', 403);
      if (request.method === 'GET') return Response.json({ campaigns: await db.select().from(campaigns).where(eq(campaigns.deleted, false)).orderBy(desc(campaigns.updatedAt)).limit(100) }, { headers });
      if (request.method === 'DELETE') {
        const id = url.searchParams.get('id') || '';
        if (!/^[a-f0-9-]{36}$/i.test(id)) fail('Invalid campaign.', 400);
        // Soft delete keeps an audit trail while guaranteeing the campaign is never served again.
        await db.update(campaigns).set({ deleted: true, status: 'paused', updatedAt: new Date() }).where(eq(campaigns.id, id));
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== 'POST') fail('Method not allowed.', 405);
      const raw = await request.text();
      if (raw.length > 8192) fail('Request too large.', 413);
      const body = JSON.parse(raw);
      const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
      const date = (value: unknown) => { if (!value) return null; const parsed = new Date(String(value)); return Number.isNaN(parsed.getTime()) ? fail('Use valid start and end dates.', 400) : parsed; };
      const managedMedia = typeof body.mediaUrl === 'string' && /^\/\.netlify\/functions\/milkyway-account\?action=campaign-media&key=[a-f0-9%-]+$/i.test(body.mediaUrl);
      if (!['draft', 'approved', 'paused'].includes(body.status) || !text(body.business, 100) || !body.business.trim() || !text(body.title ?? '', 140) || !text(body.description, 1000) || !text(body.ctaLabel ?? '', 40) || !(managedMedia || secureUrl(body.mediaUrl)) || (body.destination && !secureUrl(body.destination)) || !['image', 'video'].includes(body.mediaType) || !['all', 'members'].includes(body.audience || 'all')) fail('Use a business name, HTTPS media and destination, and a valid approval status.', 400);
      if (managedMedia) {
        const key = new URL(body.mediaUrl, url.origin).searchParams.get('key') || '';
        const [asset] = await db.select().from(mediaAssets).where(and(eq(mediaAssets.key, key), eq(mediaAssets.purpose, 'campaign'), eq(mediaAssets.deleted, false)));
        if (!asset || body.mediaType !== (asset.mime.startsWith('video/') ? 'video' : 'image')) fail('Media unavailable.', 400);
      }
      const startsAt = date(body.startsAt), endsAt = date(body.endsAt);
      if (startsAt && endsAt && endsAt <= startsAt) fail('The end date must be after the start date.', 400);
      const frequency = Math.min(20, Math.max(3, Number(body.frequency) || 6)), dismissDays = Math.min(365, Math.max(1, Number(body.dismissDays) || 7));
      const id = body.id || crypto.randomUUID();
      if (!/^[a-f0-9-]{36}$/i.test(id)) fail('Invalid campaign.', 400);
      const values: Record<string, unknown> = { business: body.business.trim(), title: (body.title || '').trim(), description: body.description, mediaUrl: body.mediaUrl, mediaType: body.mediaType, destination: body.destination || '', ctaLabel: (body.ctaLabel || '').trim(), status: body.status, startsAt, endsAt, audience: body.audience || 'all', frequency, dismissDays, updatedAt: new Date() };
      // Placement, payment and targeting are set from the full dashboard; older editors that omit them keep the saved values.
      if ('placement' in body) {
        if (!placements.includes(body.placement)) fail('Choose a feed, banner or video placement.', 400);
        if (body.placement === 'video' && body.mediaType !== 'video') fail('Video ads need a video file or video link.', 400);
        values.placement = body.placement;
      }
      if ('skipAfter' in body) values.skipAfter = Math.min(30, Math.max(0, Math.round(Number(body.skipAfter) || 0)));
      if ('paid' in body) values.paid = body.paid === true;
      if ('amountPaid' in body) values.amountPaid = Math.min(2_000_000_000, Math.max(0, Math.round(Number(body.amountPaid) || 0)));
      if ('currency' in body) { if (!/^[A-Z]{3}$/.test(String(body.currency))) fail('Use a three-letter currency code such as TZS.', 400); values.currency = body.currency; }
      if ('paymentRef' in body) { if (!text(body.paymentRef, 120)) fail('The payment reference is too long.', 400); values.paymentRef = body.paymentRef.trim(); }
      if ('targetLanguages' in body) values.targetLanguages = codeList(body.targetLanguages);
      if ('targetCountries' in body) values.targetCountries = codeList(body.targetCountries);
      await db.insert(campaigns).values({ id, ...values, createdBy: account.id } as typeof campaigns.$inferInsert).onConflictDoUpdate({ target: campaigns.id, set: values, where: eq(campaigns.deleted, false) });
      return Response.json({ id }, { headers });
    }
    if (action === 'avatar' && request.method === 'POST') {
      if (Number(request.headers.get('Content-Length')) > 2 * 1024 * 1024 + 65536) fail('Photo must be under 2 MB.', 413);
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024 || !imageTypes.includes(file.type)) return fail('Choose a JPEG, PNG or WebP photo under 2 MB.', 400);
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const signature = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : file.type === 'image/png' ? bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10' : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
      if (!signature) fail('This file is not a supported image.', 415);
      const previousProfile = await profileRequest();
      const store = getStore('milkyway-profile-images');
      const key = `${account.id}/${crypto.randomUUID()}`;
      const avatarUrl = `/.netlify/functions/milkyway-account?action=avatar&key=${encodeURIComponent(key)}`;
      await store.set(key, buffer);
      try {
        await db.insert(mediaAssets).values({ key, ownerId: account.id, purpose: 'avatar', name: file.name.slice(0, 120), mime: file.type });
        await profileRequest('PATCH', { avatar_url: avatarUrl }, previousProfile.avatar_url ?? null);
      } catch (error) {
        const savedProfile = await profileRequest().catch(() => null);
        if (!savedProfile || savedProfile.avatar_url !== avatarUrl) {
          if (savedProfile) {
            await store.delete(key).catch(() => {});
            await db.update(mediaAssets).set({ deleted: true }).where(eq(mediaAssets.key, key)).catch(() => {});
          }
          throw error;
        }
      }
      let cleanupPending = false;
      const previousKey = avatarKey(previousProfile.avatar_url);
      if (previousKey && previousKey !== key) cleanupPending = !(await removeAvatarObject(previousKey).catch(() => false));
      else if (previousProfile.avatar_url && !previousKey) cleanupPending = true;
      return Response.json({ avatarUrl, cleanupPending }, { status: 201, headers });
    }
    if (action === 'avatar' && request.method === 'DELETE') {
      const profile = await profileRequest();
      await profileRequest('PATCH', { avatar_url: null }, profile.avatar_url ?? null);
      const key = avatarKey(profile.avatar_url);
      const cleanupPending = key ? !(await removeAvatarObject(key).catch(() => false)) : Boolean(profile.avatar_url);
      return Response.json({ avatarRemoved: true, cleanupPending }, { headers });
    }
    if (action === 'file' && request.method === 'DELETE') {
      const key = url.searchParams.get('key') || '';
      await db.transaction(async transaction => {
        const [asset] = await transaction.select().from(mediaAssets).where(and(eq(mediaAssets.key, key), eq(mediaAssets.ownerId, account.id))).for('update');
        if (!asset || asset.deleted) fail('File unavailable.', 404);
        if (asset.retained) fail('This file is retained for moderation or legal review.', 409);
        if (asset.purpose === 'avatar') {
          const profile = await profileRequest();
          if (avatarKey(profile.avatar_url) === key) await profileRequest('PATCH', { avatar_url: null }, profile.avatar_url);
          await getStore('milkyway-profile-images').delete(key);
        } else if (asset.purpose === 'dm') {
          const response = await fetch(`${base}/rest/v1/mw_messages?sender_id=eq.${account.id}&body=like.*${encodeURIComponent(key)}*&select=id&limit=1`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
          if (!response.ok) fail('File references could not be verified.', 503);
          if ((await response.json()).length) fail('Delete the associated message first. Sent files are preserved until their message is removed.', 409);
          await getStore('milkyway-private-dm-files').delete(key);
        } else fail('This file requires its original management screen.', 409);
        await transaction.update(mediaAssets).set({ deleted: true }).where(eq(mediaAssets.key, key));
      });
      return new Response(null, { status: 204, headers });
    }
    fail('Unknown account action.', 400);
  } catch (error) {
    const known = error as { status?: number; message?: string; safe?: boolean };
    return Response.json({ error: known.safe ? known.message : 'Account service unavailable. Retry after reconnecting.' }, { status: known.safe ? known.status : 503, headers });
  }
}
