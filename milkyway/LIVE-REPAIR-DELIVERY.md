# MilkyWay Live repair delivery — October 13, 2026

## Status

The existing application was repaired in place. Source changes and automated checks were completed; production Supabase publication, push configuration, platform build/deployment validation, and real-device acceptance remain outstanding. The owner elected to publish Supabase changes and perform two-account/device acceptance. No production records were deleted, no credentials were replaced, and no ordinary user was granted administrator privileges.

## Root causes and repairs

- The deployed canonical Supabase `livekit-token` endpoint answered OPTIONS with HTTP 200 but GET health with HTTP 405. The alternative `mw-livekit-token` endpoint returned HTTP 404. This confirmed a deployed/source contract mismatch, not an absent LiveKit credential. A read-only authenticated LiveKit room-list query succeeded; no room was created or modified by that probe.
- Participant and control calls could receive token-shaped successful responses from an incompatible deployment. Strict action-specific response validation now rejects those responses with deployment guidance rather than treating them as valid room data. The reviewed shared Supabase source returns contract version 2, health, discovery, participants, track state, tokens, and authorized room control responses.
- Listening previously depended on profile loading and sequential playback promises. Playback starts immediately after connection and attempts subscribed audio concurrently. Browser autoplay restrictions still require a user gesture where applicable; the interface reports blocked listening rather than claiming audible sound.
- Non-host synchronization is restricted to the requesting account. Sensitive moderation remains server-authorized. Layout selection never grants publishing permission. Existing approval, rejection, microphone restrictions, removal, blocking, audience, and seat rules were retained.
- Host-start confirmation requires actual published LiveKit tracks. A partial unique index prevents duplicate new active rooms for one host. End/disconnect handling preserves ended, failed, or interrupted lifecycle metadata. Session history remains owner-scoped metadata, not a recording or playback promise.
- A responsive Galaxy Glass three-dot bottom sheet and dedicated participant panel replaced duplicated on-stage settings. Video tiles represent actual connected speakers, not empty capacity. Sheets support keyboard focus trapping, Escape, outside-tap closure, scrolling, and focus restoration without disconnecting Live. Host information remains user content and is excluded from automatic translation.

## Source changes

Live service and lifecycle changes were made in `lib/livekit-service.ts`, `functions/milkyway-room.mts`, `functions/milkyway-media-authorize.mts`, `functions/milkyway-livekit-webhook.mts`, `functions/milkyway-account.mts`, `supabase/functions/_shared/milkyway-token.ts`, and `milkyway/live-feed.js`.

Durable alerts, preferences, subscriptions, and delivery jobs were added through `db/schema.ts`, `lib/live-notifications.ts`, `lib/push-delivery.ts`, `functions/milkyway-notifications.mts`, `functions/milkyway-push-dispatch.mts`, and `milkyway/live-notifications.js`. `web-push` was added for actual encrypted server delivery; it is not a simulated browser notification implementation.

Presentation and localization updates were made in `milkyway/index.html`, `milkyway/galaxy-live.css`, `milkyway/live-menu.css`, `milkyway/german-locale.js`, `milkyway/translations.js`, `milkyway/ui-language.js`, the shared language helpers, service worker, manifest, and the existing account/admin/media/portal/Sanaa/moderation page script includes. Regression and browser audits were extended in `tools/repair-regressions.test.mjs`, `tools/audit-master-release.mjs`, and `tools/audit-galaxy-live.mjs`.

Existing authenticated profile retrieval and avatar upload, verified Admin navigation, and advertisement management were retained and checked rather than replaced. Actual production administrator access still depends on the existing server-side administrator RPC and role data. No advertisement records were reset.

The selector now contains English, Swahili, French, Chinese, Arabic, Portuguese, Hindi, and German, matching the owner's eight-language decision. German catalog coverage and new Live/notification diagnostics were added; Arabic direction remains RTL. Translations were not certified by native speakers, and complete translation of every historical or dynamically supplied message was not claimed. Existing Galaxy Glass, Clear Glass, Aurora Glass, and Obsidian Platinum themes were preserved with their selectors and persisted preferences.

The existing electric-blue/gold logo and vivid standard/maskable PWA icons were visually checked and preserved. Manifest orientation was changed to support landscape. Physical launcher appearance and installed-cache replacement still require device acceptance.

## Database and Supabase publication

The single new additive Netlify migration is `netlify/database/migrations/20261013051051_live_notifications_lifecycle/migration.sql`. It adds lifecycle/fanout fields, notification tables, and indexes without resetting existing data. The platform must apply it during deployment. All ten previously applied migrations were retained byte-for-byte and checksum-verified; no applied migration was edited or renamed.

The new Supabase SQL is `supabase/migrations/20261013_milkyway_live_notification_recipients.sql`. It adds a stateless, authenticated recipient RPC over existing follows/profiles/blocking records, excluding bilateral blocks, banned accounts, and existing Live-notification opt-outs. New persistent notification data lives in Netlify Database, not a competing Supabase store. The owner must review and execute this SQL on the existing project. Do not blindly apply every historical Supabase migration.

The owner must publish the reviewed existing canonical function to the existing project:

```sh
supabase functions deploy livekit-token --project-ref wpclkhgizbvxuvbhbwzs --no-verify-jwt
```

The reviewed function explicitly validates Supabase Auth for protected actions; gateway JWT verification is disabled to permit the public health contract and avoid incompatible gateway token checks. Preserve the existing server-side Supabase and LiveKit secrets. Do not deploy a new competing Live endpoint. After publication, verify authenticated health, participants, discovery, and control responses before device testing.

The Supabase function's authorization callback targets the published `https://masiyatunda.com/.netlify/functions/milkyway-media-authorize`. Publish the matching Netlify application and migration before acceptance; preview database branch behavior alone does not certify production media authorization. Preserve and verify the existing signed LiveKit webhook destination at `/.netlify/functions/milkyway-livekit-webhook` and its existing server-side key configuration.

If production Admin reports a missing administrator RPC, review and apply the existing `supabase/migrations/20261012_milkyway_admin_access.sql` only after checking its current deployment status. Do not promote test accounts or bypass server authorization to make the icon appear.

## Notification configuration and limits

Configure a matching VAPID key pair and contact subject securely in Netlify Functions environment settings:

- `MW_VAPID_PUBLIC_KEY`
- `MW_VAPID_PRIVATE_KEY`
- `MW_VAPID_SUBJECT`

The private key must stay server-side. Generate/configure the pair outside browser code and repository files; preserve any existing configured pair to avoid invalidating subscriptions.

Users enable background notifications explicitly from Alerts. Supported subscriptions are stored per authenticated account/device; account changes detach existing device subscriptions. Without valid VAPID configuration the interface honestly reports background push as unavailable, while persistent in-app alerts remain usable after the recipient RPC and migration are deployed.

After successful host publication and a five-second cancellation grace, authenticated fanout creates one persistent alert per eligible follower/session and one job per subscribed device. It pages recipients in batches of 500, respects saved preferences, and retries failures without duplicate records. Fanout initiation/retries currently depend on the connected host client; closing or losing that client before fanout completes can leave followers unnotified. This is not an independently scheduled recipient-generation service.

The scheduled production dispatcher processes up to 100 due delivery jobs each minute, with durable leases, crash recovery, bounded retries, and expired-subscription removal. Very large audiences may need higher-throughput delivery infrastructure. Ended sessions, disabled preferences, and alerts over ten minutes old do not send queued push. Provider TTL is five minutes. Scheduled delivery requires a published production deployment, not merely a preview.

Delivery also depends on browser/PWA support, permission, network, OS battery policies, and device notification settings. Sound is requested only when allowed by preferences; it is not guaranteed. Existing open clients receive a session-link message rather than forced navigation that would destroy an active Live. No actual push-provider/device delivery was claimed here.

## Validation completed

- 92 Node regression tests passed, including response contracts, ownership, admission/moderation, notification idempotency/preferences, subscription takeover protection, delivery retry/expiry, lifecycle history, and concurrent audio playback.
- TypeScript checking and 35 JavaScript/inline-script syntax checks passed.
- Both existing Supabase function entrypoints passed Deno checking.
- 431 master-release browser checks passed at 360, 390, 768, and 1280 pixels with eight languages, four themes, profile/admin/campaign fixture flows, and no browser runtime failures.
- 219 Galaxy Live browser checks passed at 360, 390, 740 × 360 landscape, and 1280 pixels, covering layouts, participants, moderation fixture calls, sheet dimensions/focus/Escape/outside closure, and clean runtime behavior.
- The actual `web-push` SDK encrypted content and signed a request using ephemeral fixture keys. Service-worker notification and click handling passed isolated tests. These are not provider-delivery tests.
- Immutable migration checksums and whitespace checks passed. No build command or production deployment was run; automatic platform validation remains pending.

All browser authentication, API writes, moderation, and media state used explicit fixtures. Screenshots demonstrate layout, not successful two-account video or audible media. Final automated checks had no failures; real-device checks below were not performed.

## Owner acceptance checklist

Use two existing authorized accounts on separate devices where possible. Use an existing genuine administrator only for administrator tests. Record browser/device, deployment, timestamps, and actual results without sharing passwords or tokens.

| Check | Required real acceptance |
| --- | --- |
| Start | Start video Live; verify real camera/microphone permission, available devices, published tracks, and no duplicate session after double taps. |
| Discover/join | Discover the same room from the second account and follow its direct link; check audience restrictions and denied access. |
| Video | Confirm host and approved participant video render on both devices; mute/camera status reflects reality. |
| Audio | Speak in both directions, measure perceptible delay, and exercise blocked-autoplay retry, microphone toggles, and device changes. |
| Leave/rejoin | Leave, reconnect, interrupt network, and close a tab; confirm stale tiles/tracks disappear and loading settles. |
| Moderation | Approve/reject requests, restrict/allow microphone, remove/block, change seats/layout, and verify non-host direct calls are rejected. Host microphone allowance must not silently activate a participant's local microphone. |
| End | End as host; verify everyone disconnects and the room leaves discovery. Exercise retryable cleanup. |
| History | Confirm owner-only session ID/title/type/start/end/duration/final status; interrupted and failed starts are labeled accurately, with no duplicate entry or playback claim. |
| Alerts | Verify eligible offline followers retain a single session-start alert; check opt-outs, blocked users, and immediately canceled sessions. |
| Background push | Enable permission/subscription on a supported device, leave the app, start another Live, and confirm an actual system notification and correct session link. Test revoked permission and expired subscriptions. |
| Account | Confirm each account sees its own avatar/name/email and avatar changes propagate to Live, messages, comments, and alerts. |
| Admin/ads | Confirm verified Admin entry, create/edit/publish/unpublish/remove a test ad, scheduling/placements, and denied direct actions from the ordinary account. Preserve existing ads. |
| Languages | Check all eight selections on main/account/Live/settings/Alerts pages and Arabic RTL; review translations with speakers. |
| Themes | Check four theme selections, contrast/focus/readability, and persistence after reload. |
| Install | Update/reinstall the PWA as needed and inspect the real vivid standard/maskable logo on Android, portrait/landscape controls, and sheet scrolling. |
| Deploy | Confirm Netlify's automatic build, additive migration, function deployment, production smoke checks, and scheduled push runs succeed. |
