# Live service repair — October 12, 2026

The Live page previously sent every new conversation to the Netlify token generator and used its environment check to report missing credentials. That check could not see secrets stored in Supabase. The repository's shared Supabase handler also explicitly rejected conversation rooms and returned `room`, rather than the new interface's canonical `roomName`. The legacy browser request omitted the public `apikey` header. These were integration mismatches, not evidence that the owner's existing Supabase secrets were missing.

The existing `livekit-token` function is now the sole token issuer. The frontend first initializes membership through the authenticated Netlify room endpoint, which continues to use the existing Netlify Database room, member and message tables. It then sends its current Supabase access token and public project key to the existing Supabase function and validates `token`, `serverUrl` and `roomName`. No LiveKit signing key is sent to the browser.

Supabase verifies the user with the same Supabase project and obtains canonical room permissions from the authenticated `https://masiyatunda.com/.netlify/functions/milkyway-media-authorize` endpoint. This fixed production authorization URL cannot be supplied by a client. Netlify remains the authority for host identity, scope, lifecycle, admission and moderation. LiveKit administration is performed in Supabase after durable moderation changes commit; failed synchronization is reported, and subsequent status checks reconcile canonical permissions. The existing signed Netlify webhook remains compatible if previously configured, but token issuance and normal moderation no longer require Netlify copies of the LiveKit credentials. Preview/local media cannot be certified against a different database branch because the Supabase callback deliberately trusts the published production authorization endpoint.

Broadcast and conversation modes reuse the existing text `admission` field: `broadcast` is host-only publishing, while conversation rooms retain `approval` or the existing explicit host-selected `direct` admission setting. New conversations default to approval; viewers never publish automatically. A room's Live type cannot be changed by submitting different admission settings. Camera and microphone grants remain limited to their corresponding media sources; Audio Live never grants camera access. Host-muted microphones, removed users, bans, follower scope and ended rooms remain enforced server-side. Existing session listings/history, DM call authorization, legacy broadcasts, layouts and media controls were preserved. No table, policy or migration was added or modified.

The language selector now uses a compact Galaxy Glass listbox while retaining the original hidden selects as translation adapters. All four language names remain available, and selection, keyboard navigation, Escape, outside taps and navigation close the menu without opening a native Android selection sheet.

## Release action

After the reviewed Netlify update has been published, deploy the **existing** Supabase function from this repository using an authorized Supabase CLI session:

```sh
supabase functions deploy livekit-token --project-ref wpclkhgizbvxuvbhbwzs --no-verify-jwt
```

Keep the existing `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` secrets unchanged. The gateway JWT check is disabled only because the handler explicitly verifies bearer sessions with Supabase Auth; this also allows anonymous CORS preflight and non-sensitive health checks. Token issuance, participant access, synchronization and room termination still require authentication and canonical authorization. No service-role key or additional shared secret is required.

This environment had no Supabase deployment authorization, so the existing Edge Function was not deployed. An unauthenticated probe of the currently deployed function returned HTTP 200 for OPTIONS and HTTP 401 for GET; that did not establish secret presence, authenticated invocation or quota availability. The reported organization quota warning may block deployment or subsequent invocation. No real authenticated provider call, multi-device audio/video call or production deployment was certified. Automated builds remained assigned to the platform rather than being run locally.
