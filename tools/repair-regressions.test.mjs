import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

test('administrator access accepts verified roles or the existing RPC, never editable profile flags', async () => {
  let invocations = 0;
  const gate = loadModule('lib/admin.ts', {}, { fetch: async () => { invocations++;return Response.json(false); } }).administratorAccess;
  assert.equal(await gate({ app_metadata: { authorization: { roles: ['admin'] } } }, 'https://backend.invalid', {}), true);
  assert.equal(invocations, 0);
  assert.equal(await gate({ user_metadata: { roles: ['admin'] }, is_admin: true }, 'https://backend.invalid', {}), false);
  const rpcGate = loadModule('lib/admin.ts', {}, { fetch: async () => Response.json(true) }).administratorAccess;
  assert.equal(await rpcGate({}, 'https://backend.invalid', {}), true);
  const absent = loadModule('lib/admin.ts', {}, { fetch: async () => new Response(null, { status: 404 }) }).administratorAccess;
  assert.equal(await absent({}, 'https://backend.invalid', {}), false);
  const denied = loadModule('lib/admin.ts', {}, { fetch: async () => new Response(null, { status: 503 }) }).administratorAccess;
  await assert.rejects(() => denied({}, 'https://backend.invalid', {}), /could not be verified/);
});

test('admin-status verifies accounts and does not turn ordinary members into administrators', async () => {
  for (const setup of [{}, { admin: true }, { adminRpc: true }]) {
    const response = await backend(setup).account(request('milkyway-account?action=admin-status', undefined, 'GET'));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).isAdmin, !!(setup.admin || setup.adminRpc));
  }
  assert.equal((await backend().account(request('milkyway-account?action=admin-status', undefined, 'GET', false))).status, 401);
});

test('availability preserves gateway, quota, missing deployment, invalid response and network diagnoses', async () => {
  for (const [status, reason] of [[401, 'authentication_required'], [403, 'access_denied'], [402, 'platform_restricted'], [429, 'platform_restricted'], [404, 'endpoint_missing'], [405, 'endpoint_incompatible'], [503, 'service_error']]) {
    const service = loadModule('lib/livekit-service.ts', { 'livekit-server-sdk': require('livekit-server-sdk'), './supabase.js': { supabaseConfig: () => ({ base: 'https://edge.invalid', apiKey: 'fixture-public' }) }, './livekit.js': { livekitConfig: () => null }, './livekit-direct.js': {} }, { fetch: async () => new Response('{}', { status }) });
    await assert.rejects(() => service.livekitRequest(new Request('https://application.invalid')), error => error.reason === reason && error.status === status);
  }
  const unavailable = loadModule('lib/livekit-service.ts', { 'livekit-server-sdk': require('livekit-server-sdk'), './supabase.js': { supabaseConfig: () => ({ base: 'https://edge.invalid', apiKey: '' }) }, './livekit.js': { livekitConfig: () => null }, './livekit-direct.js': {} }, { fetch: async () => { throw new Error('private upstream detail'); } });
  await assert.rejects(() => unavailable.livekitRequest(new Request('https://application.invalid')), error => error.reason === 'network_error' && !error.message.includes('private upstream'));
});

test('campaign creation, update and pause use the existing schema and administrator authorization', async () => {
  const payload = { business: 'Fixture business', title: 'Fixture campaign', description: 'Fixture content', mediaUrl: 'https://media.invalid/photo.jpg', mediaType: 'image', destination: 'https://business.invalid', status: 'draft', audience: 'all', frequency: 6, dismissDays: 7 };
  assert.equal((await backend().account(request('milkyway-account?action=campaigns', payload))).status, 403);
  const fixture = backend({ adminRpc: true, campaignRecords: [] });
  const created = await fixture.account(request('milkyway-account?action=campaigns', payload));
  assert.equal(created.status, 200);
  const { id } = await created.json();
  for (const status of ['approved', 'paused']) assert.equal((await fixture.account(request('milkyway-account?action=campaigns', { ...payload, id, status }))).status, 200);
  assert.deepEqual(fixture.inserted.map(item => item.records.status), ['draft', 'approved', 'paused']);
  for (const invalid of [{ business: '' }, { mediaUrl: 'javascript:alert(1)' }, { destination: 'http://business.invalid' }, { status: 'published' }, { startsAt: '2026-10-12', endsAt: '2026-10-11' }]) assert.equal((await fixture.account(request('milkyway-account?action=campaigns', { ...payload, ...invalid }))).status, 400);
});

test('public advertising excludes drafts, paused, unpaid, deleted, scheduled, expired and member-only campaigns', async () => {
  const campaign = { id: sessionId, status: 'approved', paid: true, deleted: false, startsAt: null, endsAt: null, audience: 'all', updatedAt: new Date(), createdBy: ownerId };
  const records = [campaign, ...[{ status: 'draft' }, { status: 'paused' }, { paid: false }, { deleted: true }, { audience: 'members' }, { startsAt: new Date('2099-01-01') }, { endsAt: new Date('2000-01-01') }].map((patch, index) => ({ ...campaign, id: String(index), ...patch }))];
  const response = await backend({ campaignRecords: records }).account(request('milkyway-account?action=advertisements', undefined, 'GET', false));
  assert.equal(response.status, 200);
  const { campaigns } = await response.json();
  assert.deepEqual(campaigns.map(record => record.id), [sessionId]);
  assert.equal('createdBy' in campaigns[0], false);
});

test('paid placements validate placement, video media and targeting, and older editors keep saved values', async () => {
  const payload = { business: 'Fixture business', title: 'Fixture campaign', description: 'Fixture content', mediaUrl: 'https://media.invalid/clip.mp4', mediaType: 'video', destination: 'https://business.invalid', status: 'approved', audience: 'all', frequency: 6, dismissDays: 7 };
  const fixture = backend({ adminRpc: true, campaignRecords: [] });
  assert.equal((await fixture.account(request('milkyway-account?action=campaigns', { ...payload, placement: 'popup' }))).status, 400);
  assert.equal((await fixture.account(request('milkyway-account?action=campaigns', { ...payload, placement: 'video', mediaType: 'image', mediaUrl: 'https://media.invalid/photo.jpg' }))).status, 400);
  assert.equal((await fixture.account(request('milkyway-account?action=campaigns', { ...payload, placement: 'video', currency: 'shillings' }))).status, 400);
  const created = await fixture.account(request('milkyway-account?action=campaigns', { ...payload, placement: 'video', skipAfter: 99, paid: true, amountPaid: 50000, currency: 'TZS', targetLanguages: 'sw, EN, <script>', targetCountries: 'tz,ke' }));
  assert.equal(created.status, 200);
  const saved = fixture.inserted.at(-1).records;
  assert.deepEqual([saved.placement, saved.skipAfter, saved.paid, saved.amountPaid, saved.targetLanguages, saved.targetCountries], ['video', 30, true, 50000, 'sw,en', 'tz,ke']);
  const { id } = await created.json();
  await fixture.account(request('milkyway-account?action=campaigns', { ...payload, id, status: 'paused' }));
  assert.equal('paid' in fixture.inserted.at(-1).records || 'placement' in fixture.inserted.at(-1).records, false);
});

test('public advertising honours language targeting and hides payment details', async () => {
  const base = { status: 'approved', paid: true, deleted: false, startsAt: null, endsAt: null, audience: 'all', updatedAt: new Date(), createdBy: ownerId, targetLanguages: '', targetCountries: '', paymentRef: 'private', amountPaid: 9 };
  const records = [{ ...base, id: 'everyone' }, { ...base, id: 'english', targetLanguages: 'en' }, { ...base, id: 'kenya', targetCountries: 'ke' }];
  const { campaigns } = await (await backend({ campaignRecords: records }).account(request('milkyway-account?action=advertisements&lang=sw', undefined, 'GET', false))).json();
  assert.deepEqual(campaigns.map(record => record.id), ['everyone']);
  assert.equal('paymentRef' in campaigns[0] || 'amountPaid' in campaigns[0], false);
});

test('ad events reject unknown campaigns and event types', async () => {
  for (const query of ['id=bad&type=click', `id=${sessionId}&type=view`]) assert.equal((await backend().account(request(`milkyway-account?action=ad-event&${query}`, undefined, 'POST', false))).status, 400);
});

test('advertisement uploads reject ordinary accounts and forged images before storage writes', async () => {
  const data = new FormData();data.append('file', new File(['not a png'], 'photo.png', { type: 'image/png' }));
  const upload = () => new Request('https://application.invalid/.netlify/functions/milkyway-account?action=campaign-media', { method: 'POST', headers: { Authorization: 'Bearer fixture-only' }, body: data });
  assert.equal((await backend().account(upload())).status, 403);
  assert.equal((await backend({ admin: true }).account(upload())).status, 415);
});

test('eight languages have complete new-language catalogs and account labels never expose identifiers', () => {
  const context = { window: {}, Map };
  vm.runInNewContext(source('milkyway/locale-catalogs.js'), context);
  vm.runInNewContext(source('milkyway/german-locale.js'), context);
  const prefix = source('milkyway/translations.js').split('  const language =')[0];
  vm.runInNewContext(prefix + 'globalThis.pack = { rows, phrases, indexes };})();', context);
  assert.equal(Object.keys(context.pack.indexes).length, 8);
  for (const locale of ['ar', 'pt', 'hi', 'de']) for (const values of [...Object.values(context.pack.rows), ...context.pack.phrases]) assert.ok(context.window.MilkyWayLocales[locale][values[0]], `${locale}: ${values[0]}`);
  assert.equal(context.window.MilkyWayLocales.ar.Password, 'كلمة المرور');
  assert.equal(context.window.MilkyWayLocales.pt.Password, 'Senha');
  assert.equal(context.window.MilkyWayLocales.hi.Password, 'पासवर्ड');
  for (const locale of ['ar', 'pt', 'hi', 'de']) {
    for (const [english, translated] of Object.entries(context.window.MilkyWayLocales[locale])) {
      const identifiers = english.match(/\bmw[-_][A-Za-z0-9_-]+\b|\blivekit-token\b|\b[A-Z]+_[A-Z_]+\b/g) || [];
      for (const identifier of identifiers) assert.ok(translated.includes(identifier), `${locale}: preserve ${identifier}`);
    }
  }
  for (const key of ['appearance', 'helpSupport', 'aboutMilkyWay']) assert.notEqual(context.pack.rows[key][0], key);
});

test('PWA standard and maskable icons have valid PNG dimensions and opaque launcher backgrounds', () => {
  const manifest = JSON.parse(source('milkyway/manifest.json'));
  assert.equal(manifest.icons.length, 4);
  for (const icon of manifest.icons) {
    const bytes = readFileSync(new URL(`../milkyway/${icon.src}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    const size = Number(icon.sizes.split('x')[0]);assert.equal(bytes.readUInt32BE(16), size);assert.equal(bytes.readUInt32BE(20), size);
    assert.ok([2, 3].includes(bytes[25]), 'launcher image has no alpha channel');
  }
});

test('Supabase health authenticates against LiveKit and never confuses configured credentials with provider availability', async () => {
  for (const [code, reason, available] of [[null, 'service_ready', true], ['unauthenticated', 'provider_authentication', false], ['permission_denied', 'provider_authentication', false], ['resource_exhausted', 'platform_restricted', false], ['unavailable', 'provider_unavailable', false]]) {
    let options = null;
    class ServiceFixture {
      constructor(_host, _key, _secret, configured) { options = configured; }
      async listRooms(names) { assert.deepEqual([...names], ['milkyway-health-probe']);if (code) throw Object.assign(new Error('private provider diagnostic'), { code });return []; }
    }
    const environment = { LIVEKIT_URL: projectUrl, LIVEKIT_API_KEY: 'ephemeral-fixture-key', LIVEKIT_API_SECRET: 'ephemeral-fixture-signing' };
    const handler = loadModule('supabase/functions/_shared/milkyway-token.ts', { 'npm:livekit-server-sdk@2.19.1': { RoomServiceClient: ServiceFixture } }, { Deno: { env: { get: name => environment[name] } } }).milkywayToken;
    const response = await handler(new Request('https://edge.invalid/functions/v1/livekit-token'));
    const result = await response.json();assert.equal(result.available, available);assert.equal(result.reason, reason);
    assert.equal(options.requestTimeout, 8);assert.equal(options.failover, false);
    assert.equal(JSON.stringify(result).includes('private provider'), false);
  }
});

test('actual Audio Live capture never requests the camera and releases tracks after video permission failure', async () => {
  const client = source('milkyway/live-feed.js');
  const capture = client.slice(client.indexOf('  async function captureTracks('), client.indexOf('  async function preview('));
  let audioRequests = 0, videoRequests = 0, stopped = 0;
  const microphone = { kind: 'audio', mediaStreamTrack: { readyState: 'live' }, stop() { stopped++; } };
  const sdk = { async createLocalAudioTrack() { audioRequests++;return microphone; }, async createLocalVideoTrack() { videoRequests++;throw Object.assign(new Error('fixture camera denied'), { name: 'NotAllowedError' }); } };
  const context = { window: { isSecureContext: true, LivekitClient: sdk }, navigator: { mediaDevices: { getUserMedia() {} } } };
  vm.runInNewContext(capture + 'globalThis.capture = captureTracks;', context);
  const tracks = await context.capture('audio', () => {});
  assert.equal(tracks.length, 1);assert.equal(audioRequests, 1);assert.equal(videoRequests, 0);
  await assert.rejects(() => context.capture('video', () => {}), /fixture camera denied/);
  assert.equal(videoRequests, 1);assert.equal(stopped, 1);
});

const require = createRequire(import.meta.url);
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ownerId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const roomName = `mw-conversation-video-${sessionId}`;
const projectUrl = 'wss://masiyatunda-milkyway-live-mgh6b1np.livekit.cloud';

function loadModule(path, imports, globals = {}) {
  const module = { exports: {} };
  const stripped = stripTypeScriptTypes(source(path));
  const names = [...stripped.matchAll(/export (?:(?:async )?function|const) (\w+)/g)].map(match => match[1]);
  const defaultName = stripped.match(/export default async function (\w+)/)?.[1];
  const exports = [...names, ...(defaultName ? [`default:${defaultName}`] : [])];
  const script = stripped.replace(/import \{([^}]+)\} from '([^']+)';/g, 'const {$1} = require("$2");').replace(/import (\w+) from '([^']+)';/g, 'const $1 = require("$2");').replace(/export default /g, '').replace(/export (?=(?:async )?function|const)/g, '') + `\nObject.assign(module.exports, {${exports.join(',')}});`;
  const context = vm.createContext({ module, exports: module.exports, require: identity => {
    if (!Object.hasOwn(imports, identity)) throw new Error(`Unexpected dependency: ${identity}`);
    return imports[identity];
  }, URL, Request, Response, File, TextDecoder, AbortSignal, Buffer, crypto: globalThis.crypto, ...globals });
  vm.runInContext(script, context, { filename: path });
  return module.exports;
}

function livekit(env = {}, runtime = undefined) {
  return loadModule('lib/livekit.ts', { 'livekit-server-sdk': require('livekit-server-sdk') }, { process: { env }, ...(runtime ? { Netlify: { env: { get: name => runtime[name] } } } : {}) });
}

test('missing LiveKit configuration reports names only and cannot issue credentials', () => {
  const configuration = livekit();
  const status = configuration.livekitConfigurationStatus();
  assert.equal(status.available, false);
  assert.equal(status.reason, 'configuration_missing');
  assert.deepEqual(Array.from(status.missing), ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']);
  assert.equal(configuration.livekitConfig(), null);
});

test('configured LiveKit requires a secure canonical WebSocket origin', () => {
  for (const address of ['http://room.invalid', 'https://room.invalid', 'ws://room.invalid', 'wss://room.invalid', 'wss://room.invalid/path', 'wss://room.invalid/?query=value', 'wss://room.invalid/#fragment', 'wss://user:password@room.invalid', `${projectUrl}/path`, `${projectUrl}/?query=value`, `${projectUrl}/#fragment`, 'invalid']) {
    const configuration = livekit({ LIVEKIT_URL: address, LIVEKIT_API_KEY: 'test-only', LIVEKIT_API_SECRET: 'test-only' });
    assert.equal(configuration.livekitConfigurationStatus().reason, 'configuration_invalid', address);
    assert.equal(configuration.livekitConfig(), null, address);
  }
  const configuration = livekit({ LIVEKIT_URL: projectUrl, LIVEKIT_API_KEY: 'test-only', LIVEKIT_API_SECRET: 'test-only' });
  assert.equal(configuration.livekitConfigurationStatus().reason, 'configuration_present');
  assert.equal(configuration.livekitConfig().serviceUrl, projectUrl.replace('wss:', 'https:'));
  assert.deepEqual(Object.keys(configuration.livekitConfigurationStatus()).sort(), ['available', 'missing', 'reason']);
});

test('URL-only configuration correctly reports the two missing server credentials', () => {
  const configuration = livekit({ LIVEKIT_URL: projectUrl });
  assert.deepEqual(Array.from(configuration.livekitConfigurationStatus().missing), ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']);
  assert.equal(configuration.livekitConfig(), null);
});

test('Netlify runtime configuration takes precedence and credentials never appear in public diagnostics', () => {
  const configuration = livekit({ LIVEKIT_URL: 'http://invalid' }, { LIVEKIT_URL: ` ${projectUrl}/ `, LIVEKIT_API_KEY: ' test-only ', LIVEKIT_API_SECRET: ' test-only ' });
  assert.equal(configuration.livekitConfig().serverUrl, projectUrl);
  assert.equal(configuration.livekitConfig().apiKey, 'test-only');
  assert.equal(configuration.livekitConfigurationStatus().available, true);
  assert.doesNotMatch(JSON.stringify(configuration.livekitConfigurationStatus()), /test-only|room\.invalid/);
});

test('viewers, pending speakers and banned members have no publication permissions', () => {
  for (const state of ['viewer', 'pending', 'banned']) {
    for (const audioOnly of [true, false]) {
      const permissions = livekit().roomPermissions({ state, hostMuted: false }, audioOnly);
      assert.equal(permissions.canPublish, false);
      assert.equal(permissions.canPublishData, false);
      assert.equal(permissions.canSubscribe, true);
      assert.equal(permissions.canPublishSources.length, 0);
    }
  }
});

test('admitted speakers have mode-specific media permissions and host mute removes microphone', () => {
  const { TrackSource } = require('livekit-server-sdk');
  const configuration = livekit();
  assert.deepEqual(Array.from(configuration.roomPermissions({ state: 'speaker', hostMuted: false }, false).canPublishSources), [TrackSource.CAMERA, TrackSource.MICROPHONE]);
  assert.deepEqual(Array.from(configuration.roomPermissions({ state: 'speaker', hostMuted: true }, false).canPublishSources), [TrackSource.CAMERA]);
  assert.deepEqual(Array.from(configuration.roomPermissions({ state: 'speaker', hostMuted: false }, true).canPublishSources), [TrackSource.MICROPHONE]);
  assert.equal(configuration.roomPermissions({ state: 'speaker', hostMuted: true }, true).canPublish, false);
});

const operations = Object.fromEntries(['and', 'eq', 'desc', 'inArray', 'or', 'isNull', 'lte', 'gt', 'count'].map(name => [name, (...values) => ({ operation: name, values })]));
const tables = Object.fromEntries(['liveRooms', 'liveMembers', 'liveMessages', 'mediaAssets', 'campaigns', 'adDismissals', 'storyViews', 'postWatermarks', 'liveHistoryArchives', 'liveAlerts', 'pushSubscriptions', 'pushDeliveries', 'notificationPreferences'].map(name => [name, new Proxy({ name }, { get: (table, field) => field === 'name' ? table.name : `${table.name}.${String(field)}` })]));

function backend({ accountId = ownerId, owned = true, active = false, networkError = false, assets = [], avatarUrl = null, roomRecords = [], memberRecords = [], discoveryRecords = [], callRecords = [], campaignRecords = [], admin = false, adminRpc = false, configuration = livekit(), authStatus = 200, roomStatus = 200, sdk = require('livekit-server-sdk') } = {}) {
  const inserted = [];
  const filters = [];
  const requests = [];
  const storageDeletes = [];
  const matches = (condition, record) => condition.operation === 'and' ? condition.values.every(value => matches(value, record)) : condition.operation === 'or' ? condition.values.some(value => matches(value, record)) : condition.operation === 'eq' ? record[condition.values[0].split('.').at(-1)] === condition.values[1] : condition.operation === 'inArray' ? condition.values[1].includes(record[condition.values[0].split('.').at(-1)]) : condition.operation === 'isNull' ? record[condition.values[0].split('.').at(-1)] == null : condition.operation === 'lte' ? record[condition.values[0].split('.').at(-1)] <= condition.values[1] : condition.operation === 'gt' ? record[condition.values[0].split('.').at(-1)] > condition.values[1] : true;
  const database = {
    insert(table) { return { values(records) { return { async onConflictDoNothing() {
      inserted.push({ table: table.name, records });
      if (table.name === 'liveRooms' && !roomRecords.some(record => record.room === records.room)) roomRecords.push({ admission: 'approval', layout: 4, endedAt: null, ...records });
      if (table.name === 'liveMembers' && !memberRecords.some(record => record.room === records.room && record.userId === records.userId)) memberRecords.push({ hostMuted: false, ...records });
    }, async onConflictDoUpdate() { inserted.push({ table: table.name, records: structuredClone(records) });if (table.name === 'campaigns') { const existing = campaignRecords.find(campaign => campaign.id === records.id);if (existing) Object.assign(existing, records);else campaignRecords.push(records); } } }; } }; },
    select() { return { from(table) { return { where(condition) {
      filters.push({ table: table.name, condition });
      const candidates = table.name === 'mediaAssets' ? assets : table.name === 'liveRooms' ? roomRecords : table.name === 'liveMembers' ? memberRecords : table.name === 'campaigns' ? campaignRecords : [];
      const records = candidates.filter(record => matches(condition, record));
      records.for = async () => records;
      records.orderBy = () => ({ limit: async count => records.slice(0, count) });
      records.limit = async count => records.slice(0, count);
      return records;
    } }; } }; },
    update(table) { return { set(patch) { return { async where(condition) {
      const candidates = table.name === 'liveRooms' ? roomRecords : table.name === 'liveMembers' ? memberRecords : table.name === 'mediaAssets' ? assets : table.name === 'campaigns' ? campaignRecords : [];
      candidates.filter(record => matches(condition, record)).forEach(record => Object.assign(record, patch));
    } }; } }; },
    async transaction(callback) { return callback(database); },
  };
  const fetch = async (address, options = {}) => {
    requests.push({ address, method: options.method || 'GET' });
    if (networkError) throw new Error('upstream diagnostic must not leak');
    if (address.endsWith('/functions/v1/livekit-token')) return edge(new Request(address, options));
    if (address.endsWith('/milkyway-media-authorize')) return authorize(new Request(address, options));
    if (address.endsWith('/auth/v1/user')) return Response.json(authStatus === 200 ? { id: accountId, app_metadata: admin ? { roles: ['admin'] } : {} } : { error: 'fixture access failure' }, { status: authStatus });
    if (address.endsWith('/rpc/mw_is_admin')) return Response.json(adminRpc);
    if (address.includes('mw_profiles')) return Response.json([{ id: accountId, avatar_url: avatarUrl }]);
    if (address.includes('mw_follows')) return Response.json([]);
    if (address.includes('mw_dm_calls')) return Response.json(callRecords);
    if (address.includes('mw_video_live_sessions?is_live=')) return Response.json(discoveryRecords);
    if (address.includes('room_name=')) return Response.json(roomStatus === 200 ? [{ host_id: ownerId, is_live: active, scope: 'public' }] : { error: 'fixture policy denial' }, { status: roomStatus });
    if (address.includes('mw_video_live_sessions') || address.includes('mw_audio_live_rooms')) return Response.json(owned && !active ? [{ id: sessionId }] : []);
    throw new Error('Unexpected fixture request');
  };
  const imports = {
    'drizzle-orm': operations,
    '../db/index.js': { db: database },
    '../db/schema.js': tables,
    '../lib/supabase.js': { supabaseConfig: () => ({ base: 'https://backend.invalid', apiKey: 'test-only' }) },
    '../lib/livekit.js': configuration,
    '../lib/suspensions.js': { assertActive: async () => {}, activeSuspension: async () => null, isOwner: () => false },
    '../lib/coins.js': loadModule('lib/coins.ts', {}),
    'livekit-server-sdk': sdk,
    '@netlify/blobs': { getStore: () => ({ async delete(key) { storageDeletes.push(key); } }) },
  };
  const edgeConfiguration = configuration.livekitConfig();
  const environment = { SUPABASE_ANON_KEY: 'test-only', LIVEKIT_URL: edgeConfiguration?.serverUrl, LIVEKIT_API_KEY: edgeConfiguration?.apiKey, LIVEKIT_API_SECRET: edgeConfiguration?.apiSecret };
  const edge = loadModule('supabase/functions/_shared/milkyway-token.ts', { 'npm:livekit-server-sdk@2.19.1': sdk }, { fetch, Deno: { env: { get: name => environment[name] } } }).milkywayToken;
  imports['../lib/live-authorize.js'] = loadModule('lib/live-authorize.ts', { 'drizzle-orm': operations, '../db/index.js': { db: database }, '../db/schema.js': tables, './supabase.js': imports['../lib/supabase.js'], './livekit.js': configuration }, { fetch });
  const authorize = loadModule('functions/milkyway-media-authorize.mts', imports, { fetch }).default;
  imports['../lib/admin.js'] = loadModule('lib/admin.ts', {}, { fetch });
  const direct = loadModule('lib/livekit-direct.ts', { 'livekit-server-sdk': sdk, './livekit.js': configuration, './supabase.js': imports['../lib/supabase.js'], './live-authorize.js': imports['../lib/live-authorize.js'] }, { fetch });
  imports['../lib/livekit-service.js'] = loadModule('lib/livekit-service.ts', { 'livekit-server-sdk': sdk, './supabase.js': imports['../lib/supabase.js'], './livekit.js': configuration, './livekit-direct.js': direct }, { fetch });
  return { imports, inserted, filters, requests, storageDeletes, edge, authorize, room: loadModule('functions/milkyway-room.mts', imports, { fetch }).default, account: loadModule('functions/milkyway-account.mts', imports, { fetch }).default };
}

const request = (path, body, method = 'POST', authenticated = true) => new Request(`https://application.invalid/.netlify/functions/${path}`, {
  method, headers: authenticated ? { Authorization: 'Bearer test-only', 'Content-Type': 'application/json' } : {}, body: body === undefined ? undefined : JSON.stringify(body),
});

test('room availability is public, no-store and truthful when missing configuration', async () => {
  const response = await backend().room(request('milkyway-room', undefined, 'GET', false));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).available, false);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('session closure cannot falsely succeed without actual LiveKit shutdown', async () => {
  const fixture = backend();
  const response = await fixture.room(request('milkyway-room', { room: roomName, action: 'end' }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /cleanup is incomplete/);
  assert.ok(fixture.inserted.some(item => item.table === 'liveRooms' && item.records.endedAt));
  assert.ok(fixture.requests.some(item => item.method === 'PATCH'));
});

test('another account cannot close the host session', async () => {
  const fixture = backend({ accountId: otherId });
  const response = await fixture.room(request('milkyway-room', { room: roomName, action: 'end' }));
  assert.equal(response.status, 403);
  assert.equal(fixture.inserted.length, 0);
  assert.equal(fixture.requests.filter(item => item.method === 'PATCH').length, 0);
});

function tokenFixture(options = {}) {
  const material = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))).toString('hex');
  const configuration = livekit({ LIVEKIT_URL: projectUrl, LIVEKIT_API_KEY: 'test-only', LIVEKIT_API_SECRET: material });
  const { TokenVerifier } = require('livekit-server-sdk');
  const verifier = new TokenVerifier('test-only', material);
  const fixture = backend({ active: true, configuration, ...options });
  const prepare = fixture.room;
  fixture.room = async request => {
    const body = request.method === 'POST' ? await request.clone().json() : null;
    const response = await prepare(request);
    if (!response.ok || body?.action !== 'token') return response;
    const state = await response.json();
    const signed = await fixture.edge(new Request('https://edge.invalid/token', { method: 'POST', headers: request.headers, body: JSON.stringify({ ...body, roomName: body.room, action: 'token' }) }));
    return signed.ok ? Response.json({ ...state, ...await signed.json() }) : signed;
  };
  return { ...fixture, prepare, verifier };
}

test('real SDK signing grants the authenticated host room-scoped video/audio publication', async () => {
  const fixture = tokenFixture();
  const response = await fixture.room(request('milkyway-room', { room: roomName, action: 'token', identity: otherId, role: 'viewer', layout: 8 }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  const claims = await fixture.verifier.verify(payload.token);
  assert.equal(claims.sub, ownerId);
  assert.equal(claims.video.room, roomName);
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.canPublish, true);
  assert.equal(claims.video.canSubscribe, true);
  assert.equal(claims.video.canPublishData, false);
  assert.deepEqual(claims.video.canPublishSources, ['camera', 'microphone']);
  assert.equal(payload.settings.layout, 8);
  assert.equal(payload.settings.admission, 'approval');
  assert.equal(payload.self.state, 'speaker');
});

test('a viewer cannot spoof host publication through token request fields', async () => {
  const fixture = tokenFixture({ accountId: otherId, roomRecords: [{ room: roomName, hostId: ownerId, endedAt: null, layout: 4 }] });
  const response = await fixture.room(request('milkyway-room', { room: roomName, action: 'token', identity: ownerId, role: 'host' }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  const claims = await fixture.verifier.verify(payload.token);
  assert.equal(claims.sub, otherId);
  assert.equal(claims.video.canPublish, false);
  assert.equal(claims.video.canSubscribe, true);
  assert.deepEqual(claims.video.canPublishSources, []);
  assert.equal(payload.self.state, 'viewer');
});

test('an admitted participant receives real signed publication rights, including host microphone restrictions', async () => {
  for (const muted of [true, false]) {
    const fixture = tokenFixture({ accountId: otherId, roomRecords: [{ room: roomName, hostId: ownerId, endedAt: null }], memberRecords: [{ room: roomName, userId: otherId, name: 'Fixture participant', state: 'speaker', hostMuted: muted }] });
    const response = await fixture.room(request('milkyway-room', { room: roomName, action: 'token' }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    const claims = await fixture.verifier.verify(payload.token);
    assert.equal(claims.video.canPublish, true);
    assert.deepEqual(claims.video.canPublishSources, muted ? ['camera'] : ['camera', 'microphone']);
    assert.equal(claims.video.canSubscribe, true);
  }
});

test('Audio Live tokens allow both host and admitted participant to publish only microphone tracks', async () => {
  const audioRoom = `mw-conversation-audio-${sessionId}`;
  for (const accountId of [ownerId, otherId]) {
    const fixture = tokenFixture({ accountId, roomRecords: [{ room: audioRoom, hostId: ownerId, endedAt: null }], memberRecords: accountId === otherId ? [{ room: audioRoom, userId: otherId, state: 'speaker', hostMuted: false }] : [] });
    const response = await fixture.room(request('milkyway-room', { room: audioRoom, action: 'token' }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    const claims = await fixture.verifier.verify(payload.token);
    assert.equal(claims.video.room, audioRoom);
    assert.deepEqual(claims.video.canPublishSources, ['microphone']);
    assert.equal(claims.video.canSubscribe, true);
    assert.ok(claims.exp - Math.floor(Date.now() / 1000) <= 60);
  }
});

test('ended rooms and banned participants cannot obtain conversation tokens', async () => {
  for (const options of [{ roomRecords: [{ room: roomName, hostId: ownerId, endedAt: new Date() }] }, { roomRecords: [{ room: roomName, hostId: ownerId, endedAt: null }], memberRecords: [{ room: roomName, userId: otherId, state: 'banned' }] }]) {
    const fixture = tokenFixture({ accountId: otherId, ...options });
    const response = await fixture.room(request('milkyway-room', { room: roomName, action: 'token' }));
    assert.ok([403, 404].includes(response.status));
    assert.equal(Object.hasOwn(await response.json(), 'token'), false);
  }
});

test('expired authentication and denied room policies retain distinct HTTP errors', async () => {
  for (const authStatus of [401, 403]) {
    const fixture = backend({ authStatus });
    const response = await fixture.room(request('milkyway-room', { room: roomName, action: 'token' }));
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /session expired/);
  }
  assert.equal((await backend({ roomStatus: 403 }).room(request('milkyway-room', { room: roomName, action: 'token' }))).status, 403);
});

test('non-canonical conversation identifiers are rejected before backend requests', async () => {
  const fixture = backend();
  const response = await fixture.room(request('milkyway-room', { room: `mw-conversation-video-${'-'.repeat(36)}`, action: 'token' }));
  assert.equal(response.status, 400);
  assert.equal(fixture.requests.length, 0);
});

function moderationFixture() {
  const serviceCalls = [];
  const participants = [{ identity: ownerId }, { identity: otherId }];
  const roomRecords = [{ room: roomName, hostId: ownerId, admission: 'approval', layout: 4, endedAt: null }];
  const memberRecords = [{ room: roomName, userId: otherId, name: 'Fixture guest', state: 'viewer', hostMuted: false }];
  class RoomServiceFixture {
    async listParticipants() { return participants; }
    async updateParticipant(room, identity, changes) { serviceCalls.push({ action: 'permission', room, identity, changes });participants.find(participant => participant.identity === identity).permission = changes.permission; }
    async removeParticipant(room, identity, options) { serviceCalls.push({ action: 'remove', room, identity, options }); }
    async deleteRoom(room) { serviceCalls.push({ action: 'end', room }); }
  }
  const sdk = { ...require('livekit-server-sdk'), RoomServiceClient: RoomServiceFixture };
  const base = tokenFixture({ roomRecords, memberRecords, sdk });
  const configuration = livekit({ LIVEKIT_URL: projectUrl, LIVEKIT_API_KEY: 'test-only', LIVEKIT_API_SECRET: 'test-only' });
  const guest = backend({ active: true, accountId: otherId, roomRecords, memberRecords, sdk, configuration });
  return { ...base, guest, serviceCalls, roomRecords, memberRecords };
}

test('request and host approval update the existing participant rights rather than creating a broadcast', async () => {
  const fixture = moderationFixture();
  assert.equal((await fixture.guest.room(request('milkyway-room', { room: roomName, action: 'request' }))).status, 200);
  assert.equal(fixture.memberRecords.find(member => member.userId === otherId).state, 'pending');
  assert.equal(fixture.serviceCalls.at(-1).changes.permission.canPublish, false);
  assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'approve', target: otherId }))).status, 200);
  assert.equal(fixture.memberRecords.find(member => member.userId === otherId).state, 'speaker');
  const granted = fixture.serviceCalls.at(-1).changes.permission;
  const { TrackSource } = require('livekit-server-sdk');
  assert.equal(granted.canPublish, true);
  assert.equal(granted.canSubscribe, true);
  assert.deepEqual(Array.from(granted.canPublishSources), [TrackSource.CAMERA, TrackSource.MICROPHONE]);
  assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'mute', target: otherId }))).status, 200);
  assert.deepEqual(Array.from(fixture.serviceCalls.at(-1).changes.permission.canPublishSources), [TrackSource.CAMERA]);
  assert.equal(fixture.memberRecords.find(member => member.userId === otherId).hostMuted, true);
});

test('a guest cannot approve another participant and the admitted-speaker limit is enforced', async () => {
  const fixture = moderationFixture();
  assert.equal((await fixture.guest.room(request('milkyway-room', { room: roomName, action: 'approve', target: sessionId }))).status, 403);
  for (let index = 0; index < 20; index++) fixture.memberRecords.push({ room: roomName, userId: index === 0 ? ownerId : crypto.randomUUID(), state: 'speaker', hostMuted: false });
  assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'approve', target: otherId }))).status, 409);
  assert.equal(fixture.memberRecords.find(member => member.userId === otherId).state, 'viewer');
});

test('host blocking removes and revokes the participant, then rejects fresh token requests', async () => {
  const fixture = moderationFixture();
  const response = await fixture.room(request('milkyway-room', { room: roomName, action: 'ban', target: otherId }));
  assert.equal(response.status, 200);
  const removed = fixture.serviceCalls.find(call => call.action === 'remove');
  assert.equal(removed.identity, otherId);
  assert.equal(typeof removed.options.revokeTokenTs, 'bigint');
  assert.equal((await fixture.guest.room(request('milkyway-room', { room: roomName, action: 'token' }))).status, 403);
});

test('host session cleanup closes the listing, ends the durable room and requests server deletion', async () => {
  const fixture = moderationFixture();
  assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'end' }))).status, 200);
  assert.ok(fixture.roomRecords[0].endedAt);
  assert.ok(fixture.requests.some(operation => operation.method === 'PATCH'));
  assert.equal(fixture.serviceCalls.find(call => call.action === 'end').room, roomName);
});

test('the owner server address is configured without creating API credentials', () => {
  assert.match(source('lib/livekit.ts'), /wss:\/\/masiyatunda-milkyway-live-mgh6b1np\.livekit\.cloud/);
  assert.match(source('netlify.toml'), /LIVEKIT_URL = "wss:\/\/masiyatunda-milkyway-live-mgh6b1np\.livekit\.cloud"/);
  assert.doesNotMatch(source('netlify.toml'), /LIVEKIT_API_(?:KEY|SECRET)\s*=/);
  const configuration = livekit({ LIVEKIT_API_KEY: 'test-only', LIVEKIT_API_SECRET: 'test-only' });
  assert.equal(configuration.livekitConfig().serverUrl, 'wss://masiyatunda-milkyway-live-mgh6b1np.livekit.cloud');
});

test('duplicate join requests do not create duplicate pending events and cancellation returns to viewer', async () => {
  const fixture = moderationFixture();
  const join = () => fixture.guest.room(request('milkyway-room', { room: roomName, action: 'request' }));
  assert.equal((await join()).status, 200);
  const eventCount = fixture.guest.inserted.filter(item => item.table === 'liveMessages').length;
  assert.equal((await join()).status, 200);
  assert.equal(fixture.guest.inserted.filter(item => item.table === 'liveMessages').length, eventCount);
  assert.equal((await fixture.guest.room(request('milkyway-room', { room: roomName, action: 'leave-stage' }))).status, 200);
  assert.equal(fixture.memberRecords.find(member => member.userId === otherId).state, 'viewer');
  assert.equal((await join()).status, 200);
  assert.equal(fixture.memberRecords.find(member => member.userId === otherId).state, 'pending');
});

test('rejected viewers cannot bypass rejection with another request but hosts may invite them', async () => {
  const fixture = moderationFixture();
  assert.equal((await fixture.guest.room(request('milkyway-room', { room: roomName, action: 'request' }))).status, 200);
  assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'reject', target: otherId }))).status, 200);
  assert.equal(fixture.memberRecords.find(member => member.userId === otherId).state, 'rejected');
  assert.equal((await fixture.guest.room(request('milkyway-room', { room: roomName, action: 'request' }))).status, 403);
  assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'approve', target: otherId }))).status, 200);
  assert.equal(fixture.memberRecords.find(member => member.userId === otherId).state, 'speaker');
});

test('admission respects the configured occupied tile limit, including direct admission', async () => {
  for (const admission of ['approval', 'direct']) {
    const fixture = moderationFixture();fixture.roomRecords[0].layout = 1;fixture.roomRecords[0].admission = admission;
    assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'approve', target: otherId }))).status, 409);
    if (admission === 'direct') assert.equal((await fixture.guest.room(request('milkyway-room', { room: roomName, action: 'request' }))).status, 409);
    assert.equal(fixture.memberRecords.find(member => member.userId === otherId).state, 'viewer');
  }
});

test('switching a Live to auto-accept seats viewers who were already waiting', async () => {
  const fixture = moderationFixture();
  assert.equal((await fixture.guest.room(request('milkyway-room', { room: roomName, action: 'request' }))).status, 200);
  assert.equal(fixture.memberRecords.find(member => member.userId === otherId).state, 'pending');
  assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'settings', layout: 4, admission: 'direct' }))).status, 200);
  assert.equal(fixture.roomRecords[0].admission, 'direct');
  assert.equal(fixture.memberRecords.find(member => member.userId === otherId).state, 'speaker');
  assert.equal(fixture.serviceCalls.at(-1).changes.permission.canPublish, true);
});

test('the Go LIVE auto-accept switch opens the room for one-touch guest entry', async () => {
  const fixture = tokenClientFixture(Response.json({ serverUrl: 'wss://room.invalid', token: 'test-only', roomName }), true);
  await fixture.run();
  assert.equal(fixture.requests[0].body.admission, 'direct');
});

test('layout settings are durable, host-only and reject reductions below admitted occupancy', async () => {
  const fixture = moderationFixture();
  const settings = { room: roomName, action: 'settings', layout: 2, admission: 'approval', layoutStyle: 'duo', hostPosition: 'end', mobileLayout: 'compact' };
  assert.equal((await fixture.guest.room(request('milkyway-room', settings))).status, 403);
  assert.equal((await fixture.room(request('milkyway-room', settings))).status, 200);
  assert.equal(fixture.roomRecords[0].layoutStyle, 'duo');
  assert.equal(fixture.roomRecords[0].hostPosition, 'end');
  assert.equal(fixture.roomRecords[0].mobileLayout, 'compact');
  assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'approve', target: otherId }))).status, 200);
  const response = await fixture.room(request('milkyway-room', { ...settings, layoutStyle: 'grid', layout: 1 }));
  assert.equal(response.status, 409);
  assert.equal(fixture.roomRecords[0].layout, 2);
});

test('invalid layout styles, positions, mobile modes and mismatched duo capacity are rejected', async () => {
  for (const invalid of [{ layoutStyle: 'unknown' }, { hostPosition: 'unknown' }, { mobileLayout: 'unknown' }, { layoutStyle: 'duo', layout: 4 }, { layout: 22 }]) {
    const fixture = moderationFixture();
    assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'settings', layout: 4, admission: 'approval', ...invalid }))).status, 400);
  }
});

test('host box counts from one through twenty-one (host plus twenty guests) are accepted within the global limit', async () => {
  const fixture = moderationFixture();
  for (let layout = 1; layout <= 21; layout++) {
    assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'settings', layout, admission: 'approval', layoutStyle: 'grid' }))).status, 200);
    assert.equal(fixture.roomRecords[0].layout, layout);
  }
});

test('the seven multi-guest layouts are stored and side by side is limited to the host plus one guest', async () => {
  const fixture = moderationFixture();
  for (const layoutStyle of ['fullscreen', 'fluid-panel', 'fluid-grid', 'fixed-grid', 'side-by-side', 'spotlight', 'roundtable']) {
    assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'settings', layout: layoutStyle === 'side-by-side' ? 2 : 9, admission: 'approval', layoutStyle, hostPosition: 'end', mobileLayout: 'stack' }))).status, 200);
    assert.equal(fixture.roomRecords[0].layoutStyle, layoutStyle);
  }
  assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'settings', layout: 5, admission: 'approval', layoutStyle: 'side-by-side' }))).status, 400);
});

test('all five layout arrangements can be stored without removing connected participants', async () => {
  const fixture = moderationFixture();
  for (const layoutStyle of ['host-top', 'host-side', 'duo', 'grid', 'focus']) {
    assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'settings', layout: layoutStyle === 'duo' ? 2 : 20, admission: 'approval', layoutStyle, hostPosition: 'start', mobileLayout: 'stack' }))).status, 200);
    assert.equal(fixture.roomRecords[0].layoutStyle, layoutStyle);
  }
  assert.equal(fixture.serviceCalls.filter(call => call.action === 'remove').length, 0);
});

test('signed departures cancel pending requests and release speaker seats without lifting rejections or bans', async () => {
  const sdk = require('livekit-server-sdk');
  const material = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))).toString('hex');
  const configuration = livekit({ LIVEKIT_API_KEY: 'test-only', LIVEKIT_API_SECRET: material });
  class RoomServiceFixture { async listParticipants() { return []; } }
  for (const state of ['pending', 'speaker', 'rejected', 'banned']) {
    const members = [{ room: roomName, userId: otherId, state }];
    const fixture = backend({ memberRecords: members, roomRecords: [{ room: roomName, hostId: ownerId, endedAt: null }], configuration, sdk: { ...sdk, RoomServiceClient: RoomServiceFixture } });
    const handler = loadModule('functions/milkyway-livekit-webhook.mts', fixture.imports).default;
    const body = JSON.stringify({ event: 'participant_left', room: { name: roomName }, participant: { identity: otherId } });
    const token = new sdk.AccessToken('test-only', material);
    token.sha256 = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))).toString('base64');
    const authorization = await token.toJwt();
    const response = await handler(new Request('https://application.invalid/webhook', { method: 'POST', headers: { Authorization: authorization }, body }));
    assert.equal(response.status, 204);
    assert.equal(members[0].state, ['pending', 'speaker'].includes(state) ? 'viewer' : state);
    assert.equal((await handler(new Request('https://application.invalid/webhook', { method: 'POST', headers: { Authorization: authorization }, body: body + ' ' }))).status, 401);
  }
});

test('signed host departures and room-finished events close durable lifecycle state without changing permissions for another room', async () => {
  const sdk = require('livekit-server-sdk');
  const material = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
  const configuration = livekit({ LIVEKIT_API_KEY: 'test-only', LIVEKIT_API_SECRET: material });
  for (const event of ['participant_left', 'room_finished']) {
    const removedRooms = [];
    class ServiceFixture { async deleteRoom(name) { removedRooms.push(name); } }
    const records = [{ room: roomName, hostId: ownerId, endedAt: null, featuredId: otherId }];
    const fixture = backend({ roomRecords: records, configuration, sdk: { ...sdk, RoomServiceClient: ServiceFixture } });
    const handler = loadModule('functions/milkyway-livekit-webhook.mts', fixture.imports).default;
    const body = JSON.stringify({ event, room: { name: roomName }, participant: { identity: ownerId } });
    const token = new sdk.AccessToken('test-only', material);
    token.sha256 = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))).toString('base64');
    const response = await handler(new Request('https://application.invalid/webhook', { method: 'POST', headers: { Authorization: await token.toJwt() }, body }));
    assert.equal(response.status, 204);assert.ok(records[0].endedAt);assert.equal(records[0].featuredId, null);
    assert.deepEqual(removedRooms, event === 'participant_left' ? [roomName] : []);
  }
});

test('discovery verifies host media, mode, room lifecycle and access before listing sessions', async () => {
  const audioRoom = roomName.replace('-video-', '-audio-');
  const restrictedRoom = `mw-conversation-video-${crypto.randomUUID()}`;
  const endedRoom = `mw-conversation-video-${crypto.randomUUID()}`;
  const disconnectedRoom = `mw-conversation-video-${crypto.randomUUID()}`;
  const records = [roomName, audioRoom, restrictedRoom, endedRoom, disconnectedRoom].map((room, index) => ({ id: crypto.randomUUID(), room_name: room, host_id: ownerId, host_name: 'Fixture only', is_live: true, scope: index === 2 ? 'followers' : 'public' }));
  class RoomServiceFixture {
    async listRooms(names) { return names.map(name => ({ name, numParticipants: 2 })); }
    async listParticipants(name) { return name === disconnectedRoom ? [{ identity: otherId, tracks: [{ source: 1 }] }] : [{ identity: ownerId, tracks: [{ source: name === audioRoom ? 2 : 1 }] }]; }
  }
  const roomRecords = records.map(record => ({ room: record.room_name, hostId: ownerId, endedAt: record.room_name === endedRoom ? new Date() : null }));
  const fixture = backend({ roomRecords, discoveryRecords: records, configuration: livekit({ LIVEKIT_API_KEY: 'test-only', LIVEKIT_API_SECRET: 'test-only' }), sdk: { ...require('livekit-server-sdk'), RoomServiceClient: RoomServiceFixture } });
  const handler = loadModule('functions/milkyway-discovery.mts', fixture.imports, { fetch: async address => Response.json(address.includes('mw_video_live_sessions') ? records : []) }).default;
  const response = await handler(request('milkyway-discovery', undefined, 'GET', false));
  assert.equal(response.status, 200);
  const sessions = (await response.json()).sessions;
  assert.deepEqual(sessions.map(session => session.room_name), [roomName, audioRoom]);
  assert.ok(sessions.every(session => session.connectedCount === 1));
});

function tokenClientFixture(response, autoAccept = false) {
  const script = source('milkyway/live-feed.js');
  const begin = script.indexOf('  async function requestAccess(');
  const finish = script.indexOf('  function stopPreview()', begin);
  const requests = [];
  const context = vm.createContext({
    accessRequest: null, AbortController, URL,
    window: { setTimeout, clearTimeout, MilkyWayI18n: { text: value => `localized:${value}` } },
    byId: identity => ({ value: identity === 'mwLiveSeatCount' ? '3' : '4', checked: identity === 'mwLiveAutoAccept' ? autoAccept : true }), sb: { supabaseKey: 'test-only', auth: { refreshSession: async () => ({ error: new Error('fixture refresh denied'), data: { session: null } }) } }, tokenEndpoint: 'https://supabase.invalid/functions/v1/livekit-token', serverUrl: 'wss://room.invalid',
    async fetch(address, options) { requests.push({ address, headers: options.headers, body: JSON.parse(options.body) });return address.startsWith('/.netlify/') ? Response.json({ roomName, settings: { layout: 4, admission: 'approval' }, self: { userId: ownerId, state: 'speaker' } }) : response; },
  });
  vm.runInContext(`${script.slice(begin, finish)};globalThis.requestToken = requestAccess;`, context);
  const run = () => context.requestToken({ access_token: 'test-only' }, { room: roomName, roomName, identity: ownerId, role: 'host' });
  return { context, requests, run };
}

test('the existing Live interface prepares authorization then requests its token from Supabase', async () => {
  const fixture = tokenClientFixture(Response.json({ serverUrl: 'wss://room.invalid', token: 'test-only', roomName }));
  await fixture.run();
  assert.equal(fixture.requests[0].address, '/.netlify/functions/milkyway-room');
  assert.equal(fixture.requests[0].body.action, 'token');
  assert.equal(fixture.requests[0].body.admission, 'approval');
  assert.equal(fixture.requests[0].body.layout, 4);
  assert.equal(fixture.requests[0].body.layoutStyle, 'fullscreen');
  assert.equal(fixture.requests[0].body.hostPosition, 'start');
  assert.equal(fixture.requests[1].address, 'https://supabase.invalid/functions/v1/livekit-token');
  assert.equal(fixture.requests[1].body.roomName, roomName);
  assert.equal(fixture.requests[1].headers.Authorization, 'Bearer test-only');
  assert.equal(fixture.requests[1].headers.apikey, 'test-only');
  assert.equal(Object.hasOwn(fixture.requests[1].body, 'role'), false);
  assert.equal(fixture.context.accessRequest, null);
});

test('token rejection displays localized server diagnostics and releases the request', async () => {
  for (const [status, error] of [[403, 'This room is for followers only.'], [404, 'This room has ended or is unavailable.'], [503, 'Live conversation service is not configured. Contact the administrator.']]) {
    const fixture = tokenClientFixture(Response.json({ error }, { status }));
    await assert.rejects(fixture.run(), failure => failure.message === `localized:${error}`);
    assert.equal(fixture.context.accessRequest, null);
  }
});

test('expired token authentication is distinguished from other service failures', async () => {
  const fixture = tokenClientFixture(Response.json({ error: 'fixture auth detail' }, { status: 401 }));
  await assert.rejects(fixture.run(), /sign-in expired/);
  assert.equal(fixture.context.accessRequest, null);
});

test('invalid token payloads and server origins cannot proceed to connection', async () => {
  for (const payload of [{ token: {}, serverUrl: 'wss://room.invalid' }, { token: 'test-only', serverUrl: null }, { token: 'test-only', serverUrl: 'not-a-url' }, { token: 'test-only', serverUrl: 'https://room.invalid' }, { token: 'test-only', serverUrl: 'wss://room.invalid/?query=test' }]) {
    const fixture = tokenClientFixture(Response.json(payload));
    await assert.rejects(fixture.run(), /token service/i);
    assert.equal(fixture.context.accessRequest, null);
  }
  await assert.rejects(tokenClientFixture(new Response('<html>invalid response</html>')).run(), /invalid response/);
});

test('Netlify prepares durable authorization and the signed LiveKit token in one round trip', async () => {
  const fixture = tokenFixture();
  const response = await fixture.prepare(request('milkyway-room', { room: roomName, action: 'token', liveType: 'broadcast' }));
  const state = await response.json();
  assert.equal(response.status, 200);
  assert.equal(state.settings.admission, 'broadcast');
  assert.equal(state.roomName, roomName);
  assert.equal(state.serverUrl, projectUrl);
  assert.equal(Object.hasOwn(state, 'permissions'), false);
  const claims = await fixture.verifier.verify(state.token);
  assert.equal(claims.sub, ownerId);
  assert.equal(claims.video.room, roomName);
  assert.equal(claims.video.canPublish, true);
  assert.ok(claims.exp - Math.floor(Date.now() / 1000) <= 60);
  assert.equal(fixture.requests.some(item => item.address.endsWith('/functions/v1/livekit-token')), false);
});

test('a viewer joining through the room service gets a subscribe-only token without a second token request', async () => {
  const fixture = tokenFixture({ accountId: otherId, roomRecords: [{ room: roomName, hostId: ownerId, endedAt: null, layout: 4 }] });
  const response = await fixture.prepare(request('milkyway-room', { room: roomName, action: 'token', identity: ownerId, role: 'host' }));
  const state = await response.json();
  assert.equal(response.status, 200);
  const claims = await fixture.verifier.verify(state.token);
  assert.equal(claims.sub, otherId);
  assert.equal(claims.video.canPublish, false);
  assert.deepEqual(claims.video.canPublishSources, []);
  assert.equal(fixture.requests.some(item => item.address.endsWith('/functions/v1/livekit-token')), false);
});

test('an auto-accepted guest request returns the speaker state so the app seats them at once', async () => {
  const fixture = moderationFixture();fixture.roomRecords[0].admission = 'direct';
  const response = await fixture.guest.room(request('milkyway-room', { room: roomName, action: 'request' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state, 'speaker');
  assert.equal(fixture.memberRecords.find(member => member.userId === otherId).state, 'speaker');
  assert.equal(fixture.serviceCalls.at(-1).changes.permission.canPublish, true);
});

test('broadcast viewers remain subscribe-only even with a stale speaker state and forged host fields', async () => {
  const fixture = tokenFixture({ accountId: otherId, roomRecords: [{ room: roomName, hostId: ownerId, admission: 'broadcast' }], memberRecords: [{ room: roomName, userId: otherId, state: 'speaker', hostMuted: false }] });
  const response = await fixture.room(request('milkyway-room', { room: roomName, action: 'token', liveType: 'conversation', role: 'host', identity: ownerId }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  const claims = await fixture.verifier.verify(payload.token);
  assert.equal(claims.sub, otherId);
  assert.equal(claims.video.canPublish, false);
  assert.deepEqual(claims.video.canPublishSources, []);
  assert.equal(claims.video.roomAdmin, undefined);
});

test('broadcast requests and host approval cannot enable a viewer or change the Live mode', async () => {
  const fixture = moderationFixture();
  fixture.roomRecords[0].admission = 'broadcast';
  assert.equal((await fixture.guest.room(request('milkyway-room', { room: roomName, action: 'request' }))).status, 403);
  assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'approve', target: otherId }))).status, 403);
  assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'settings', admission: 'direct', layout: 4 }))).status, 400);
  assert.equal(fixture.memberRecords[0].state, 'viewer');
});

test('Supabase enforces authentication, CORS, malformed requests and trusted room authorization', async () => {
  const fixture = tokenFixture();
  const options = await fixture.edge(new Request('https://edge.invalid/token', { method: 'OPTIONS', headers: { Origin: 'https://masiyatunda.com', 'Access-Control-Request-Headers': 'authorization,apikey,content-type' } }));
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('Access-Control-Allow-Origin'), 'https://masiyatunda.com');
  assert.match(options.headers.get('Access-Control-Allow-Headers'), /apikey/);
  assert.equal((await fixture.edge(new Request('https://edge.invalid/token', { method: 'OPTIONS', headers: { Origin: 'https://untrusted.invalid' } }))).status, 403);
  assert.equal((await fixture.edge(request('token', { roomName }, 'POST', false))).status, 401);
  assert.equal((await fixture.edge(request('token', null))).status, 400);
  assert.equal((await fixture.edge(new Request('https://edge.invalid/token', { method: 'POST', body: '{' }))).status, 400);
  assert.equal((await fixture.edge(request('token', { roomName, identity: ownerId, role: 'host' }))).status, 404);
  assert.equal((await tokenFixture({ authStatus: 403 }).edge(request('token', { roomName }))).status, 401);
});

test('removed users cannot obtain new tokens or use media synchronization', async () => {
  const fixture = tokenFixture({ accountId: otherId, roomRecords: [{ room: roomName, hostId: ownerId }], memberRecords: [{ room: roomName, userId: otherId, state: 'removed' }] });
  assert.equal((await fixture.room(request('milkyway-room', { room: roomName, action: 'token' }))).status, 403);
  assert.equal((await fixture.edge(request('token', { roomName, action: 'sync', target: ownerId }))).status, 403);
});

test('Supabase synchronization ignores client-supplied publishing and moderator privileges', async () => {
  const fixture = moderationFixture();
  await fixture.room(request('milkyway-room', { room: roomName, action: 'token' }));
  const response = await fixture.guest.edge(request('token', { roomName, action: 'sync', target: otherId, permissions: { canPublish: true, roomAdmin: true }, role: 'host' }));
  assert.equal(response.status, 200);
  const permissions = fixture.serviceCalls.at(-1).changes.permission;
  assert.equal(permissions.canPublish, false);
  assert.equal(permissions.canPublishData, false);
  assert.deepEqual(Array.from(permissions.canPublishSources), []);
  assert.equal(permissions.roomAdmin, undefined);
});

test('legacy broadcast tokens still require the actual host and leave viewers subscribe-only', async () => {
  const fixture = tokenFixture({ accountId: otherId });
  const legacyRoom = `mw-video-live-${sessionId}`;
  const denied = await fixture.edge(request('token', { roomName: legacyRoom, role: 'host', identity: ownerId }));
  assert.equal(denied.status, 403);
  const watched = await fixture.edge(request('token', { roomName: legacyRoom, role: 'viewer', identity: otherId }));
  assert.equal(watched.status, 200);
  const claims = await fixture.verifier.verify((await watched.json()).token);
  assert.equal(claims.video.canPublish, false);
  assert.deepEqual(claims.video.canPublishSources, []);
});

test('existing DM calls retain accepted-participant authorization and mode-specific grants', async () => {
  for (const mode of ['audio', 'video']) {
    const fixture = tokenFixture({ callRecords: [{ caller_id: ownerId, callee_id: otherId, status: 'accepted', offer: { transport: 'livekit', mode } }] });
    const response = await fixture.edge(request('token', { room: `mw-call-${sessionId}`, identity: ownerId, role: 'call' }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    const claims = await fixture.verifier.verify(payload.token);
    assert.equal(claims.sub, ownerId);
    assert.equal(claims.video.canPublish, true);
    assert.equal(claims.video.canPublishData, true);
    assert.deepEqual(claims.video.canPublishSources, mode === 'audio' ? ['microphone'] : ['camera', 'microphone']);
    assert.equal(payload.roomName, `mw-call-${sessionId}`);
  }
  for (const call of [{ caller_id: ownerId, callee_id: otherId, status: 'ringing', offer: { transport: 'livekit' } }, { caller_id: otherId, callee_id: sessionId, status: 'accepted', offer: { transport: 'livekit' } }]) {
    const fixture = tokenFixture({ callRecords: [call] });
    assert.equal((await fixture.edge(request('token', { roomName: `mw-call-${sessionId}`, identity: ownerId, role: 'call' }))).status, 403);
  }
});

test('the Supabase room client reports quota restrictions without exposing upstream diagnostics', async () => {
  const configuration = loadModule('lib/livekit-service.ts', { 'livekit-server-sdk': require('livekit-server-sdk'), './supabase.js': { supabaseConfig: () => ({ base: 'https://edge.invalid', apiKey: 'test-only' }) }, './livekit.js': { livekitConfig: () => null }, './livekit-direct.js': {} }, { fetch: async () => Response.json({ error: 'private upstream diagnostic' }, { status: 429 }) });
  await assert.rejects(configuration.livekitRequest(request('room'), { action: 'discovery' }), error => error.status === 429 && /platform restriction/.test(error.message) && !error.message.includes('private upstream'));
});

test('unauthenticated history operations are rejected', async () => {
  const response = await backend().account(request('milkyway-account?action=live-history', { sessions: [{ id: sessionId, source: 'video' }] }, 'POST', false));
  assert.equal(response.status, 401);
});

test('history archives preserve original sessions and belong to the authenticated account', async () => {
  const fixture = backend();
  const response = await fixture.account(request('milkyway-account?action=live-history', { sessions: [{ id: sessionId, source: 'video' }] }));
  assert.equal(response.status, 200);
  assert.equal(fixture.inserted.length, 1);
  assert.equal(fixture.inserted[0].table, 'liveHistoryArchives');
  assert.equal(fixture.inserted[0].records[0].ownerId, ownerId);
  assert.ok(fixture.requests.some(item => item.address.includes(`host_id=eq.${ownerId}&is_live=eq.false`)));
  assert.ok(fixture.requests.every(item => item.method === 'GET'));
});

test('foreign or active sessions cannot be archived', async () => {
  for (const options of [{ owned: false }, { active: true }]) {
    const fixture = backend(options);
    const response = await fixture.account(request('milkyway-account?action=live-history', { sessions: [{ id: sessionId, source: 'video' }] }));
    assert.equal(response.status, 403);
    assert.equal(fixture.inserted.length, 0);
  }
});

test('invalid history references and destructive DELETE requests are rejected', async () => {
  for (const sessions of [[], [{ id: 'not-a-session', source: 'video' }], [{ id: sessionId, source: 'unknown' }], Array.from({ length: 61 }, () => ({ id: sessionId, source: 'video' }))]) {
    assert.equal((await backend().account(request('milkyway-account?action=live-history', { sessions }))).status, 400);
  }
  assert.equal((await backend().account(request('milkyway-account?action=live-history', undefined, 'DELETE'))).status, 405);
});

test('history reads are owner scoped and unexpected upstream details stay private', async () => {
  const fixture = backend();
  assert.equal((await fixture.account(request(`milkyway-account?action=live-history&ids=${sessionId}`, undefined, 'GET'))).status, 200);
  assert.ok(JSON.stringify(fixture.filters).includes(ownerId));
  const response = await backend({ networkError: true }).account(request('milkyway-account?action=live-history', undefined, 'GET'));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /upstream diagnostic/);
});

test('profile file deletion cannot target another account’s stored object', async () => {
  const key = `${otherId}/fixture-avatar`;
  const fixture = backend({ assets: [{ key, ownerId: otherId, purpose: 'avatar', retained: false, deleted: false }] });
  assert.equal((await fixture.account(request(`milkyway-account?action=file&key=${encodeURIComponent(key)}`, undefined, 'DELETE'))).status, 404);
  assert.equal(fixture.storageDeletes.length, 0);
});

test('retention holds prevent profile file destruction', async () => {
  const key = `${ownerId}/fixture-avatar`;
  const fixture = backend({ assets: [{ key, ownerId, purpose: 'avatar', retained: true, deleted: false }] });
  assert.equal((await fixture.account(request(`milkyway-account?action=file&key=${encodeURIComponent(key)}`, undefined, 'DELETE'))).status, 409);
  assert.equal(fixture.storageDeletes.length, 0);
});

test('removing an owned file deletes only the exact object and leaves a different profile photo intact', async () => {
  const key = `${ownerId}/fixture-avatar`;
  const fixture = backend({ assets: [{ key, ownerId, purpose: 'avatar', retained: false, deleted: false }], avatarUrl: `/.netlify/functions/milkyway-account?action=avatar&key=${encodeURIComponent(`${key}-different`)}` });
  assert.equal((await fixture.account(request(`milkyway-account?action=file&key=${encodeURIComponent(key)}`, undefined, 'DELETE'))).status, 204);
  assert.deepEqual(fixture.storageDeletes, [key]);
  assert.ok(fixture.requests.every(item => item.method !== 'PATCH'));
});

test('unsupported or forged profile images are rejected before storage writes', async () => {
  for (const file of [new File(['not an image'], 'fixture.txt', { type: 'text/plain' }), new File(['not a PNG'], 'fixture.png', { type: 'image/png' })]) {
    const fixture = backend();
    const form = new FormData();form.append('file', file);
    const response = await fixture.account(new Request('https://application.invalid/.netlify/functions/milkyway-account?action=avatar', { method: 'POST', headers: { Authorization: 'Bearer test-only' }, body: form }));
    assert.ok([400, 415].includes(response.status));
    assert.equal(fixture.inserted.length, 0);
    assert.equal(fixture.storageDeletes.length, 0);
  }
});

function cleanupFixture() {
  const script = source('milkyway/live-feed.js');
  const begin = script.indexOf('  async function disconnect() {');
  const finish = script.indexOf('\n  function hidePage()', begin);
  const element = { disabled: true, querySelectorAll: () => [], replaceChildren() {} };
  const calls = [];
  const context = vm.createContext({
    closing: null, host: true, session: { host_id: ownerId, room_name: roomName }, pendingEndSession: null,
    room: { state: 'connected', localParticipant: { publishData: async () => {}, trackPublications: new Map() }, disconnect: async () => { calls.push('disconnect'); } },
    generation: 0, accessRequest: null, roomPoll: null, roomState: null, roomChatSignature: '', pendingComment: null, announcementTimer: null,
    connectionAccountId: ownerId, joining: false, soundEnabled: false, soundRequest: null, audioTracks: new Map(), encoder: new TextEncoder(),
    clearTimeout() {}, window: { clearInterval() {} }, byId: () => element, stopPreview() {}, clearTileVideos() {}, conversationRoom: () => true,
    roomAction: () => Promise.resolve(), reset() {}, message() {},
    async endRecord(record) { calls.push(record.room_name);if (calls.filter(item => item === roomName).length === 1) throw new Error('fixture network failure'); },
  });
  vm.runInContext(`${script.slice(begin, finish)};globalThis.runCleanup = disconnect;`, context);
  return { context, calls };
}

test('failed host cleanup retains its session for an actual retry', async () => {
  const { context, calls } = cleanupFixture();
  const failed = await context.runCleanup();
  assert.equal(failed.clean, false);
  assert.equal(context.pendingEndSession.room_name, roomName);
  assert.equal(context.session, null);
  const retried = await context.runCleanup();
  assert.equal(retried.clean, true);
  assert.equal(context.pendingEndSession, null);
  assert.equal(calls.filter(item => item === 'disconnect').length, 1);
  assert.equal(calls.filter(item => item === roomName).length, 2);
});

test('concurrent exit actions share cleanup rather than duplicating shutdown', async () => {
  const { context, calls } = cleanupFixture();
  const results = await Promise.all([context.runCleanup(), context.runCleanup()]);
  assert.ok(results.every(result => result.clean === false));
  assert.equal(calls.filter(item => item === 'disconnect').length, 1);
  assert.equal(calls.filter(item => item === roomName).length, 1);
});

test('cleanup requires the original host account instead of silently reporting success', async () => {
  const script = source('milkyway/live-feed.js');
  const begin = script.indexOf('  async function endRecord(record) {');
  const finish = script.indexOf('\n  async function disconnect()', begin);
  const context = vm.createContext({ user: { id: otherId }, translate: key => key });
  vm.runInContext(`${script.slice(begin, finish)};globalThis.closeRecord = endRecord;`, context);
  await assert.rejects(context.closeRecord({ host_id: ownerId, room_name: roomName }), /liveCleanupHostRequired/);
});

function authFixture() {
  const script = source('milkyway/index.html');
  const begin = script.indexOf('let authUpdateGeneration=0;');
  const finish = script.indexOf('});boot()', begin) + 3;
  const scheduled = [];
  const calls = [];
  const context = vm.createContext({
    user: null,
    sb: { auth: { onAuthStateChange(callback) { context.callback = callback; } } },
    setTimeout(callback) { scheduled.push(callback); },
    window: { MilkyWayCalls: { disconnect() {} }, MilkyWayFiles: { release() {} }, MilkyWayLive: { refresh() {} } },
    $: () => ({ replaceChildren() {} }), closeSheet() {}, openSheet() {},
    async ensureProfile() { calls.push('profile'); },
    setWho() { calls.push('account'); }, loadFeed() { calls.push('feed'); },
    setupNotificationSound() {}, startNotificationWatch() {}, startPresence() {}, toast() {},
  });
  vm.runInContext(script.slice(begin, finish), context);
  return { context, scheduled, calls };
}

test('Supabase auth callbacks return synchronously and defer database work', async () => {
  const { context, scheduled, calls } = authFixture();
  assert.equal(context.callback('SIGNED_IN', { user: { id: ownerId } }), undefined);
  assert.equal(calls.length, 0);
  assert.equal(scheduled.length, 1);
  await scheduled[0]();
  assert.deepEqual(calls, ['profile', 'account', 'feed']);
});

test('stale queued auth callbacks cannot reload a previous account after sign out', async () => {
  const { context, scheduled, calls } = authFixture();
  context.callback('SIGNED_IN', { user: { id: ownerId } });
  context.callback('SIGNED_OUT', null);
  await scheduled[0]();
  assert.equal(calls.length, 0);
  await scheduled[1]();
  assert.deepEqual(calls, ['account', 'feed']);
});

function draftFixture() {
  const script = source('milkyway/premium.js');
  const begin = script.indexOf('  function draftKey(');
  const finish = script.indexOf("  byId('threadInput').addEventListener('input'", begin);
  const identityBegin = script.indexOf('  function messageId(');
  const identityFinish = script.indexOf('  const editSheet', identityBegin);
  const records = new Map();
  const input = { value: '' };
  const context = vm.createContext({ user: { id: ownerId }, draftPeer: null, pendingMessage: null, crypto: globalThis.crypto, byId: () => input,
    sessionStorage: { getItem: key => records.get(key) || null, setItem: (key, value) => records.set(key, value), removeItem: key => records.delete(key) },
  });
  vm.runInContext(`${script.slice(begin, finish)}\n${script.slice(identityBegin, identityFinish)}\nObject.assign(globalThis, {switchDraft,acknowledgeMessage,messageId});`, context);
  return { context, input, records };
}

test('DM acknowledgments preserve a newer draft typed while sending', () => {
  const { context, input, records } = draftFixture();
  context.switchDraft(otherId);input.value = 'newer draft';
  records.set(`mw-draft:${ownerId}:${otherId}`, input.value);
  context.acknowledgeMessage('sent text', otherId, ownerId, 'sent text');
  assert.equal(input.value, 'newer draft');
  assert.equal(records.get(`mw-draft:${ownerId}:${otherId}`), 'newer draft');
});

test('DM retries reuse their identifier until acknowledged and successful text clears only its own draft', () => {
  const { context, input } = draftFixture();
  context.switchDraft(otherId);input.value = 'sent text';
  const identity = context.messageId('sent text', otherId);
  assert.equal(context.messageId('sent text', otherId), identity);
  context.acknowledgeMessage('sent text', otherId, ownerId, 'sent text');
  assert.equal(input.value, '');
  assert.notEqual(context.messageId('sent text', otherId), identity);
});

test('DM attachment acknowledgments never erase unrelated composer text', () => {
  const { context, input } = draftFixture();
  context.switchDraft(otherId);input.value = 'unsent caption';
  context.acknowledgeMessage('{"attachment":"fixture"}', otherId, ownerId, 'unsent caption');
  assert.equal(input.value, 'unsent caption');
});

function listeningFixture(blocked = new Set()) {
  const script = source('milkyway/live-feed.js');
  const begin = script.indexOf('  function paintListening()');
  const finish = script.indexOf('  function sessionCard(', begin);
  const attributes = new Map();
  const notices = { mwLiveSound: { setAttribute: (key, value) => attributes.set(key, value), getAttribute: key => attributes.get(key) }, mwLiveAudioNotice: { dataset: {} }, mwLiveListeningHint: { dataset: {} } };
  const messages = [];
  let started = 0;
  const tracks = [0, 1].map(index => ({ element: { muted: true, async play() { if (blocked.has(index)) throw new Error('fixture playback rejection'); } } }));
  const context = vm.createContext({ room: { state: 'connected', async startAudio() { started++; } }, soundEnabled: false, soundRequest: null, audioTracks: new Map(tracks.map((track, index) => [index, track])),
    byId: identity => notices[identity], connected: () => context.room?.state === 'connected', translate: key => key, message: text => messages.push(text),
  });
  vm.runInContext(`${script.slice(begin, finish)};globalThis.listen = toggleSound;`, context);
  return { context, tracks, attributes, notices, messages, blocked, started: () => started };
}

test('room listening enables all subscribed audio without requesting local media', async () => {
  const fixture = listeningFixture();
  await fixture.context.listen();
  assert.equal(fixture.context.soundEnabled, true);
  assert.ok(fixture.tracks.every(track => track.element.muted === false));
  assert.equal(fixture.attributes.get('aria-pressed'), 'true');
  assert.equal(fixture.notices.mwLiveListeningHint.dataset.mwI18n, 'liveListeningEnabled');
  await fixture.context.listen();
  assert.ok(fixture.tracks.every(track => track.element.muted === true));
  assert.equal(fixture.context.soundEnabled, false);
});

test('partial playback failure rolls back all audio and exposes a truthful retry notice', async () => {
  const fixture = listeningFixture(new Set([1]));
  await fixture.context.listen();
  assert.equal(fixture.context.soundEnabled, false);
  assert.ok(fixture.tracks.every(track => track.element.muted));
  assert.equal(fixture.attributes.get('aria-pressed'), 'false');
  assert.deepEqual(fixture.messages, ['liveListeningBlocked']);
  fixture.blocked.clear();
  await fixture.context.listen();
  assert.equal(fixture.context.soundEnabled, true);
});

test('subscribed audio begins concurrently rather than waiting for another playback promise', async () => {
  const fixture = listeningFixture();
  let releasePlayback;
  let secondStarted = false;
  fixture.tracks[0].element.play = () => new Promise(resolve => { releasePlayback = resolve; });
  fixture.tracks[1].element.play = async () => { secondStarted = true; };
  const pending = fixture.context.listen();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(secondStarted, true);
  releasePlayback();
  await pending;
  assert.equal(fixture.context.soundEnabled, true);
});

test('rapid listening actions share one playback start', async () => {
  const fixture = listeningFixture();
  await Promise.all([fixture.context.listen(), fixture.context.listen()]);
  assert.equal(fixture.started(), 1);
  assert.equal(fixture.context.soundEnabled, true);
  assert.equal(fixture.context.soundRequest, null);
});

test('late playback authorization cannot unmute a disconnected or replacement room', async () => {
  const fixture = listeningFixture();
  let finishStart;
  fixture.context.room.startAudio = () => new Promise(resolve => { finishStart = resolve; });
  const operation = fixture.context.listen();
  fixture.context.room = { state: 'connected' };
  finishStart();await operation;
  assert.equal(fixture.context.soundEnabled, false);
  assert.ok(fixture.tracks.every(track => track.element.muted));
});

test('legacy token-shaped successes cannot be mistaken for participant, discovery, or control responses', async () => {
  for (const [action, payload] of [['participants', { token: 'ephemeral-fixture', serverUrl: projectUrl }], ['participants', { participants: [null] }], ['participants', { participants: [{ identity: 42 }] }], ['discovery', { sessions: [{}] }], ['end', { ok: false }], ['sync', {}]]) {
    const service = loadModule('lib/livekit-service.ts', { 'livekit-server-sdk': require('livekit-server-sdk'), './supabase.js': { supabaseConfig: () => ({ base: 'https://fixture.invalid', apiKey: 'fixture-public' }) }, './livekit.js': { livekitConfig: () => null }, './livekit-direct.js': {} }, { fetch: async () => Response.json(payload) });
    await assert.rejects(service.livekitRequest(request('room'), { action }), error => error.reason === 'endpoint_incompatible' && /existing Supabase function/.test(error.message));
  }
});

test('a viewer cannot call server synchronization for another participant', async () => {
  const fixture = backend({ accountId: otherId, active: true, roomRecords: [{ room: roomName, hostId: ownerId, admission: 'approval', endedAt: null }], memberRecords: [{ room: roomName, userId: otherId, state: 'viewer' }, { room: roomName, userId: ownerId, state: 'speaker' }] });
  assert.equal((await fixture.authorize(request('milkyway-media-authorize', { action: 'sync', roomName, target: ownerId }))).status, 403);
  assert.equal((await fixture.authorize(request('milkyway-media-authorize', { action: 'sync', roomName, target: otherId }))).status, 200);
});

test('an expired Live token is refreshed once without switching account identity', async () => {
  const fixture = tokenClientFixture(Response.json({ error: 'fixture expiry' }, { status: 401 }));
  fixture.context.user = { id: ownerId };
  let refreshes = 0;
  fixture.context.sb.auth.refreshSession = async () => { refreshes++;return { data: { session: { user: { id: ownerId }, access_token: 'refreshed-fixture' } } }; };
  const originalFetch = fixture.context.fetch;
  fixture.context.fetch = async (address, options) => options.headers.Authorization === 'Bearer refreshed-fixture' && !address.startsWith('/.netlify/') ? Response.json({ roomName, token: 'ephemeral-fixture', serverUrl: 'wss://room.invalid' }) : originalFetch(address, options);
  await fixture.run();assert.equal(refreshes, 1);
});

function notificationsFixture(options = {}) {
  const identity = options.identity || ownerId;
  const records = Object.fromEntries(['liveRooms', 'liveAlerts', 'notificationPreferences', 'pushSubscriptions', 'pushDeliveries'].map(name => [name, []]));
  records.liveRooms.push({ room: roomName, hostId: ownerId, endedAt: null, startedAt: new Date(Date.now() - 10000), notificationCursor: null, notificationsComplete: false, ...options.room });
  records.notificationPreferences.push(...(options.preferences || []));
  records.pushSubscriptions.push(...(options.subscriptions || []));
  records.liveAlerts.push(...(options.alerts || []));
  records.pushDeliveries.push(...(options.deliveries || []));
  const field = value => String(value).split('.').at(-1);
  const matches = (condition, row) => !condition ? true : condition.operation === 'and' ? condition.values.every(item => matches(item, row)) : condition.operation === 'or' ? condition.values.some(item => matches(item, row)) : condition.operation === 'eq' ? row[field(condition.values[0])] === condition.values[1] : condition.operation === 'inArray' ? condition.values[1].includes(row[field(condition.values[0])]) : condition.operation === 'isNull' ? row[field(condition.values[0])] == null : condition.operation === 'lte' ? row[field(condition.values[0])] <= condition.values[1] : true;
  const primary = { liveRooms: ['room'], liveAlerts: ['room', 'recipientId'], notificationPreferences: ['userId'], pushSubscriptions: ['id'], pushDeliveries: ['room', 'subscriptionId'] };
  const database = {
    select(selection) { return { from(table) {
      let condition = null;let limit = Infinity;
      const result = () => {
        const found = records[table.name].filter(row => matches(condition, row)).slice(0, limit);
        if (selection?.count) return [{ count: found.length }];
        return found.map(row => selection ? Object.fromEntries(Object.entries(selection).map(([name, value]) => [name, row[field(value)]])) : structuredClone(row));
      };
      const chain = { where(value) { condition = value;return chain; }, orderBy() { return chain; }, limit(value) { limit = value;return chain; }, async for() { return result(); }, then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); } };
      return chain;
    } }; },
    insert(table) { return { values(values) {
      const insert = patch => {
        for (const value of Array.isArray(values) ? values : [values]) {
          const existing = records[table.name].find(row => primary[table.name].every(name => row[name] === value[name]));
          if (existing) { if (patch) Object.assign(existing, patch); }
          else records[table.name].push({ createdAt: new Date(), readAt: null, status: 'pending', attempts: 0, nextAttemptAt: new Date(), ...structuredClone(value) });
        }
      };
      return { async onConflictDoNothing() { insert(); }, async onConflictDoUpdate(options) { insert(options.set); } };
    } }; },
    update(table) { return { set(patch) { return { where(condition) {
      const found = records[table.name].filter(row => matches(condition, row));found.forEach(row => Object.assign(row, patch));
      const result = Promise.resolve();result.returning = async () => structuredClone(found);return result;
    } }; } }; },
    delete(table) { return { async where(condition) {
      const removed = records[table.name].filter(row => matches(condition, row));records[table.name] = records[table.name].filter(row => !matches(condition, row));
      if (table.name === 'pushSubscriptions') records.pushDeliveries = records.pushDeliveries.filter(row => !removed.some(subscription => subscription.id === row.subscriptionId));
    } }; },
    async transaction(callback) { return callback(database); },
  };
  const imports = { 'node:crypto': require('node:crypto'), 'drizzle-orm': operations, '../db/index.js': { db: database }, '../db/schema.js': tables, './supabase.js': { supabaseConfig: () => ({ base: 'https://fixture.invalid', apiKey: 'fixture-public' }) }, './livekit-service.js': { livekitRequest: async () => ({ participants: options.participants || [{ identity: ownerId, tracks: [{ source: 2 }] }] }) } };
  const fetch = async address => address.endsWith('/auth/v1/user') ? Response.json({ id: identity }) : address.includes('mw_video_live_sessions') ? Response.json([{ host_id: ownerId, host_name: 'Fixture host', is_live: true, title: 'Fixture Live', scope: 'followers' }]) : address.includes('mw_profiles') ? Response.json([{ display_name: 'Fixture host', avatar_url: '' }]) : Response.json(options.recipients || [{ recipient_id: otherId }]);
  const environment = options.push ? { MW_VAPID_PUBLIC_KEY: 'ephemeral-fixture-public', MW_VAPID_PRIVATE_KEY: 'ephemeral-fixture-private', MW_VAPID_SUBJECT: 'mailto:fixture@example.invalid' } : {};
  const library = loadModule('lib/live-notifications.ts', imports, { fetch, process: { env: environment } });
  const endpoint = loadModule('functions/milkyway-notifications.mts', { 'drizzle-orm': operations, '../db/index.js': { db: database }, '../db/schema.js': tables, '../lib/live-notifications.js': library });
  const sent = [];
  const worker = loadModule('lib/push-delivery.ts', { 'web-push': { async sendNotification(subscription, payload) { sent.push({ subscription, payload });if (options.pushError) throw Object.assign(new Error('private provider error'), { statusCode: options.pushError }); } }, 'drizzle-orm': operations, '../db/index.js': { db: database }, '../db/schema.js': tables, './live-notifications.js': library });
  return { records, library, endpoint: endpoint.default, worker, sent };
}

test('Live notification endpoints require authentication and keep recipient reads and writes owner scoped', async () => {
  const fixture = notificationsFixture({ alerts: [{ room: roomName, recipientId: ownerId, readAt: null }, { room: roomName, recipientId: otherId, readAt: null }] });
  assert.equal((await fixture.endpoint(request('milkyway-notifications', undefined, 'GET', false))).status, 401);
  const own = await (await fixture.endpoint(request('milkyway-notifications', undefined, 'GET'))).json();
  assert.equal(own.alerts.length, 1);assert.equal(own.alerts[0].recipientId, ownerId);assert.equal(own.unread, 1);
  await fixture.endpoint(request('milkyway-notifications?action=read', { rooms: [roomName] }));
  assert.ok(fixture.records.liveAlerts[0].readAt);assert.equal(fixture.records.liveAlerts[1].readAt, null);
});

test('announcements require the real host, published media, and a cancellation grace period', async () => {
  for (const [options, status] of [[{ identity: otherId }, 403], [{ room: { endedAt: new Date() } }, 404], [{ room: { startedAt: new Date() } }, 409], [{ participants: [{ identity: ownerId, tracks: [] }] }, 409]]) {
    const fixture = notificationsFixture(options);
    assert.equal((await fixture.endpoint(request('milkyway-notifications?action=live-started', { room: roomName }))).status, status);
    assert.equal(fixture.records.liveAlerts.length, 0);
  }
});

test('Live start notifications persist offline alerts and create one push job per eligible subscribed follower', async () => {
  const fixture = notificationsFixture({ subscriptions: [{ id: 'fixture-subscription', userId: otherId }] });
  for (let attempt = 0; attempt < 2; attempt++) assert.equal((await fixture.endpoint(request('milkyway-notifications?action=live-started', { room: roomName }))).status, 200);
  assert.equal(fixture.records.liveAlerts.length, 1);assert.equal(fixture.records.pushDeliveries.length, 1);assert.equal(fixture.records.liveRooms[0].notificationsComplete, true);
  const optedOut = notificationsFixture({ preferences: [{ userId: otherId, liveEnabled: false }], subscriptions: [{ id: 'fixture-subscription', userId: otherId }] });
  await optedOut.endpoint(request('milkyway-notifications?action=live-started', { room: roomName }));
  assert.equal(optedOut.records.liveAlerts.length, 0);assert.equal(optedOut.records.pushDeliveries.length, 0);
});

test('push registration rejects arbitrary URLs, malformed keys, and unsupported delivery configuration', async () => {
  const fixture = notificationsFixture();
  const receiver = require('node:crypto').createECDH('prime256v1');receiver.generateKeys();
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/fixture', keys: { p256dh: receiver.getPublicKey().toString('base64url'), auth: 'A'.repeat(22) } };
  for (const endpoint of ['http://fcm.googleapis.com/fixture', 'https://localhost/fixture', 'https://fcm.googleapis.com.evil.invalid/fixture', 'https://fcm.googleapis.com:8443/fixture', 'https://fcm.googleapis.com@evil.invalid/fixture']) assert.throws(() => fixture.library.validatedSubscription({ ...subscription, endpoint }));
  assert.throws(() => fixture.library.validatedSubscription({ ...subscription, keys: { p256dh: 'invalid', auth: 'invalid' } }));
  assert.equal((await fixture.endpoint(request('milkyway-notifications?action=subscription', { subscription }))).status, 503);
  assert.equal(fixture.records.pushSubscriptions.length, 0);
  assert.equal((await (await fixture.endpoint(request('milkyway-notifications?action=settings', undefined, 'GET'))).json()).pushAvailable, false);
});

test('notification preferences cannot be written for a supplied account identifier', async () => {
  const fixture = notificationsFixture();
  const response = await fixture.endpoint(request('milkyway-notifications?action=preferences', { userId: otherId, liveEnabled: false, soundEnabled: false, language: 'de' }));
  assert.equal(response.status, 200);assert.equal(fixture.records.notificationPreferences[0].userId, ownerId);
});

test('subscription reassignment requires device keys and deletion remains owner scoped', async () => {
  const receiver = require('node:crypto').createECDH('prime256v1');receiver.generateKeys();
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/ownership-fixture', keys: { p256dh: receiver.getPublicKey().toString('base64url'), auth: 'A'.repeat(22) } };
  const fixture = notificationsFixture({ push: true });
  const validated = fixture.library.validatedSubscription(subscription);
  fixture.records.pushSubscriptions.push({ ...validated, userId: otherId, auth: 'B'.repeat(22) });
  const registration = request('milkyway-notifications?action=subscription', { subscription });
  assert.equal((await fixture.endpoint(registration)).status, 409);
  assert.equal(fixture.records.pushSubscriptions[0].userId, otherId);
  assert.equal((await fixture.endpoint(request('milkyway-notifications?action=subscription', { subscription }, 'DELETE'))).status, 200);
  assert.equal(fixture.records.pushSubscriptions.length, 1);
  fixture.records.pushSubscriptions[0].auth = validated.auth;
  assert.equal((await fixture.endpoint(request('milkyway-notifications?action=subscription', { subscription }))).status, 200);
  assert.equal(fixture.records.pushSubscriptions[0].userId, ownerId);
  assert.equal((await fixture.endpoint(request('milkyway-notifications?action=subscription', { subscription }, 'DELETE'))).status, 200);
  assert.equal(fixture.records.pushSubscriptions.length, 0);
});

test('background delivery sends a session deep link and honors the saved sound and language preferences', async () => {
  const fixture = notificationsFixture({ push: true, subscriptions: [{ id: 'fixture', userId: otherId, endpoint: 'https://fcm.googleapis.com/fcm/send/fixture', p256dh: 'fixture', auth: 'fixture' }], alerts: [{ room: roomName, recipientId: otherId, hostName: 'Fixture host', title: 'Fixture Live', createdAt: new Date() }], deliveries: [{ room: roomName, recipientId: otherId, subscriptionId: 'fixture', status: 'pending', attempts: 0, nextAttemptAt: new Date(0) }], preferences: [{ userId: otherId, liveEnabled: true, soundEnabled: false, language: 'de' }] });
  await fixture.worker.dispatchPush();assert.equal(fixture.sent.length, 1);
  const payload = JSON.parse(fixture.sent[0].payload);assert.equal(payload.title, 'Fixture host ist live');assert.equal(payload.silent, true);assert.equal(payload.url, `/milkyway/#live=${roomName}`);assert.equal(fixture.records.pushDeliveries[0].status, 'delivered');
});

test('background delivery removes expired subscriptions and durably retries temporary provider failures', async () => {
  for (const status of [404, 410, 429, 503]) {
    const fixture = notificationsFixture({ push: true, pushError: status, subscriptions: [{ id: 'fixture', userId: otherId }], alerts: [{ room: roomName, recipientId: otherId, hostName: 'Fixture', title: 'Live', createdAt: new Date() }], deliveries: [{ room: roomName, recipientId: otherId, subscriptionId: 'fixture', status: 'pending', attempts: 0, nextAttemptAt: new Date(0) }] });
    await fixture.worker.dispatchPush();
    if ([404, 410].includes(status)) { assert.equal(fixture.records.pushSubscriptions.length, 0);assert.equal(fixture.records.pushDeliveries.length, 0); }
    else { assert.equal(fixture.records.pushDeliveries[0].status, 'pending');assert.equal(fixture.records.pushDeliveries[0].attempts, 1);assert.ok(fixture.records.pushDeliveries[0].nextAttemptAt > new Date()); }
  }
});

test('ended sessions and newly disabled preferences do not send queued push notifications', async () => {
  for (const options of [{ room: { endedAt: new Date() } }, { preferences: [{ userId: otherId, liveEnabled: false }] }]) {
    const fixture = notificationsFixture({ ...options, push: true, subscriptions: [{ id: 'fixture', userId: otherId }], alerts: [{ room: roomName, recipientId: otherId, createdAt: new Date() }], deliveries: [{ room: roomName, recipientId: otherId, subscriptionId: 'fixture', status: 'pending', attempts: 0, nextAttemptAt: new Date(0) }] });
    await fixture.worker.dispatchPush();assert.equal(fixture.sent.length, 0);assert.equal(fixture.records.pushDeliveries[0].status, 'expired');
  }
});

test('the real web-push SDK encrypts notification content and signs an ephemeral VAPID request', () => {
  const webpush = require('web-push');
  const { createECDH, randomBytes } = require('node:crypto');
  const receiver = createECDH('prime256v1');receiver.generateKeys();
  const keys = webpush.generateVAPIDKeys();
  const payload = JSON.stringify({ title: 'Private fixture alert' });
  const encrypted = webpush.generateRequestDetails({ endpoint: 'https://fcm.googleapis.com/fcm/send/fixture', keys: { p256dh: receiver.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } }, payload, { vapidDetails: { ...keys, subject: 'mailto:fixture@example.invalid' }, TTL: 300 });
  assert.equal(encrypted.method, 'POST');assert.equal(encrypted.headers['Content-Encoding'], 'aes128gcm');assert.equal(encrypted.headers.TTL, 300);
  assert.ok(encrypted.body.length > payload.length);assert.equal(encrypted.body.includes('Private fixture alert'), false);assert.ok(encrypted.headers.Authorization);
});

test('service-worker push validates deep links and focuses existing clients without reloading a Live', async () => {
  const events = {};const shown = [];const messages = [];let focused = false;
  const context = { URL, self: { location: { origin: 'https://application.invalid' }, registration: { scope: 'https://application.invalid/milkyway/', showNotification: async (title, options) => shown.push({ title, options }) }, addEventListener(name, listener) { events[name] = listener; }, clients: { matchAll: async () => [{ url: 'https://application.invalid/milkyway/', postMessage: message => messages.push(message), focus: async () => { focused = true; } }] } } };
  vm.runInNewContext(source('milkyway/sw.js'), context);
  const invoke = async payload => { let pending;events.push({ data: { json: () => payload }, waitUntil: task => { pending = task; } });await pending; };
  await invoke({ title: 'Fixture Live', body: 'Fixture', url: 'https://evil.invalid/milkyway/' });assert.equal(shown.length, 0);
  await invoke({ title: 'Fixture Live', body: 'Fixture', url: `/milkyway/#live=${roomName}`, silent: true });assert.equal(shown.length, 1);assert.equal(shown[0].options.silent, true);
  let pending;events.notificationclick({ notification: { data: shown[0].options.data, close() {} }, waitUntil: task => { pending = task; } });await pending;
  assert.equal(focused, true);assert.equal(messages[0].type, 'mw-open-live');assert.ok(messages[0].url.endsWith(roomName));
});

test('session-history lifecycle metadata is retrieved only for the authenticated host', async () => {
  const fixture = backend({ roomRecords: [{ room: roomName, hostId: ownerId, startedAt: new Date(), endedAt: new Date(), lifecycleStatus: 'ended' }, { room: `mw-conversation-video-${otherId}`, hostId: otherId, lifecycleStatus: 'ended' }] });
  const response = await fixture.account(request(`milkyway-account?action=live-history&rooms=${roomName},mw-conversation-video-${otherId}`, undefined, 'GET'));
  const result = await response.json();assert.equal(response.status, 200);assert.equal(result.metadata.length, 1);assert.equal(result.metadata[0].room, roomName);
});

test('confirmed media publication is required to record a successfully started session', async () => {
  for (const published of [false, true]) {
    class ServiceFixture {
      async listParticipants() { return [{ identity: ownerId, permission: { canPublish: true, canPublishData: false, canPublishSources: [1, 2] }, tracks: published ? [{ source: 2, muted: false }] : [] }]; }
    }
    const room = { room: roomName, hostId: ownerId, endedAt: null, lifecycleStatus: 'preparing' };
    const fixture = backend({ active: true, sdk: { ...require('livekit-server-sdk'), RoomServiceClient: ServiceFixture }, configuration: livekit({ LIVEKIT_URL: projectUrl, LIVEKIT_API_KEY: 'ephemeral-fixture', LIVEKIT_API_SECRET: 'ephemeral-fixture-signature' }), roomRecords: [room], memberRecords: [{ room: roomName, userId: ownerId, state: 'speaker', hostMuted: false }] });
    const response = await fixture.room(request('milkyway-room', { room: roomName, action: 'started' }));
    assert.equal(response.status, published ? 200 : 409);assert.equal(room.lifecycleStatus, published ? 'live' : 'preparing');assert.equal(!!room.startedAt, published);
  }
});

test('Netlify LiveKit gateway answers health checks, creates the host room and issues room-scoped tokens with existing credentials', async () => {
  const sdk = require('livekit-server-sdk');
  const calls = [];
  class ServiceFixture { constructor(...args) { calls.push(['client', args[0]]); } async listRooms(names) { calls.push(['listRooms', names]); return []; } async createRoom(options) { calls.push(['createRoom', options.name]); return {}; } }
  const load = configuration => loadModule('lib/livekit-direct.ts', { 'livekit-server-sdk': { ...sdk, RoomServiceClient: ServiceFixture }, './livekit.js': configuration, './supabase.js': { supabaseConfig: () => ({ base: 'https://backend.invalid', apiKey: 'test-only' }) }, './live-authorize.js': { authorizeLiveRoom: async () => ({ roomName, identity: ownerId, name: 'Host', avatar: '', hostId: ownerId, remove: false, permissions: { canPublish: true, canPublishSources: [1, 2] } }) } }, {
    fetch: async address => address.endsWith('/auth/v1/user') ? Response.json({ id: ownerId }) : Response.json([]),
    BigInt, Math, Date, JSON, Number, String, Promise, Array, Object, Error, Boolean,
  }).livekitDirect;
  const missing = await load(livekit())(new Request('https://application.invalid'));
  assert.equal(missing.result.available, false);
  assert.equal(missing.result.reason, 'configuration_missing');
  const configured = load(livekit({ LIVEKIT_URL: projectUrl, LIVEKIT_API_KEY: 'test-only', LIVEKIT_API_SECRET: 'test-only-secret-value-long-enough' }));
  const health = await configured(new Request('https://application.invalid'));
  assert.equal(health.status, 200);
  assert.equal(health.result.available, true);
  assert.equal(health.result.reason, 'service_ready');
  const token = await configured(new Request('https://application.invalid', { method: 'POST', headers: { Authorization: 'Bearer test-only' } }), { action: 'token', roomName });
  assert.equal(token.status, 200);
  assert.equal(token.result.roomName, roomName);
  assert.equal(token.result.serverUrl, projectUrl);
  assert.equal(JSON.parse(Buffer.from(token.result.token.split('.')[1], 'base64url')).video.room, roomName);
  assert.ok(calls.some(([name, value]) => name === 'createRoom' && value === roomName));
  const anonymous = await configured(new Request('https://application.invalid', { method: 'POST' }), { action: 'token', roomName });
  assert.equal(anonymous.status, 401);
});

test('call pushes ring every device with Answer / Decline and an open app checks in instead of a duplicate notification', async () => {
  const callId = '7b0c3f5e-2a41-4e8b-9d7c-1f2e3a4b5c6d';
  const sent = [];const removed = [];
  const subscriptions = [{ id: 'device-a', userId: otherId, endpoint: 'https://fcm.googleapis.com/a', p256dh: 'p', auth: 'a' }, { id: 'device-b', userId: otherId, endpoint: 'https://fcm.googleapis.com/b', p256dh: 'p', auth: 'a' }];
  const query = rows => ({ from: () => ({ where: () => Object.assign(Promise.resolve(rows), { limit: async () => rows }) }) });
  let selects = 0;
  const { sendCallPush, callPushPayload } = loadModule('lib/call-push.ts', {
    'web-push': { sendNotification: async (subscription, payload, options) => { if (subscription.endpoint.endsWith('/b')) throw Object.assign(new Error('gone'), { statusCode: 410 }); sent.push({ payload: JSON.parse(payload), options }); } },
    'drizzle-orm': { eq: () => null, inArray: (column, values) => values },
    '../db/index.js': { db: { select: () => (selects++ ? query([{ userId: otherId, language: 'en' }]) : query(subscriptions)), delete: () => ({ where: async ids => { removed.push(...ids); } }) } },
    '../db/schema.js': { notificationPreferences: {}, pushSubscriptions: { id: 'id', userId: 'userId' } },
    './live-notifications.js': { pushConfiguration: () => ({ publicKey: 'p', privateKey: 'k', subject: 'https://application.invalid' }) },
  }, { JSON, Promise, String });
  const result = await sendCallPush(otherId, { kind: 'ring', id: callId, mode: 'video', callerName: 'Amani' });
  assert.equal(result.delivered, 1);assert.deepEqual(removed, ['device-b']);
  assert.equal(sent[0].payload.title, 'Amani · Incoming video call');assert.equal(sent[0].payload.url, `/milkyway/#call=${callId}`);
  assert.equal(sent[0].options.urgency, 'high');assert.equal(sent[0].options.TTL, 45);assert.ok(sent[0].options.topic.length <= 32);
  assert.match(JSON.parse(callPushPayload({ kind: 'missed', id: callId, mode: 'audio', callerName: 'Amani' }, 'sw')).title, /^Simu uliyoikosa/);

  const events = {};const shown = [];const messages = [];let visibility = 'hidden';let opened = null;
  const context = { URL, Date, self: { location: { origin: 'https://application.invalid' }, registration: { scope: 'https://application.invalid/milkyway/', showNotification: async (title, options) => shown.push({ title, options }) }, addEventListener(name, listener) { events[name] = listener; }, clients: { openWindow: async address => { opened = address; }, matchAll: async () => (visibility === 'none' ? [] : [{ url: 'https://application.invalid/milkyway/', visibilityState: visibility, postMessage: message => messages.push(message), focus: async () => {} }]) } } };
  vm.runInNewContext(source('milkyway/sw.js'), context);
  const invoke = async payload => { let pending;events.push({ data: { json: () => payload }, waitUntil: task => { pending = task; } });await pending; };
  const ring = sent[0].payload;
  await invoke({ ...ring, url: '/milkyway/#call=not-a-call' });assert.equal(shown.length, 0);
  await invoke(ring);assert.equal(shown.length, 1);assert.equal(shown[0].options.requireInteraction, true);assert.equal(shown[0].options.actions.map(action => action.action).join(), 'answer,decline');
  visibility = 'visible';await invoke(ring);assert.equal(shown.length, 1);assert.equal(messages.at(-1).type, 'mw-call-push');
  let pending;events.notificationclick({ action: 'answer', notification: { data: shown[0].options.data, close() {} }, waitUntil: task => { pending = task; } });await pending;
  assert.deepEqual({ ...messages.at(-1) }, { type: 'mw-call-action', id: callId, action: 'answer' });
  visibility = 'none';events.notificationclick({ action: 'decline', notification: { data: shown[0].options.data, close() {} }, waitUntil: task => { pending = task; } });await pending;
  assert.equal(opened, `https://application.invalid/milkyway/#call=${callId}&do=decline`);
});

test('call signals reach the other participant over a realtime broadcast that only names the call', async () => {
  const callId = '7b0c3f5e-2a41-4e8b-9d7c-1f2e3a4b5c6d';
  const requests = [];
  const { sendCallSignal, callChannel } = loadModule('lib/call-signal.ts', {}, { JSON, AbortSignal, fetch: async (url, options) => { requests.push({ url, options });return new Response(null, { status: 202 }); } });
  assert.equal(await sendCallSignal('https://backend.invalid', { apikey: 'anon', Authorization: 'Bearer user' }, [otherId], { kind: 'ring', id: callId }), true);
  assert.equal(requests[0].url, 'https://backend.invalid/realtime/v1/api/broadcast');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer user');
  assert.deepEqual(JSON.parse(requests[0].options.body), { messages: [{ topic: callChannel(otherId), event: 'call', payload: { kind: 'ring', id: callId }, private: false }] });
  assert.equal(await sendCallSignal('', {}, [otherId], { kind: 'update', id: callId }), false);
  assert.equal(requests.length, 1);
  const client = readFileSync(new URL('../milkyway/dm-calls.js', import.meta.url), 'utf8');
  assert.match(client, /sb\.channel\(`mw-calls-\$\{account\}`/);
  assert.match(client, /ringFromSignal[\s\S]*callApi\(`\?id=/);
});

test('gallery audiences keep Only me posts and their documents private to the author', async () => {
  const owner = '11111111-1111-4111-8111-111111111111', stranger = '22222222-2222-4222-8222-222222222222';
  const publicPost = '33333333-3333-4333-8333-333333333333', privatePost = '44444444-4444-4444-8444-444444444444';
  const repost = '55555555-5555-4555-8555-555555555555';
  const tables = { reposts: [{ repostId: repost, originalId: privatePost, userId: stranger, originalAuthorId: owner }], audiences: [{ postId: privatePost, ownerId: owner, audience: 'only_me' }], files: [{ key: `${owner}/${privatePost}/a`, postId: privatePost, ownerId: owner, name: 'secret.pdf', mime: 'application/pdf', size: 5 }, { key: `${owner}/${publicPost}/b`, postId: publicPost, ownerId: owner, name: 'open.pdf', mime: 'application/pdf', size: 5 }] };
  const column = (table, names) => Object.fromEntries(names.map(name => [name, { table, name }]));
  const postAudiences = column('audiences', ['postId', 'ownerId', 'audience']), postFiles = column('files', ['key', 'postId', 'ownerId', 'name', 'mime', 'size', 'createdAt']), postReposts = column('reposts', ['repostId', 'originalId', 'userId', 'originalAuthorId']);
  const orm = { eq: (c, v) => row => row[c.name] === v, inArray: (c, values) => row => values.includes(row[c.name]), and: (...tests) => row => tests.every(check => check(row)) };
  const query = (rows, map = row => row) => { const chain = { where: check => query(rows.filter(check), map), limit: count => query(rows.slice(0, count), map), then: (resolve, reject) => Promise.resolve(rows.map(map)).then(resolve, reject) };return chain; };
  const db = {
    select: fields => ({ from: table => query(tables[Object.values(table)[0].table], fields ? row => Object.fromEntries(Object.entries(fields).map(([key, c]) => [key, row[c.name]])) : row => row) }),
    insert: table => ({ values: values => ({ onConflictDoUpdate: async ({ set }) => { const rows = tables[Object.values(table)[0].table];const found = rows.find(row => row.postId === values.postId);if (found) Object.assign(found, set);else rows.push(values); } }) }),
    delete: () => ({ where: async () => {} }),
  };
  const posts = { [publicPost]: owner, [privatePost]: owner, [repost]: stranger };
  const fetch = async address => {
    const url = new URL(address);
    const id = url.searchParams.get('id')?.slice(3);
    return Response.json(posts[id] ? [{ id, author_id: posts[id] }] : []);
  };
  const service = loadModule('functions/milkyway-gallery.mts', {
    '@netlify/blobs': { getStore: () => ({ get: async () => new TextEncoder().encode('%PDF-').buffer, set: async () => {}, delete: async () => {} }) },
    'drizzle-orm': orm, '../db/index.js': { db }, '../db/schema.js': { postAudiences, postFiles, postReposts },
    '../lib/supabase.js': { supabaseConfig: () => ({ base: 'https://backend.invalid', apiKey: 'fixture-public' }) },
    '../lib/suspensions.js': { assertActive: async () => {} },
  }, { fetch: async (address, options) => { const url = new URL(address);if (url.pathname === '/auth/v1/user') return Response.json({ id: options.headers.Authorization?.slice(7) });return fetch(address); } }).default;
  const call = (query, account, init = {}) => service(new Request(`https://application.invalid/.netlify/functions/milkyway-gallery?${query}`, { ...init, headers: { ...(account ? { Authorization: `Bearer ${account}` } : {}), ...init.headers } }));
  const audiences = await (await call(`action=audiences&ids=${publicPost},${privatePost}`)).json();
  assert.deepEqual(audiences.private.map(row => row.postId), [privatePost]);
  // A repost of an "Only me" post is hidden from everyone but the reposter.
  const repostAudiences = await (await call(`action=audiences&ids=${repost}`)).json();
  assert.deepEqual(repostAudiences.private, [{ postId: repost, ownerId: stranger }]);
  const strangerGallery = await (await call(`action=gallery&owner=${owner}`, stranger)).json();
  assert.deepEqual(strangerGallery.files.map(file => file.name), ['open.pdf']);
  assert.equal(strangerGallery.mine, false);
  const ownerGallery = await (await call(`action=gallery&owner=${owner}`, owner)).json();
  assert.deepEqual(ownerGallery.files.map(file => file.name).sort(), ['open.pdf', 'secret.pdf']);
  assert.equal(ownerGallery.audiences[privatePost], 'only_me');
  assert.equal((await call(`action=file&key=${encodeURIComponent(`${owner}/${privatePost}/a`)}`)).status, 403);
  assert.equal((await call(`action=file&key=${encodeURIComponent(`${owner}/${privatePost}/a`)}`, stranger)).status, 403);
  assert.equal((await call(`action=file&key=${encodeURIComponent(`${owner}/${privatePost}/a`)}`, owner)).status, 200);
  assert.equal((await call(`action=file&key=${encodeURIComponent(`${owner}/${publicPost}/b`)}`)).status, 200);
  const change = (account, audience) => call(`action=audience&id=${publicPost}`, account, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audience }) });
  assert.equal((await change(stranger, 'only_me')).status, 403);
  assert.equal((await change(owner, 'public')).status, 400);
  assert.equal((await change(owner, 'only_me')).status, 200);
  assert.equal((await call(`action=file&key=${encodeURIComponent(`${owner}/${publicPost}/b`)}`)).status, 403);
});

test('shared post links preview the post media and caption, hide Only me posts and open the post in the app', async () => {
  const author = '11111111-1111-4111-8111-111111111111';
  const photo = '33333333-3333-4333-8333-333333333333', clip = '55555555-5555-4555-8555-555555555555', hidden = '44444444-4444-4444-8444-444444444444';
  const storage = 'https://backend.invalid/storage/v1/object/public/portfolio/milkyway/u';
  const posts = {
    [photo]: { id: photo, author_id: author, author_name: 'Amani', caption: 'Kitchen <cabinet> mpya', media_url: `${storage}/a.jpg`, media_type: 'image', created_at: '2026-10-14T10:00:00Z' },
    [clip]: { id: clip, author_id: author, author_name: 'Amani', caption: 'Video ya leo', media_url: `${storage}/b.mp4`, media_type: 'video', created_at: '2026-10-14T10:00:00Z' },
    [hidden]: { id: hidden, author_id: author, author_name: 'Amani', caption: 'secret caption', media_url: `${storage}/c.jpg`, media_type: 'image', created_at: '2026-10-14T10:00:00Z' },
  };
  const tables = { audiences: [{ postId: hidden, audience: 'only_me' }], preferences: [], extras: [] };
  const column = (table, names) => Object.fromEntries(names.map(name => [name, { table, name }]));
  const query = (rows, map) => { const chain = { where: check => query(rows.filter(check), map), then: (resolve, reject) => Promise.resolve(rows.map(map)).then(resolve, reject), catch: () => chain };return chain; };
  const db = { select: fields => ({ from: table => query(tables[Object.values(table)[0].table], row => Object.fromEntries(Object.entries(fields).map(([key, c]) => [key, row[c.name]]))) }) };
  const fetch = async (address, options = {}) => {
    const url = new URL(address);
    if (options.method === 'HEAD') return new Response(null, { status: url.pathname.endsWith('b.mp4.poster.jpg') ? 200 : 404 });
    if (url.pathname.endsWith('/mw_posts')) { const post = posts[url.searchParams.get('id').slice(3)];return Response.json(post ? [post] : []); }
    if (url.pathname.endsWith('/mw_profiles')) return Response.json([{ display_name: 'Amani', username: 'amani', avatar_url: null }]);
    return new Response('', { status: 404 });
  };
  const service = loadModule('functions/milkyway-post-share.mts', {
    'drizzle-orm': { eq: (c, v) => row => row[c.name] === v }, '../db/index.js': { db },
    '../db/schema.js': { postAudiences: column('audiences', ['postId', 'audience']), accountPreferences: column('preferences', ['userId', 'isPrivate']), postExtras: column('extras', ['postId', 'media']) },
    '../lib/supabase.js': { supabaseConfig: () => ({ base: 'https://backend.invalid', apiKey: 'fixture-public' }) },
  }, { fetch }).default;
  const page = async id => { const response = await service(new Request(`https://masiyatunda.com/milkyway/p/${id}`));return { status: response.status, html: await response.text() }; };
  const meta = (html, key) => new RegExp(`(?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1];

  const image = await page(photo);
  assert.equal(image.status, 200);
  assert.equal(meta(image.html, 'og:title'), 'Amani (@amani) · MilkyWay');
  assert.equal(meta(image.html, 'og:description'), 'Kitchen &lt;cabinet&gt; mpya');
  assert.match(meta(image.html, 'og:image'), /^https:\/\/masiyatunda\.com\/\.netlify\/images\?url=.*a\.jpg.*fm=jpg/);
  assert.equal(meta(image.html, 'twitter:card'), 'summary_large_image');
  assert.match(image.html, new RegExp(`location\\.replace\\("/milkyway/\\?post=${photo}#post-${photo}"\\)`));

  const video = await page(clip);
  assert.equal(meta(video.html, 'og:type'), 'video.other');
  assert.equal(meta(video.html, 'og:video'), `${storage}/b.mp4`);
  assert.match(meta(video.html, 'og:image'), /b\.mp4\.poster\.jpg/);

  const secret = await page(hidden);
  assert.doesNotMatch(secret.html, /secret caption|c\.jpg/);
  assert.match(meta(secret.html, 'og:image'), /icon-512\.png$/);
  assert.match(secret.html, new RegExp(`/milkyway/\\?post=${hidden}`));

  const invalid = await service(new Request('https://masiyatunda.com/milkyway/p/not-a-post'));
  assert.equal(invalid.status, 302);
});

test('one-tap repost creates one post per person, refuses duplicates, own posts and Only me posts', async () => {
  const author = '11111111-1111-4111-8111-111111111111', fan = '22222222-2222-4222-8222-222222222222';
  const original = '33333333-3333-4333-8333-333333333333', hidden = '44444444-4444-4444-8444-444444444444';
  const tables = { reposts: [], audiences: [{ postId: hidden, ownerId: author, audience: 'only_me' }], extras: [], comments: [] };
  const column = (table, names) => Object.fromEntries(names.map(name => [name, { table, name }]));
  const schema = { postReposts: column('reposts', ['repostId', 'originalId', 'userId', 'originalAuthorId', 'originalAuthorName']), postAudiences: column('audiences', ['postId', 'ownerId', 'audience']), postExtras: column('extras', ['postId', 'ownerId']), commentExtras: column('comments', ['commentId', 'postId', 'ownerId']) };
  const orm = { eq: (c, v) => row => row[c.name] === v, inArray: (c, values) => row => values.includes(row[c.name]), and: (...tests) => row => tests.every(check => check(row)) };
  const query = (rows, map = row => row) => ({ where: check => query(rows.filter(check), map), limit: count => query(rows.slice(0, count), map), then: (resolve, reject) => Promise.resolve(rows.map(map)).then(resolve, reject) });
  const tableOf = table => tables[Object.values(table)[0].table];
  const db = {
    select: fields => ({ from: table => query(tableOf(table), fields ? row => Object.fromEntries(Object.entries(fields).map(([key, c]) => [key, row[c.name]])) : row => row) }),
    insert: table => ({ values: values => ({ onConflictDoNothing: () => ({ returning: async () => { const rows = tableOf(table);if (rows.some(row => row.userId === values.userId && row.originalId === values.originalId)) return [];rows.push(values);return [{ repostId: values.repostId }]; } }) }) }),
    delete: table => ({ where: async check => { const rows = tableOf(table);for (let index = rows.length - 1; index >= 0; index--) if (check(rows[index])) rows.splice(index, 1); } }),
  };
  const posts = new Map([[original, { id: original, author_id: author, caption: 'Hello', media_url: 'https://backend.invalid/a.jpg', media_type: 'image' }], [hidden, { id: hidden, author_id: author, caption: 'Secret' }]]);
  const inserted = [];
  const fetch = async (address, options = {}) => {
    const url = new URL(address);
    if (url.pathname === '/auth/v1/user') return Response.json({ id: options.headers.Authorization.slice(7) });
    if (url.pathname === '/rest/v1/mw_profiles') return Response.json([{ display_name: 'Author' }]);
    if (url.pathname === '/rest/v1/mw_posts' && options.method === 'POST') { const row = JSON.parse(options.body);inserted.push(row);posts.set(row.id, row);return new Response(null, { status: 201 }); }
    const post = posts.get(url.searchParams.get('id')?.slice(3));
    return Response.json(post ? [post] : []);
  };
  const service = loadModule('functions/milkyway-social.mts', {
    'drizzle-orm': orm, '../db/index.js': { db }, '../db/schema.js': schema,
    '../lib/supabase.js': { supabaseConfig: () => ({ base: 'https://backend.invalid', apiKey: 'fixture-public' }) },
    '../lib/suspensions.js': { assertActive: async () => {} },
  }, { fetch }).default;
  const call = (id, account) => service(new Request(`https://application.invalid/.netlify/functions/milkyway-social?action=repost&id=${id}`, { method: 'POST', headers: { Authorization: `Bearer ${account}` }, body: '{}' }));
  const first = await call(original, fan);
  assert.equal(first.status, 201);
  const { postId } = await first.json();
  assert.equal(inserted.length, 1);
  assert.deepEqual({ ...inserted[0], id: undefined }, { id: undefined, author_id: fan, author_name: 'Author', caption: 'Hello', media_url: 'https://backend.invalid/a.jpg', media_type: 'image' });
  assert.equal(inserted[0].id, postId);
  assert.equal((await call(original, fan)).status, 409);
  assert.equal((await call(postId, fan)).status, 400); // reposting your own repost
  assert.equal((await call(original, author)).status, 400);
  assert.equal((await call(hidden, fan)).status, 403);
  assert.equal(inserted.length, 1);
  // Deleting the repost lets the person repost again.
  posts.delete(postId);
  assert.equal((await call(original, fan)).status, 201);
  assert.equal(tables.reposts.length, 1);
});

test('gifts split 60/40 behind the scenes into the creator balance and company wallet, creators only see net coins and withdrawals unlock at 50 coins', async () => {
  const creator = '11111111-1111-4111-8111-111111111111', fan = '22222222-2222-4222-8222-222222222222', post = '33333333-3333-4333-8333-333333333333';
  const tables = { balances: [{ userId: fan, coins: 100 }], earnings: [], gifts: [], topups: [], withdrawals: [], settings: [], rooms: [], messages: [], audiences: [], countries: [], company: [] };
  const column = (table, names) => Object.fromEntries(names.map(name => [name, { table, name }]));
  const schema = {
    companyWallet: column('company', ['id', 'balanceMilli', 'updatedAt']),
    accountBalances: column('balances', ['userId', 'coins', 'updatedAt']), creatorEarnings: column('earnings', ['userId', 'availableMilli', 'lifetimeMilli', 'updatedAt']),
    gifts: column('gifts', ['id', 'senderId', 'recipientId', 'giftKey', 'coins', 'creatorMilli', 'companyMilli', 'targetType', 'targetId', 'createdAt']),
    coinTopups: column('topups', ['id', 'userId', 'coins', 'amountTzs', 'network', 'phone', 'reference', 'status', 'adminNote', 'createdAt']),
    coinWithdrawals: column('withdrawals', ['id', 'userId', 'milli', 'payoutTzs', 'grossTzs', 'commissionTzs', 'network', 'phone', 'accountName', 'status', 'payoutRef', 'adminNote', 'createdAt']),
    walletSettings: column('settings', ['key', 'value']), liveRooms: column('rooms', ['room', 'endedAt']), liveMessages: column('messages', ['id', 'room']), postAudiences: column('audiences', ['postId', 'audience']),
    accountCountries: column('countries', ['userId', 'country', 'currency', 'source']),
  };
  // `sql` only appears as "column ± number" in updates and "column is null" in filters.
  const sql = (strings, ...values) => ({ strings: [...strings], values });
  const evaluate = (value, row) => value && value.strings ? (value.strings[1].trim() === '-' ? row[value.values[0].name] - value.values[1] : row[value.values[0].name] + value.values[1]) : value;
  const condition = check => typeof check === 'function' ? check : check?.strings ? row => row[check.values[0].name] == null : () => true;
  const orm = { eq: (c, v) => row => row[c.name] === v, gte: (c, v) => row => row[c.name] >= v, and: (...tests) => row => tests.every(test => condition(test)(row)), desc: c => c, sql };
  const tableOf = table => tables[Object.values(table)[0].table];
  const project = (fields, row) => fields ? Object.fromEntries(Object.entries(fields).map(([key, c]) => [key, row[c.name]])) : { ...row };
  const query = (rows, fields) => ({ where: check => query(rows.filter(condition(check)), fields), orderBy: () => query(rows, fields), limit: count => query(rows.slice(0, count), fields), for: () => query(rows, fields), then: (resolve, reject) => Promise.resolve(fields && Object.values(fields).some(value => value.strings) ? [{ count: rows.length }] : rows.map(row => project(fields, row))).then(resolve, reject) });
  const db = {
    select: fields => ({ from: table => query(tableOf(table), fields) }),
    insert: table => ({ values: values => {
      const rows = tableOf(table), record = { id: crypto.randomUUID(), status: 'pending', adminNote: '', payoutRef: '', createdAt: new Date(), ...values };
      const add = () => { rows.push(record);return [record]; };
      return {
        then: (resolve, reject) => Promise.resolve(add()).then(resolve, reject),
        returning: async () => add(),
        onConflictDoNothing: () => ({ returning: async () => rows.some(row => row.reference && row.reference === record.reference) ? [] : add() }),
        onConflictDoUpdate: async ({ target, set }) => { const existing = rows.find(row => row[target.name] === values[target.name]);if (!existing) return add();for (const [key, value] of Object.entries(set)) existing[key] = evaluate(value, existing); },
      };
    } }),
    update: table => ({ set: changes => ({ where: check => {
      const apply = () => tableOf(table).filter(condition(check)).map(row => { for (const [key, value] of Object.entries(changes)) row[key] = evaluate(value, row);return row; });
      return { returning: async fields => apply().map(row => project(fields, row)), then: (resolve, reject) => Promise.resolve(apply()).then(resolve, reject) };
    } }) }),
    transaction: async run => run(db),
  };
  const fetch = async (address, options = {}) => {
    const url = new URL(address);
    if (url.pathname === '/auth/v1/user') { const id = options.headers.Authorization.slice(7);return Response.json({ id, email: id === creator ? 'creator@example.invalid' : 'owner@example.invalid', email_confirmed_at: 'now', user_metadata: id === creator ? { mw_country: 'gb' } : {} }); }
    if (url.pathname === '/rest/v1/mw_posts') return Response.json(url.searchParams.get('id') === `eq.${post}` ? [{ id: post, author_id: creator }] : []);
    if (url.pathname === '/rest/v1/mw_profiles') return Response.json([{ id: fan, display_name: 'Fan' }]);
    return Response.json([]);
  };
  const service = loadModule('functions/milkyway-wallet.mts', {
    'drizzle-orm': orm, '../db/index.js': { db }, '../db/schema.js': schema,
    '../lib/supabase.js': { supabaseConfig: () => ({ base: 'https://backend.invalid', apiKey: 'fixture-public' }) },
    '../lib/suspensions.js': { isOwner: account => account.email === 'owner@example.invalid', assertActive: async () => {} },
    '../lib/coins.js': loadModule('lib/coins.ts', {}),
  }, { fetch, console }).default;
  const call = (action, account, body) => service(new Request(`https://application.invalid/.netlify/functions/milkyway-wallet?action=${action}`, body ? { method: 'POST', headers: { Authorization: `Bearer ${account}` }, body: JSON.stringify(body) } : { headers: { Authorization: `Bearer ${account}` } }), { geo: { country: { code: 'TZ' } } });

  // A 70-coin private island costs the fan 70 coins: 42 coins (60%) to the creator, 28 coins (40%) to the company wallet.
  const sent = await call('gift', fan, { gift: 'kisiwa-binafsi', postId: post });
  assert.equal(sent.status, 200);
  assert.equal((await sent.json()).coins, 30);
  assert.equal(tables.gifts[0].coins, 70);
  assert.equal(tables.gifts[0].creatorMilli, 42000);
  assert.equal(tables.gifts[0].companyMilli, 28000);
  // The cheapest gift is a tenth of a coin (TZS 100): 0.06 coin to the creator, 0.04 coin to the company.
  assert.equal((await call('gift', fan, { gift: 'maua', postId: post })).status, 200);
  assert.deepEqual([tables.gifts[1].coins, tables.gifts[1].creatorMilli, tables.gifts[1].companyMilli], [0.1, 60, 40]);
  assert.deepEqual(tables.company.map(row => [row.id, row.balanceMilli]), [['company', 28040]]);
  assert.equal((await call('gift', creator, { gift: 'maua', postId: post })).status, 400); // no gifts to yourself
  assert.equal((await call('gift', fan, { gift: 'unknown', postId: post })).status, 400);
  // The creator's wallet shows 42.06 net coins; nothing in the response reveals the gross value, the split or the company wallet.
  const wallet = await (await call('wallet', creator)).json();
  assert.equal(wallet.earned, 42.06);
  // The creator joined from the UK: the country recorded at sign-up is saved once and prices are shown in pounds.
  const joined = tables.countries.find(row => row.userId === creator);
  assert.deepEqual([joined.country, joined.currency, joined.source], ['GB', 'GBP', 'signup']);
  assert.equal(wallet.pricing.currency, 'GBP');
  assert.equal(wallet.pricing.digits, 2);
  assert.ok(wallet.pricing.coinMinor > 0);
  assert.equal(wallet.canWithdraw, false);
  assert.deepEqual(wallet.received.map(item => item.earned), [42, 0.06]);
  assert.doesNotMatch(JSON.stringify(wallet), /commission|gross|company|"coins":70/i);
  // Withdrawal stays locked below 50 coins (TZS 50,000).
  const payout = { network: 'mpesa', phone: '0712 345 678', name: 'Creator Name' };
  const locked = await call('withdraw', creator, { ...payout, coins: 42.06 });
  assert.equal(locked.status, 400);
  assert.match((await locked.json()).error, /50 coins \(TZS 50,000\)/);
  // The fan has 29.9 coins left: not enough for the 100-coin crown (also under its old key).
  assert.equal((await call('gift', fan, { gift: 'taji-ya-milkyway', postId: post })).status, 402);
  assert.equal((await call('gift', fan, { gift: 'taji-ya-masiyatunda', postId: post })).status, 402);
  assert.equal((await call('gift', fan, { gift: 'simu-ya-dhahabu', postId: post })).status, 200); // 25 coins
  const ready = await (await call('wallet', creator)).json();
  assert.equal(ready.earned, 57.06);
  assert.equal(ready.canWithdraw, true);
  const requested = await call('withdraw', creator, { ...payout, coins: 50 });
  assert.equal(requested.status, 200);
  assert.equal((await requested.json()).payoutTzs, 50000);
  assert.equal(tables.withdrawals[0].phone, '255712345678');
  assert.equal(tables.withdrawals[0].payoutTzs, 50000);
  assert.equal(tables.withdrawals[0].commissionTzs, 33333);
  assert.equal((await call('withdraw', creator, { ...payout, coins: 50 })).status, 409); // one payout at a time
  // Only the owner can settle payouts; a rejected payout returns the coins.
  assert.equal((await call('admin-withdrawal', creator, { id: tables.withdrawals[0].id, decision: 'reject' })).status, 403);
  assert.equal((await call('admin-withdrawal', otherId, { id: tables.withdrawals[0].id, decision: 'reject', note: 'Wrong number' })).status, 200);
  assert.equal((await (await call('wallet', creator)).json()).earned, 57.06);
  // Coin purchases are credited only after the owner approves them, and a reference cannot be reused.
  assert.equal((await call('topup', fan, { coins: 20, network: 'airtel', phone: '+255 754 000 111', reference: 'AB12CD34EF' })).status, 200);
  assert.equal((await call('topup', fan, { coins: 20, network: 'airtel', phone: '+255 754 000 111', reference: 'ab12cd34ef' })).status, 409);
  assert.equal(tables.topups[0].amountTzs, 20000);
  // Without a sign-up country, the network location is saved; Tanzania keeps shillings.
  assert.equal(tables.countries.find(row => row.userId === fan)?.currency, 'TZS');
  assert.equal(tables.topups[0].currency, 'TZS');
  assert.equal(tables.topups[0].amountLocalMinor, 20000);
  assert.equal(tables.withdrawals[0].currency, 'GBP');
  assert.equal((await call('admin-topup', otherId, { id: tables.topups[0].id, decision: 'approve' })).status, 200);
  assert.equal(Math.round(tables.balances.find(row => row.userId === fan).coins * 10) / 10, 24.9);
  assert.equal((await call('admin-topup', otherId, { id: tables.topups[0].id, decision: 'approve' })).status, 409);
});

test('gift catalog prices 100 gifts from 0.1 coin (TZS 100) to 100 coins in every language and matches the server prices', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../milkyway/gift-catalog.js', import.meta.url), 'utf8'), sandbox);
  const catalog = JSON.parse(JSON.stringify(sandbox.window.MilkyWayGiftCatalog));
  const prices = catalog.gifts.map(gift => gift.coins);
  assert.equal(prices.length, 100);
  assert.deepEqual([prices[0], prices.at(-1)], [0.1, 100]);
  assert.ok(prices.every((price, index) => index === 0 || price > prices[index - 1]), 'cheapest first');
  // Every price is a whole number of TZS 100 steps, so the 60/40 split is exact in thousandths of a coin.
  assert.ok(prices.every(price => Number.isInteger(Math.round(price * 1000)) && Math.round(price * 1000) % 100 === 0));
  assert.equal(catalog.gifts.at(-1).key, 'taji-ya-milkyway');
  for (const key of ['tembo', 'chui', 'dainaso', 'simu-ya-mkononi', 'simu-janja', 'gari-la-kifahari']) assert.ok(catalog.gifts.some(gift => gift.key === key), key);
  for (const item of [...catalog.gifts.flatMap(gift => [gift.names, gift.about]), ...catalog.categories.flatMap(category => [category.name, category.about])]) {
    assert.equal(item.length, catalog.languages.length);
    assert.ok(item.every(text => typeof text === 'string' && text.trim()));
  }
  const server = loadModule('lib/coins.ts', {}).giftCatalog;
  assert.deepEqual(JSON.parse(JSON.stringify(server.map(gift => [gift.key, gift.coins, gift.category]))), catalog.gifts.map(gift => [gift.key, gift.coins, gift.category]));
});

test('sign-up detects the country from the network, then the device, and saves it to the account once', async () => {
  const joiner = '44444444-4444-4444-8444-444444444444', traveller = '55555555-5555-4555-8555-555555555555', fresh = '66666666-6666-4666-8666-666666666666';
  const metadata = { [joiner]: { mw_country: 'ke', mw_country_source: 'network' }, [traveller]: {}, [fresh]: {} };
  const rows = [];
  const column = name => ({ name });
  const accountCountries = { userId: column('userId'), country: column('country'), currency: column('currency'), source: column('source'), detectedAt: column('detectedAt') };
  const db = {
    select: fields => ({ from: () => ({ where: check => Promise.resolve(rows.filter(check).map(row => Object.fromEntries(Object.entries(fields).map(([key, c]) => [key, row[c.name]])))) }) }),
    insert: () => ({ values: values => ({ onConflictDoNothing: async () => { if (!rows.some(row => row.userId === values.userId)) rows.push({ detectedAt: new Date(), ...values }); } }) }),
  };
  const fetch = async (address, options) => {
    const id = options.headers.Authorization.slice(7);
    return new URL(address).pathname === '/auth/v1/user' ? Response.json({ id, user_metadata: metadata[id] }) : new Response(null, { status: 404 });
  };
  const service = loadModule('functions/milkyway-account.mts', {
    'drizzle-orm': { eq: (c, v) => row => row[c.name] === v }, '../db/index.js': { db }, '../db/schema.js': { accountCountries },
    '../lib/supabase.js': { supabaseConfig: () => ({ base: 'https://backend.invalid', apiKey: 'fixture-public' }) },
    '../lib/admin.js': { administratorAccess: async () => false }, '../lib/suspensions.js': { isOwner: () => false, activeSuspension: async () => null },
    '../lib/coins.js': loadModule('lib/coins.ts', {}), '@netlify/blobs': { getStore: () => ({}) },
  }, { fetch }).default;
  const call = (action, { account, method = 'GET', region = '', geo } = {}) => service(new Request(`https://masiyatunda.com/.netlify/functions/milkyway-account?action=${action}`, { method, headers: { ...(account ? { Authorization: `Bearer ${account}` } : {}), ...(region ? { 'X-MW-Region': region } : {}) } }), geo ? { geo: { country: { code: geo } } } : {});
  // The sign-up form: network location wins, the device region is the fallback, unknown stays empty.
  assert.deepEqual(await (await call('detect-country', { geo: 'TZ', region: 'GB' })).json(), { country: 'TZ', source: 'network' });
  assert.deepEqual(await (await call('detect-country', { geo: 'XX', region: 'gb' })).json(), { country: 'GB', source: 'device' });
  assert.deepEqual(await (await call('detect-country', { region: 'nowhere' })).json(), { country: '', source: '' });
  // The country recorded at sign-up is saved, even when the first sign-in happens elsewhere.
  const saved = await call('country', { account: joiner, method: 'POST', geo: 'US' });
  assert.equal(saved.status, 201);
  assert.deepEqual([(await saved.json()).country, rows[0].source, rows[0].currency], ['KE', 'network', 'KES']);
  // Without a sign-up value, the first signed-in request's location is used; later travel never replaces it.
  await call('country', { account: traveller, method: 'POST', region: 'NG' });
  assert.equal((await (await call('country', { account: traveller, method: 'POST', geo: 'FR' })).json()).country, 'NG');
  assert.equal((await (await call('country', { account: traveller })).json()).country, 'NG');
  // Reading does not save, and nothing detectable saves nothing.
  assert.equal((await (await call('country', { account: fresh })).json()).country, '');
  assert.equal((await (await call('country', { account: fresh, method: 'POST' })).json()).country, '');
  assert.equal(rows.length, 2);
});

test('sign-up date of birth and gender are saved privately, validated, and changeable from the profile', async () => {
  const joiner = '77777777-7777-4777-8777-777777777777', young = '88888888-8888-4888-8888-888888888888', fresh = '99999999-9999-4999-8999-999999999999';
  const metadata = { [joiner]: { mw_birth_date: '1998-02-14', mw_gender: 'female' }, [young]: { mw_birth_date: `${new Date().getUTCFullYear() - 5}-01-01`, mw_gender: 'male' }, [fresh]: {} };
  const rows = [];
  const column = name => ({ name });
  const accountDetails = { userId: column('userId'), birthDate: column('birthDate'), gender: column('gender') };
  const db = {
    select: fields => ({ from: () => ({ where: check => Promise.resolve(rows.filter(check).map(row => Object.fromEntries(Object.entries(fields).map(([key, c]) => [key, row[c.name]])))) }) }),
    insert: () => ({ values: values => ({ onConflictDoUpdate: async ({ set }) => { const row = rows.find(row => row.userId === values.userId); if (row) Object.assign(row, set); else rows.push({ ...values }); } }) }),
  };
  const fetch = async (address, options) => Response.json({ id: options.headers.Authorization.slice(7), user_metadata: metadata[options.headers.Authorization.slice(7)] });
  const service = loadModule('functions/milkyway-account.mts', {
    'drizzle-orm': { eq: (c, v) => row => row[c.name] === v }, '../db/index.js': { db }, '../db/schema.js': { accountDetails },
    '../lib/supabase.js': { supabaseConfig: () => ({ base: 'https://backend.invalid', apiKey: 'fixture-public' }) },
    '../lib/admin.js': { administratorAccess: async () => false }, '../lib/suspensions.js': { isOwner: () => false, activeSuspension: async () => null },
    '../lib/coins.js': loadModule('lib/coins.ts', {}), '@netlify/blobs': { getStore: () => ({}) },
  }, { fetch }).default;
  const call = (account, method = 'GET', body) => service(new Request('https://masiyatunda.com/.netlify/functions/milkyway-account?action=details', { method, headers: { Authorization: `Bearer ${account}` }, ...(body ? { body: JSON.stringify(body) } : {}) }), {});
  // The first sign-in saves what the sign-up form recorded.
  const saved = await call(joiner, 'POST');
  assert.equal(saved.status, 201);
  assert.deepEqual(await saved.json(), { birthDate: '1998-02-14', gender: 'female' });
  assert.deepEqual(await (await call(joiner)).json(), { birthDate: '1998-02-14', gender: 'female' });
  // Later sign-ins never overwrite it; the profile can correct it.
  metadata[joiner] = { mw_birth_date: '2001-01-01', mw_gender: 'male' };
  assert.equal((await (await call(joiner, 'POST')).json()).birthDate, '1998-02-14');
  assert.deepEqual(await (await call(joiner, 'POST', { birthDate: '1998-03-14', gender: 'other' })).json(), { birthDate: '1998-03-14', gender: 'other' });
  // Impossible dates, under-13s and unknown genders are refused.
  assert.equal((await call(joiner, 'POST', { birthDate: '1998-02-30', gender: 'female' })).status, 400);
  assert.equal((await call(joiner, 'POST', { birthDate: '1998-02-14', gender: 'robot' })).status, 400);
  assert.equal((await (await call(young, 'POST')).json()).birthDate, '');
  // Nothing recorded saves nothing.
  assert.deepEqual(await (await call(fresh, 'POST')).json(), { birthDate: '', gender: '' });
  assert.equal(rows.length, 1);
});

test('coin prices follow the account country: TZS in Tanzania, USD in the US, GBP in the UK, USD when unknown', () => {
  const { pricingFor, currencyOf, coinTzs } = loadModule('lib/coins.ts', {});
  const rates = { TZS: 1, USD: 2500, GBP: 3200, KES: 20, JPY: 17 };
  const price = country => JSON.parse(JSON.stringify(pricingFor(country, rates)));
  assert.equal(coinTzs, 1000);
  assert.deepEqual(price('TZ'), { country: 'TZ', currency: 'TZS', tzsPerUnit: 1, digits: 0, coinMinor: 1000 });
  assert.deepEqual(price('US'), { country: 'US', currency: 'USD', tzsPerUnit: 2500, digits: 2, coinMinor: 40 });
  assert.deepEqual(price('GB'), { country: 'GB', currency: 'GBP', tzsPerUnit: 3200, digits: 2, coinMinor: 31 });
  // Shillings and yen are shown as whole amounts.
  assert.deepEqual([price('KE').coinMinor, price('KE').digits, price('JP').coinMinor, price('JP').digits], [50, 0, 59, 0]);
  // A country with no known currency, or a currency with no rate, falls back to US dollars.
  assert.equal(currencyOf('ZZ'), 'USD');
  assert.equal(price('DE').currency, 'USD');
});

// Minimal in-memory IndexedDB with the calls the offline data layer uses.
function memoryIndexedDB() {
  const rows = new Map();
  const later = (request, value) => { setTimeout(() => { request.result = value;request.onsuccess?.(); }, 0);return request; };
  const store = transaction => {
    const done = request => { transaction.pending++;const success = request.onsuccess;request.onsuccess = () => { success?.();if (--transaction.pending === 0) setTimeout(() => transaction.oncomplete?.(), 0); }; };
    const call = value => { const request = {};done(request);return later(request, value); };
    return {
      get: key => call(rows.get(key)), put: value => { rows.set(value.key, value);return call(undefined); }, count: () => call(rows.size), clear: () => { rows.clear();return call(undefined); },
      index: () => ({ openCursor() { const request = {};done(request);const sorted = [...rows.values()].sort((a, b) => a.savedAt - b.savedAt);let at = 0;const step = () => later(request, at < sorted.length ? { value: sorted[at], delete: () => rows.delete(sorted[at].key), continue: () => { at++;done(request);step(); } } : null);step();return request; } }),
    };
  };
  return { rows, open() { const request = {};setTimeout(() => { request.result = { createObjectStore: () => ({ createIndex() {} }), transaction() { const transaction = { pending: 0 };transaction.objectStore = () => store(transaction);return transaction; } };request.onupgradeneeded?.();request.onsuccess(); }, 0);return request; } };
}

test('offline data layer replays saved reads, answers empty lists offline and fires one reconnect refresh', async () => {
  const supabase = 'https://wpclkhgizbvxuvbhbwzs.supabase.co';
  let online = true;const calls = [];const events = [];const listeners = {};
  const network = async (input, init) => {
    const address = String(input);calls.push(address);
    if (!online) throw new TypeError('Failed to fetch');
    if (address.includes('mw-probe')) return new Response('{}', { status: 200 });
    return new Response(JSON.stringify([{ id: 'post-1', account: init?.headers?.Authorization || '' }]), { status: 200, headers: { 'content-type': 'application/json', 'content-range': '0-0/1' } });
  };
  const idb = memoryIndexedDB();
  const window = { fetch: network, addEventListener: (name, listener) => { (listeners[name] ||= []).push(listener); }, dispatchEvent: event => events.push(event.type) };
  const context = vm.createContext({ window, indexedDB: idb, navigator: { get onLine() { return online; } }, document: { documentElement: { dataset: {} }, addEventListener() {}, visibilityState: 'visible' }, location: { href: 'https://application.invalid/milkyway/', origin: 'https://application.invalid' }, localStorage: { getItem: () => 'en' }, Headers, Request, Response, URL, CustomEvent: class { constructor(type) { this.type = type; } }, setTimeout, clearTimeout, atob, JSON, Promise, Date, Map, String, Math });
  vm.runInContext(source('milkyway/offline-data.js'), context);
  const token = payload => `Bearer x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;
  const feed = `${supabase}/rest/v1/mw_posts?select=*&order=created_at.desc&limit=40`;
  const first = await window.fetch(feed, { headers: { Authorization: token({ sub: ownerId }) } });
  assert.equal((await first.json())[0].id, 'post-1');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(idb.rows.size, 1);

  online = false;
  const saved = await window.fetch(feed, { headers: { Authorization: token({ sub: ownerId }) } });
  assert.equal(saved.headers.get('x-mw-offline'), 'saved');assert.equal((await saved.json())[0].id, 'post-1');
  // Another account never sees the first account's saved copy; it gets a calm empty list instead of an error.
  const other = await window.fetch(feed, { headers: { Authorization: token({ sub: otherId }) } });
  assert.equal(other.headers.get('x-mw-offline'), 'empty');assert.deepEqual(await other.json(), []);
  const count = await window.fetch(`${supabase}/rest/v1/mw_follows?select=*`, { method: 'HEAD', headers: { Prefer: 'count=exact' } });
  assert.equal(count.headers.get('content-range'), '*/0');
  // Writes are not replayed: they fail, and the failure reads as a friendly offline line.
  await assert.rejects(() => window.fetch(`${supabase}/rest/v1/mw_signals`, { method: 'POST', body: '{}' }), /Failed to fetch/);
  assert.equal(context.window.MilkyWayOffline.offline, true);
  assert.match(context.window.MilkyWayOffline.friendly('TypeError: Failed to fetch'), /No connection right now/);
  assert.equal(context.window.MilkyWayOffline.friendly('Wrong password'), 'Wrong password');

  online = true;
  listeners.online.forEach(listener => listener());
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(context.window.MilkyWayOffline.offline, false);
  assert.deepEqual(events.filter(type => type === 'mw-reconnected'), ['mw-reconnected']);
  assert.ok(calls.some(address => address.includes('mw-probe')));
  await context.window.MilkyWayOffline.clear();
  assert.equal(idb.rows.size, 0);
});

test('prefetched feed videos play from the device with byte ranges, and unsaved videos go to the network', async () => {
  const listeners = {};const network = [];
  const video = 'https://wpclkhgizbvxuvbhbwzs.supabase.co/storage/v1/object/public/portfolio/milkyway/fixture/clip.mp4';
  const stored = new Map([['mw-feed-videos', new Map([[video, new Response(new Uint8Array(100).map((_, index) => index), { headers: { 'content-type': 'video/mp4' } })]])]]);
  const caches = { open: async name => ({ match: async url => { const saved = stored.get(name)?.get(String(url));return saved?.clone(); } }) };
  const context = { URL, Response, caches, fetch: async request => { network.push(request.url);return new Response('network', { status: 206 }); }, self: { location: { origin: 'https://application.invalid' }, registration: { scope: 'https://application.invalid/milkyway/' }, addEventListener(name, listener) { listeners[name] = listener; }, clients: { matchAll: async () => [] } } };
  vm.runInNewContext(source('milkyway/sw.js'), context);
  const play = async (url, range, destination = 'video') => {
    let answer;
    listeners.fetch({ request: { url, method: 'GET', destination, headers: new Headers(range ? { range } : {}) }, respondWith: response => { answer = response; } });
    return answer && await answer;
  };
  const part = await play(video, 'bytes=10-19');
  assert.equal(part.status, 206);assert.equal(part.headers.get('content-range'), 'bytes 10-19/100');
  assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  const open = await play(video, 'bytes=90-');
  assert.equal(open.headers.get('content-range'), 'bytes 90-99/100');assert.equal(open.headers.get('content-length'), '10');
  assert.equal((await play(video, 'bytes=500-')).status, 416);
  const whole = await play(video, null, '');
  assert.equal(whole.status, 200);assert.equal((await whole.arrayBuffer()).byteLength, 100);
  assert.equal(network.length, 0);
  // Not saved yet: the request goes to the network untouched; other files are left to the normal caching.
  await play(video.replace('clip', 'other'), 'bytes=0-');
  assert.equal(network.length, 1);
  assert.equal(await play('https://wpclkhgizbvxuvbhbwzs.supabase.co/rest/v1/mw_posts', null, ''), undefined);
});

test('offline likes, saves, follows and comments are queued once, keep only the last choice and sync without duplicates', async () => {
  const postId = '33333333-3333-4333-8333-333333333333';
  const items = new Map();const events = [];const listeners = {};const writes = [];
  let online = false;let failNetwork = false;
  const result = error => Promise.resolve({ error });
  const sb = { supabaseKey: 'fixture', auth: { getSession: async () => ({ data: { session: { access_token: 'token', user: { id: ownerId } } } }) }, from: table => ({
    insert: row => { if (failNetwork) return result({ message: 'TypeError: Failed to fetch' });writes.push(['insert', table, row]);return result(table === 'mw_saves' ? { code: '23505', message: 'duplicate' } : null); },
    delete: () => ({ match: row => { writes.push(['delete', table, row]);return result(null); } }),
  }) };
  const window = { addEventListener: (name, listener) => { (listeners[name] ||= []).push(listener); }, dispatchEvent: event => events.push(event.type), MilkyWayOffline: { get offline() { return !online; }, isNetworkError: error => /failed to fetch/i.test(String(error?.message ?? error)) } };
  const context = vm.createContext({ window, user: { id: ownerId }, sb, navigator: { get onLine() { return online; } }, localStorage: { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) }, document: { readyState: 'complete', getElementById: () => null, querySelectorAll: () => [], addEventListener() {}, visibilityState: 'visible' }, CSS: { escape: value => value }, CustomEvent: class { constructor(type, init) { this.type = type;this.detail = init?.detail; } }, setTimeout: () => 0, fetch: async () => { writes.push(['details']);return new Response('{}'); }, console, TypeError, Response, Date, JSON });
  vm.runInContext(source('milkyway/offline-actions.js'), context);
  const outbox = window.MilkyWayOutbox;
  assert.equal(outbox.offline(), true);
  // Tapping a reaction on, off and on again while offline leaves one queued "on".
  outbox.queue({ type: 'signal', target: postId, kind: 'light', on: true });
  outbox.queue({ type: 'signal', target: postId, kind: 'light', on: false });
  outbox.queue({ type: 'signal', target: postId, kind: 'light', on: true });
  outbox.queue({ type: 'save', target: postId, on: true });
  outbox.queue({ type: 'follow', target: otherId, on: false });
  outbox.queue({ type: 'comment', id: '00000000-0000-4000-8000-000000000001', target: postId, author: 'Fixture', body: 'Hello offline', details: { parentId: null, tags: [{ id: otherId }] } });
  assert.equal(outbox.size, 4);
  assert.equal(outbox.state('signal', postId, 'light'), true);assert.equal(outbox.state('follow', otherId), false);
  assert.equal(outbox.comments(postId)[0].body, 'Hello offline');assert.equal(outbox.comments(postId)[0].mwPending, true);
  // Still offline: nothing is sent.
  assert.equal((await outbox.flush()).synced, 0);assert.equal(writes.length, 0);
  // Online, but the connection drops on the first write: everything stays queued.
  online = true;failNetwork = true;
  await outbox.flush();
  assert.equal(outbox.size, 4);
  failNetwork = false;
  const synced = await outbox.flush();
  assert.equal(synced.synced, 4);assert.equal(outbox.size, 0);
  assert.deepEqual(writes.map(([kind, table]) => `${kind} ${table || ''}`.trim()), ['insert mw_signals', 'insert mw_saves', 'delete mw_follows', 'insert mw_echoes', 'details']);
  assert.equal(JSON.stringify(writes[0][2]), JSON.stringify({ post_id: postId, user_id: ownerId, kind: 'light' }));
  assert.equal(writes[3][2].id, '00000000-0000-4000-8000-000000000001');
  assert.ok(events.includes('mw-outbox-synced'));
  // Another account never sends (or sees) the first account's queue.
  online = false;outbox.queue({ type: 'save', target: postId, on: true });
  context.user = { id: otherId };
  assert.equal(outbox.size, 0);assert.equal(outbox.state('save', postId), undefined);
});

test('starting offline never blocks: saved sessions read as valid offline, boot draws the feed at once, no native error screen', async () => {
  let online = false;const store = new Map();
  const listeners = {};
  const window = { fetch: async () => { if (!online) throw new TypeError('Failed to fetch');return new Response('{}', { status: 200 }); }, addEventListener: (name, listener) => { (listeners[name] ||= []).push(listener); }, dispatchEvent() {} };
  const context = vm.createContext({ window, indexedDB: memoryIndexedDB(), navigator: { get onLine() { return online; } }, document: { documentElement: { dataset: {} }, addEventListener() {}, visibilityState: 'visible' }, location: { href: 'https://application.invalid/milkyway/', origin: 'https://application.invalid' }, localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) }, Headers, Request, Response, URL, CustomEvent: class { constructor(type) { this.type = type; } }, setTimeout, clearTimeout, atob, JSON, Promise, Date, Map, String, Math });
  vm.runInContext(source('milkyway/offline-data.js'), context);
  const storage = context.window.MilkyWayOffline.authStorage;
  const key = 'sb-wpclkhgizbvxuvbhbwzs-auth-token';
  const expired = Math.floor(Date.now() / 1000) - 3600;
  storage.setItem(key, JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: expired, user: { id: ownerId } }));
  // Offline, an expired session reads as valid for a few minutes, so the auth client does not wait ~30 s on a refresh.
  const held = JSON.parse(storage.getItem(key));
  assert.ok(held.expires_at > Date.now() / 1000);assert.equal(held.user.id, ownerId);
  // Writing that copy back keeps the real expiry on the device.
  storage.setItem(key, JSON.stringify(held));
  assert.equal(JSON.parse(store.get(key)).expires_at, expired);assert.equal('mw_real_expires_at' in JSON.parse(store.get(key)), false);
  online = true;
  listeners.online.forEach(listener => listener());
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(context.window.MilkyWayOffline.offline, false);
  assert.equal(JSON.parse(storage.getItem(key)).expires_at, expired);

  const page = source('milkyway/index.html');
  assert.match(page, /createClient\(SUPABASE_URL,SUPABASE_ANON_KEY,window\.MilkyWayOffline\?\.authStorage/);
  const boot = page.match(/async function boot\(\)\{.*\}/)[0];
  assert.ok(boot.indexOf('loadFeed()') < boot.indexOf('ensureProfile'), 'the feed loads before the profile check');
  assert.doesNotMatch(boot, /await ensureProfile/);
  const config = JSON.parse(source('capacitor.config.json'));
  assert.equal(config.server.errorPath, undefined);
  const start = source('android/capacitor-web/index.html');
  assert.doesNotMatch(start, /Hakuna mtandao|No connection/);
  assert.match(start, /location\.replace\(target\)/);
  assert.match(source('android/capacitor/app/src/main/java/com/masiyatunda/milkyway/MainActivity.java'), /setWebViewClient\(client\)/);
  assert.match(source('sw-cache.js'), /saved && self\.navigator\.onLine === false/);
  // A page that was never saved falls back to the saved app shell, never to a "No connection" screen.
  const worker = source('sw-cache.js');
  assert.doesNotMatch(worker, /Hakuna mtandao|You are offline|status: 503/);
  assert.match(worker, /return \(await shell\(cache\)\) \|\|/);
});

test('startup splash video exists only in the Android app, never on the website', () => {
  const { existsSync } = createRequire(import.meta.url)('node:fs');
  // Website: no splash script, styles, skip button or intro video.
  for (const file of ['milkyway/splash.js', 'milkyway/splash.css', 'milkyway/brand/milkyway-intro.mp4', 'brand/milkyway-intro.mp4', 'img/milkyway-intro.mp4']) {
    assert.equal(existsSync(file), false, `${file} is removed from the website`);
  }
  for (const page of ['index.html', 'milkyway/index.html', 'milkyway/sw.js']) {
    assert.doesNotMatch(source(page), /splash\.(js|css)|mwSplash/, `${page} has no web splash`);
  }
  // APK: the supplied video plays full screen as the launcher activity, with no skip control.
  const video = readFileSync('android/capacitor/app/src/main/res/raw/milkyway_splash.mp4');
  assert.equal(video.length, 5857439, 'bundled splash is the supplied final video');
  assert.ok(video.includes(Buffer.from('mp4a')), 'splash video carries its audio track');
  const manifest = source('android/capacitor/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /\.SplashVideoActivity"[\s\S]*?android\.intent\.category\.LAUNCHER[\s\S]*?\.MainActivity"/);
  const activity = source('android/capacitor/app/src/main/java/com/masiyatunda/milkyway/SplashVideoActivity.java');
  assert.match(activity, /R\.raw\.milkyway_splash/);
  assert.match(activity, /handleOnBackPressed\(\) \{ \}/, 'Back cannot skip the splash');
  assert.match(activity, /setOnCompletionListener\(mp -> openApp\(\)\)/);
  assert.doesNotMatch(activity + source('android/capacitor/app/src/main/res/layout/activity_splash_video.xml'), /Button|Ruka|TextView|setOnClickListener/);
});
