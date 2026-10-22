import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accountBalances, creatorEarnings, companyWallet, gifts, coinTopups, coinWithdrawals, walletSettings, liveRooms, liveMessages, postAudiences, accountCountries } from '../db/schema.js';
import { supabaseConfig } from '../lib/supabase.js';
import { isOwner, assertActive } from '../lib/suspensions.js';
import { coinTzs, minWithdrawCoins, milliPerCoin, giftCatalog, giftAliases, topupPackages, networks, giftSplit, payoutBreakdown, isCountry, currencyOf, fallbackRates, pricingFor, localMinor, currencyDigits } from '../lib/coins.js';

// MilkyWay Coins wallet: the gift catalog, sending gifts on posts and LIVEs, mobile money top-ups and creator payouts.
// Top-ups and payouts are confirmed by the owner in the admin dashboard, because no mobile money provider is connected.
// Every gift is split behind the scenes: 60% to the recipient's dashboard balance, 40% to the company wallet. Responses
// to users report only gift prices and their own net share; the split and the company wallet are only visible to the owner.
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status, safe: true }); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const coinsOf = (milli: number) => milli / milliPerCoin;
const settingKey = 'payment_instructions';
const companyWalletId = 'company';

const phoneNumber = (value: unknown) => {
  let digits = String(value ?? '').replace(/[\s().-]/g, '');
  if (!/^\+?\d{9,15}$/.test(digits)) return null;
  digits = digits.replace(/^\+/, '');
  if (digits.startsWith('0')) digits = `255${digits.slice(1)}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
};
const cleanText = (value: unknown, limit: number) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, limit);

async function paymentInstructions() {
  const [row] = await db.select({ value: walletSettings.value }).from(walletSettings).where(eq(walletSettings.key, settingKey));
  return row?.value || '';
}

// Lipa Namba: the mobile money merchant number shown with a QR code on the buy-coins screen.
// `qr` is optional text copied from the official merchant QR; without it the QR carries the number itself.
const lipaKeys = { number: 'lipa_namba', name: 'lipa_name', network: 'lipa_network', qr: 'lipa_qr' } as const;
type Lipa = Record<keyof typeof lipaKeys, string>;
async function lipaNamba(): Promise<Lipa> {
  const rows = await db.select({ key: walletSettings.key, value: walletSettings.value }).from(walletSettings).where(inArray(walletSettings.key, Object.values(lipaKeys)));
  const values = new Map(rows.map(row => [row.key, row.value]));
  return Object.fromEntries(Object.entries(lipaKeys).map(([field, key]) => [field, values.get(key) || ''])) as Lipa;
}
const emptyLipa: Lipa = { number: '', name: '', network: '', qr: '' };

// Exchange rates (TZS per unit of each currency), refreshed from a public feed at most twice a day and kept in
// the wallet settings so every function instance shares them. The built-in table covers any outage.
const ratesKey = 'fx_rates';
const ratesAge = 12 * 3600 * 1000;
let ratesCache: { at: number; rates: Record<string, number> } | null = null;
async function exchangeRates(): Promise<Record<string, number>> {
  if (ratesCache && Date.now() - ratesCache.at < ratesAge) return ratesCache.rates;
  try {
    const [row] = await db.select({ value: walletSettings.value }).from(walletSettings).where(eq(walletSettings.key, ratesKey));
    const stored = row?.value ? JSON.parse(row.value) : null;
    if (stored?.rates && Date.now() - Number(stored.at) < ratesAge) { ratesCache = stored;return stored.rates; }
    const response = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(4000) });
    const feed = response.ok ? await response.json() : null;
    const perUsd = feed?.rates || {};
    if (!(perUsd.TZS > 0)) throw new Error('No TZS rate');
    const rates: Record<string, number> = { TZS: 1 };
    for (const [currency, value] of Object.entries(perUsd)) if (typeof value === 'number' && value > 0 && /^[A-Z]{3}$/.test(currency)) rates[currency] = perUsd.TZS / value;
    ratesCache = { at: Date.now(), rates };
    const value = JSON.stringify(ratesCache);
    await db.insert(walletSettings).values({ key: ratesKey, value }).onConflictDoUpdate({ target: walletSettings.key, set: { value, updatedAt: new Date() } });
    return rates;
  } catch {
    // Retry the feed in an hour rather than on every request.
    ratesCache = { at: Date.now() - ratesAge + 3600 * 1000, rates: { ...fallbackRates, ...ratesCache?.rates } };
    return ratesCache.rates;
  }
}

type Geo = { geo?: { country?: { code?: string } } };
// The visitor's country: their network location first, then the region the device reports (time zone / language).
const networkCountry = (context?: Geo) => { const code = String(context?.geo?.country?.code || '').toUpperCase();return isCountry(code) ? code : ''; };
const deviceCountry = (request: Request) => { const code = String(request.headers.get('X-MW-Region') || '').toUpperCase();return isCountry(code) ? code : ''; };

export default async function handler(request: Request, context?: Geo) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  try {
    if (!['GET', 'POST'].includes(request.method)) fail('Method not allowed.', 405);
    if (action === 'catalog' && request.method === 'GET') {
      // Guests see prices in the currency of where they are browsing from; this is also what sign-up records.
      const detected = networkCountry(context) || deviceCountry(request);
      const pricing = { ...pricingFor(detected || 'TZ', await exchangeRates()), detected: Boolean(detected) };
      return Response.json({ coinTzs, minWithdrawCoins, gifts: giftCatalog, topupPackages, networks, pricing, paymentInstructions: await paymentInstructions().catch(() => ''), lipa: await lipaNamba().catch(() => emptyLipa) }, { headers: { ...headers, 'Cache-Control': 'private, max-age=60', Vary: 'X-MW-Region' } });
    }

    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) fail('Sign in first.', 401);
    const { base, apiKey } = supabaseConfig(request);
    if (!base || !apiKey) fail('Account service is not configured.', 503);
    const authHeaders = { Authorization: authorization, apikey: apiKey };
    const accountResponse = await fetch(`${base}/auth/v1/user`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
    if (!accountResponse.ok) fail([401, 403].includes(accountResponse.status) ? 'Your session expired. Sign in again.' : 'Account verification is temporarily unavailable. Retry after reconnecting.', [401, 403].includes(accountResponse.status) ? 401 : 503);
    const account = await accountResponse.json();
    if (!uuid.test(account.id || '')) fail('Invalid account.', 401);
    const me = account.id as string;
    const rest = async (path: string) => {
      const response = await fetch(`${base}/rest/v1/${path}`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
      if (!response.ok) fail('MilkyWay could not be reached. Retry.', 503);
      return response.json();
    };
    const profiles = async (ids: string[]) => {
      type Profile = { id: string; display_name?: string; username?: string; avatar_url?: string };
      const unique = [...new Set(ids)].filter(id => uuid.test(id));
      const rows: Profile[] = unique.length ? await rest(`mw_profiles?id=in.(${unique.join(',')})&select=id,display_name,username,avatar_url`).catch(() => []) : [];
      return new Map(rows.map(row => [row.id, row]));
    };
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

    // The account's country is saved once, when it first joins: the country recorded at sign-up, otherwise the
    // network location of this request, otherwise the device's region. It is never asked for.
    let pricingCache: ReturnType<typeof pricingFor> | null = null;
    const pricing = async () => {
      if (pricingCache) return pricingCache;
      const rates = await exchangeRates();
      try {
        const [saved] = await db.select({ country: accountCountries.country }).from(accountCountries).where(eq(accountCountries.userId, me));
        if (saved) return pricingCache = pricingFor(saved.country, rates);
        const signup = String(account.user_metadata?.mw_country || '').toUpperCase();
        const [country, source] = isCountry(signup) ? [signup, 'signup'] : networkCountry(context) ? [networkCountry(context), 'network'] : deviceCountry(request) ? [deviceCountry(request), 'device'] : ['', ''];
        if (!country) return pricingCache = pricingFor('TZ', rates);
        await db.insert(accountCountries).values({ userId: me, country, currency: currencyOf(country), source }).onConflictDoNothing().returning({ userId: accountCountries.userId });
        return pricingCache = pricingFor(country, rates);
      } catch (error) {
        console.error('Account country unavailable', error);
        return pricingCache = pricingFor(networkCountry(context) || 'TZ', rates);
      }
    };

    if (action === 'country' && request.method === 'POST') return Response.json({ pricing: await pricing() }, { headers });

    if (action === 'wallet' && request.method === 'GET') {
      const [[balance], [earnings], received, topups, withdrawals] = await Promise.all([
        db.select().from(accountBalances).where(eq(accountBalances.userId, me)),
        db.select().from(creatorEarnings).where(eq(creatorEarnings.userId, me)),
        db.select().from(gifts).where(eq(gifts.recipientId, me)).orderBy(desc(gifts.createdAt)).limit(20),
        db.select().from(coinTopups).where(eq(coinTopups.userId, me)).orderBy(desc(coinTopups.createdAt)).limit(10),
        db.select().from(coinWithdrawals).where(eq(coinWithdrawals.userId, me)).orderBy(desc(coinWithdrawals.createdAt)).limit(10),
      ]);
      const senders = await profiles(received.map(gift => gift.senderId));
      const available = earnings?.availableMilli ?? 0;
      return Response.json({
        coins: balance?.coins ?? 0,
        earned: coinsOf(available),
        lifetimeEarned: coinsOf(earnings?.lifetimeMilli ?? 0),
        minWithdrawCoins, coinTzs, pricing: await pricing(),
        canWithdraw: available >= minWithdrawCoins * milliPerCoin && !withdrawals.some(item => item.status === 'pending'),
        received: received.map(gift => ({ gift: gift.giftKey, earned: coinsOf(gift.creatorMilli), from: senders.get(gift.senderId)?.display_name || '', target: gift.targetType, at: gift.createdAt })),
        topups: topups.map(item => ({ id: item.id, coins: item.coins, amountTzs: item.amountTzs, currency: item.currency, amountLocalMinor: item.amountLocalMinor, reference: item.reference, status: item.status, note: item.adminNote, at: item.createdAt })),
        withdrawals: withdrawals.map(item => ({ id: item.id, coins: coinsOf(item.milli), payoutTzs: item.payoutTzs, currency: item.currency, payoutLocalMinor: item.payoutLocalMinor, network: item.network, status: item.status, payoutRef: item.payoutRef, note: item.adminNote, at: item.createdAt })),
      }, { headers });
    }

    if (action === 'gift' && request.method === 'POST') {
      await assertActive(me);
      const gift = giftCatalog.find(item => item.key === (giftAliases[body.gift] || body.gift));
      if (!gift) fail('Choose a gift.', 400);
      let recipient = '', targetType = '', targetId = '', room = '';
      if (typeof body.postId === 'string') {
        if (!uuid.test(body.postId)) fail('Post unavailable.', 404);
        const [post] = await rest(`mw_posts?id=eq.${body.postId}&select=id,author_id&limit=1`);
        if (!post) fail('Post unavailable.', 404);
        const [audience] = await db.select({ audience: postAudiences.audience }).from(postAudiences).where(eq(postAudiences.postId, body.postId));
        if (audience?.audience === 'only_me' && post.author_id !== me) fail('Post unavailable.', 404);
        recipient = post.author_id;targetType = 'post';targetId = post.id;
      } else if (typeof body.storyId === 'string') {
        // Story photos and videos: the gift goes to whoever posted the story, while it is still up.
        if (!uuid.test(body.storyId)) fail('This story has expired.', 404);
        const [story] = await rest(`mw_stories?id=eq.${body.storyId}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,user_id&limit=1`);
        if (!story) fail('This story has expired.', 404);
        recipient = story.user_id;targetType = 'story';targetId = story.id;
      } else if (typeof body.room === 'string') {
        if (!/^[A-Za-z0-9_-]{3,120}$/.test(body.room)) fail('This LIVE has ended.', 404);
        const [session] = await rest(`mw_video_live_sessions?room_name=eq.${encodeURIComponent(body.room)}&is_live=eq.true&select=host_id,room_name&limit=1`);
        if (!session) fail('This LIVE has ended.', 404);
        recipient = session.host_id;targetType = 'live';targetId = session.room_name;room = session.room_name;
      } else fail('Choose a post, story or LIVE to send the gift to.', 400);
      if (!uuid.test(recipient)) fail('This creator cannot receive gifts.', 404);
      if (recipient === me) fail('You cannot send a gift to yourself.', 400);
      const sender = room ? (await profiles([me])).get(me) : undefined;
      const { creatorMilli: share, companyMilli } = giftSplit(gift!.coins);
      const coins = await db.transaction(async transaction => {
        const [spent] = await transaction.update(accountBalances).set({ coins: sql`${accountBalances.coins} - ${gift!.coins}`, updatedAt: new Date() })
          .where(and(eq(accountBalances.userId, me), gte(accountBalances.coins, gift!.coins))).returning({ coins: accountBalances.coins });
        if (!spent) fail('Not enough coins. Top up your wallet first.', 402);
        await transaction.insert(creatorEarnings).values({ userId: recipient, availableMilli: share, lifetimeMilli: share })
          .onConflictDoUpdate({ target: creatorEarnings.userId, set: { availableMilli: sql`${creatorEarnings.availableMilli} + ${share}`, lifetimeMilli: sql`${creatorEarnings.lifetimeMilli} + ${share}`, updatedAt: new Date() } });
        await transaction.insert(companyWallet).values({ id: companyWalletId, balanceMilli: companyMilli })
          .onConflictDoUpdate({ target: companyWallet.id, set: { balanceMilli: sql`${companyWallet.balanceMilli} + ${companyMilli}`, updatedAt: new Date() } });
        await transaction.insert(gifts).values({ senderId: me, recipientId: recipient, giftKey: gift!.key, coins: gift!.coins, creatorMilli: share, companyMilli, targetType, targetId });
        // Conversation rooms show the gift in the LIVE chat for everyone watching.
        if (room) {
          const [open] = await transaction.select({ room: liveRooms.room }).from(liveRooms).where(and(eq(liveRooms.room, room), sql`${liveRooms.endedAt} is null`));
          if (open) await transaction.insert(liveMessages).values({ id: crypto.randomUUID(), room, userId: me, name: cleanText(sender?.display_name || 'MilkyWay', 80), avatar: cleanText(sender?.avatar_url || '', 600), body: JSON.stringify({ mwGift: 1, gift: gift!.key }), kind: 'gift' });
        }
        return spent.coins;
      });
      return Response.json({ sent: gift!.key, coins }, { headers });
    }

    if (action === 'topup' && request.method === 'POST') {
      await assertActive(me);
      const coins = Number(body.coins);
      if (!Number.isInteger(coins) || coins < 1 || coins > 1000) fail('Choose between 1 and 1,000 coins.', 400);
      if (!networks.includes(body.network)) fail('Choose your mobile money network.', 400);
      const phone = phoneNumber(body.phone);
      if (!phone) fail('Enter the phone number you paid from.', 400);
      const reference = cleanText(body.reference, 40).toUpperCase();
      if (!/^[A-Z0-9.-]{6,40}$/.test(reference)) fail('Enter the transaction reference from your payment message.', 400);
      const [pending] = await db.select({ count: sql<number>`count(*)::int` }).from(coinTopups).where(and(eq(coinTopups.userId, me), eq(coinTopups.status, 'pending')));
      if (pending.count >= 3) fail('You already have top-ups waiting for confirmation.', 409);
      const local = await pricing();
      const [saved] = await db.insert(coinTopups).values({ userId: me, coins, amountTzs: coins * coinTzs, currency: local.currency, amountLocalMinor: localMinor(coins * coinTzs, local.tzsPerUnit, local.digits), network: body.network, phone: phone!, reference }).onConflictDoNothing().returning({ id: coinTopups.id });
      if (!saved) fail('This transaction reference was already submitted.', 409);
      return Response.json({ id: saved.id, status: 'pending' }, { headers });
    }

    if (action === 'withdraw' && request.method === 'POST') {
      await assertActive(me);
      const milli = Math.round(Number(body.coins) * milliPerCoin);
      if (!Number.isFinite(milli) || milli < minWithdrawCoins * milliPerCoin) fail(`The minimum withdrawal is ${minWithdrawCoins} coins (TZS ${(minWithdrawCoins * coinTzs).toLocaleString('en')}).`, 400);
      if (!networks.includes(body.network)) fail('Choose your mobile money network.', 400);
      const phone = phoneNumber(body.phone);
      if (!phone) fail('Enter the mobile money number to receive the payout.', 400);
      const accountName = cleanText(body.name, 80);
      if (accountName.length < 3) fail('Enter the name registered on the mobile money number.', 400);
      // With 1 coin = 1,000 TZS, a thousandth of a coin is one shilling, so the stored net share is the payout amount.
      const breakdown = payoutBreakdown(milli * coinTzs / milliPerCoin);
      const local = await pricing();
      const payoutLocal = { currency: local.currency, payoutLocalMinor: localMinor(breakdown.payoutTzs, local.tzsPerUnit, local.digits) };
      const saved = await db.transaction(async transaction => {
        const [waiting] = await transaction.select({ id: coinWithdrawals.id }).from(coinWithdrawals).where(and(eq(coinWithdrawals.userId, me), eq(coinWithdrawals.status, 'pending'))).limit(1);
        if (waiting) fail('Your previous withdrawal is still being processed.', 409);
        const [reserved] = await transaction.update(creatorEarnings).set({ availableMilli: sql`${creatorEarnings.availableMilli} - ${milli}`, updatedAt: new Date() })
          .where(and(eq(creatorEarnings.userId, me), gte(creatorEarnings.availableMilli, milli))).returning({ availableMilli: creatorEarnings.availableMilli });
        if (!reserved) fail('You do not have that many coins to withdraw.', 402);
        const [row] = await transaction.insert(coinWithdrawals).values({ userId: me, milli, ...breakdown, ...payoutLocal, network: body.network, phone: phone!, accountName }).returning({ id: coinWithdrawals.id });
        return { id: row.id, earned: coinsOf(reserved.availableMilli) };
      });
      return Response.json({ ...saved, payoutTzs: breakdown.payoutTzs, ...payoutLocal, status: 'pending' }, { headers });
    }

    if (action.startsWith('admin-')) {
      // Money movements are limited to the verified owner account.
      if (!isOwner(account)) fail('Only the MilkyWay owner account can manage coins and payouts.', 403);
      if (action === 'admin-summary' && request.method === 'GET') {
        const [[giftTotals], [outstanding], [paid], [topupsWaiting], [payoutsWaiting], [company], instructions] = await Promise.all([
          db.select({ count: sql<number>`count(*)::int`, creator: sql<number>`coalesce(sum(${gifts.creatorMilli}), 0)::bigint`, company: sql<number>`coalesce(sum(${gifts.companyMilli}), 0)::bigint` }).from(gifts),
          db.select({ milli: sql<number>`coalesce(sum(${creatorEarnings.availableMilli}), 0)::bigint` }).from(creatorEarnings),
          db.select({ tzs: sql<number>`coalesce(sum(${coinWithdrawals.payoutTzs}), 0)::bigint` }).from(coinWithdrawals).where(eq(coinWithdrawals.status, 'paid')),
          db.select({ count: sql<number>`count(*)::int` }).from(coinTopups).where(eq(coinTopups.status, 'pending')),
          db.select({ count: sql<number>`count(*)::int` }).from(coinWithdrawals).where(eq(coinWithdrawals.status, 'pending')),
          db.select({ balanceMilli: companyWallet.balanceMilli }).from(companyWallet).where(eq(companyWallet.id, companyWalletId)),
          paymentInstructions(),
        ]);
        const lipa = await lipaNamba();
        const tzsOf = (milli: unknown) => Number(milli) * coinTzs / milliPerCoin;
        const creatorTzs = tzsOf(giftTotals.creator), commissionTzs = tzsOf(giftTotals.company);
        return Response.json({
          gifts: giftTotals.count, giftsGrossTzs: creatorTzs + commissionTzs, commissionTzs, companyWalletTzs: tzsOf(company?.balanceMilli ?? 0), creatorsOwedTzs: tzsOf(outstanding.milli),
          paidOutTzs: Number(paid.tzs), pendingTopups: topupsWaiting.count, pendingWithdrawals: payoutsWaiting.count, paymentInstructions: instructions, lipa, minWithdrawCoins, coinTzs,
        }, { headers });
      }
      if (action === 'admin-topups' && request.method === 'GET') {
        const status = ['pending', 'approved', 'rejected'].includes(url.searchParams.get('status') || '') ? url.searchParams.get('status')! : 'pending';
        const rows = await db.select().from(coinTopups).where(eq(coinTopups.status, status)).orderBy(desc(coinTopups.createdAt)).limit(100);
        const people = await profiles(rows.map(row => row.userId));
        return Response.json({ topups: rows.map(row => ({ ...row, localDigits: currencyDigits(row.currency), name: people.get(row.userId)?.display_name || '', username: people.get(row.userId)?.username || '' })) }, { headers });
      }
      if (action === 'admin-withdrawals' && request.method === 'GET') {
        const status = ['pending', 'paid', 'rejected'].includes(url.searchParams.get('status') || '') ? url.searchParams.get('status')! : 'pending';
        const rows = await db.select().from(coinWithdrawals).where(eq(coinWithdrawals.status, status)).orderBy(desc(coinWithdrawals.createdAt)).limit(100);
        const people = await profiles(rows.map(row => row.userId));
        return Response.json({ withdrawals: rows.map(row => ({ ...row, coins: coinsOf(row.milli), localDigits: currencyDigits(row.currency), name: people.get(row.userId)?.display_name || '', username: people.get(row.userId)?.username || '' })) }, { headers });
      }
      if (request.method !== 'POST') fail('Method not allowed.', 405);
      const note = cleanText(body.note, 300);
      if (action === 'admin-topup') {
        if (!uuid.test(body.id || '') || !['approve', 'reject'].includes(body.decision)) fail('Invalid top-up decision.', 400);
        await db.transaction(async transaction => {
          const [topup] = await transaction.update(coinTopups).set({ status: body.decision === 'approve' ? 'approved' : 'rejected', adminNote: note, resolvedAt: new Date(), resolvedBy: me })
            .where(and(eq(coinTopups.id, body.id), eq(coinTopups.status, 'pending'))).returning();
          if (!topup) fail('This top-up was already handled.', 409);
          if (body.decision === 'approve') await transaction.insert(accountBalances).values({ userId: topup.userId, coins: topup.coins })
            .onConflictDoUpdate({ target: accountBalances.userId, set: { coins: sql`${accountBalances.coins} + ${topup.coins}`, updatedAt: new Date() } });
        });
        return Response.json({ ok: true }, { headers });
      }
      if (action === 'admin-withdrawal') {
        if (!uuid.test(body.id || '') || !['paid', 'reject'].includes(body.decision)) fail('Invalid payout decision.', 400);
        const payoutRef = cleanText(body.payoutRef, 60);
        if (body.decision === 'paid' && payoutRef.length < 4) fail('Enter the mobile money transaction reference of the payout.', 400);
        await db.transaction(async transaction => {
          const [withdrawal] = await transaction.update(coinWithdrawals).set({ status: body.decision === 'paid' ? 'paid' : 'rejected', payoutRef, adminNote: note, resolvedAt: new Date(), resolvedBy: me })
            .where(and(eq(coinWithdrawals.id, body.id), eq(coinWithdrawals.status, 'pending'))).returning();
          if (!withdrawal) fail('This payout was already handled.', 409);
          // A rejected request returns the reserved coins to the creator.
          if (body.decision === 'reject') await transaction.update(creatorEarnings).set({ availableMilli: sql`${creatorEarnings.availableMilli} + ${withdrawal.milli}`, updatedAt: new Date() }).where(eq(creatorEarnings.userId, withdrawal.userId));
        });
        return Response.json({ ok: true }, { headers });
      }
      if (action === 'admin-settings') {
        const value = cleanText(String(body.paymentInstructions ?? '').replace(/\r?\n/g, ' • '), 400);
        const number = String(body.lipa?.number ?? '').replace(/[^\d]/g, '').slice(0, 20);
        const lipa: Lipa = {
          number,
          name: cleanText(body.lipa?.name, 80),
          network: networks.includes(body.lipa?.network) ? body.lipa.network : '',
          qr: cleanText(body.lipa?.qr, 600),
        };
        const entries = [[settingKey, value], ...Object.entries(lipaKeys).map(([field, key]) => [key, lipa[field as keyof Lipa]])];
        await db.transaction(async transaction => {
          for (const [key, entry] of entries) await transaction.insert(walletSettings).values({ key, value: entry }).onConflictDoUpdate({ target: walletSettings.key, set: { value: entry, updatedAt: new Date() } });
        });
        return Response.json({ paymentInstructions: value, lipa }, { headers });
      }
    }
    fail('Unknown wallet action.', 400);
  } catch (error) {
    const known = error as { status?: number; message?: string; safe?: boolean };
    if (!known.safe) console.error('Wallet error', error);
    return Response.json({ error: known.safe ? known.message : 'Wallet service unavailable. Retry after reconnecting.' }, { status: known.safe ? known.status : 503, headers });
  }
}
