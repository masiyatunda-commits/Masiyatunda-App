(() => {
  const byId = identity => document.getElementById(identity);
  const translate = key => window.MilkyWayI18n.t(key);
  const trigger = document.createElement('button');
  // The global menu lives only inside My Account; the header and the Live screen carry no three-line menu icon.
  trigger.type = 'button';trigger.id = 'mwMenuTrigger';trigger.className = 'mwx-menu-item mw-account-menu-trigger';
  trigger.innerHTML = '<span class="mwx-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></span><span class="mwx-menu-label" data-mw-i18n="menu"></span><span class="mwx-chevron"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></span>';
  trigger.dataset.mwI18nAria = 'menu';trigger.setAttribute('aria-expanded', 'false');trigger.setAttribute('aria-controls', 'mwMainMenu');
  const overlay = document.createElement('div');overlay.id = 'mwMainMenu';overlay.className = 'mw-menu-overlay';overlay.hidden = true;
  overlay.innerHTML = '<section class="mw-menu-panel" role="dialog" aria-modal="true" aria-labelledby="mwMenuTitle"><header><h2 id="mwMenuTitle" data-mw-i18n="menu"></h2><button type="button" class="btn ghost" data-mw-i18n="close" id="mwMenuClose"></button></header><div id="mwMenuPreferences"></div><div class="mw-menu-links" id="mwMenuLinks"></div><p id="mwMenuStatus" class="muted" role="status"></p></section>';
  byId('authTitle').after(trigger);document.body.append(overlay);
  let previousOverflow = '';
  const close = () => { if (overlay.hidden) return;overlay.hidden = true;trigger.setAttribute('aria-expanded', 'false');document.body.style.overflow = previousOverflow;trigger.focus({ preventScroll: true }); };
  trigger.onclick = () => { if (!overlay.hidden) return close();previousOverflow = document.body.style.overflow;overlay.hidden = false;trigger.setAttribute('aria-expanded', 'true');document.body.style.overflow = 'hidden';byId('mwMenuClose').focus(); };
  byId('mwMenuClose').onclick = close;overlay.onclick = event => { if (event.target === overlay) close(); };
  // Listen on the document so Escape still works after a click moves focus out of the panel.
  document.addEventListener('keydown', event => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') { event.preventDefault();close(); }
    if (event.key !== 'Tab') return;
    const controls = [...overlay.querySelectorAll('button,a,select')].filter(element => !element.hidden && !element.disabled && element.getClientRects().length);
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault();controls.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault();controls[0].focus(); }
    else if (!overlay.contains(document.activeElement)) { event.preventDefault();controls[0]?.focus(); }
  });
  window.addEventListener('popstate', close);
  const preferences = byId('mwMenuPreferences');
  const languageControl = document.querySelector('.mw-header-language');if (languageControl) preferences.append(languageControl);
  if (languageControl) languageControl.dataset.label = translate('language');
  const theme = document.createElement('label');theme.className = 'mw-menu-preference';
  theme.innerHTML = '<span data-mw-i18n="appearance"></span><select id="mwMenuAppearance" data-mw-theme-selector aria-label="Appearance" data-mw-i18n-aria="appearance">' + window.MilkyWayTheme.options + '</select>';preferences.append(theme);window.MilkyWayTheme.apply();
  const links = byId('mwMenuLinks');
  const action = (key, callback) => { const button = document.createElement('button');button.type = 'button';button.className = 'btn ghost';button.dataset.mwI18n = key;button.onclick = () => { close();closeSheet('authModal');callback(); };links.append(button);return button; };
  action('settings', () => openSettings());
  const liveSettings = action('galaxySettings', () => window.MilkyWayLive.openSettings());
  liveSettings.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z"/></svg><span data-mw-i18n="galaxySettings"></span>';delete liveSettings.dataset.mwI18n;
  const administrator = document.createElement('a');administrator.id = 'mwAdminNavigation';administrator.href = '/admin.html';administrator.className = 'btn ghost';administrator.hidden = true;
  administrator.innerHTML = '<span aria-hidden="true">🛡</span> <span data-mw-i18n="admin"></span>';links.append(administrator);
  const ads = action('manageAds', () => window.MilkyWayPremium.openAdvertisements());ads.id = 'mwMenuAds';ads.hidden = true;
  const sheetAction = (key, sheet) => action(key, () => { if (byId(sheet)) openSheet(sheet); });
  sheetAction('helpSupport', 'mwHelpSheet');sheetAction('aboutMilkyWay', 'mwAboutSheet');
  const androidApp = document.createElement('a');androidApp.className = 'btn ghost';androidApp.href = 'download/MilkyWay.apk?v=7';androidApp.dataset.mwApk = '';androidApp.download = 'MilkyWay.apk';androidApp.type = 'application/vnd.android.package-archive';
  androidApp.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg><span data-mw-i18n="getAndroidApp"></span>';androidApp.dataset.mwI18nAria = 'downloadAndroidApp';
  androidApp.onclick = close;links.append(androidApp);
  const brandDownload = byId('mwApkLink');if (brandDownload) new MutationObserver(() => { androidApp.hidden = brandDownload.hidden; }).observe(brandDownload, { attributes: true, attributeFilter: ['hidden'] });
  const signOut = action('signOut', () => byId('logoutBtn').click());signOut.hidden = !logged();
  let authorizationGeneration = 0;
  async function verifyAccess() {
    const generation = ++authorizationGeneration;administrator.hidden = true;ads.hidden = true;signOut.hidden = !logged();
    byId('mwMenuStatus').textContent = '';
    try {
      const session = (await sb.auth.getSession()).data.session;
      if (!session) { window.MilkyWayPremium.setAdministrator(false);return; }
      const response = await fetch('/.netlify/functions/milkyway-account?action=admin-status', { headers: { Authorization: `Bearer ${session.access_token}`, apikey: sb.supabaseKey || '' }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(translate('adminAccessUnavailable'));
      const access = (await response.json()).isAdmin === true;
      if (generation !== authorizationGeneration) return;
      administrator.hidden = !access;ads.hidden = !access;window.MilkyWayPremium.setAdministrator(access);
      if (access && location.hash === '#advertisements') window.MilkyWayPremium.openAdvertisements();
    } catch { if (generation === authorizationGeneration) { window.MilkyWayPremium.setAdministrator(false);byId('mwMenuStatus').textContent = translate('adminAccessUnavailable'); } }
  }
  sb.auth.onAuthStateChange(() => { window.setTimeout(verifyAccess, 0); });
  window.addEventListener('hashchange', () => { if (location.hash === '#advertisements' && !ads.hidden) window.MilkyWayPremium.openAdvertisements(); });
  window.addEventListener('mw-language-change', () => { if (languageControl) languageControl.dataset.label = translate('language');if (byId('mwMenuStatus').textContent) byId('mwMenuStatus').textContent = translate('adminAccessUnavailable'); });
  verifyAccess();window.MilkyWayI18n.apply();
})();
