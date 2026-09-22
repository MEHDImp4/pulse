# 🎵 Pulse

> Discord music streaming bot — per-server queue, button controls, live progress, reliable playback via `yt-dlp` + FFmpeg.

🇫🇷 [Français](./README.md) · 🇬🇧 **English**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A524-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![discord.js](https://img.shields.io/badge/discord.js-14-5865F2?logo=discord&logoColor=white)](https://discord.js.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](./Dockerfile)
[![Tests](https://img.shields.io/badge/tests-vitest-6E9F18?logo=vitest&logoColor=white)](./tests)
[![CI](https://github.com/MEHDImp4/pulse/actions/workflows/ci.yml/badge.svg)](https://github.com/MEHDImp4/pulse/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](./CODE_OF_CONDUCT.md)
[![Discussions](https://img.shields.io/badge/Discussions-open-5865F2?logo=discord&logoColor=white)](https://github.com/MEHDImp4/pulse/discussions)

---

## ✨ Features

- 🔎 **YouTube search** or direct URL playback, with **autocomplete** on `/play`
- 🌐 **Multi-source**: SoundCloud (real stream), radio / direct URLs, and **Spotify / Deezer / Apple Music** links resolved to a YouTube search
- 📃 **Per-server queue** (no cross-guild mixing) with **pagination**
- 🎧 **One voice session per server**: Discord allows a bot in only one voice channel per server; several servers can run in parallel, with independent queues and settings
- 📚 **YouTube playlists**: import by URL (`/playlist` or `/play` with a playlist link)
- ♾️ **Radio (autoplay)**: on by default, chains related tracks when the queue empties; member-queued tracks stay first (`/autoplay` to disable)
- 🎛️ **Audio filters**: bassboost, nightcore, vaporwave, 8D, treble, loudness normalization (`/filter`)
- 🎤 **Synced lyrics** via lrclib (`/lyrics`)
- 📊 **Observability**: `/status` (uptime, active sessions, voice latency, memory, `yt-dlp`/FFmpeg status, child processes)
- ⏩ **Seek** and **previous track**: navigate within a track (`/seek`, `/previous`, ⏪/⏩ buttons)
- 💾 **Persistence & resume**: per-channel queues, and the bot rejoins and resumes its session after a restart
- 🔁 **Loop** track / queue, 🔀 **shuffle**, ⏭ **play next** (`/playnext`)
- ⏯️ **Button controls**: pause, resume, skip, stop, vote-skip, volume
- 📊 **Live progress** in `/nowplaying` (bar + elapsed/total time)
- 🗳️ **Vote-skip** by majority (min. 2 votes) for group listening
- 🛡️ **DJ controls**: skip / stop / seek / clear / remove / shuffle / loop require the "Manage Server" permission; other members can **vote** to skip
- 🔊 **Live volume** control (0–100), shown on the now-playing card
- 🚀 **Reliability**: automatic stream retry, **SponsorBlock**, `yt-dlp` cookies, `yt-dlp` self-update on start
- 🛡️ **Anti-spam**: per-user, per-command cooldowns
- 🐳 **Production-ready Docker**: healthcheck, tini (PID 1), graceful shutdown

## 🎮 Commands

| Command | Description |
|---|---|
| `/play query:<text or URL>` | Search or queue a track (autocomplete, playlists) |
| `/playnext query:<text or URL>` | Insert a track right after the current one |
| `/playlist url:<URL> [limit:<n>]` | Import a YouTube playlist into the queue |
| `/pause` · `/resume` | Pause / resume playback |
| `/skip` | Skip to the next track (votes for non-moderators) |
| `/forceskip` | Force skip to the next track ("Manage Server" permission) |
| `/previous` | Replay the previous track |
| `/voteskip` | Vote to skip the current track |
| `/stop` | Stop playback and clear the queue |
| `/queue` | Show the queue (paginated) |
| `/nowplaying` | Current track + live progress bar |
| `/seek position:<seconds\|mm:ss>` | Move playback to a position |
| `/filter preset:<…>` | Apply an audio filter (shows the current one if omitted) |
| `/lyrics [query:<text>]` | Show lyrics (current track or a search) |
| `/loop mode:<off\|track\|queue>` | Repeat: off, track or queue |
| `/autoplay mode:<on\|off>` | Enable/disable chaining of related tracks |
| `/shuffle` | Shuffle the queue |
| `/remove position:<n>` | Remove a track from the queue |
| `/clear` | Clear the queue |
| `/volume level:<0-100>` | Set the volume (shows current volume if omitted) |
| `/leave` | Disconnect the bot from the voice channel |
| `/testaudio` | Play a local 3 s tone to test voice |
| `/status` | Bot status: uptime, guilds, sessions, latency, memory, tools, processes |
| `/help` | List commands |

## ✅ Requirements

- **Node.js 24+**
- **FFmpeg** and **yt-dlp** available in `PATH` (bundled in the Docker image)
- A **Discord bot** with permissions: *View Channel, Connect, Speak, Send Messages, Embed Links, Use Application Commands*

> Note: user-facing bot messages are in French.

## 🚀 Quick start

### Docker (recommended)

```bash
cp .env.docker.example .env.docker   # set DISCORD_TOKEN and DISCORD_CLIENT_ID
docker compose up -d --build
docker compose logs -f
```

### Local

```bash
npm install
cp .env.example .env                 # set DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
npm run deploy:commands              # register slash commands
npm run dev                          # tsx watch
```

Production locally: `npm run build && npm start`.

## ⚙️ Configuration

All variables are optional unless stated otherwise.

| Variable | Default | Description |
|---|---|---|
| `DISCORD_TOKEN` | — | **Required.** Bot token |
| `DISCORD_CLIENT_ID` | — | **Required.** Application ID |
| `DISCORD_GUILD_ID` | — | Dev guild (instant commands). Empty → global commands |
| `LOG_LEVEL` | `info` | pino log level |
| `MAX_QUEUE_SIZE` | `100` | Max queue size per server |
| `MAX_TRACK_DURATION_MINUTES` | `180` | Max track duration (0 = unlimited) |
| `MAX_STREAM_RETRIES` | `2` | Playback attempts before giving up on a track |
| `STREAM_START_TIMEOUT_MS` | `20000` | Max delay before a stream is considered stalled (then retried) |
| `IDLE_TIMEOUT_SECONDS` | `300` | Auto-disconnect after inactivity |
| `EMPTY_CHANNEL_TIMEOUT_SECONDS` | `60` | Auto-disconnect when the channel is empty |
| `COMMAND_COOLDOWN_SECONDS` | `5` | Default anti-spam cooldown |
| `AUTO_DELETE_SECONDS` | `1` | Auto-delete confirmation replies (0 = disabled; messages with buttons are kept) |
| `SPONSORBLOCK_CATEGORIES` | `sponsor,selfpromo` | Segments skipped via SponsorBlock |
| `YTDLP_COOKIES_FILE` | — | `yt-dlp` cookies (restricted / anti-bot videos) |
| `YTDLP_AUTO_UPDATE` | `true` | Update `yt-dlp` on container start |
| `NOWPLAYING_LIVE` | `true` | Refresh the progress bar |
| `NOWPLAYING_INTERVAL_MS` | `1000` | Now-playing card refresh interval (ms) |
| `VOTE_SKIP_MIN` / `VOTE_SKIP_RATIO` | `2` / `0.5` | Vote-skip threshold |
| `VOLUME_STEP` | `5` | Volume button step |
| `SEEK_STEP_SECONDS` | `10` | Seek button step (⏪/⏩) |
| `VOLUME_HEADROOM_DB` / `VOLUME_RANGE_DB` | `3` / `30` | Perceptual volume curve (dB) |
| `AUTOCOMPLETE_ENABLED` | `true` | Autocomplete on `/play` |
| `PLAYLIST_MAX_ITEMS` | `50` | Max tracks imported per playlist |
| `AUTOPLAY_DEFAULT` | `true` | Autoplay (radio) on by default: chains related tracks when the queue empties |
| `AUTOPLAY_MAX_CONSECUTIVE` | `1000` | Cap on chained tracks (0 = unlimited) |
| `AUTOPLAY_HISTORY` | `100` | Number of recent tracks excluded when picking the next one |
| `AUTOPLAY_RETRY_MS` | `30000` | Retry delay when autoplay finds nothing (stays connected) |
| `AUTOPLAY_EMPTY_TIMEOUT_SECONDS` | `1800` | Empty-channel disconnect delay while autoplay is active |
| `QUEUE_PERSIST` | `true` | Persist per-channel queues to resume after a restart |
| `QUEUE_PERSIST_DEBOUNCE_MS` | `1000` | Write debounce for persisted queues |
| `RESUME_ON_STARTUP` | `true` | Rejoin the last channel and resume the session on startup |
| `RESUME_MAX_AGE_MINUTES` | `1440` | Only resume sessions saved within the last N minutes |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | — | Spotify credentials (enables Spotify → YouTube link resolution) |
| `LYRICS_ENABLED` | `true` | Enable `/lyrics` |
| `LYRICS_API_BASE` | `https://lrclib.net` | Lyrics API base URL |
| `LYRICS_TIMEOUT_MS` | `8000` | Lyrics request timeout |
| `YTDLP_PATH` / `FFMPEG_PATH` | `yt-dlp` / `ffmpeg` | Binary paths |
| `METADATA_CACHE_TTL_MS` | `600000` | `yt-dlp` metadata cache lifetime (0 = disabled) |
| `METADATA_CACHE_MAX_ENTRIES` | `500` | Max metadata cache entries |
| `DATA_DIR` | `data` (`/data` in Docker) | Persistence directory for settings and queues |

## 🐳 Docker

The `node:24-bookworm-slim` image bundles FFmpeg and `yt-dlp`, and includes:

- **`HEALTHCHECK`** based on the process (`pgrep`) → `healthy` state
- **`init: true`** → tini as PID 1 (signal forwarding + zombie reaping)
- **`stop_grace_period: 15s`** → time to drain voice connections and kill `yt-dlp`
- **Graceful shutdown**: disconnect message, player teardown, `SIGTERM → SIGKILL` on child processes
- **`yt-dlp` update** on start (`docker-entrypoint.sh`, non-blocking)

## 🏗️ Architecture

```text
Discord
  ↓
discord.js (Client)
  ↓
PlayerManager ──► GuildPlayer (one per server) + QueueManager
                        ↓
                   AudioPipeline ──► AudioProvider
                        ↓                 ↓
                     FFmpeg         YouTubeProvider ──► yt-dlp
                        ↓
                 @discordjs/voice
                        ↓
                  Discord Voice
```

- `GuildPlayer` holds the state of one session (server + voice channel): queue, loop mode, volume, skip votes, now-playing message. Since Discord allows only one voice channel per server per bot, a single session is active per server; several servers run in parallel. A second session from another channel in the same server is refused with an explicit message.
- `decideNext()` (a pure function) determines the next track according to the loop mode.
- **YouTube URLs are validated** and the **direct stream is resolved just-in-time** (avoids expiry while queued).
- Autocomplete uses a fast suggestions endpoint (never `yt-dlp`, too slow for Discord's 3 s limit).

## 📁 Structure

```text
src/
  commands/        # one file per command + barrel + helpers/types
  interactions/    # buttons (music, queue pagination)
  music/           # GuildPlayer, PlayerManager, QueueManager, decideNext…
  audio/           # AudioPipeline (FFmpeg)
  providers/       # ProviderRegistry (YouTube, SoundCloud, radio, Spotify/Deezer/Apple), AudioProvider
  services/        # suggestions (autocomplete), nowPlaying (live progress)
  ui/              # embeds, buttons, progress bar
  utils/           # logger, cooldown, time, process
  config/          # env
tests/             # vitest (pure logic)
```

## 🧪 Tests

```bash
npm test
```

Covers pure logic: queue operations, `decideNext` (loop), cooldowns, vote-skip threshold, progress bar, suggestion parsing and guild isolation.

## 🔒 Security

- The Discord token is **never committed** (`.env` and `.env.docker` are git-ignored).
- `yt-dlp` and FFmpeg are spawned with an **argument list** (`shell: false`) — no shell command built from user input.
- URLs are validated as YouTube before resolution; external processes have timeouts and are cleaned up on shutdown.

To report a vulnerability, see [SECURITY.md](./SECURITY.md).

## 🛠️ Troubleshooting

| Symptom | Hint |
|---|---|
| "An invalid token was provided" | Check `DISCORD_TOKEN` in `.env.docker` / `.env` |
| `yt-dlp not found` / `FFmpeg not found` | Install the binary or set `YTDLP_PATH` / `FFMPEG_PATH`; status is shown in `/status` |
| Bot joins but no sound | Check *Connect* + *Speak* permissions and opus libs; test with `/testaudio` |
| Voice connection failure | Check channel permissions and `VOICE_CONNECTION_TIMEOUT_MS`, then retry the command |
| `yt-dlp` fails on some videos | Provide `YTDLP_COOKIES_FILE` (restricted/anti-bot videos) |
| Commands missing in Discord | Run `npm run deploy:commands` then `Ctrl+R` in Discord |
| Duplicate commands or "This command is outdated" | Mixed global/guild scope: run `npm run deploy:commands` (it clears the other scope) then `Ctrl+R` |

## 🤝 Contributing

Contributions are welcome! Read [CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md) before opening a PR. For bugs or ideas, use the [issues](https://github.com/MEHDImp4/pulse/issues); for questions, use [Discussions](https://github.com/MEHDImp4/pulse/discussions). Report security issues privately (see [SECURITY.md](./SECURITY.md)).

## 📄 License

[MIT](./LICENSE) © 2026 Mehdi Diouri
