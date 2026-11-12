<div align="center">

# Pulse

**Your music. Your server. Your rules.**

A self-hosted Discord music bot with interactive playback, personal playlists, community controls, and an optional web dashboard.

Built with **TypeScript · discord.js · yt-dlp · FFmpeg**

[![CI](https://github.com/MEHDImp4/pulse/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/MEHDImp4/pulse/actions/workflows/ci.yml)
[![CodeQL](https://github.com/MEHDImp4/pulse/actions/workflows/codeql.yml/badge.svg?branch=master)](https://github.com/MEHDImp4/pulse/actions/workflows/codeql.yml)
[![Docker](https://github.com/MEHDImp4/pulse/actions/workflows/docker-publish.yml/badge.svg?branch=master)](https://github.com/MEHDImp4/pulse/actions/workflows/docker-publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-8A73FF.svg)](LICENSE)
[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-377F55.svg)](https://nodejs.org/)

[**Get started**](#quick-start) · [**Unraid**](#unraid) · [**Commands**](#discord-commands) · [**Web dashboard**](#optional-web-dashboard) · [**Français**](README.fr.md)

</div>

---

## Why Pulse?

Pulse brings music into your Discord voice channels without handing control to a third-party hosted bot. Run it on **Unraid, Docker, a VPS, or your own computer**. Each Discord server gets its own playback sessions and queue, while the music library and settings persist across restarts.

| Music | Community | Self-hosting |
|:--|:--|:--|
| YouTube search, links and playlists | Personal favorites and saved playlists | Ready-to-use Docker image |
| SoundCloud and supported public radio streams | Configurable DJ roles and vote-skip | Unraid template with persistent AppData |
| Spotify, Deezer and Apple Music link resolution¹ | Fair Queue and interactive controls | Automatic slash-command registration |
| Autoplay, audio filters and lyrics | Independent server queues | Optional Discord OAuth2 web dashboard |

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

Need a local development build instead? See [the Docker install guide](docs/DOCKER_INSTALL.md#5-build-local-de-developpement).

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

| Command | What it does |
|---|---|
| `/play query:<title or URL>` | Search or queue a track; also recognizes supported playlists |
| `/search query:<title>` | Pick from up to five results using a private Discord menu |
| `/playlist url:<URL> [limit:<n>]` | Import a supported playlist |
| `/queue`, `/nowplaying` | See what is queued and currently playing |
| `/pause`, `/resume`, `/skip`, `/stop` | Playback controls |
| `/playnext`, `/previous`, `/remove`, `/shuffle`, `/clear` | Manage the queue |
| `/loop`, `/autoplay`, `/filter`, `/volume`, `/seek` | Customize playback |
| `/favorite add`, `/favorite list`, `/favorite play` | Your personal favorites |
| `/myplaylist save`, `/myplaylist list`, `/myplaylist load` | Save and replay your own playlists |
| `/djrole add`, `/djrole remove`, `/djrole list` | Configure DJ roles (Manage Server required) |
| `/fairqueue` | Rotate queued requests fairly between users |
| `/voteskip` | Vote to skip a track |
| `/lyrics` | Look up lyrics when available |
| `/status`, `/testaudio`, `/help`, `/leave` | Diagnostics, help and voice management |

For a complete list of options, use **`/help` in Discord**. A configured DJ role or the **Manage Server** permission is required for certain disruptive queue/playback controls. `/fairqueue` rearranges the existing queue **once**; it is not a continuously enabled scheduling mode.

> The search menu is bound to the requesting user and voice channel and expires after two minutes. Your favorites and personal playlists are stored separately for each Discord user.

## Optional web dashboard

Pulse includes a responsive browser dashboard for managing playback, the queue and listening statistics.

- Sign in with **Discord OAuth2**; no bot token is sent to your browser.
- View only servers where you have **Manage Server** / administrator permissions and Pulse is installed.
- Pause, resume, skip, stop, change volume, add tracks, clear or reorder the queue using drag-and-drop.
- View each server's most-played songs, popular artists and playback counts.

The dashboard is **disabled by default**. To enable it with Docker Compose:

1. Add these settings to `.env.docker` (replace the example values):

   ```dotenv
   DASHBOARD_PORT=8080
   DASHBOARD_PUBLIC_URL=https://pulse.example.com
   DASHBOARD_CLIENT_SECRET=YOUR_DISCORD_OAUTH_CLIENT_SECRET
   ```

2. Register the exact redirect URI `https://pulse.example.com/oauth/callback` in **Discord Developer Portal → OAuth2 → Redirects**.
3. Run the optional dashboard Compose overlay:

   ```sh
   docker compose -f docker-compose.yml \
     -f dashboard/docker-compose.dashboard.yml up -d
   ```

4. Configure a **TLS/HTTPS reverse proxy** in front of the dashboard. The Compose overlay publishes the port only to `127.0.0.1` on the Docker host; a proxy running in another container needs appropriate shared networking.

**Never publish the dashboard's HTTP port directly to the internet.** On Unraid, follow the [dashboard-specific instructions](docs/DOCKER_INSTALL.md#dashboard-sur-unraid). The dashboard controls an **existing connected voice session**; starting a new voice connection still happens through Discord.

## Configuration

Only two credentials are required: `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Everything else is optional.

| Environment variable | Default | Purpose |
|---|---|---|
| `DISCORD_GUILD_ID` | Empty | Register slash commands in one Discord server (instead of globally) |
| `DATA_DIR` | `/data` in Docker | Persistent queues, personal playlists, DJ roles and statistics |
| `MAX_QUEUE_SIZE` | `100` | Maximum pending tracks |
| `PLAYLIST_MAX_ITEMS` | `50` | Tracks imported per playlist |
| `AUTOPLAY_DEFAULT` | `true` | Automatically suggest related tracks |
| `QUEUE_PERSIST` | `true` | Save and resume queues across restarts |
| `NOWPLAYING_INTERVAL_MS` | `5000` | Live now-playing refresh interval |
| `METADATA_MAX_CONCURRENT` | `3` | Limit concurrent metadata lookups |
| `RADIO_ALLOWED_HOSTS` | Empty | Optional hostname allowlist for public radio streams |
| `DASHBOARD_PORT` | `0` | Enable the optional OAuth2 dashboard |

See [`.env.docker.example`](.env.docker.example) for Docker options and [`.env.example`](.env.example) for local development. Spotify and Apple Music integrations require additional optional credentials; see [the detailed documentation](docs/DOCKER_INSTALL.md).

### Data and backups

- **Docker Compose:** keep the `pulse-data` named volume.
- **Unraid:** back up `/mnt/user/appdata/pulse-discord-music`.
- **Source install:** back up the directory configured through `DATA_DIR`.

Queue state, favorites, DJ roles and listening statistics are stored locally. Deleting the persistent volume or AppData directory can erase them.

## How it works

```text
Discord slash commands / buttons       Optional OAuth2 dashboard
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
| Dashboard login fails | Check HTTPS URL, OAuth Client Secret, exact Discord redirect URI and your Manage Server permission |

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
- [Original project specification](docs/CAHIER_DES_CHARGES.md)
- [Issues and suggestions](https://github.com/MEHDImp4/pulse/issues)

Pulse is open source under the [MIT License](LICENSE). It is not affiliated with Discord, YouTube, Spotify, Deezer, Apple Music or SoundCloud. Use music sources in accordance with their terms and applicable law.

<div align="center">

**Built for shared listening. Hosted by you.**

[Back to top](#pulse) · [Documentation en français](README.fr.md)

</div>
