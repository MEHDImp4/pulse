# Pulse — Discord Music Bot

Per-server music queues, interactive playback controls, live progress, and reliable streaming through `yt-dlp` and FFmpeg. Built with TypeScript and discord.js, with Docker support.

## Highlights

- YouTube search and playlists, SoundCloud streams, radio URLs, and supported music-link resolution
- Independent queues and playback settings for each Discord server
- Slash commands, button controls, vote-skip, filters, lyrics, and autoplay
- Queue persistence, status reporting, and Docker deployment

## Quick start

Requirements: Node.js 24+, FFmpeg, yt-dlp, and a Discord application with a bot token.

```sh
npm install
cp .env.example .env
npm run deploy:commands
npm run dev
```

Set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` in `.env`. Add `DISCORD_GUILD_ID` for development commands scoped to one server.

**Docker / Unraid (no build required):** See [docs/DOCKER_INSTALL.md](./docs/DOCKER_INSTALL.md) for an image-based install with a guided credential setup, a Compose template, optional OAuth dashboard and Unraid configuration.

```sh
sh scripts/docker-setup.sh
docker compose up -d
```

The container synchronizes Discord slash commands automatically on startup (unless disabled). The published GHCR image will become pullable after the Docker release workflow runs from `master`. Until then, use the local build override documented in the install guide.

This README is the canonical quick start. See [docs/CAHIER_DES_CHARGES.md](./docs/CAHIER_DES_CHARGES.md) for the complete project specification and [SECURITY.md](./SECURITY.md) before configuring credentials.

## Operational safety

- `/status` displays diagnostics only for the invoking Discord server (not the other servers using this bot).
- Radio streams are opened through a DNS-pinned HTTP(S) client with public-address and per-redirect checks. FFmpeg only receives validated audio bytes, not arbitrary URLs.
- To restrict radio traffic, set `RADIO_ALLOWED_HOSTS` to a comma-separated list of exact domain names.
- The Dockerfile pins yt-dlp to a tested stable release. Runtime self-update is **disabled** by default; upgrade via an image rebuild after review.
- Live now-playing cards refresh every 5 seconds by default (`NOWPLAYING_INTERVAL_MS`, minimum 2000 ms) to reduce Discord REST traffic.

Quality gates:

```sh
npm ci
npm run typecheck
npm run build
npm test
docker build -t pulse-bot:test .
```

A real Discord voice smoke test (`/testaudio`, `/play`, `/skip`, `/leave`) is still required before public rollout.

## Search performance controls

Pulse reuses simultaneous identical metadata searches, caches short-lived
flat playlists and caps concurrent yt-dlp metadata workers to avoid CPU
and process spikes on busy servers. Audio streams are **not** cached or
blocked by this lookup limiter.

- `METADATA_MAX_CONCURRENT=3` limits simultaneous metadata subprocesses.
- `METADATA_MAX_PENDING=64` caps waiting unique lookups; excess requests fail
  quickly rather than growing an unlimited queue.
- `METADATA_CACHE_TTL_MS=600000` and `METADATA_CACHE_MAX_ENTRIES=500`
  bound the reusable metadata cache. Playlist/search cache entries are limited
  to 5 minutes and at most 100 entries per provider.

## Phase 2 — Interactive music and playlists

- `/search query:<title>` returns up to five tracks in a private select menu.
  Only the requester can pick a result, from the original voice channel,
  within 2 minutes. `/play` stays instant for users who prefer one command.
- `/playlist` accepts YouTube and Deezer public playlists.
- Spotify playlist import requires `SPOTIFY_CLIENT_ID`,
  `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_REFRESH_TOKEN`. Spotify's
  2026 API restricts `/playlists/{id}/items` to playlists owned by or
  shared with the OAuth account. Arbitrary public playlists **will not work**.
- Apple Music catalog playlists require a developer JWT in
  `APPLE_MUSIC_DEVELOPER_TOKEN` and optionally `APPLE_MUSIC_STOREFRONT`.
  User-library playlists are not covered.
- These services provide metadata only; Pulse resolves matching audio via
  the YouTube provider. Missing/region-blocked tracks are skipped.

## Phase 3 — Personal libraries

- `/favorite add`, `/favorite list`, `/favorite remove position`,
  `/favorite play position`: favorites are private to each Discord user.
- `/myplaylist save name`, `list`, `delete name`, `load name`:
  save the current song and queue, reload by resolving sources at playback.
- Personal music data is stored locally in `DATA_DIR/music-library.json` with
  atomic file replacement, up to 100 favorites and 20 lists/100 tracks per
  user. Back up `DATA_DIR` to retain this data.

## Phase 3 — Community controls

- `/djrole add|remove|list` lets a Manage Server administrator configure
  up to ten DJ roles per guild. Roles are checked on disruptive slash
  commands **and** playback buttons. Configuration persists in
  `DATA_DIR/dj-roles.json`.
- `/fairqueue` reorders the pending queue in round-robin requester order
  while keeping each user's requested song order. This is a one-time
  balancing action, not a persistent scheduling mode.

## Phase 4 — Web dashboard (OAuth Discord)

Pulse includes an optional, responsive single-process web dashboard:
- `/login` uses Discord OAuth2 Authorization Code with `identify guilds`.
- Only Manage Server members, administrators and owners can inspect/control
  their servers **where the bot is also installed**. Permissions are revalidated
  on each API request.
- Remote actions: pause, resume, skip, stop, set volume, remove/clear queue,
  and fair-queue rotation. The dashboard is read-only if the bot has not joined
  a voice channel.
- Server-side OAuth tokens stay in memory; the browser only receives an
  HttpOnly SameSite cookie and a separate CSRF token. Sessions disappear on
  reboot or OAuth token expiry.

Enable on the host:
```env
DASHBOARD_PORT=8080
DASHBOARD_BIND=127.0.0.1
DASHBOARD_PUBLIC_URL=https://pulse.example.com
DASHBOARD_CLIENT_SECRET=your_discord_oauth_client_secret
```
Register the exact Discord OAuth2 redirect
`https://pulse.example.com/oauth/callback` in the Discord developer portal.
Place a TLS reverse proxy in front of the dashboard (for Docker, the optional
`dashboard/docker-compose.dashboard.yml` exposes only 127.0.0.1:8080
to the host; adjust networking to your reverse proxy).
Never expose an HTTP dashboard publicly. CSRF and per-server guild access
are enforced by the backend, not merely the frontend.

The dashboard UI ships as static assets (no extra frontend dependencies)
with a server-list sidebar, now-playing panel, volume control, drag-and-drop
queue reordering, track search/addition, skip/stop, and Fair Queue.
Remote actions are restricted to guild admins; the frontend is not a
security boundary. A connected voice session is required to enqueue.

## Listening insights and AutoDJ
The dashboard shows per-server top 5 songs, artists, and total plays,
saved in `DATA_DIR/listening-stats.json` (no listener IDs are stored).
The AutoDJ candidate ranking prefers a similar duration/artist and
penalizes karaoke, slowed and cover versions unless those keywords
appear in the source track. Recommendations still contain randomness.

## Installer sur Unraid

Le template [Pulse-Discord-Music](./templates/unraid/pulse.xml) est conçu
pour Docker → Add Container, avec les deux champs Discord requis, AppData
persistant et aucun port ouvert par défaut. Voir le [guide Unraid](./docs/DOCKER_INSTALL.md#4-installation-native-unraid-sans-docker-compose).

Le dépôt fournit aussi le fichier `ca_profile.xml` permettant de préparer
une candidature au catalogue Community Applications. La présence de ce fichier
**ne signifie pas** que l'app a déjà été acceptée dans le catalogue Unraid.
