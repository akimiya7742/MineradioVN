# Spotify Premium integration

Mineradio uses Spotify's official OAuth Authorization Code flow with PKCE, the Spotify Web API, and the Web Playback SDK. Spotify audio is never fetched, proxied, decoded, or replaced with a YouTube source.

## Setup

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Copy its Client ID into Mineradio's **Spotify Premium** dialog.
3. Add this loopback Redirect URI to the Spotify app settings without a port, allowing Mineradio to select a free local port:

	`http://127.0.0.1/api/spotify/callback`

	The authorization request will show the actual runtime URI, normally `http://127.0.0.1:3000/api/spotify/callback`. Spotify explicitly allows a dynamic port for a registered loopback IP literal.

4. Save and log in with an authorized Spotify Premium account.

No Client Secret is required or stored. Tokens are saved in the user's Mineradio application-data directory as `spotify_tokens.json`; the Client ID is saved separately as `spotify_config.json`.

## Supported capabilities

- Spotify account authorization and automatic token refresh.
- The top-right Spotify account button renders the authenticated user's avatar and display name, with a Spotify fallback mark when the profile has no image; it refreshes on startup/login and resets on logout.
- Catalog track search (Spotify's current limit is at most 10 results per request).
- Official Premium streaming through the Web Playback SDK.
- Play, pause, resume, seek, volume, current position, duration, Media Session controls, queue transitions, cover art, and metadata.
- Spotify Connect state adoption: tracks selected from another Spotify client update Mineradio's current queue item, artwork, metadata, lyrics, position, play/pause state, volume, shuffle/repeat mode, Discord presence, and listen session without issuing a second play command.
- While a Spotify Connect context owns playback, Mineradio's next/previous and mode controls are sent back to that Spotify context instead of replacing it with Mineradio's local queue.
- `/api/spotify/queue` proxies Spotify's parameterless `GET /v1/me/player/queue` response. During Spotify playback the visible Mineradio queue is refreshed as a bounded 10-item window: one `currently_playing` item followed by at most nine items from Spotify's `queue` array. The window is replaced on refresh rather than appended, preventing repeated SDK state events from accumulating duplicates.
- `/api/spotify/devices` exposes the user's available Spotify Connect devices. A compact device button beside the playback controls opens the refresh/transfer popover for Mineradio, a phone, speaker, or another unrestricted Spotify device; account credentials remain in the separate Spotify modal. When output is remote, Mineradio polls the official playback state and routes play/pause, seek, volume, next/previous, shuffle, and repeat commands to the selected device.
- Synced lyrics lookup through LRCLIB using Spotify track metadata.
- Clean hand-off between the HTML audio player and Spotify's SDK player, preventing both sources from playing together.

## Current platform boundaries

- Spotify Premium is required for Web Playback SDK playback.
- Development Mode apps are limited by Spotify's current authorized-user and endpoint rules. Add each test user in the Spotify dashboard.
- Spotify user refresh tokens currently expire after six months. Mineradio discards an expired token and asks the user to authorize again instead of retrying forever.
- New Development Mode apps cannot access Audio Analysis or Audio Features. Mineradio therefore does not fabricate a Spotify beat map or analyze the DRM stream.
- Spotify's policy prohibits synchronizing Spotify recordings with visual media and altering Spotify audio. During Spotify playback, Mineradio retains only its independent ambient visual state; audio-reactive analysis and beat-camera triggering remain disabled.
- The Web Playback SDK requires browser DRM/EME support. Some stock Electron builds may not include a compatible Widevine module; Mineradio reports this as an SDK initialization/device error instead of falling back to YouTube.
- Spotify's platform cannot be used for a commercial streaming integration without the appropriate Spotify approval.
