# MilkyWay repair verification and release gates

Current release note: `LIVE-SUPABASE-REPAIR.md` supersedes this document's historical Netlify LiveKit credential/token instructions. The current repair uses the existing Supabase token function and secrets.

This document covers the existing HTML application, Supabase authentication and social data, Netlify Functions, Netlify Database and Blobs, and the existing LiveKit integration. It is not evidence of a completed production release. No real two-account media test or physical Android test has been completed in this environment. The owner agreed to perform device acceptance.

## Configuration diagnosis

On October 11, 2026, presence-only checks of Netlify production environment variables found none of `LIVEKIT_URL`, `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET`. The public production room endpoint returned HTTP 200 with `available: false`. This explains the Live configuration error; adding UI controls cannot supply the missing service credentials.

On October 12, the supplied existing-project address passed an HTTPS reachability probe (HTTP 200); its unauthenticated RTC validation endpoint returned HTTP 401 as expected. Neither probe established authenticated WebSocket connectivity or media. An automated Functions-scoped environment update was attempted, but readback still returned no LiveKit variables and the environment-write API denied authorization. The URL was therefore not confirmed as configured. A successful CLI exit alone was not accepted as evidence that configuration persisted.

### Secure administrator configuration

Open the existing **masiyatunda** project in Netlify, then **Project configuration → Environment variables → Add a variable**. Set `LIVEKIT_URL` to the address supplied by the owner. Add `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` from the same existing LiveKit project; mark credentials as secret, assign the **Functions** scope, and configure the **Production** and **Deploy Previews** contexts as appropriate. Do not grant client/build access to the API secret or paste credentials into code or conversations. Save, verify the variable names/scopes/contexts and deploy the reviewed Functions so the configuration takes effect. If the menu is unavailable, an account owner or administrator with environment-variable management permission must perform this step.

An administrator must configure all three variables securely in the Netlify Functions runtime for the relevant preview and production contexts. The URL must be a secure WebSocket origin (`wss://`), without embedded credentials, a path, query parameters or fragments. Configuration presence is not a connectivity test. Do not put secrets into HTML, JavaScript, repository documentation or browser storage.

Configure the signed LiveKit webhook at `/.netlify/functions/milkyway-livekit-webhook` with the matching project signing credentials. Confirm that the endpoint verifies genuine events and reconciles ended rooms and blocked participants. Existing DM-call and legacy broadcast Edge Functions, `livekit-token` and `mw-livekit-token`, also require their authorized shared implementation and server-side configuration to be deployed in Supabase; a Netlify deployment does not deploy them. The legacy Edge implementation validates the existing project's LiveKit origin, so its URL must match that integration.

The actual configured Netlify Functions directory is `functions`, as specified in `netlify.toml`. Do not introduce a competing token service or authentication provider.

## Database and retention

All existing migration directories must remain immutable, including `20261011231413_live_history_archives`. Confirm platform-managed application of this migration in the target branch before accepting history persistence. History removal archives the authenticated owner's ended-session references in Netlify Database; it does not delete the original Supabase session, moderation evidence or recordings. Clear history applies to the owned sessions currently displayed; load older pages to manage older entries.

The existing Supabase profile backend lacked `is_private`, `allow_messages`, `notify_follow`, `notify_echo` and `notify_signal` during the audit. Unsupported privacy and notification controls are disabled with a translated explanation. Language, appearance and device sound remain usable. The Supabase owner must review the actual schema and authorization policies before restoring these settings; do not blindly apply legacy SQL files or report these account rules as functional.

Read-only checks returned PostgreSQL error `42703` for the profile settings fields, HTTP 404 / `PGRST202` for the Sanaa `get_public_artist_profiles` RPC, and HTTP 404 / `PGRST205` for the Media `site_media` table. Review their existing definitions and deployed policies separately. HTTP 200 for an HTML page does not establish that its backend queries work.

## Repeatable local verification

Use Node 22.13 or later for the isolated regression suite. Type stripping in Node 22/24 may emit an experimental warning.

```sh
npm test
npm run typecheck
npm run check:syntax
git diff --check
```

`npm test` executes real source functions with explicit authentication, database, storage and LiveKit control-service fixtures. It also signs and cryptographically verifies SDK tokens with ephemeral test-only signing material, without printing or configuring any credentials. It covers Netlify runtime configuration, host/viewer/admitted-speaker grants, audio-only restrictions, approval, moderation, speaker limits, token-response validation, playback rollback/retry, owner-only history archival, retained media protection, exact-object deletion, shutdown retries, synchronous auth callbacks and DM drafts. These fixtures never establish genuine persistence, LiveKit connectivity or production authorization-policy correctness.

Run browser checks against local Netlify emulation, not a production origin. The browser script expects LiveKit to be unconfigured for its failure-path assertions.

```sh
/opt/buildhome/node-deps/node_modules/.bin/netlify dev --port 8889
```

In a separate terminal, install optional browser tooling outside the repository:

```sh
npm install --prefix /tmp/milkyway-audit --no-package-lock --no-audit --no-fund playwright
/tmp/milkyway-audit/node_modules/.bin/playwright install chromium
MW_PLAYWRIGHT_MODULE=/tmp/milkyway-audit/node_modules/playwright/index.mjs node tools/audit-browser.mjs
```

Screenshots default to `/tmp/milkyway-browser-audit`. The browser suite checks all four languages at 360, 390, 768 and 1280 pixels, persistence, synchronized selectors, translated Live preparation, truthful blocked starts, layout selection, participant-tile lifecycle, safe unsupported Settings, asynchronous password form reset, DM composer sizing, appearance and public-route runtime errors. Authenticated preflight, password, Settings and track-rendering cases use fixtures. Participant-tile tests attach synthetic DOM tracks only; they do not test audio, real video or the LiveKit server.

No build command is required for these source checks. The platform validates builds automatically. Local database-backed Functions can return 503 if their emulated tables are unavailable; retain the truthful error state instead of inventing campaigns or sessions. Real remote audio, camera publication, subscriptions, admission and server cleanup remain blocked until credentials and deployment are verified and the owner completes the two-device checks. The interface attempts to enable listening after connection without requesting a viewer microphone or camera; if browser autoplay blocks it, its translated speaker-control guidance must remain visible.

## Owner acceptance: two accounts and devices

Use approved test accounts A and B in separate browser/device sessions and an authorized administrator account. Record failures without sharing passwords, access tokens, environment values or identifiable private messages.

1. Sign in from the actual preview origin and a physical Android Chrome browser. Exercise email confirmation, password recovery and existing CAPTCHA. If an embedded preview blocks media or CAPTCHA, retry its secure standalone origin and review provider allowlists; never bypass authentication or bot protection.
2. For each of Kiswahili, English, Français and Simplified Chinese, visit feed, profile, Settings, DM, comments, notifications, Live preparation, history and moderation. Check validation, errors and confirmations; reload and confirm the language remains selected. Preserve user-written content unchanged.
3. From A, save name, username and bio; upload, replace and remove a profile photo, reloading after each operation. Verify the saved pointer and exact owned stored object. Test concurrent changes, interrupted responses, retained files and attempts by B to access or delete A's private media.
4. Send text, emoji, image, video and document DMs from A to B. Test camera/file selection, delivery/loading/failure states, sender-only edits/deletes and conversation authorization. Retry an interrupted send, verify one message, and type a new draft while the earlier send is pending.
5. Publish and edit owned posts. Open comments and verify the selected post remains anchored with its composer below it. Send text/image comments, double-submit and retry lost responses, refresh with an unsent draft, then verify edit/delete, mentions, sharing and authorized downloads. Check persistence from B.
6. Create an administrator campaign and verify edit, scheduled start/end, audience, activation/deactivation and dismissal persistence. Confirm empty placements remain truthful when no eligible campaign exists.
7. Start Video Live as A after device preview. Connect B as a viewer without camera/microphone prompts. Confirm remote video and audio. Request admission from B, approve from A, and verify bidirectional audio and authorized camera publication. Repeat in Audio Live without camera access.
8. Exercise local mic/camera controls, speaking indicators, connection status, layout choices including 1, 2, 4, 6, 8 and 20, host mute, removal, block and denied rejoin. Layout slots are not proof of 20 simultaneous publishers; establish actual service-plan, bandwidth and device limits before load testing.
9. End the room, verify server termination and discovery removal, reconnect/replay rejection, device-track release and accurate ended history. Disconnect the network during termination and use Retry session cleanup; verify that retries target the original room, not a new session.
10. Archive one owned ended session, cancel another confirmation, clear displayed owned history and load older pages. Reload and verify the archive persists, B's sessions remain untouched, original moderation records remain and active sessions cannot be archived.
11. Verify notification rules only after the backend schema/policies are restored. Change password with reauthentication, sign out, request account deletion with confirmation and confirm administrator processing. A deletion request is not immediate account erasure.

## Deployment gate

The production metadata checked during this audit identified ready deploy `6acc0c6d2f2c44000850e218`, published October 11, 2026 at 22:24:04 UTC. That was the pre-existing production deployment, not verification that these repairs were published. No production deployment was initiated. Review the automatically validated preview, migration application and owner acceptance results before releasing production.
