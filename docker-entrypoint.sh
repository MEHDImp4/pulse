#!/bin/sh
set -e

if [ "${YTDLP_AUTO_UPDATE}" = "true" ]; then
  # Refresh yt-dlp in the background so the bot starts immediately instead of
  # waiting up to 90s for pip. Failures are non-fatal.
  echo "[entrypoint] Mise à jour de yt-dlp (arrière-plan)..."
  (
    timeout 90 /opt/ytdlp/bin/pip install -q --upgrade --pre "yt-dlp[default]" \
      || echo "[entrypoint] Échec de la mise à jour yt-dlp, poursuite avec la version installée"
  ) &
fi

exec "$@"
