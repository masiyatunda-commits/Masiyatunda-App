# Unified MilkyWay Live feed

The existing MilkyWay application now has one `LIVE` entry point and one shared broadcast page. Video Live publishes LiveKit camera and microphone tracks. Audio Live publishes only a microphone track and uses the host's existing profile image. Watching and listening do not request camera or microphone permission.

The supplied `MilkyWay Live Feed.html` was not available in the workspace or attachments. The replacement followed the approved written specification: a cosmic star field, translucent Galaxy Glass panels, blue/purple/pink lighting, a host header, a large broadcast stage, bottom comments and message input, and a vertical action rail. No simulated audio, sample comments, or fabricated participant counts were included.

## Existing backend

Authentication, profiles, follower relationships, and LiveKit token requests continue to use the existing Supabase project. Both modes reuse `mw_video_live_sessions` for discovery and session lifecycle. Audio broadcasts have room names beginning with `mw-audio-live-`, which preserves their mode without a schema migration. Existing video room names remain compatible. Previous audio history remains readable from `mw_audio_live_rooms`; no historical records or unrelated user data were deleted.

Comments and heart reactions use reliable LiveKit room data messages and are visible to connected participants. They are not persisted, replayed to late joiners, or represented as recordings. Gifts remain disabled because the project has no connected gift backend. Connected participant counts come directly from the connected LiveKit room, including the host.

## Token function deployment

The existing token function source was updated to verify room ownership and follower-only access and to issue non-publishing viewer tokens. Deploy the updated functions through the existing Supabase project deployment workflow:

```sh
supabase functions deploy livekit-token
supabase functions deploy mw-livekit-token
```

The browser uses `livekit-token`; the alternate function was kept consistent. Publishing the Netlify static site does not deploy these Supabase Edge Functions. Until the updated function is deployed, the previous server's less restrictive authorization remains in effect.

Keep `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in the Supabase function's server-side secret configuration. Keep existing Supabase server configuration in place. Never place secret values in browser assets. The existing session table and authenticated select/insert/update policies must already be available; the repository's existing `mw-video-live-sessions-v30.9.sql` describes them.

## Verification and limitations

JavaScript syntax checks, stylesheet parsing, Deno type checks for both token functions, mobile/desktop browser smoke checks, and mocked LiveKit lifecycle and token authorization tests were performed. The running page loaded the real LiveKit SDK, presented one Live button, contained no old Live sheets, opened the DM/auth interface after leaving Live, and produced no JavaScript page exceptions in smoke tests.

The live token endpoint returned HTTP 401 to an unauthenticated request. An authenticated test account was not available, so real microphone/camera publishing, two-client playback, production room connectivity, and deployed function permissions were not verified. The presence and validity of server-side LiveKit credentials were not confirmed. The mock tests verified application behavior, not a real LiveKit connection.

Before release, deploy the token function changes and test with two signed-in accounts on an HTTPS origin. Start each mode, join from the other account, verify media playback and permission prompts, mute/unmute, send comments and reactions, share and reopen the session link, exercise reconnect behavior, and confirm the listing ends when the host leaves. Test follower-only access with a non-follower account as well.
