#!/bin/sh
set -e

if [ "${YTDLP_AUTO_UPDATE}" = "true" ]; then
  # Optional override only: production images pin yt-dlp at build time.
  # Set YTDLP_AUTO_UPDATE=true explicitly to opt into a runtime upgrade.
  # Failures are non-fatal.
  echo "[entrypoint] Mise à jour de yt-dlp (arrière-plan)..."
  (
    timeout 90 /opt/ytdlp/bin/pip install -q --upgrade "yt-dlp[default]" \
      || echo "[entrypoint] Échec de la mise à jour yt-dlp, poursuite avec la version installée"
  ) &
fi

exec "$@"
