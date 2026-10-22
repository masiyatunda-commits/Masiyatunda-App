# MilkyWay v33.0 — source release, October 12, 2026

## Release status

This release repairs the existing Masiyatunda checkout; it is not a replacement application. A secret-sanitized backup was made before editing. No production deployment, database reset, migration execution, user-record deletion, or credential change was performed.

The repaired source and icons are included in the versioned ZIP. This is a **reviewed source release, not a certification of deployed two-device audio/video or authenticated production advertising**. Publishing the reviewed Supabase handler and applying the administrator migration remain owner-controlled actions.

There are **four themes**: the original Galaxy Glass and Clear Glass, plus Aurora Glass and Obsidian Platinum. There are **seven unique languages**, as explicitly approved by the owner: English, Swahili, French, Chinese, Arabic, Portuguese and Hindi. French was already present and was not duplicated. The contradictory “six themes/eight languages” wording was not used to add unsolicited choices.

## Confirmed diagnosis

The published `milkyway/live-feed.js` used this canonical token endpoint:

```text
https://wpclkhgizbvxuvbhbwzs.supabase.co/functions/v1/livekit-token
```

Both the repaired Live client and the retained DM-call client use `livekit-token`. Netlify room/discovery functions call that same issuer. `mw-livekit-token` remains as an existing compatibility alias; it was not deleted. Both Supabase entrypoints reuse the repaired shared handler.

On October 12, 2026, a read-only probe of the published token endpoint **with the application's existing public key returned HTTP 405 for GET**. A request without that key returned HTTP 401. The deployed health method was therefore incompatible with the published caller; these results did not prove a Supabase quota restriction or missing LiveKit secrets. The existing public key successfully reached Supabase Auth settings (HTTP 200). Zero-row schema probes for both existing Live-session tables returned HTTP 200. Their required Live/history columns were accepted by the REST API.

A read-only LiveKit control-service request, using the existing server environment and the pinned project server, authenticated successfully. It only queried a nonexistent probe room and created, joined, changed and deleted no rooms. This verified those **Netlify-environment credentials**, not Supabase Edge secret values, participant tokens, camera/microphone connectivity or a media call.

The existing `mw_is_admin` REST RPC returned HTTP 404 / `PGRST202`: the current API did not expose that function. Repository SQL already defined the legacy owner rule, while the advertising UI/server previously depended only on Auth metadata roles. Those inconsistent authorities explained why a profile administrator could lack advertising navigation. The repair did not trust a potentially editable `mw_profiles.is_admin` field as a new source of privilege.

## Changes

Live health checks now pass through the existing Netlify room endpoint with the current public key and, when present, the caller's session. Authentication, forbidden access, HTTP 405/incompatible deployment, missing endpoints, quota/rate limits, malformed responses, provider credential rejection and connection failures have separate safe diagnoses. Retry forces a new health request and refreshes discovery. An unknown/unsupported health method alone no longer prevents an authenticated token attempt; actual room authorization still remains mandatory.

The reviewed Supabase GET handler actually authenticates a bounded, read-only LiveKit control request instead of treating secret presence as proof of availability. Room tokens still derive identity from verified Supabase Auth and permissions from the trusted production Netlify authorizer. Video, audio-only capture, viewer admission, host approval, mute/removal/ban controls, layouts, comments, termination, legacy broadcasts and accepted DM calls remain connected to their existing code paths. Camera capture is conditional on Video Live. Signed host-departure/room-finished webhooks close Netlify lifecycle state, and host page exits send a best-effort authenticated keepalive termination request. Browser/process crashes and network loss cannot be guaranteed to complete a keepalive request; owner-side listing cleanup remains available.

An accessible hamburger organizes secondary settings, language, appearance, sign-out and verified administrator/advertisement links. Essential Orbit, Search, Post, Messages, Alerts and My Account navigation remains in place. Admin opens the actual existing `admin.html` and verifies access before fetching its dashboard. Existing artist handlers also received their missing form/list/counter elements and a shared badge helper, fixing browser exceptions in the previously incomplete dashboard rather than merely exposing a decorative link.

Advertising continues to use the existing Netlify Database `mw_ad_campaigns` and dismissal schema. Administrators can create, save, preview, edit, publish, schedule, pause and soft-delete campaigns. Public listings exclude drafts, paused/deleted records, future schedules, expired schedules and unauthorized member-only advertisements. The existing HTTPS video/media URL workflow remains available. JPEG/PNG/WebP image uploads under 4 MB use Netlify Blobs and the existing `mw_media_assets` metadata table; draft/uploaded media is not publicly served before a permitted publication. Publishing requires confirmation. Duplicate reads are coalesced, unchanged cards are retained rather than rebuilt, and visible pages recheck publication schedules/status every two minutes.

Shared appearance tokens cover the MilkyWay app, forms, dialogs, Live and existing company/account/admin pages. Theme selection persists through the existing `mw_appearance` preference. Typography is denser without reducing controls below 44-pixel touch targets. Previously exposed account-setting identifiers have proper labels. New-language catalogs cover the existing interface dictionary, fixed phrases and additional safe backend diagnostics. All original dictionary entries were retained. Arabic switches document direction and logical menu/form alignment; language selection persists across pages. New catalogs were generated offline with focused human-authored corrections; native-speaker review of long-form wording is recommended, and automated catalog coverage is not a linguistic-quality certification. User posts, private messages, advertiser content, identifiers and URLs are not automatically translated.

Installed icons now use the existing saturated blue/cyan/gold emblem on an opaque navy background, without tiny faded logotype text. The MilkyWay manifest has separate standard and maskable 192/512 PNGs, an explicit installation identity/scope and corrected colors. Apple-touch and tab/favicon assets were checked separately. The unrelated root company manifest retained its identity. The MilkyWay service-worker cache version and asset list were advanced.

## Egress investigation

Confirmed source patterns included original-size storage images used for feed images, profile thumbnails and Story tiles; video URLs used as Story `<img>` sources; full-feed HTML rebuilding; a 12-second Live discovery fallback; repeated health checks; and history refetching solely to change language. The repair gives public portfolio images bounded Netlify Image CDN dimensions, uses profile art instead of downloading a video as a Story image, leaves video playback on demand, increases visible discovery fallback to 45 seconds, retains realtime updates, caches profile metadata by the current host list, coalesces health requests with a 60-second freshness window, and rerenders loaded history without another history request. Original private URLs and authorization checks are not put into public caches.

These were confirmed **code-level contributors**, not an attribution of the owner's reported 24.344 GB Cached Egress. Large public media and repeated video/image transfers are the leading hypothesis given that cached egress was much larger than ordinary egress and Edge invocations. Storage/CDN request logs, asset sizes, cache headers and the current dashboard billing cycle must be examined to quantify the source. Changes do not erase historical usage, lift a quota restriction or guarantee a particular saving. Nothing was deleted to reduce usage. Netlify Image CDN/Blobs usage also remains billable according to the owner's platform plan.

## Required migration — not executed

Review and execute **only** the new file `supabase/migrations/20261012_milkyway_admin_access.sql` in the existing Supabase SQL Editor. It restores the missing RPC using verified Auth administrator metadata or the already-established legacy owner identity, requires confirmation of that owner's email, and prevents ordinary accounts from assigning/changing administrator-managed profile flags. It creates no advertising table, user account or automatic ordinary-user promotion. It retains existing RLS policies. Other legitimate administrators that currently have only a profile flag need an owner-approved trusted Auth administrator role; do not automatically promote every flagged profile.

The new migration was SQL-syntax parsed, not applied or exercised against production Postgres. Positive authenticated RPC/trigger behavior therefore remains a release gate. All ten already-applied Netlify migrations, including both files in every directory, remained byte-for-byte identical to the pre-edit backup. No new Netlify schema is needed. Historical Supabase privacy/message migrations remain present; their application state was not inferred or changed in this release.

## Testing and acceptance

| Check | Result / scope |
| --- | --- |
| Node regression suite | 75 passing tests; actual source handlers/SDK signing and verification, with explicit Auth/database/provider fixtures |
| Browser suite | 391 passing checks at 360, 390, 768 and 1280 pixels; seven language choices, RTL reversal, four themes/persistence, menus, connected wrench controls, safe diagnostics/Retry, primary social navigation, Admin gating and campaign form/save request |
| JavaScript/inline syntax | 33 checks passed |
| TypeScript | `tsc --noEmit` passed |
| Supabase entrypoints | `deno check` passed for both existing token entrypoints |
| SQL migration | Nine statements syntax parsed; not executed; procedural/RLS behavior still needs database verification |
| Immutable migrations | All 20 files in the ten supplied applied migrations matched the backup byte-for-byte |
| Manifest/icons | Standard/maskable files exist, declared dimensions match PNG headers, launcher backgrounds are opaque; favicon/Apple-touch references retained and inspected |
| Read-only provider probes | LiveKit control authentication passed; Supabase Auth settings and both Live-table column probes returned 200 |
| Published health method | GET with the existing public key returned 405; without it returned 401; repaired Edge source was not deployed |
| Published administrator RPC | 404 / PGRST202; new migration was prepared, not executed |
| Production Admin/advertising writes | Not performed: no authorized user-session test account was available, and no production mutations were permitted |
| Two-client audio/video | Not performed; no claim of a successful conversation, receiver playback, physical Android capture or provider moderation |
| Build/deployment | No build/deploy command was run; automatic platform build validation remains separate from these checks |

Screenshots of the emblem, mobile layouts and Arabic menu/Live settings were inspected. Browser Auth, advertising writes and Live responses were explicit fixtures, not fabricated production success. The original four-language visual-audit scripts are historical checks whose selector/count assumptions predate the reorganized menu; this release uses `tools/audit-master-release.mjs` for the new acceptance matrix. The source-level regression suite retained its previous tests and added coverage for the repairs.

## Exact deployment procedure

1. Keep the existing published project untouched until the owner accepts this source and the automatic platform validation succeeds. Do not reset databases, change secret values, run broad schema installers or recreate storage buckets.
2. A source ZIP produced by the exporter sanitizes embedded keys/tokens, including public browser configuration. Before using that ZIP rather than the private working checkout, restore **only the existing project publishable/public browser key** in files identified by `BACKUP-MANIFEST.json`. Search for `BACKUP_RESTORE_CREDENTIAL`. Never put a Supabase service-role key or LiveKit API secret into any HTML/JavaScript client file. The private working checkout retained its existing configuration.
3. Apply the one reviewed administrator SQL migration using the existing Supabase SQL Editor. Confirm an ordinary member cannot obtain admin access or alter privileged profile flags. Confirm the owner and each explicitly authorized administrator can reach Admin and campaign management. Do not grant roles to ordinary users as a workaround.
4. Netlify remains a static-root project: base is the repository root, **build command is blank**, **publish directory is `.`**, **Functions directory is `functions`**, dependencies come from the existing `package.json`/lockfile, and Node 22.23+ or the existing Node 24 environment supports the checks. The configured `netlify.toml` takes precedence over the generic `netlify/functions` metadata hint. Review the deploy preview, platform validation and Netlify Database branch/schema status before an owner-approved production promotion. No manual bundling or app replacement is required.
5. After the reviewed Netlify authorization handlers are approved/published, deploy the existing canonical Supabase Edge Function from an authorized owner CLI session:

   ```sh
   supabase functions deploy livekit-token --project-ref wpclkhgizbvxuvbhbwzs --no-verify-jwt
   ```

   The function explicitly verifies Supabase Auth for token/control operations even though anonymous preflight/health checks can pass the gateway. Keep the existing `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` secrets server-side. Verify them privately only if the new health response reports missing/invalid/provider-rejected configuration; no recreation or value change is implied. If external integrations actively use the retained `mw-livekit-token` alias, review and deploy its shared-handler update through that existing integration's normal authenticated procedure rather than deleting it.
6. Verify the existing signed LiveKit webhook points to `/.netlify/functions/milkyway-livekit-webhook` on the approved project and uses matching server-side signing configuration. It needs verified `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in Netlify Functions scope. The read-only local SDK probe established validity of the current environment, not production-scope/webhook-dashboard configuration. Supabase conversation authorization deliberately calls the published production Netlify endpoint: a different preview database branch is **not** certified for real media admission.
7. Run owner acceptance below. For repeatable local checks, install the existing locked dependencies, then use:

   ```sh
   npm test
   npm run typecheck
   npm run check:syntax
   deno check supabase/functions/livekit-token/index.ts supabase/functions/mw-livekit-token/index.ts
   netlify dev --port 8889
   ```

   In another terminal with Playwright/Chromium available:

   ```sh
   node tools/audit-master-release.mjs
   ```

   `MW_PLAYWRIGHT_MODULE` can point to an externally installed Playwright module. No build script was added; the platform owns build validation. For icon regeneration only, `bash tools/enhance-icons.sh` requires ImageMagick.

## Remaining owner acceptance

Use two authenticated accounts on two actual clients. Check Video Live camera/mic, Audio Live without any camera prompt, viewer joins, request/approval, host/guest visibility and receiver sound, camera/mic toggles, host mute/remove/ban, End Live, guest departure, host tab closure, signed webhook delivery, session history and discovery removal. Test a temporary disconnection and owner-side “Close listing” after abrupt process/network loss. Verify no banned participant can reconnect using an old grant.

Use an authorized administrator to upload a small valid image, preview/save a draft, publish, schedule in the future, edit, pause and inspect from an ordinary/anonymous account. Drafts/future/paused campaigns and protected uploaded media must not leak. Verify legacy dashboard panels through their actual Supabase RLS policies, not only their fixture rendering. Existing tables/policies outside the probed Live columns were not recreated or claimed verified.

Review long-form Arabic, Portuguese and Hindi wording with fluent speakers and inspect all four palettes on a low/mid-range Android phone. Open the new MilkyWay manifest and all four launcher PNGs after release. The explicit manifest identity preserves the old implied start-URL identity. Existing installed Android launcher images may remain cached; reload/update the service worker, then remove/reinstall the PWA if the old launcher icon persists. Reinstallation is a user-side icon-refresh step, not a guaranteed consequence of a code deploy. Android/vendor themed-icon preferences can also recolor launcher icons independently of the source bitmap; check that preference if a refreshed icon still appears monochrome.

## Source package

The private versioned source archive is generated outside the website's publish root:

```sh
python3 tools/backup_project.py --output /opt/build/artifacts/MilkyWay-v33.0-source.zip
```

It includes source, icons, both Supabase token aliases, SQL, immutable Netlify migrations, tests, deployment configuration and this report. It does not include hosted user data, uploaded media, Auth accounts, dependencies, private environment files, Git internals or local Netlify state. The exporter verifies ZIP integrity, source completeness, credential patterns and unchanged originals. Keep the archive private and restore configuration privately before deployment.
