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

For Docker, copy `.env.docker.example` to `.env.docker`, configure the token and client ID, then run:

```sh
docker compose up -d --build
```

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
