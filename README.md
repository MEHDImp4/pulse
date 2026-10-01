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

See [README.en.md](./README.en.md) for the full command reference, configuration options, architecture, and troubleshooting. Read [SECURITY.md](./SECURITY.md) before configuring credentials.
