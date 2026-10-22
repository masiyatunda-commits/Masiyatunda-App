(() => {
  // Feed video playback: show a real first frame instead of an empty player, and autoplay
  // the most visible post video while the user's Settings > Media > Autoplay videos is on.
  const preferenceKey = 'mw_video_autoplay';
  const selector = 'video.post-media,.mw-ad-slot video';
  const visibleRatio = 0.6;
  const byId = id => document.getElementById(id);
  const autoplayEnabled = () => localStorage.getItem(preferenceKey) !== 'off';
  const ratios = new Map();
  const saved = video => !!window.MilkyWayPrefetch?.has(video.currentSrc || video.getAttribute('src'));
  const tracked = new WeakSet();
  // Once someone turns the sound on, later autoplayed videos keep it on for this visit.
  let soundOn = false;

  // Feed videos fetch their first frame only once they come near the screen, which keeps long feeds light on phones.
  const nearby = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const video = entry.target;
      // Slow networks: no first-frame prefetch; the video stays watched and loads on tap or once the connection improves.
      // Videos already saved on the device (prefetched) load from there, so they are never held back.
      if (window.MilkyWayNetwork?.slow() && !saved(video)) continue;
      nearby.unobserve(video);
      if (video.preload !== 'none') continue;
      video.preload = 'metadata';
      if (video.readyState === 0 && video.paused) video.load();
    }
  }, { rootMargin: '900px 0px' }) : null;
  // When the connection recovers, re-observing makes nearby videos fetch their first frame straight away.
  window.MilkyWayNetwork?.onChange(tier => {
    if (tier === 'slow' || !nearby) return;
    document.querySelectorAll(selector).forEach(video => { if (tracked.has(video) && video.preload === 'none') { nearby.unobserve(video);nearby.observe(video); } });
    update();
  });

  function prepare(video) {
    if (tracked.has(video)) return;
    tracked.add(video);
    video.playsInline = true;
    if (video.preload === 'none') { if (nearby) nearby.observe(video); else video.preload = 'metadata'; }
    if (!video.hasAttribute('data-mw-sound')) { video.muted = true;video.defaultMuted = true; }
    // Some mobile browsers paint nothing until playback starts; seeking a hair forward shows the first frame.
    video.addEventListener('loadedmetadata', () => { if (video.paused && video.currentTime === 0) { try { video.currentTime = 0.05; } catch {} } }, { once: true });
    video.addEventListener('pause', () => { if (!video.mwAutoPausing && !video.ended && ratios.get(video) >= visibleRatio) video.dataset.mwUserPaused = 'true'; });
    video.addEventListener('play', () => { delete video.dataset.mwUserPaused; });
    video.addEventListener('volumechange', () => { if (!video.mwAutoMuting) soundOn = !video.muted; });
    observer?.observe(video);
  }

  function autoPause(video) {
    if (video.paused) return;
    video.mwAutoPausing = true;video.pause();video.mwAutoPausing = false;
  }

  async function autoPlay(video) {
    if (!video.paused) return;
    video.mwAutoMuting = true;video.muted = !soundOn;video.mwAutoMuting = false;
    // Marks scroll autoplay so video ads only run before videos a person chose to play.
    video.mwAutoPlaying = true;
    try { await video.play(); }
    catch {
      // Browsers refuse unmuted autoplay without a recent tap; fall back to muted playback.
      if (video.muted) return;
      video.mwAutoMuting = true;video.muted = true;video.mwAutoMuting = false;
      await video.play().catch(() => {});
    } finally { video.mwAutoPlaying = false; }
  }

  function update() {
    let best = null, bestRatio = 0;
    for (const [video, ratio] of ratios) {
      if (!video.isConnected) { ratios.delete(video);continue; }
      if (ratio >= visibleRatio && ratio > bestRatio) { best = video;bestRatio = ratio; }
    }
    for (const video of ratios.keys()) if (video !== best && video.dataset.mwAutoplayed === 'true') { autoPause(video);delete video.dataset.mwAutoplayed; }
    if (!best || !autoplayEnabled() || document.hidden || best.dataset.mwUserPaused === 'true') return;
    // On a slow connection autoplay runs only when the person turned it on themselves in Settings.
    if (window.MilkyWayNetwork?.slow() && localStorage.getItem(preferenceKey) !== 'on' && !saved(best)) return;
    if (best.paused) { best.dataset.mwAutoplayed = 'true';autoPlay(best); }
  }

  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const video = entry.target;
      const ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
      ratios.set(video, ratio);
      if (ratio < visibleRatio) {
        // Scrolled away: stop it and forget a manual pause so it can autoplay when it comes back.
        delete video.dataset.mwUserPaused;
        if (!video.paused && !document.pictureInPictureElement && !document.fullscreenElement) autoPause(video);
      }
    }
    update();
  }, { threshold: [0, 0.25, visibleRatio, 0.8, 1] }) : null;

  function scan(root = document) { root.querySelectorAll?.(selector).forEach(prepare); }
  let scanScheduled = false;
  new MutationObserver(() => { if (scanScheduled) return;scanScheduled = true;requestAnimationFrame(() => { scanScheduled = false;scan(); }); }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) document.querySelectorAll(selector).forEach(video => { if (video.dataset.mwAutoplayed === 'true') autoPause(video); });
    else update();
  });

  // Settings > Media
  function addSettings() {
    const sheet = byId('settingsSheet')?.querySelector('.sheet');
    if (!sheet || byId('mwVideoAutoplay')) return;
    const section = document.createElement('div');
    section.className = 'mw-media-settings';
    section.innerHTML = '<h3 style="margin:15px 0 8px" data-mw-i18n="mediaSettings"></h3><label class="setting-row"><span data-mw-i18n="autoplayVideos"></span><input id="mwVideoAutoplay" type="checkbox"></label><p class="muted" style="margin:4px 0 0;font-size:.8rem" data-mw-i18n="autoplayVideosHelp"></p>';
    const actions = byId('saveSettingsBtn')?.closest('.row');
    if (actions?.parentElement === sheet) actions.before(section); else sheet.append(section);
    const toggle = byId('mwVideoAutoplay');
    toggle.checked = autoplayEnabled();
    toggle.onchange = () => {
      localStorage.setItem(preferenceKey, toggle.checked ? 'on' : 'off');
      if (toggle.checked) update();
      else document.querySelectorAll(selector).forEach(video => { if (video.dataset.mwAutoplayed === 'true') { autoPause(video);delete video.dataset.mwAutoplayed; } });
    };
    window.MilkyWayI18n?.apply?.();
  }
  window.addEventListener('storage', event => {
    if (event.key !== preferenceKey) return;
    const toggle = byId('mwVideoAutoplay');if (toggle) toggle.checked = autoplayEnabled();
    update();
  });
  window.addEventListener('mw-settings-open', () => { const toggle = byId('mwVideoAutoplay');if (toggle) toggle.checked = autoplayEnabled(); });

  addSettings();
  scan();
  window.MilkyWayMediaPlayback = { autoplayEnabled, refresh: update };
})();
