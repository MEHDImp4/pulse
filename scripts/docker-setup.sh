#!/bin/sh
# Local-only setup wizard; never sends credentials to a setup server.
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TEMPLATE="$ROOT_DIR/.env.docker.example"
OUTPUT="$ROOT_DIR/.env.docker"

if [ ! -f "$TEMPLATE" ]; then
  echo "[Pulse] Fichier .env.docker.example introuvable." >&2
  exit 1
fi

umask 077

if [ -e "$OUTPUT" ]; then
  printf "Une configuration existe déjà. La remplacer ? [y/N] "
  IFS= read -r overwrite || exit 1
  case "$overwrite" in
    y|Y|yes|oui|O|o) ;;
    *) echo "Configuration conservée."; exit 0 ;;
  esac
fi

read_secret() {
  if [ -t 0 ]; then
    old_tty=$(stty -g)
    stty -echo
    trap 'stty "$old_tty" 2>/dev/null || true' EXIT HUP INT TERM
  else
    old_tty=""
  fi
  IFS= read -r secret_value || {
    if [ -n "$old_tty" ]; then stty "$old_tty"; fi
    echo "Saisie interrompue." >&2
    exit 1
  }
  if [ -n "$old_tty" ]; then
    stty "$old_tty"
    trap - EXIT HUP INT TERM
    printf "\n"
  fi
}

is_safe_value() {
  case "$1" in
    ""|*[!A-Za-z0-9._-]*) return 1 ;;
    *) return 0 ;;
  esac
}

is_discord_id() {
  printf "%s" "$1" | grep -Eq "^[0-9]{15,22}$"
}

printf "\n=== Installation de Pulse (Docker / Unraid) ===\n"
printf "Token du bot Discord (Discord Developer Portal > Bot) : "
read_secret
token=$secret_value
if ! is_safe_value "$token"; then
  echo "[Pulse] Format de token invalide." >&2
  exit 1
fi

printf "Application ID / Client ID Discord : "
IFS= read -r client_id || exit 1
if ! is_discord_id "$client_id"; then
  echo "[Pulse] Client ID invalide (nombre Discord de 15 à 22 chiffres)." >&2
  exit 1
fi

printf "ID du serveur Discord pour installer les commandes rapidement (optionnel, Entrée = global) : "
IFS= read -r guild_id || exit 1
if [ -n "$guild_id" ] && ! is_discord_id "$guild_id"; then
  echo "[Pulse] ID de serveur invalide." >&2
  exit 1
fi

printf "Configurer maintenant le dashboard HTTPS ? [y/N] "
IFS= read -r use_dashboard || exit 1
dashboard_port=0
dashboard_bind=127.0.0.1
dashboard_url=""
dashboard_secret=""
case "$use_dashboard" in
  y|Y|yes|oui|O|o)
    printf "Adresse HTTPS publique (ex. https://pulse.example.com) : "
    IFS= read -r dashboard_url || exit 1
    case "$dashboard_url" in
      https://* ) ;;
      * ) echo "[Pulse] Une URL HTTPS est obligatoire." >&2; exit 1 ;;
    esac
    if ! printf "%s" "$dashboard_url" | grep -Eq '^https://[A-Za-z0-9][A-Za-z0-9.-]+(:[0-9]{2,5})?/?$'; then
      echo "[Pulse] Indique une origine HTTPS valide, sans chemin ni paramètres." >&2
      exit 1
    fi
    printf "Discord OAuth2 Client Secret (pas le token du bot) : "
    read_secret
    dashboard_secret=$secret_value
    if ! is_safe_value "$dashboard_secret"; then
      echo "[Pulse] Format de secret OAuth invalide." >&2
      exit 1
    fi
    dashboard_port=8080
    dashboard_bind=0.0.0.0
    ;;
esac

# Render keys in the template without eval, sed interpolation, or exporting
# secrets to subprocess arguments. The current shell alone handles them.
TEMP="${OUTPUT}.tmp.$$"
trap 'rm -f "$TEMP"' EXIT HUP INT TERM
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    DISCORD_TOKEN=*) printf "DISCORD_TOKEN=%s\n" "$token" ;;
    DISCORD_CLIENT_ID=*) printf "DISCORD_CLIENT_ID=%s\n" "$client_id" ;;
    DISCORD_GUILD_ID=*) printf "DISCORD_GUILD_ID=%s\n" "$guild_id" ;;
    DASHBOARD_PORT=*) printf "DASHBOARD_PORT=%s\n" "$dashboard_port" ;;
    DASHBOARD_BIND=*) printf "DASHBOARD_BIND=%s\n" "$dashboard_bind" ;;
    DASHBOARD_PUBLIC_URL=*) printf "DASHBOARD_PUBLIC_URL=%s\n" "$dashboard_url" ;;
    DASHBOARD_CLIENT_SECRET=*) printf "DASHBOARD_CLIENT_SECRET=%s\n" "$dashboard_secret" ;;
    *) printf "%s\n" "$line" ;;
  esac
done < "$TEMPLATE" > "$TEMP"

chmod 600 "$TEMP"
mv -f "$TEMP" "$OUTPUT"
trap - EXIT HUP INT TERM

printf "\n[Pulse] Configuration écrite dans .env.docker (permissions 600).\n"
printf "[Pulse] Les identifiants ne sont pas intégrés dans l'image Docker.\n"
if [ "$dashboard_port" -eq 8080 ]; then
  printf "\nÉtape Discord : enregistrer exactement %s/oauth/callback dans OAuth2 Redirects.\n" "${dashboard_url%/}"
  printf "Puis démarrer derrière un reverse proxy HTTPS :\n"
  printf "  docker compose -f docker-compose.yml -f dashboard/docker-compose.dashboard.yml up -d\n"
else
  printf "\nLancer : docker compose up -d\n"
fi
printf "Voir les logs : docker compose logs -f bot\n"
