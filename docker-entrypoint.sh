#!/bin/sh
set -eu

# Only register slash commands when starting the bot, never when running
# an explicit utility command (for instance, docker compose run bot ...).
if [ "${1:-}" = "node" ] && [ "${2:-}" = "dist/index.js" ]; then
  if [ -z "${DISCORD_TOKEN:-}" ] || [ -z "${DISCORD_CLIENT_ID:-}" ]; then
    echo "[pulse] DISCORD_TOKEN et DISCORD_CLIENT_ID sont requis." >&2
    exit 64
  fi

  case "${PULSE_DEPLOY_COMMANDS_ON_START:-true}" in
    true|TRUE|1|yes|on)
      echo "[pulse] Synchronisation des commandes Discord..."
      # Successful REST PUTs are idempotent. Registration failure must not
      # silently leave the bot online without its slash commands.
      node dist/deploy-commands.js
      ;;
    false|FALSE|0|no|off)
      echo "[pulse] Synchronisation des commandes désactivée."
      ;;
    *)
      echo "[pulse] PULSE_DEPLOY_COMMANDS_ON_START doit être true ou false." >&2
      exit 64
      ;;
  esac
fi

if [ "${YTDLP_AUTO_UPDATE:-false}" = "true" ]; then
  # Explicit opt-in only. Never update the yt-dlp venv concurrently with a
  # running bot and its FFmpeg jobs.
  echo "[pulse] Mise à jour yt-dlp (optionnelle)..."
  timeout 90 /opt/ytdlp/bin/pip install -q --upgrade "yt-dlp[default]" \
    || echo "[pulse] Mise à jour yt-dlp indisponible, lancement avec la version installée."
fi

exec "$@"
