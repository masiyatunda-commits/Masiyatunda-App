# Galaxy Glass Live verification

Current release note: `LIVE-SUPABASE-REPAIR.md` supersedes the historical Netlify credential/token setup guidance below. Retain the owner's existing Supabase secrets.

The existing Live screen, Supabase accounts/session records, Netlify conversation tables and LiveKit room endpoint were extended in place. No replacement application or second request queue was added.

## Participation and layouts

The cyan alien button requests admission, cancels a pending request, or leaves the stage while staying connected as a viewer. The violet alien button opens a separate, read-only guest participation panel showing real admitted members, configured capacity and admission policy. It deliberately does not send another join request or imply an unsupported second queue.

Hosts can choose one through twenty total boxes, including the host, subject to LiveKit quotas and device/network capacity. The two-person arrangement uses exactly two boxes. Host-above, host-beside, grid and focus arrangements, host position and phone stacking/compact choices are stored in the existing conversation room. Approval and direct admission cannot exceed the configured box count. A host must release admitted speakers before reducing capacity below occupancy. Actual twenty-device media performance was not certified.

Stories live activity uses the existing session discovery pipeline: Supabase session/access/profile reads, Netlify room lifecycle state and LiveKit verification that the host has a published camera or microphone track. Database change events trigger refreshes; visible-page polling remains a fallback. Video and audio entries use available profile images because the existing session schema does not provide a live thumbnail. No fake preview is generated. Discovery failure is distinct from an empty verified list.

## Deployment configuration

The supplied project address was pinned in `lib/livekit.ts` and declared as `LIVEKIT_URL` in `netlify.toml`. The server rejects another LiveKit origin. This repository configuration is not proof that a deployed Functions environment variable was changed.

An environment write was attempted, but production and preview environment readback did not confirm it. The production availability endpoint still reported missing configuration. In Netlify, open the **masiyatunda** project, then **Project configuration → Environment variables**. Set `LIVEKIT_URL` to the exact owner-supplied address and add the owner's actual `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, with **Functions** scope for production and deploy-preview. Treat the API credentials as secrets. Do not paste them into repository files, frontend-prefixed variables, browser consoles or task reports. Redeploy after configuration. A code-only URL default does not create the missing API credentials.

The existing Supabase `livekit-token` and `mw-livekit-token` aliases both use the shared legacy token handler, which already requires the same project address and server-side key/secret. Their deployed secret state was not verified. Configure those variables separately in Supabase Edge Function secrets if legacy broadcasts or DM calls need them; conversation tokens continue to use the authorized Netlify endpoint.

Configure signed LiveKit webhooks to the existing `/.netlify/functions/milkyway-livekit-webhook` endpoint using matching server credentials. Departure reconciliation now releases pending requests as well as speaker seats, without lifting bans or rejections. This requires an actually configured webhook, not just a source file.

The new `20261012011429_galaxy_live_layouts` migration adds three layout fields to the existing room table. Netlify reported all eight earlier migrations applied and unchanged, with this one new migration pending. The automatic deployment workflow must apply it before testing persisted settings. Do not edit or remove the earlier migrations.

## Repeatable checks

Run `npm test`, `npm run typecheck`, `npm run check:syntax` and `git diff --check`. No lint or build script is configured in the package. Build validation is left to the automatic Netlify workflow; these commands do not certify a deployment.

Start local emulation with `/opt/buildhome/node-deps/node_modules/.bin/netlify dev --port 8889`. With Playwright available, run `tools/audit-browser.mjs` and `tools/audit-galaxy-live.mjs`; set `MW_PLAYWRIGHT_MODULE` when Playwright is installed outside the repository. Temporary browser dependencies and screenshots are kept outside the project. The Galaxy audit instruments a served copy of the source only for testing; production source contains no audit hook or simulated participants.

The isolated regression suite uses the actual source handlers and LiveKit SDK with ephemeral test-only signing material. Authentication, persistence and room-service operations use fixtures. The browser audits distinguish actual public-page rendering from fixture room/auth/API/session state. They do not prove real media publication, two-account approval, physical Android behavior or live Stories updates.

## Owner acceptance still required

After environment configuration, migration application and webhook setup, use two authorized accounts on separate devices to verify host Video LIVE and Audio LIVE, remote media in both directions, request notification with the guest's actual name, cancellation/rejection/approval, microphone/camera controls, mute/remove/block/re-entry, comments, layout changes without disconnecting, follower access, share/leave/end and removal of ended sessions from Stories. Verify a real profile photo in Audio LIVE and confirm failed discovery never displays a fabricated zero. Actual active-session and two-device tests remained blocked by missing credentials and test accounts/devices during this task.
