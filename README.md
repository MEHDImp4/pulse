<p align="center"><img src="assets/pulse-icon.png" width="128" height="128" alt="Pulse — logo casque et onde musicale" /></p>

<h1 align="center">Pulse</h1>

<p align="center"><strong>Your music. Your server. Your rules.</strong></p>

<p align="center">A self-hosted Discord music bot with interactive playback, personal playlists, community controls, and an optional web dashboard.</p>

<p align="center"><strong>TypeScript · discord.js · yt-dlp · FFmpeg</strong></p>

<p align="center">
  <a href="https://github.com/MEHDImp4/pulse/actions/workflows/ci.yml"><img src="https://github.com/MEHDImp4/pulse/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI" /></a>
  <a href="https://github.com/MEHDImp4/pulse/actions/workflows/codeql.yml"><img src="https://github.com/MEHDImp4/pulse/actions/workflows/codeql.yml/badge.svg?branch=master" alt="CodeQL" /></a>
  <a href="https://github.com/MEHDImp4/pulse/actions/workflows/docker-publish.yml"><img src="https://github.com/MEHDImp4/pulse/actions/workflows/docker-publish.yml/badge.svg?branch=master" alt="Docker publish" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-8A73FF.svg" alt="MIT License" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-24%2B-377F55.svg" alt="Node.js 24+" /></a>
</p>

<p align="center">
  <a href="#quick-start">Get started</a> ·
  <a href="#unraid">Unraid</a> ·
  <a href="#discord-commands">Commands</a> ·
  <a href="#optional-web-dashboard">Web dashboard</a> ·
  <a href="README.fr.md">Français</a>
</p>

---

## Why Pulse?

Pulse brings music into your Discord voice channels without handing control to a third-party hosted bot. Run it on **Unraid, Docker, a VPS, or your own computer**. Each Discord server gets its own playback sessions and queue, while the music library and settings persist across restarts.

| Music | Community | Self-hosting |
|:--|:--|:--|
| YouTube search, links and playlists | Personal favorites and saved playlists | Ready-to-use Docker image |
| SoundCloud and supported public radio streams | Configurable DJ roles and vote-skip | Unraid template with persistent AppData |
| Spotify, Deezer and Apple Music link resolution¹ | Fair Queue and interactive controls | Automatic slash-command registration |
| Autoplay, audio filters and lyrics | Independent server queues | Optional local-password or Discord OAuth2 web dashboard |

¹ **Important:** Spotify, Deezer and Apple Music are metadata/link providers, **not direct premium-audio streaming sources**. Pulse searches for corresponding playable tracks through its supported audio providers. Spotify playlist import requires access to a playlist owned by or shared with the OAuth account; Apple Music catalog playlist import requires a developer token. Availability can vary by source and region.

## Quick start

### 1. Create a Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications), create an application and configure its **Bot**.
2. Copy the **Bot Token** and the **Application ID** (also called Client ID).
3. Invite the bot to your server with the `bot` and `applications.commands` scopes. Give it the permissions needed for **View Channels**, **Connect**, **Speak**, **Send Messages** and **Embed Links**.
4. Optionally copy your **Discord Guild ID** to register commands immediately in one test server.

> **Keep your Bot Token private.** Never commit it, paste it into an issue, or include it in a screenshot. If exposed, regenerate it in the Discord Developer Portal.

### 2. Choose your installation method

| Platform | Best for | Installation |
|---|---|---|
| **Unraid** | Homelabs and NAS servers | [Open the Unraid instructions](#unraid) |
| **Docker Compose** | Linux, VPS and other Docker hosts | [Use the prebuilt image](#docker-compose) |
| **Node.js** | Development and contributors | [Run from source](#run-from-source) |

### Unraid

**No Node.js, FFmpeg or Docker Compose setup is required on the Unraid host.** Pulse has a native [Unraid Docker template](templates/unraid/pulse.xml) named **Pulse-Discord-Music**.

Until the application is approved for Unraid **Community Applications**, install its template once from the Unraid terminal:

```sh
mkdir -p /boot/config/plugins/dockerMan/templates-user
wget -q -O /boot/config/plugins/dockerMan/templates-user/my-pulse-discord-music.xml \
  https://raw.githubusercontent.com/MEHDImp4/pulse/master/templates/unraid/pulse.xml
```

Then open **Unraid → Docker → Add Container → Template → Pulse-Discord-Music** and fill in:

| Field | Value |
|---|---|
| **Discord Bot Token** | Your secret bot token |
| **Discord Application ID** | Your application's numeric ID |
| AppData | `/mnt/user/appdata/pulse-discord-music` (default) |
| Dashboard | Disabled by default; optional |

Select **Apply**. Pulse downloads its container image, persists its configuration under `/data`, and registers slash commands on startup.

**Community Applications status:** the repository contains the template and `ca_profile.xml`, but this **does not mean** Pulse is already listed in the public Unraid Apps catalog. Submission and approval are separate steps. See the [complete Unraid guide](docs/DOCKER_INSTALL.md#4-installation-native-unraid-sans-docker-compose).

> The image is hosted at `ghcr.io/mehdimp4/pulse:latest`. A successful GitHub Actions publish does not by itself guarantee anonymous downloads: the GHCR package must also be set to **Public**. See [Troubleshooting](#troubleshooting).

### Docker Compose

Requires Docker Engine, Docker Compose v2 and Git. The regular installation **pulls a prebuilt image**; it does not compile the source.

```sh
git clone https://github.com/MEHDImp4/pulse.git
cd pulse

# Interactive setup: Discord credentials and optional dashboard
sh scripts/docker-setup.sh

docker compose pull
docker compose up -d
docker compose logs -f bot
```

The setup wizard saves credentials to `.env.docker` with restricted file permissions. Music and settings survive container recreation in the `pulse-data` Docker volume.

**Update Pulse:**

```sh
docker compose pull
docker compose up -d
```

Need a local development build instead? See [the Docker install guide](docs/DOCKER_INSTALL.md).

### Run from source

Requires **Node.js 24.17+**, **FFmpeg**, **yt-dlp** and a Discord application.

```sh
git clone https://github.com/MEHDImp4/pulse.git
cd pulse
npm ci
cp .env.example .env

# Set DISCORD_TOKEN and DISCORD_CLIENT_ID in .env
npm run deploy:commands
npm run dev
```

Set `DISCORD_GUILD_ID` if you want slash commands registered only in your test server. Use `npm run build` and `npm start` for a compiled local run.

## Discord commands

Join a voice channel first, then try `/play`. Most actions work as native Discord slash commands; you do not need to memorize text prefixes.

Music commands (`/play`, `/playnext`, `/playlist`) use **private, short-lived confirmations** (controlled by `AUTO_DELETE_SECONDS`, default 1 second). The shared **Now Playing** card is posted separately, stays interactive, and is updated instead of creating duplicate cards. Pulse needs **Send Messages** and **Embed Links** permissions in the text channel.



**Whole-queue caching (new):** Pulse progressively downloads **every supported pending track**, not just the immediately next song, storing compressed audio in `DATA_DIR/audio-cache`. Earlier queued tracks get priority. A **1 GB global disk budget** is shared across Discord guilds, with **two concurrent downloads** and a **64 MB per-track limit**. Completed downloads survive restarts, with low-priority items evicted as the cache fills. Live radio and unsupported streams are never cached. The existing just-in-time next-track Opus preparation still handles the final transition. Settings: `CACHE_QUEUE_AUDIO`, `QUEUE_CACHE_MAX_MB`, `QUEUE_CACHE_TRACK_MAX_MB`, `QUEUE_CACHE_CONCURRENCY`, `QUEUE_CACHE_DOWNLOAD_TIMEOUT_MS`.

**Playback stability diagnostics:** `/status` now shows queue cache readiness, transition start latency (average and rolling p95 over the last 50 transitions), recovered stalls, cached versus streamed playback, and player errors. Counters are per guild session; other guilds' track metadata is never shown. Transitions longer than one second appear in server logs. This measures bot-side start latency rather than acoustic silence.

This greatly reduces gaps for already-downloaded tracks, but cannot guarantee **zero interruptions** if downloads are incomplete, the network is slow, a source is restricted or disk space is exhausted. Enabling it increases network and disk usage.

**Faster track transitions:** when the current song has a known duration and the next queue track exists, Pulse warms its audio stream **25 seconds before the end**. At most one next track is prepared per server, with process cleanup on queue changes, stops and failures. Preloading cannot guarantee zero silence with slow sources or unknown-duration tracks. Docker/Unraid settings: `PRELOAD_NEXT_TRACK`, `PRELOAD_LEAD_SECONDS`, `PRELOAD_TIMEOUT_MS`, and `PRELOAD_SWITCH_WAIT_MS`.

| Command | What it does |
|---|---|
| `/play query:<title or URL>` | Search or queue a track; also recognizes supported playlists |
| `/search query:<title>` | Pick from up to five results using a private Discord menu |
| `/playlist url:<URL> [limit:<n>]` | Import a supported playlist |
| `/queue`, `/nowplaying` | See what is queued and currently playing |
| `/pause`, `/resume`, `/skip`, `/stop` | Playback controls |
| `/playnext`, `/previous`, `/remove`, `/shuffle`, `/clear` | Manage the queue |
| `/loop`, `/autoplay`, `/filter`, `/volume`, `/seek` | Customize playback |
| `/quality [normalize] [trim_silence] [fade] [crossfade]` | Independent normalization, intro silence trimming, fades and optional crossfade |
| `/favorite add`, `/favorite list`, `/favorite play` | Your personal favorites |
| `/myplaylist save`, `/myplaylist list`, `/myplaylist load` | Save and replay your own playlists |
| `/djrole add`, `/djrole remove`, `/djrole list` | Configure DJ roles (Manage Server required) |
| `/fairqueue` | Rotate queued requests fairly between users |
| `/party [mode:on|off] [limite:1..10]` | Persistent Party Mode with a per-user pending-song cap |
| `/voteskip` | Vote to skip a track |
| `/lyrics` | Look up lyrics when available |
| `/status`, `/testaudio`, `/help`, `/leave` | Diagnostics, help and voice management |

For a complete list of options, use **`/help` in Discord**. A configured DJ role or the **Manage Server** permission is required for certain disruptive queue/playback controls. `/fairqueue` rearranges the existing queue **once**; it is not a continuously enabled scheduling mode.

> The search menu is bound to the requesting user and voice channel and expires after two minutes. Your favorites and personal playlists are stored separately for each Discord user.

### Audio quality and optional crossfade

Use `/quality` to change settings **per voice channel**: `normalize:true` enables FFmpeg loudness normalization independently of Bass Boost or other effects, `trim_silence:true` removes **leading** silent segments only (never pauses mid-song), and `fade:0..5` controls short track-boundary fades. All options persist per voice session and can be turned off. **Normalization and silence trimming default to off** to preserve the original sound, while the existing fade remains **2 seconds** by default.

`/quality crossfade:3` opts into a **real three-second audio overlap**: for non-live tracks with known durations, once **both songs are fully cached**, FFmpeg blends the previous song's tail with the next song's opening before continuing playback of the next song. Crossfade is **disabled by default**; it requires the `off` preset and silence trimming disabled. Missing audio, changed queue order, unusual timing or failed preparation falls back to normal standby playback. Manual `/skip` and `/seek` retain their original behavior.

Crossfade intentionally overlaps song boundaries; inaccurate track durations can affect timing. Start with `crossfade:2` or `crossfade:3` on a short playlist with cached tracks. Normalization and trimming may add some CPU overhead.

### Persistent Party Mode and interactive queue

`/party mode:on` enables continuous round-robin fairness whenever tracks are added, removed or played. Each user may have **3 pending songs by default**; change this with `/party limite:5` (1–10). Already queued tracks are preserved and reordered; the cap applies only to future additions. Only DJ-authorized members can change Party Mode. Single-track looping is disabled during Party Mode so other users' tracks can advance. `/party mode:off` restores ordinary manual queue ordering.

`/queue` now includes a **track selector** on every page. DJs in the bot's voice channel can move the selected track up/down or remove it using private buttons. Stale selections are rejected, and manual reordering is disabled while Party Mode is active.

The optional dashboard supports a local-password login on Unraid or Discord OAuth2 over HTTPS. It can toggle Party Mode, show guild-local cache and audio diagnostics, and control playback with session and CSRF checks.

## Optional web dashboard

Pulse includes a responsive playback, queue, Party Mode and audio-health dashboard.

**Easy local Unraid setup — no Discord OAuth needed:**

1. Open **Docker → Pulse-Discord-Music → Edit** and set
   **Dashboard - Activer** to `true`.
2. Choose the **Dashboard - Port Web (Unraid)**, initially `8090`
   or an available host port such as `8095`.
3. Set a unique **Dashboard - Mot de passe local** with at least
   12 characters, then click **Apply**.
4. Use the container's **WebUI** shortcut or open
   `http://UNRAID_LAN_IP:YOUR_PORT` from your trusted local network.

There is **no requirement for a domain, Discord OAuth client secret,
HTTPS reverse proxy or redirect URI** on a private, trusted LAN.
The local password grants control over all Discord guilds the bot has
joined. **Never forward the plain HTTP port to the Internet or access it
on an untrusted network.**

[Unraid dashboard mini-guide](docs/UNRAID_DASHBOARD.md) ·
[Full Docker deployment instructions](docs/DOCKER_INSTALL.md)

**Advanced remote setup with Discord OAuth2 + HTTPS:**

```dotenv
DASHBOARD_ENABLED=true
DASHBOARD_AUTH_MODE=discord
DASHBOARD_PORT=8080
DASHBOARD_PUBLIC_URL=https://pulse.example.com
DASHBOARD_CLIENT_SECRET=YOUR_DISCORD_OAUTH_CLIENT_SECRET
```

Register `https://pulse.example.com/oauth/callback` in
**Discord Developer Portal → OAuth2 → Redirects**, run the
`dashboard/docker-compose.dashboard.yml` Compose overlay and place
it behind an HTTPS reverse proxy. In this mode the server verifies
Manage Server / Administrator permissions through Discord OAuth2.

## Configuration

Only two credentials are required: `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Everything else is optional.

| Environment variable | Default | Purpose |
|---|---|---|
| `DISCORD_GUILD_ID` | Empty | Register slash commands in one Discord server (instead of globally) |
| `DATA_DIR` | `/data` in Docker | Persistent queues, personal playlists, DJ roles and statistics |
| `MAX_QUEUE_SIZE` | `100` | Maximum pending tracks |
| `PLAYBACK_MAX_PENDING` | `12` | Maximum waiting music commands per Discord server |
| `PLAYBACK_WAIT_TIMEOUT_MS` | `30000` | Maximum wait for playback admission, in milliseconds |
| `PLAYLIST_MAX_ITEMS` | `50` | Tracks imported per playlist |
| `AUTOPLAY_DEFAULT` | `true` | Automatically suggest related tracks |
| `QUEUE_PERSIST` | `true` | Save and resume queues across restarts |
| `NOWPLAYING_INTERVAL_MS` | `5000` | Live now-playing refresh interval |
| `METADATA_MAX_CONCURRENT` | `3` | Limit concurrent metadata lookups |
| `RADIO_ALLOWED_HOSTS` | Empty | Optional hostname allowlist for public radio streams |
| `DASHBOARD_ENABLED` | `false` | Enable/disable the optional dashboard |
| `DASHBOARD_PORT` | `8090` when enabled | Internal HTTP port; Unraid host port is configurable |
| `DASHBOARD_AUTH_MODE` | `local` | Local password or Discord OAuth2 login |
| `DASHBOARD_PASSWORD` | Empty | Required for local mode, at least 12 characters |

See [`.env.docker.example`](.env.docker.example) for Docker options and [`.env.example`](.env.example) for local development. Spotify and Apple Music integrations require additional optional credentials; see [the detailed documentation](docs/DOCKER_INSTALL.md).

### Data and backups

- **Docker Compose:** keep the `pulse-data` named volume.
- **Unraid:** back up `/mnt/user/appdata/pulse-discord-music`.
- **Source install:** back up the directory configured through `DATA_DIR`.

Queue state, favorites, DJ roles and listening statistics are stored locally. Deleting the persistent volume or AppData directory can erase them.

## How it works

```text
Discord slash commands / buttons       Optional local / OAuth2 dashboard
                 │                               │
                 └───────────────┬───────────────┘
                                 ▼
                        PlayerManager
                        ├─ per-guild players
                        ├─ queue persistence
                        └─ DJ permissions
                                 │
                                 ▼
                      Audio / metadata providers
                  YouTube · SoundCloud · public radio
                  Spotify · Deezer · Apple Music¹
                                 │
                                 ▼
                        yt-dlp + FFmpeg
                                 │
                                 ▼
                         Discord Voice
```

Pulse uses short-lived metadata caching, bounded lookup concurrency, stream retry/stall recovery and a sandboxed approach to radio URL handling. Stream URLs are resolved as needed; **Pulse does not keep a permanent cache of downloaded music**.

## Troubleshooting

| Problem | What to check |
|---|---|
| GHCR image cannot be pulled | Confirm the [Docker publish workflow](https://github.com/MEHDImp4/pulse/actions/workflows/docker-publish.yml) succeeded and the package is public |
| Bot starts but commands are missing | Check `DISCORD_CLIENT_ID`, bot invite scopes, `DISCORD_GUILD_ID` and startup logs; global commands can take time to propagate |
| No sound / stream errors | Try `/testaudio`; check the container logs and source availability; some videos are region-restricted or unavailable |
| Playlists are empty | Verify the source URL, access restrictions and `PLAYLIST_MAX_ITEMS` |
| Unraid cannot save data | Verify the AppData mount points to `/data` and inspect container logs; avoid deleting the AppData directory |
| Dashboard login fails | In LAN mode check private IP, mapped port, password and enabled flag; in OAuth mode check HTTPS, redirect URI and Discord permissions |

Logs: `docker compose logs --tail=100 bot`. For Unraid, use the container's **Logs** menu. If you're still stuck, [open a GitHub issue](https://github.com/MEHDImp4/pulse/issues/new) **without including credentials**.

## Development and security

```sh
npm ci
npm run typecheck
npm run build
npm test
docker build -t pulse:test .
```

CI runs TypeScript checks, tests and Docker builds. Security analysis uses CodeQL. **Passing CI does not replace a live Discord voice playback test**, especially after changes to discord.js voice, yt-dlp, FFmpeg or the host network.

- [Contributing guide](CONTRIBUTING.md)
- [Security policy / private vulnerability reporting](SECURITY.md)
- [Docker and Unraid deployment guide](docs/DOCKER_INSTALL.md)
- [Unraid local dashboard mini-guide](docs/UNRAID_DASHBOARD.md)
- [Original project specification](docs/CAHIER_DES_CHARGES.md)
- [Issues and suggestions](https://github.com/MEHDImp4/pulse/issues)

Pulse is open source under the [MIT License](LICENSE). It is not affiliated with Discord, YouTube, Spotify, Deezer, Apple Music or SoundCloud. Use music sources in accordance with their terms and applicable law.

<p align="center"><strong>Built for shared listening. Hosted by you.</strong></p>

<p align="center"><a href="#pulse">Back to top</a> · <a href="README.fr.md">Documentation en français</a></p>
