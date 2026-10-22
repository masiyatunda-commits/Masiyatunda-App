# MilkyWay Android app

MilkyWay ships as a Trusted Web Activity (TWA) generated with Google's Bubblewrap library. The APK opens `https://masiyatunda.com/milkyway/index.html` full screen in the phone's Chrome engine, so camera, microphone, notifications and LiveKit behave exactly as on the website.

- Download: `/milkyway/download/MilkyWay.apk` (linked under the MilkyWay brand in the app header, in the side menu, and next to the MilkyWay App button on masiyatunda.com).
- Package ID: `com.masiyatunda.milkyway`; minimum Android 7.0 (API 24); target API 36; signed with APK Signature Scheme v2 and v3.
- Domain association: `/.well-known/assetlinks.json` holds the SHA-256 fingerprint of the signing certificate. Without it Android would show a browser address bar.

## Rebuilding

Build configuration lives in `android/` (`twa-manifest.json`, `build-apk.mjs`, `signing/`). The site blocks `/android/*` with a forced 404, so the signing key is never served.

1. Raise `appVersionCode` (and `appVersion`) in `android/twa-manifest.json`.
2. Install `@bubblewrap/core` in a separate folder, plus JDK 17 and the Android SDK command-line tools.
3. Run `BUBBLEWRAP_CORE_DIR=<folder> JAVA_HOME=<jdk17> ANDROID_HOME=<sdk> node android/build-apk.mjs`.

Always sign with `android/signing/milkyway-release.keystore`. A different key makes Android refuse to update installed copies ("App not installed"). For Google Play, upload the same key or register Play's app-signing fingerprint in `assetlinks.json` as well.

Official guidance: `https://developer.chrome.com/docs/android/trusted-web-activity/quick-start`.
