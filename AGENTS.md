# AGENTS.md

## Project

Discord music bot (MVP) — TypeScript + Node.js 24+, discord.js 14, @discordjs/voice, yt-dlp, FFmpeg. Single package, no monorepo.

## Commands

```bash
npm install              # install deps
npm run dev              # dev mode (tsx watch, loads .env)
npm run build            # tsc → dist/
npm run typecheck        # tsc --noEmit for src AND tests
npm start                # node dist/index.js (production)
npm run deploy:commands  # register slash commands with Discord
npm test                 # vitest run
npm run test:watch       # vitest watch
```

No lint or format scripts exist. `tsc` is the only static check: `npm run build` (src) and `npm run typecheck` (src + tests).

## Environment

Copy `.env.example` → `.env`. Required vars: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`. Optional: `DISCORD_GUILD_ID` (set for guild-scoped dev commands; leave empty for global).

## External tools

`yt-dlp` and `ffmpeg` must be in `PATH`. On Windows, `yt-dlp.exe` sits in repo root (gitignored). Docker image installs both via apt/pip.

## Architecture

Commands are one file per command in `src/commands/*.ts`, each exporting a `CommandDefinition`. The barrel `src/commands/index.ts` collects them into `commands` and `commandMap`. Shared helpers live in `src/commands/helpers.ts`, shared types in `src/commands/types.ts`. New commands: create a file, export the definition, add it to the barrel array.

Button handlers are in `src/interactions/` (`musicControls.ts` for playback/volume/vote-skip, `queuePagination.ts` for `/queue` pages). UI builders are in `src/ui/` (`controls.ts` buttons, `embeds.ts` embeds, `progress.ts` progress bar).

Key flow: `src/index.ts` → `PlayerManager` → `GuildPlayer` → `AudioPipeline`/`AudioProvider` → `YouTubeProvider` → yt-dlp/FFmpeg → @discordjs/voice.

`GuildPlayer` owns per-session state (guild + voice channel): queue, loop mode, volume, skip votes, and the live now-playing message. Auto-advance decides the next track via the pure `decideNext()` helper. Discord allows a bot in only one voice channel per guild, so a guild has at most one active session; commands refuse a second channel (`preparePlayback`). If Discord moves the bot to another channel, `PlayerManager.rebind` re-keys the session (settings + persisted queue included) and the now-playing card is refreshed.

URLs are validated to YouTube-only in `YouTubeProvider`. Direct audio streams are resolved just-in-time (not at queue time) to avoid expiry. `/play` autocomplete uses `src/services/suggestions.ts` (fast Google suggest endpoint, never yt-dlp which is too slow). Live progress is driven by `src/services/nowPlaying.ts`.

Playback start is guarded by `waitForStatus` (`src/audio/playbackWatchdog.ts`, `STREAM_START_TIMEOUT_MS`) so a stalled pipe cannot hang the player. Child processes are terminated via `terminateAll` (`src/utils/childProcess.ts`, SIGTERM then SIGKILL). Stable yt-dlp metadata is cached with `createTtlCache` (`src/utils/ttlCache.ts`, `METADATA_CACHE_TTL_MS`); stream URLs are never cached. Interactive commands defer immediately and read the caller's channel from the cached `interaction.member` (never `members.fetch`) to stay inside Discord's 3s ACK window.

## Testing

- Framework: vitest, config in `vitest.config.ts`
- Setup file `tests/setup.ts` stubs required env vars so tests run without a real bot token
- Unit tests cover pure logic: queue ops, `decideNext`, cooldowns, skip threshold, progress bar, suggestion parsing, guild isolation
- No integration tests, no snapshot tests

## Conventions

- UI strings are in French
- Error messages use ❌ prefix, info uses ℹ️
- Logging via pino (`src/utils/logger.ts`)
- External processes use `spawn()` with `shell: false` and timeouts — never shell strings
