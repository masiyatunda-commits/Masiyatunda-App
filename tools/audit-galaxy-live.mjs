import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

const { chromium } = await import(process.env.MW_PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.MW_AUDIT_ORIGIN || 'http://localhost:8889';
const output = process.env.MW_AUDIT_OUTPUT || '/tmp/milkyway-galaxy-audit';
await mkdir(output, { recursive: true });
const liveSource = await readFile(new URL('../milkyway/live-feed.js', import.meta.url), 'utf8');
const fixtureSource = liveSource.replace('  async function refresh(force = true) {', '  async function refresh(force = true) { return;').replace('  window.MilkyWayLive = {', `
  window.MilkyWayLiveAudit = seed => {
    room = seed.room;host = seed.host;session = seed.session;mode = seed.mode;roomState = seed.state;
    connectionAccountId = seed.room.localParticipant.identity;
    byId('mwLiveLobby').hidden = true;byId('mwLiveStage').hidden = false;
    byId('mwLiveLayoutControls').hidden = !host;
    renderGrid();renderConversationParticipants();paintParticipation();
    return { pollRoom, paintLiveNow };
  };
  window.MilkyWayLive = {`);
const hostId = '11111111-1111-4111-8111-111111111111';
const guestId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const roomName = `mw-conversation-video-${sessionId}`;
const browser = await chromium.launch({ headless: true });
let checks = 0;
const failures = [];
const check = (condition, label) => { assert.ok(condition, label);checks++; };

try {
  for (const width of [360, 390, 740, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 740 ? 360 : 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    await page.route('**/milkyway/live-feed.js', route => route.fulfill({ contentType: 'text/javascript', body: fixtureSource }));
    const settings = { layout: 4, admission: 'approval', layoutStyle: 'host-top', hostPosition: 'start', mobileLayout: 'stack' };
    const members = [{ userId: hostId, name: 'Audit host (fixture)', state: 'speaker' }, { userId: guestId, name: 'Audit guest (fixture)', state: 'viewer' }];
    let asHost = true;
    const actions = [];
    await page.route('**/.netlify/functions/milkyway-room', async route => {
      const request = route.request();
      if (request.method() === 'GET') return route.fulfill({ json: { available: false, reason: 'configuration_missing', missing: ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] } });
      const body = request.postDataJSON();actions.push(body);
      if (body.action === 'settings') Object.assign(settings, body);
      if (body.action === 'request') members[1].state = 'pending';
      if (body.action === 'leave-stage') members[1].state = 'viewer';
      if (body.action === 'status') return route.fulfill({ json: { settings, members, self: members[asHost ? 0 : 1], messages: [], connected: [hostId, guestId] } });
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto(`${origin}/milkyway/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.MilkyWayLiveAudit && window.MilkyWayI18n);
    await page.locator('#accountTopBtn').click();await page.locator('#mwMenuTrigger').click();await page.locator('#langSelTrigger').click();await page.locator('#langSelOptions [data-language="en"]').click();await page.keyboard.press('Escape');
    await page.evaluate(() => window.MilkyWayLive.open());
    check(await page.evaluate(() => getComputedStyle(document.getElementById('mwLivePage')).backgroundImage.includes('galaxy-nebula.svg')), `actual nebula asset at ${width}px`);
    check(await page.evaluate(() => { const channels = getComputedStyle(document.querySelector('#mwLivePage .mw-live-glass')).backgroundColor.match(/[\d.]+/g).map(Number);return channels.length === 4 && channels.slice(0, 3).every(channel => channel < 60) && channels[3] > 0 && channels[3] < 1; }), 'galaxy glass remains dark and translucent under existing appearance theme');
    await page.evaluate(({ hostId, guestId, sessionId, roomName, settings, members }) => {
      const participant = (identity, name) => ({ identity, name, isMicrophoneEnabled: false, isCameraEnabled: false, audioTrackPublications: new Map(), videoTrackPublications: new Map(), trackPublications: new Map(), async setMicrophoneEnabled(enabled) { this.isMicrophoneEnabled = enabled; }, async setCameraEnabled(enabled) { this.isCameraEnabled = enabled; } });
      const host = participant(hostId, members[0].name), guest = participant(guestId, members[1].name);
      const room = { state: 'connected', localParticipant: host, remoteParticipants: new Map([[guestId, guest]]), async startAudio() {}, async disconnect() {}, async publishData() {} };
      host.publishData = async () => {};
      window.galaxySeed = { host: true, mode: 'video', room, session: { id: sessionId, room_name: roomName, host_id: hostId, host_name: host.name }, state: { settings, members, self: members[0] } };
      window.galaxyGuest = guest;window.galaxyHost = host;
      user = { id: hostId };sb.auth.getSession = async () => ({ data: { session: { access_token: 'test-only' } } });
      window.galaxyAudit = window.MilkyWayLiveAudit(window.galaxySeed);
    }, { hostId, guestId, sessionId, roomName, settings, members });
    await page.evaluate(() => window.galaxyAudit.pollRoom());
    await page.locator('#mwLiveMenuTrigger').click();
    check(await page.locator('#mwLiveMenu').isVisible(), 'three-dot menu opens a real bottom sheet');
    check(await page.locator('#mwLiveMenuClose').evaluate(element => element === document.activeElement), 'bottom sheet receives keyboard focus');
    await page.locator('#mwLiveMenu').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
    check(await page.locator('#mwLiveMenu').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= innerHeight + 1 && bounds.width <= innerWidth;
    }), 'bottom sheet fits the visible portrait or landscape viewport');
    await page.keyboard.press('Shift+Tab');
    check(await page.locator('#mwLiveReportProblem').evaluate(element => element === document.activeElement), 'keyboard focus stays inside the sheet');
    await page.keyboard.press('Escape');
    check(await page.locator('#mwLiveMenu').isHidden() && await page.locator('#mwLiveMenuTrigger').evaluate(element => element === document.activeElement), 'Escape closes the sheet and restores the trigger focus');
    await page.locator('#mwLiveMenuTrigger').click();
    await page.locator('#mwLiveSheetBackdrop').click({ position: { x: 4, y: 4 } });
    check(await page.locator('#mwLiveMenu').isHidden(), 'outside tap closes the sheet without leaving Live');
    await page.locator('#mwLiveMenuTrigger').click();
    await page.locator('#mwLiveMenu [data-action="settings"]').click();
    check(await page.locator('#mwLiveLayoutControls').isVisible(), 'host gear opens real layout controls');
    for (const style of ['host-top', 'host-side', 'duo', 'grid', 'focus']) {
      await page.locator('#mwLiveLayoutStyle').selectOption(style);
      await page.waitForFunction(style => document.getElementById('mwLiveGrid').dataset.layout === style && !document.getElementById('mwLiveLayoutStyle').disabled, style);
      const geometry = await page.evaluate(() => {
        const grid = document.getElementById('mwLiveGrid'), host = grid.querySelector('[data-host="true"]');
        const boxes = [...grid.querySelectorAll('.mw-stage-tile:not([hidden])')].map(tile => tile.getBoundingClientRect());
        const overlaps = boxes.some((first, index) => boxes.slice(index + 1).some(second => first.left < second.right - 1 && first.right > second.left + 1 && first.top < second.bottom - 1 && first.bottom > second.top + 1));
        return { count: Number(grid.dataset.count), tiles: boxes.length, hostWidth: host.getBoundingClientRect().width, gridWidth: grid.getBoundingClientRect().width, columns: getComputedStyle(grid).gridTemplateColumns, overlaps, overflow: document.getElementById('mwLivePage').scrollWidth > innerWidth + 1 };
      });
      check(geometry.count === geometry.tiles && !geometry.overflow, `actual ${style} tile count and no overflow at ${width}px`);
      check(!geometry.overlaps, `actual ${style} tiles never overlap at ${width}px`);
      if (style === 'duo') check(geometry.count === 1 && await page.locator('#mwLiveLayout').isDisabled(), 'duo capacity does not invent a disconnected participant');
      if (style === 'host-top' || style === 'focus') check(geometry.hostWidth > geometry.gridWidth * .9, 'host occupies actual full-width main video area');
      if (style === 'host-side' && width >= 600) check(geometry.hostWidth > geometry.gridWidth * .9, 'host-only view fills the screen without an empty participant strip');
      if (style !== 'duo') {
        await page.locator('#mwLiveLayout').selectOption('1');
        await page.waitForFunction(() => document.getElementById('mwLiveGrid').dataset.count === '1' && !document.getElementById('mwLiveLayout').disabled);
        check(await page.evaluate(() => {
          const grid = document.getElementById('mwLiveGrid'), tile = grid.querySelector('[data-host="true"]');
          return grid.querySelectorAll('.mw-stage-tile:not([hidden])').length === 1 && tile.getBoundingClientRect().width >= grid.getBoundingClientRect().width - 12 && tile.getBoundingClientRect().height >= grid.getBoundingClientRect().height - 12;
        }), `one-box ${style} layout fills the main stage at ${width}px`);
        await page.locator('#mwLiveLayout').selectOption('4');
        await page.waitForFunction(() => document.getElementById('mwLiveGrid').dataset.count === '1' && document.getElementById('mwLiveLayout').value === '4' && !document.getElementById('mwLiveLayout').disabled);
      }
    }
    await page.locator('#mwLiveLayoutStyle').selectOption('host-side');
    await page.waitForFunction(() => !document.getElementById('mwLiveLayoutStyle').disabled);
    await page.locator('#mwLiveHostPosition').selectOption('end');
    await page.waitForFunction(() => document.getElementById('mwLiveGrid').dataset.hostPosition === 'end' && !document.getElementById('mwLiveHostPosition').disabled);
    await page.locator('#mwLiveMobileLayout').selectOption('compact');
    await page.waitForFunction(() => document.getElementById('mwLiveGrid').dataset.mobile === 'compact' && !document.getElementById('mwLiveMobileLayout').disabled);
    await page.locator('#mwLiveLayout').selectOption('20');
    await page.waitForFunction(() => document.getElementById('mwLiveGrid').dataset.count === '1' && document.getElementById('mwLiveLayout').value === '20' && !document.getElementById('mwLiveLayout').disabled);
    check(await page.locator('#mwLiveGrid .mw-stage-tile:not([hidden])').count() === 1, 'capacity of twenty does not create empty video boxes');
    check(await page.locator('#mwLiveGrid [data-identity]').count() === 1, 'only the admitted host occupies a tile');
    check(await page.evaluate(() => {
      const grid = document.getElementById('mwLiveGrid');
      const host = grid.querySelector('[data-host="true"]').getBoundingClientRect();
      const guests = [...grid.querySelectorAll('.mw-stage-empty')].map(tile => tile.getBoundingClientRect());
      return guests.every(guest => guest.right <= host.left + 1) && guests.every((guest, index) => index === 0 || guest.top >= guests[index - 1].bottom - 1);
    }), 'side layout guest tiles never overlap the main host or each other');
    await page.locator('#mwLiveSettingsClose').click();
    await page.locator('#mwLiveGrid').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: `${output}/host-${width}.png` });
    asHost = false;
    await page.evaluate(({ hostId, guestId }) => {
      user = { id: guestId };window.galaxySeed.host = false;window.galaxySeed.room.localParticipant = window.galaxyGuest;
      window.galaxySeed.room.remoteParticipants = new Map([[hostId, window.galaxyHost]]);
      window.galaxySeed.state.self = window.galaxySeed.state.members[1];
      window.galaxyAudit = window.MilkyWayLiveAudit(window.galaxySeed);
    }, { hostId, guestId });
    await page.evaluate(() => window.galaxyAudit.pollRoom());
    check(await page.locator('#mwLiveRequest').isVisible() && await page.locator('#mwLiveGuestButton').isVisible(), 'two visible alien participation buttons for viewers');
    check(await page.evaluate(() => getComputedStyle(document.getElementById('mwLiveRequest')).backgroundImage !== getComputedStyle(document.getElementById('mwLiveGuestButton')).backgroundImage), 'cyan and violet participation buttons have distinct colours');
    await page.locator('#mwLiveRequest').click();
    await page.waitForFunction(() => document.getElementById('mwLiveRequest').dataset.pending === 'true' && !document.getElementById('mwLiveRequest').disabled);
    check(await page.locator('#mwLiveRequest').textContent().then(text => text.includes('Cancel request') && text.includes('Waiting for host approval')), 'pending request exposes cancellation and waiting status');
    await page.locator('#mwLiveRequest').click();
    await page.waitForFunction(() => document.getElementById('mwLiveRequest').dataset.pending === 'false');
    check(actions.filter(action => action.action === 'request').length === 1 && actions.filter(action => action.action === 'leave-stage').length === 1, 'join and cancellation invoke different supported server actions');
    const beforeGuestAction = actions.filter(action => action.action === 'request').length;
    await page.locator('#mwLiveGuestButton').click();
    check(await page.locator('#mwLiveGuests').isVisible(), 'second alien button opens actual guest participation roster');
    check(await page.locator('#mwLiveGuestList').textContent().then(text => text.includes('Audit host')), 'guest roster reads current room members');
    check(actions.filter(action => action.action === 'request').length === beforeGuestAction, 'guest panel never submits a duplicate join request');
    await page.locator('#mwLiveGuests>button').click();
    await page.locator('#mwLiveMenuTrigger').click();await page.locator('#mwLiveMenu [data-action="settings"]').click();
    check(!await page.locator('#mwLiveLayoutControls').isVisible(), 'ordinary viewers do not see host-only settings');
    await page.locator('#mwLiveSettingsClose').click();
    members[1].state = 'rejected';await page.evaluate(() => window.galaxyAudit.pollRoom());
    check(await page.locator('#mwLiveRequest').isDisabled(), 'rejected viewer cannot resend a request');
    members[1].state = 'speaker';await page.evaluate(() => window.galaxyAudit.pollRoom());
    check(await page.locator('#mwLiveGrid [data-identity]').count() === 2 && await page.locator('#mwLiveMic').isVisible(), 'approved speaker enters actual tile layout and gains microphone control');
    await page.locator('#mwLiveMic').click();
    check(await page.locator('#mwLiveMic').getAttribute('aria-pressed') === 'true', 'participant microphone control calls the SDK and reflects its enabled state (fixture)');
    await page.locator('#mwLiveMic').click();
    check(await page.locator('#mwLiveMic').getAttribute('aria-pressed') === 'false', 'participant microphone can be switched off (fixture)');
    await page.locator('#mwLiveCamera').click();
    check(await page.locator('#mwLiveCamera').getAttribute('aria-pressed') === 'true', 'participant camera control calls the SDK and reflects its enabled state (fixture)');
    await page.locator('#mwLiveCamera').click();
    check(await page.locator('#mwLiveCamera').getAttribute('aria-pressed') === 'false', 'participant camera can be switched off (fixture)');
    await page.locator('#mwLiveRequest').click();
    await page.waitForFunction(() => !document.getElementById('mwLiveMic').getClientRects().length);
    check(await page.locator('#mwLiveGrid [data-identity]').count() === 1, 'leaving the stage removes the occupied guest tile');
    await page.screenshot({ path: `${output}/viewer-${width}.png` });
    await page.evaluate(async () => {
      await window.MilkyWayLive.disconnect();
      window.galaxyAudit.paintLiveNow([], 0);
    });
    check(await page.locator('#mwStoriesLive, #mwLiveFeedCards').count() === 0, 'home screen has no duplicate LIVE box beside the stories');
    check(await page.locator('#mwLiveSessions .mw-live-session').count() === 0 && await page.locator('#mwLiveNowCount').isHidden(), 'empty Live list shows no count');
    await page.evaluate(({ hostId, sessionId, roomName }) => {
      const sessions = [{ id: sessionId, room_name: roomName, host_id: hostId, host_name: 'Video host (fixture)', title: 'Video fixture', verified: true, profile: { display_name: 'Video host (fixture)', avatar_url: '/milkyway/brand/milkyway-emblem-96.png' } }, { id: '44444444-4444-4444-8444-444444444444', room_name: 'mw-conversation-audio-44444444-4444-4444-8444-444444444444', host_id: '55555555-5555-4555-8555-555555555555', host_name: 'Audio host (fixture)', title: 'Audio fixture', verified: true, profile: { display_name: 'Audio host (fixture)', avatar_url: '/milkyway/brand/milkyway-emblem-96.png' } }];
      window.galaxyStories = sessions;window.galaxyAudit.paintLiveNow(sessions, 2);
    }, { hostId, sessionId, roomName });
    check((await page.locator('#mwLiveNowCount').textContent()).startsWith('2 '), 'Live list inside the Live screen shows the real count');
    check(await page.locator('#mwLiveSessions .mw-stories-live-type').allTextContents().then(types => types.includes('Video LIVE') && types.includes('Audio LIVE')), 'Live list distinguishes video and audio sessions');
    await page.evaluate(() => { window.LivekitClient = { Room: class {} }; });
    await page.locator('#mwLiveSessions .mw-live-session').nth(1).locator('button').click();
    await page.waitForFunction(() => !document.getElementById('mwLivePage').hidden && document.getElementById('mwLiveMessage').dataset.error === 'true');
    check(actions.findLast(action => action.action === 'token')?.room === 'mw-conversation-audio-44444444-4444-4444-8444-444444444444', 'Watch requests the correct room as a viewer');
    check(await page.locator('#mwLivePage').getAttribute('data-entry') === 'viewer' && await page.locator('.mwx-golive').isHidden() && await page.locator('#mwLiveSetup').isHidden(), 'a failed viewer join never lands on the host Go LIVE setup');
    await context.close();
  }
  check(failures.length === 0, `no browser runtime errors: ${JSON.stringify(failures)}`);
  console.log(`${checks} Galaxy Live browser checks passed at 360, 390, 740 (landscape) and 1280px. Room/auth/API/session state used explicit fixtures, not live accounts or real media. Screenshots: ${output}`);
} finally {
  await browser.close();
}
