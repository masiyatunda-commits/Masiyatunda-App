import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const { chromium } = await import(process.env.MW_PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.MW_AUDIT_ORIGIN || 'http://localhost:8889';
const output = resolve(process.env.MW_AUDIT_OUTPUT || '/tmp/milkyway-browser-audit');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const liveSource = await readFile(new URL('../milkyway/live-feed.js', import.meta.url), 'utf8');
const tileSource = liveSource.slice(liveSource.indexOf('  function participantTile('), liveSource.indexOf('  function controlButton('));
let checks = 0;
const failures = [];
const check = (condition, label) => { assert.ok(condition, label);checks++; };

try {
  for (const width of [360, 390, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    await page.route('**/functions/v1/livekit-token', route => route.fulfill({ json: { available: false, reason: 'configuration_missing', service: 'supabase' } }));
    await page.goto(`${origin}/milkyway/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.MilkyWayI18n && window.MilkyWayLive && document.getElementById('langSel'));
    check(await page.locator('#langSelTrigger').isVisible(), `visible language selector at ${width}px`);
    check(await page.locator('#langSel option').count() === 4, 'four language choices');
    for (const language of ['sw', 'en', 'fr', 'zh']) {
      await page.locator('#langSelTrigger').click();await page.locator(`#langSelOptions [data-language="${language}"]`).click();
      await page.waitForFunction(selected => document.documentElement.lang === selected && localStorage.getItem('mw_lang') === selected && ['langSel', 'mwLiveLanguage', 'mwAuthLanguage', 'mwSettingsLanguage'].every(identity => document.getElementById(identity).value === selected), language);
      const state = await page.evaluate(() => ({
        saved: localStorage.getItem('mw_lang'),
        values: ['langSel', 'mwLiveLanguage', 'mwAuthLanguage', 'mwSettingsLanguage'].map(identity => document.getElementById(identity).value),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        text: window.MilkyWayI18n.t('liveConfigurationMissing'),
      }));
      check(state.saved === language && state.values.every(value => value === language), `selectors and persistence agree: ${language}/${width}`);
      check(!state.overflow, `feed has no horizontal overflow: ${language}/${width}`);
      check(await page.locator('#whoami').textContent() === await page.evaluate(() => window.MilkyWayI18n.t('guest')), 'guest guidance is translated without altering profile names');
      await page.evaluate(() => window.MilkyWayLive.open());
      await page.waitForFunction(() => document.getElementById('mwLiveServiceStatus').dataset.state !== 'checking');
      check(await page.locator('#mwLiveServiceText').textContent() === state.text, 'missing configuration is clearly localized');
      check(await page.locator('#mwLiveListeningHint').textContent() === await page.evaluate(() => window.MilkyWayI18n.t('liveListeningMuted')), 'room listening guidance is translated');
      check(await page.evaluate(() => [
        ['The token service returned an invalid response. Contact the administrator.', 'liveTokenInvalidResponse'],
        ['The token service did not return a LiveKit server URL and token. Contact the administrator.', 'liveTokenMissingFields'],
        ['Account or room authorization could not be verified.', 'roomAccessUnverified'],
      ].every(([message, key]) => window.MilkyWayI18n.text(message) === window.MilkyWayI18n.t(key))), 'token and authorization errors remain localized');
      check((await page.locator('#mwLiveServiceVariables').textContent()) === '', 'Live does not falsely request Netlify copies of existing Supabase secrets');
      check(await page.locator('#mwLiveInitialLayout option').count() === 20, 'layout choices reach configured limit');
      await page.locator('#mwLivePage [data-mode="video"]').click();
      check(await page.locator('#mwLiveStart').textContent() === await page.evaluate(() => window.MilkyWayI18n.t('startVideoLive')), 'Video Live control is translated');
      await page.locator('#mwLiveInitialLayout').selectOption('20');
      check(await page.locator('#mwLiveInitialLayout').inputValue() === '20', 'layout selection remains functional');
      await page.locator('#mwLivePage [data-mode="audio"]').click();
      check(await page.locator('#mwLiveStart').textContent() === await page.evaluate(() => window.MilkyWayI18n.t('startAudioLive')), 'Audio Live control is translated');
      check(await page.evaluate(() => document.getElementById('mwLivePage').scrollWidth <= innerWidth + 1), 'Live has no horizontal overflow');
      if (language === 'en' && width === 390) {
        await page.evaluate(() => { document.getElementById('mwLivePage').scrollTop = 0; });
        await page.screenshot({ path: `${output}/live-phone.png` });
      }
      await page.evaluate(() => window.MilkyWayLive.close());
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.MilkyWayI18n && document.getElementById('langSel'));
    check(await page.locator('#langSel').inputValue() === 'zh', 'language survives reload');
    await page.locator('#langSelTrigger').click();await page.locator('#langSelOptions [data-language="en"]').click();
    await page.evaluate(() => {
      const previousUser = user, originalSession = sb.auth.getSession, originalSdk = window.LivekitClient;
      window.auditCaptureRequests = 0;
      user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid' };
      sb.auth.getSession = async () => ({ data: { session: { access_token: 'test-only', user } } });
      window.LivekitClient = { Room: class {}, createLocalAudioTrack() { window.auditCaptureRequests++;throw new Error('No capture is permitted in this fixture'); } };
      window.restoreAuditAuth = () => { user = previousUser;sb.auth.getSession = originalSession;window.LivekitClient = originalSdk; };
      window.MilkyWayLive.open();
    });
    for (const mode of ['video', 'audio']) {
      await page.locator(`#mwLivePage [data-mode="${mode}"]`).click();
      await page.locator('#mwLiveType').selectOption('conversation');
      await page.locator('#mwLiveStart').click();
      await page.waitForFunction(() => document.getElementById('mwLiveMessage').textContent === window.MilkyWayI18n.t('liveConfigurationMissing') && !window.MilkyWayLive.isActive());
      check(await page.evaluate(() => document.getElementById('mwLiveStatus').dataset.connected === 'false' && window.auditCaptureRequests === 0), `${mode} start fails truthfully without requesting devices (authenticated preflight fixture)`);
    }
    await page.evaluate(() => { window.restoreAuditAuth();delete window.restoreAuditAuth;window.MilkyWayLive.close(); });
    const password = await page.evaluate(async () => {
      const previousUser = user, originalSignIn = sb.auth.signInWithPassword, originalUpdate = sb.auth.updateUser;
      let updates = 0;
      user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid' };
      sb.auth.signInWithPassword = async () => ({ error: null });
      sb.auth.updateUser = async () => { updates++;return { error: null }; };
      try {
        document.getElementById('mwCurrentPassword').value = 'fixture-current-123';
        document.getElementById('mwNewPassword').value = 'fixture-new-123';
        document.getElementById('mwConfirmPassword').value = 'fixture-new-123';
        document.getElementById('mwPasswordForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        for (let attempt = 0; attempt < 30 && document.getElementById('mwPasswordStatus').textContent !== window.MilkyWayI18n.t('passwordChanged'); attempt++) await new Promise(resolve => setTimeout(resolve, 10));
        return updates === 1 && document.getElementById('mwCurrentPassword').value === '' && document.getElementById('mwPasswordStatus').textContent === window.MilkyWayI18n.t('passwordChanged');
      } finally { user = previousUser;sb.auth.signInWithPassword = originalSignIn;sb.auth.updateUser = originalUpdate; }
    });
    check(password, 'native asynchronous password submit resets the captured form (auth fixture)');
    const settings = await page.evaluate(async () => {
      const originalFrom = sb.from;
      const previousUser = user;
      user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid' };
      sb.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: user.id, display_name: 'Fixture only' }, error: null }) }) }) });
      try {
        await openSettings();
        return {
          open: document.getElementById('settingsSheet').classList.contains('open'),
          disabled: ['privacyPrivate', 'privacyMessages', 'notifyFollow', 'notifyEcho', 'notifySignal', 'saveSettingsBtn'].every(identity => document.getElementById(identity).disabled),
          warning: document.getElementById('settingsMsg').textContent === window.MilkyWayI18n.t('accountSettingsUnavailable'),
          languageEnabled: !document.getElementById('mwSettingsLanguage').disabled,
        };
      } finally { sb.from = originalFrom;user = previousUser; }
    });
    check(settings.open && settings.disabled && settings.warning && settings.languageEnabled, 'unsupported backend settings fail safely without blocking the menu (fixture)');
    await page.locator('#mwAppearance').selectOption('milkyway');
    check(await page.evaluate(() => localStorage.getItem('mw_appearance') === 'milkyway' && document.documentElement.dataset.mwAppearance === 'milkyway'), 'appearance saves immediately');
    await page.evaluate(() => closeSheet('settingsSheet'));
    await page.evaluate(() => openSheet('threadSheet'));
    const composer = await page.locator('#threadInput').boundingBox();
    check(composer.width >= 180 && composer.height >= 80, 'DM composer remains spacious');
    check(await page.locator('#dmAttachBtn').isVisible(), 'separate camera action remains visible');
    await page.evaluate(() => closeSheet('threadSheet'));
    const tiles = await page.evaluate(rendererSource => {
      const grid = document.getElementById('mwLiveGrid');
      let attachments = 0, detachments = 0;
      const cameraTrack = { sid: 'fixture-track', attach() { attachments++;return document.createElement('video'); }, detach() { detachments++; } };
      const host = { identity: 'fixture-host', name: 'Fixture Host', isMicrophoneEnabled: true, isCameraEnabled: true, isSpeaking: true, videoTrackPublications: new Map([['camera', { track: cameraTrack }]]) };
      const speaker = { identity: 'fixture-speaker', name: 'Fixture Speaker', isMicrophoneEnabled: false, isCameraEnabled: false, isSpeaking: false, videoTrackPublications: new Map() };
      const viewer = { identity: 'fixture-viewer', name: 'Fixture Viewer', videoTrackPublications: new Map() };
      const room = { localParticipant: host, remoteParticipants: new Map([[speaker.identity, speaker], [viewer.identity, viewer]]) };
      const state = { settings: { layout: 4 }, members: [{ userId: host.identity, state: 'speaker' }, { userId: speaker.identity, state: 'speaker' }, { userId: viewer.identity, state: 'viewer' }] };
      const renderer = new Function('room', 'session', 'roomState', 'byId', 'conversationRoom', 'translate', `${rendererSource};return {renderGrid,clearTileVideos};`)(room, { host_id: host.identity }, state, identity => document.getElementById(identity), () => true, window.MilkyWayI18n.t);
      const render = renderer.renderGrid;
      render();
      const result = {
        attached: attachments === 1 && grid.querySelectorAll('video').length === 1,
        host: grid.querySelector('[data-host="true"]').classList.contains('is-speaking') && grid.querySelector('[data-host="true"]').dataset.featured === 'true',
        cameraOff: grid.querySelector('[data-identity="fixture-speaker"]').dataset.camera === 'off' && grid.querySelector('[data-identity="fixture-speaker"] .mw-stage-initial').textContent === 'F',
        viewerExcluded: !grid.querySelector('[data-identity="fixture-viewer"]'),
      };
      state.settings.layout = 1;render();
      result.layout = grid.dataset.count === '1' && grid.querySelector('[data-identity="fixture-speaker"]').hidden;
      room.remoteParticipants.delete(speaker.identity);render();
      result.departed = !grid.querySelector('[data-identity="fixture-speaker"]');
      renderer.clearTileVideos(grid.querySelector('[data-host="true"]'));
      result.detached = detachments === 1 && grid.querySelectorAll('video').length === 0;
      grid.replaceChildren();grid.hidden = true;
      return result;
    }, tileSource);
    for (const [label, passed] of Object.entries(tiles)) check(passed, `participant tile ${label} (SDK DOM fixture, not real media)`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.mwAppearance === 'milkyway');
    check(await page.evaluate(() => document.documentElement.dataset.mwAppearance === 'milkyway'), 'appearance survives reload');
    if (width === 390) {
      await page.waitForSelector('#feed .post', { timeout: 15000 });
      await page.screenshot({ path: `${output}/feed-phone.png` });
    }
    await context.close();
  }
  for (const route of ['/', '/admin.html', '/careers.html', '/sanaa.html', '/media.html', '/milkyway/moderation.html']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    page.on('pageerror', error => failures.push(`${route}: ${error.message}`));
    const response = await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
    check(response.status() === 200, `${route} returns 200`);
    await page.waitForTimeout(800);
    await page.close();
  }
  check(failures.length === 0, `no browser runtime errors: ${JSON.stringify(failures)}`);
  console.log(`${checks} browser checks passed. Authenticated preflight, password, Settings and participant tracks used explicit fixtures; no authenticated backend writes or real media connections were tested. Screenshots: ${output}`);
} finally {
  await browser.close();
}
