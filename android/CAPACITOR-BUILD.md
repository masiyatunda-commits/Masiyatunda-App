# MilkyWay native Android app (Capacitor)

The native project lives in `android/capacitor`. It loads https://masiyatunda.com/milkyway/ inside a
Capacitor WebView, so web updates reach the app without a new APK. It adds native FCM push notifications.

## Startup splash
`SplashVideoActivity` is the launcher screen. It plays `app/src/main/res/raw/milkyway_splash.mp4` (logo,
sound and Swahili text are all inside the video) full screen, cannot be skipped (no buttons, Back is
ignored), then opens `MainActivity`. The website has no splash; to change the intro, replace that file
and rebuild the APK.

## Sharing
- **Into MilkyWay:** the app is listed in Android's share sheet for photos, videos (one or several) and
  shared text/links. `MilkyWayNativePlugin` copies the shared files into the app cache (photos/videos only,
  up to 10 files of 100 MB each), and `milkyway/share-target.js` opens the post composer with the first
  file and the shared text filled in. Users who are signed out are asked to sign in first.
- **Out of MilkyWay:** the official `@capacitor/share` plugin backs the existing Share buttons, so they open
  the native Android share sheet inside the app.

## One-time Firebase setup
1. Create a Firebase project and add an Android app with package name `com.masiyatunda.milkyway`.
2. Download `google-services.json`. Either set its full contents as the Netlify environment variable
   `FIREBASE_GOOGLE_SERVICES` (no APK rebuild needed: the app fetches this public client config from
   `/api/fcm?action=config` and starts Firebase itself), or place it at
   `android/capacitor/app/google-services.json` before building.
3. In Firebase → Project settings → Service accounts, generate a private key (JSON).
4. In Netlify environment variables, set:
   - `FIREBASE_SERVICE_ACCOUNT` — the service-account JSON (raw or base64).
   - `FCM_WEBHOOK_SECRET` — any long random string.
5. In the Supabase SQL editor, run `supabase/migrations/20261016_milkyway_fcm_event_relay.sql`
   after replacing `REPLACE_WITH_FCM_WEBHOOK_SECRET` with the same secret. This pushes new messages,
   likes, comments and follows. Artist registrations notify admin devices directly.

## Build the APK
Requires Android Studio (JDK 21, Android SDK 36).
```
npm install
npm run android:sync
cd android/capacitor && ./gradlew assembleRelease
```
The signed APK is written to `android/capacitor/app/build/outputs/apk/release/app-release.apk`.
Release builds are signed with the existing MilkyWay key in `android/signing`, so they install as an
update over the current app. Copy it to `milkyway/download/` to publish it on the download button.

Admins get registration alerts once they open the app and sign in on the Admin page (`/admin.html`).

## Updates
- Web/UI changes and bug fixes: deploy the site as usual. The app loads https://masiyatunda.com/milkyway/
  live, so every user gets the change on the next launch — no new APK.
- Native changes (new plugins, permissions, icons): raise `versionCode`/`versionName` in
  `android/capacitor/app/build.gradle`, build, copy the APK to `milkyway/download/MilkyWay.apk`, and set the
  same `versionCode` in `milkyway/download/version.json`. Installed apps with a lower version show an
  update banner (set `"required": true` to hide the "later" button). Every "APK" download button on the site
  also reads `version.json` (`milkyway/apk-link.js`) and adds the version to its link, so visitors always get
  the new file.
