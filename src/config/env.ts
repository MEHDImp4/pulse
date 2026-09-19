function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid integer environment variable: ${name}`);
  }
  return value;
}

function floatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid number environment variable: ${name}`);
  }
  return value;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  discordToken: required("DISCORD_TOKEN"),
  discordClientId: required("DISCORD_CLIENT_ID"),
  discordGuildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
  logLevel: process.env.LOG_LEVEL?.trim() || "info",
  idleTimeoutSeconds: intEnv("IDLE_TIMEOUT_SECONDS", 300),
  emptyChannelTimeoutSeconds: intEnv("EMPTY_CHANNEL_TIMEOUT_SECONDS", 60),
  maxQueueSize: intEnv("MAX_QUEUE_SIZE", 100),
  maxTrackDurationMinutes: intEnv("MAX_TRACK_DURATION_MINUTES", 180),
  maxStreamRetries: intEnv("MAX_STREAM_RETRIES", 2),
  ytdlpPath: process.env.YTDLP_PATH?.trim() || "yt-dlp",
  ffmpegPath: process.env.FFMPEG_PATH?.trim() || "ffmpeg",
  dataDir: process.env.DATA_DIR?.trim() || "data",
  ytdlpCookiesFile: process.env.YTDLP_COOKIES_FILE?.trim() || undefined,
  sponsorblockCategories: process.env.SPONSORBLOCK_CATEGORIES?.trim() ?? "sponsor,selfpromo",
  externalProcessTimeoutMs: intEnv("EXTERNAL_PROCESS_TIMEOUT_MS", 20_000),
  voiceConnectionTimeoutMs: intEnv("VOICE_CONNECTION_TIMEOUT_MS", 20_000),
  commandCooldownSeconds: intEnv("COMMAND_COOLDOWN_SECONDS", 5),
  autoDeleteSeconds: intEnv("AUTO_DELETE_SECONDS", 1),
  nowPlayingLive: boolEnv("NOWPLAYING_LIVE", true),
  nowPlayingIntervalMs: intEnv("NOWPLAYING_INTERVAL_MS", 1_000),
  voteSkipMin: intEnv("VOTE_SKIP_MIN", 2),
  voteSkipRatio: floatEnv("VOTE_SKIP_RATIO", 0.5),
  volumeStep: intEnv("VOLUME_STEP", 5),
  seekStepSeconds: intEnv("SEEK_STEP_SECONDS", 10),
  volumeHeadroomDb: floatEnv("VOLUME_HEADROOM_DB", 3),
  volumeRangeDb: floatEnv("VOLUME_RANGE_DB", 30),
  autocompleteEnabled: boolEnv("AUTOCOMPLETE_ENABLED", true),
  suggestTimeoutMs: intEnv("SUGGEST_TIMEOUT_MS", 800),
  playlistMaxItems: intEnv("PLAYLIST_MAX_ITEMS", 50),
  autoplayDefault: boolEnv("AUTOPLAY_DEFAULT", true),
  autoplayMaxConsecutive: intEnv("AUTOPLAY_MAX_CONSECUTIVE", 1_000),
  autoplayHistory: intEnv("AUTOPLAY_HISTORY", 100),
  autoplayRetryMs: intEnv("AUTOPLAY_RETRY_MS", 30_000),
  autoplayEmptyTimeoutSeconds: intEnv("AUTOPLAY_EMPTY_TIMEOUT_SECONDS", 1_800),
  resumeOnStartup: boolEnv("RESUME_ON_STARTUP", true),
  resumeMaxAgeMinutes: intEnv("RESUME_MAX_AGE_MINUTES", 1_440),
  queuePersist: boolEnv("QUEUE_PERSIST", true),
  queuePersistDebounceMs: intEnv("QUEUE_PERSIST_DEBOUNCE_MS", 1_000),
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID?.trim() || undefined,
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET?.trim() || undefined,
  lyricsEnabled: boolEnv("LYRICS_ENABLED", true),
  lyricsApiBase: process.env.LYRICS_API_BASE?.trim() || "https://lrclib.net",
  lyricsTimeoutMs: intEnv("LYRICS_TIMEOUT_MS", 8_000),
  radioAllowedHosts: (process.env.RADIO_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
} as const;
