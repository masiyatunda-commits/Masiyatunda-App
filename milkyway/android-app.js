// Hides the APK download pill where it makes no sense: inside the installed
// Android app itself (Capacitor, or the older android-app:// launcher) and on iPhone/iPad.
(() => {
  const link = document.getElementById('mwApkLink');
  if (!link) return;
  try { if (document.referrer.startsWith('android-app://com.masiyatunda.milkyway')) sessionStorage.setItem('mw_android_app', '1'); } catch {}
  let insideApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  try { insideApp = insideApp || sessionStorage.getItem('mw_android_app') === '1'; } catch {}
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  link.hidden = insideApp || apple;
})();
