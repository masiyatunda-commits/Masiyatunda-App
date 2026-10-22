import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

const { chromium } = await import(process.env.MW_PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.MW_AUDIT_ORIGIN || 'http://localhost:8889';
const output = process.env.MW_AUDIT_OUTPUT || '/tmp/milkyway-master-audit';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label);checks++; };
const languages = ['sw', 'en', 'fr', 'zh', 'ar', 'pt', 'hi', 'de'];
const themes = ['galaxy', 'milkyway', 'light', 'sunlight'];
const fixtureId = '11111111-1111-4111-8111-111111111111';
const html = await readFile(new URL('../milkyway/index.html', import.meta.url), 'utf8');
const administratorHtml = await readFile(new URL('../admin.html', import.meta.url), 'utf8');

async function fixtures(page, administrator = false) {
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }));
  await page.route('**/.netlify/functions/milkyway-discovery', route => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/.netlify/functions/milkyway-room', route => route.fulfill({ json: { available: true, reason: 'configuration_present', service: 'supabase' } }));
  await page.route('**/.netlify/functions/milkyway-account?**', route => {
    const action = new URL(route.request().url()).searchParams.get('action');
    return route.fulfill({ json: action === 'admin-status' ? { isAdmin: administrator } : action === 'advertisements' || action === 'campaigns' ? { campaigns: [] } : { ids: [], viewed: [] } });
  });
}

try {
  for (const width of [360, 390, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();await fixtures(page);
    await page.goto(`${origin}/milkyway/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.MilkyWayLive && document.getElementById('mwMenuTrigger'));
    check(!await page.locator('header.top #mwMenuTrigger, #mwLivePage #mwMenuTrigger').count(), `no header or Live menu icon: ${width}`);
    await page.locator('#accountTopBtn').click();await page.locator('#mwMenuTrigger').click();
    check(await page.locator('#mwMainMenu').isVisible(), 'menu opens');
    check(await page.locator('#langSel option').count() === 8, 'eight real language choices');
    check(await page.locator('#mwMenuPreferences [data-mw-theme-selector] option').count() === 4, 'exactly four themes');
    await page.keyboard.press('Escape');check(!await page.locator('#mwMainMenu').isVisible(), 'Escape closes menu');
    check(await page.locator('#mwMenuTrigger').evaluate(element => element === document.activeElement), 'menu restores keyboard focus');
    for (const language of languages) {
      await page.locator('#accountTopBtn').click();await page.locator('#mwMenuTrigger').click();await page.locator('#langSelTrigger').click();
      await page.locator(`#langSelOptions [data-language="${language}"]`).click();
      await page.waitForFunction(language => document.documentElement.lang === language && document.documentElement.dir === (language === 'ar' ? 'rtl' : 'ltr'), language);
      const state = await page.evaluate(() => ({ language: document.documentElement.lang, direction: document.documentElement.dir, selected: localStorage.getItem('mw_lang'), overflow: document.documentElement.scrollWidth > innerWidth + 1, labels: [...document.querySelectorAll('.mw-account-menu summary')].map(element => element.textContent), missing: [...document.querySelectorAll('[data-mw-i18n]')].filter(element => element.textContent === element.dataset.mwI18n).map(element => element.dataset.mwI18n), theme: document.documentElement.dataset.mwAppearance }));
      check(state.selected === language, `language persisted: ${language}`);
      check(state.direction === (language === 'ar' ? 'rtl' : 'ltr'), `correct text direction: ${language}`);
      check(!state.overflow, `no phone overflow: ${language}/${width}`);
      check(!state.labels.some(label => /profileSettings|accountSettings|privacySettings/.test(label)), 'account identifiers do not leak');
      check(state.missing.length === 0, `no unresolved UI keys: ${state.missing.join(',')}`);
      await page.keyboard.press('Escape');
      await page.evaluate(() => window.MilkyWayLive.open());
      await page.locator('#mwLivePage [data-mode="audio"]').click();
      const initiallyOpen = await page.locator('#mwLiveConfiguration').getAttribute('open') !== null;
      await page.locator('#mwLiveLobbySettings').click();
      check((await page.locator('#mwLiveConfiguration').getAttribute('open') !== null) !== initiallyOpen, 'wrench toggles configuration');
      if (initiallyOpen) await page.locator('#mwLiveLobbySettings').click();
      check(await page.locator('#mwLiveConfiguration').getAttribute('open') !== null, 'wrench opens real configuration');
      check(await page.locator('#mwLivePreviewButton').isVisible(), 'device preview remains connected in settings');
      check(await page.locator('#mwLiveInitialLayout').isVisible(), 'participant layout remains connected');
      check(await page.locator('#mwLiveStart').isVisible(), 'start control remains outside secondary settings');
      await page.evaluate(() => window.MilkyWayLive.close());
    }
    for (const theme of themes) {
      await page.locator('#accountTopBtn').click();await page.locator('#mwMenuTrigger').click();await page.locator('[data-mw-theme-selector]').selectOption(theme);
      check(await page.evaluate(theme => document.documentElement.dataset.mwAppearance === theme && localStorage.getItem('mw_appearance') === theme, theme), `theme selected: ${theme}`);
      const colors = await page.locator('.mw-menu-panel').evaluate(element => ({ background: getComputedStyle(element).backgroundColor, text: getComputedStyle(element).color }));
      check(colors.background !== colors.text, `theme contrast tokens differ: ${theme}`);
      await page.keyboard.press('Escape');
      await page.screenshot({ path: `${output}/${width}-${theme}.png` });
      await page.reload({ waitUntil: 'domcontentloaded' });await page.waitForFunction(() => document.getElementById('mwMenuTrigger'));
      check(await page.evaluate(theme => document.documentElement.dataset.mwAppearance === theme, theme), `theme survives reload: ${theme}`);
    }
    check(!await page.locator('#mwAdminNavigation').isVisible(), 'ordinary visitors do not see admin entry');
    check(!await page.locator('#mwMenuAds').isVisible(), 'ordinary visitors do not see campaign editor');
    check(await page.locator('.orbit [data-tab]').count() >= 6, 'primary social navigation remains connected');
    if (width === 360) {
      let healthRequests = 0;
      let healthReason = 'endpoint_incompatible';
      await page.route('**/.netlify/functions/milkyway-room', route => { healthRequests++;return route.fulfill({ json: { available: false, reason: healthReason, service: 'supabase' } }); });
      await page.evaluate(() => window.MilkyWayLive.open());
      for (const [reason, key] of [['endpoint_incompatible', 'liveEndpointIncompatible'], ['authentication_required', 'liveHealthAuthentication'], ['platform_restricted', 'livePlatformRestricted'], ['provider_authentication', 'liveProviderAuthentication']]) {
        healthReason = reason;const before = healthRequests;
        await page.locator('#mwLiveServiceRetry').click();
        await page.waitForFunction(key => document.getElementById('mwLiveServiceText').textContent === window.MilkyWayI18n.t(key) && !document.getElementById('mwLiveServiceRetry').disabled, key);
        check(healthRequests > before, `Retry repeats health request: ${reason}`);
        check(await page.locator('#mwLiveServiceText').textContent() === await page.evaluate(key => window.MilkyWayI18n.t(key), key), `actionable localized health diagnosis: ${reason}`);
      }
      await page.evaluate(() => window.MilkyWayLive.close());
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();await fixtures(page, true);
  const injection = `user={id:'${fixtureId}',email:'fixture@example.invalid'};sb.auth.getSession=async()=>({data:{session:{user,access_token:'fixture-only'}}});`;
  await page.route(`${origin}/milkyway/`, route => route.fulfill({ contentType: 'text/html', body: html.replace('<script src="release-shell.js">', `<script>${injection}</script><script src="release-shell.js">`) }));
  await page.goto(`${origin}/milkyway/`, { waitUntil: 'domcontentloaded' });await page.waitForFunction(() => document.getElementById('mwMenuAds')?.hidden === false);
  await page.locator('#accountTopBtn').click();await page.locator('#mwMenuTrigger').click();check(await page.locator('#mwAdminNavigation').getAttribute('href') === '/admin.html', 'authorized entry opens actual dashboard');
  await page.locator('#mwMenuAds').click();check(await page.locator('#mwAdsSheet').isVisible(), 'authorized campaign management opens');
  for (const name of ['business', 'title', 'description', 'mediaUrl', 'destination', 'startsAt', 'endsAt', 'status']) check(await page.locator(`#mwCampaignForm [name="${name}"]`).count() === 1, `existing campaign field: ${name}`);
  check(await page.locator('#mwAdMediaUpload').isVisible(), 'real media upload input is accessible');
  await page.locator('#mwCampaignForm [name="business"]').fill('Fixture business');await page.locator('#mwCampaignForm [name="mediaUrl"]').fill('https://media.example.invalid/photo.png');
  let saved = null;
  await page.route('**/.netlify/functions/milkyway-account?action=campaigns', route => { if (route.request().method() === 'POST') { saved = route.request().postDataJSON();return route.fulfill({ json: { id: fixtureId } }); }return route.fulfill({ json: { campaigns: [] } }); });
  await page.locator('#mwCampaignForm button.primary').click();await page.waitForFunction(() => document.getElementById('mwCampaignStatus').textContent.length > 0);
  check(saved?.status === 'draft' && saved.business === 'Fixture business', 'editor saves a real validated request, not an automatic publication');
  for (const administrator of [false, true]) {
    await page.route('**/.netlify/functions/milkyway-account?action=admin-status', route => route.fulfill({ json: { isAdmin: administrator } }));
    await page.route(`${origin}/admin.html`, route => route.fulfill({ contentType: 'text/html', body: administratorHtml.replace('const $=id=>', `sb.auth.getSession=async()=>({data:{session:{user:{id:'${fixtureId}',email:'fixture@example.invalid'},access_token:'fixture-only'}}});\nconst $=id=>`) }));
    await page.goto(`${origin}/admin.html`, { waitUntil: 'domcontentloaded' });await page.waitForTimeout(350);
    check(await page.locator('#app').isVisible() === administrator, `dashboard verifies permission: ${administrator}`);
    check(await page.locator('#mwAdminAdsLink').isVisible() === administrator, 'dashboard advertising link follows authorization');
    check(await page.evaluate(() => document.documentElement.dataset.mwAppearance === 'galaxy'), 'theme also applies on existing dashboard');
  }
  await context.close();check(errors.length === 0, `no uncaught browser errors: ${errors.join('; ')}`);
  console.log(`${checks} master-release browser checks passed. Authentication, campaign writes and Live service responses were explicit fixtures; no real two-device media test was performed.`);
} finally { await browser.close(); }
