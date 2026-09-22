# 🎵 Pulse

> Bot Discord de streaming musical — file d'attente indépendante par serveur, contrôles par boutons, progression en direct, lecture fiable via `yt-dlp` + FFmpeg.

🇫🇷 **Français** · 🇬🇧 [English](./README.en.md)

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

## ✨ Fonctionnalités

- 🔎 **Recherche YouTube** ou lecture directe par URL, avec **autocomplétion** sur `/play`
- 🌐 **Multi-sources** : SoundCloud (flux réel), flux radio / URL directe, et liens **Spotify / Deezer / Apple Music** convertis en recherche YouTube
- 📃 **File d'attente par serveur** (aucun mélange entre guildes) avec **pagination**
- 🎧 **Une session vocale par serveur** : Discord n'autorise qu'un salon vocal par bot et par serveur ; plusieurs serveurs peuvent tourner en parallèle, avec files et réglages indépendants
- 📚 **Playlists YouTube** : import par URL (`/playlist` ou `/play` avec un lien de playlist)
- ♾️ **Radio (autoplay)** : activé par défaut, enchaîne des titres similaires quand la file se vide ; les titres ajoutés par les membres restent prioritaires (`/autoplay` pour couper)
- 🎛️ **Filtres audio** : bassboost, nightcore, vaporwave, 8D, treble, normalisation (`/filter`)
- 🎤 **Paroles synchronisées** via lrclib (`/lyrics`)
- 📊 **Observabilité** : `/status` (uptime, sessions actives, latence voix, mémoire, état `yt-dlp`/FFmpeg, processus enfants)
- ⏩ **Seek** et **morceau précédent** : navigation dans le morceau (`/seek`, `/previous`, boutons ⏪/⏩)
- 💾 **Persistance & reprise** : files par salon, et le bot rejoint et reprend sa session après un redémarrage
- 🔁 **Boucle** morceau / file, 🔀 **shuffle**, ⏭ **insertion en tête** (`/playnext`)
- ⏯️ **Contrôles par boutons** : pause, reprise, suivant, stop, vote-skip, volume ±
- 📊 **Progression en direct** dans `/nowplaying` (barre + temps écoulé/total)
- 🗳️ **Vote-skip** majoritaire (min. 2 voix) pour les écoutes en groupe
- 🛡️ **Contrôles DJ** : Suivant / Arrêter / Seek / Clear / Remove / Shuffle / Loop réservés à la permission « Gérer le serveur » ; les autres membres peuvent **voter** pour passer
- 🔊 **Volume réglable** en direct (0–100), affiché dans la fiche de lecture
- 🚀 **Fiabilité** : retry automatique des flux, **SponsorBlock**, cookies `yt-dlp`, mise à jour `yt-dlp` au démarrage
- 🛡️ **Anti-spam** : cooldowns par utilisateur et par commande
- 🐳 **Docker prêt pour la prod** : healthcheck, tini (PID 1), arrêt gracieux

## 🎮 Commandes

| Commande | Description |
|---|---|
| `/play query:<texte ou URL>` | Recherche ou ajoute un morceau (autocomplete, playlists) |
| `/playnext query:<texte ou URL>` | Insère un morceau juste après le morceau courant |
| `/playlist url:<URL> [limit:<n>]` | Importe une playlist YouTube dans la file |
| `/pause` · `/resume` | Met en pause / reprend la lecture |
| `/skip` | Passe au morceau suivant (vote pour les non-modérateurs) |
| `/forceskip` | Force le passage au morceau suivant (permission « Gérer le serveur ») |
| `/previous` | Rejoue le morceau précédent |
| `/voteskip` | Vote pour passer au morceau suivant |
| `/stop` | Arrête la lecture et vide la file |
| `/queue` | Affiche la file d'attente (paginée) |
| `/nowplaying` | Morceau en cours + barre de progression live |
| `/seek position:<secondes\|mm:ss>` | Déplace la lecture à une position |
| `/filter preset:<…>` | Applique un filtre audio (affiche le filtre si omis) |
| `/lyrics [query:<texte>]` | Affiche les paroles (morceau en cours ou recherche) |
| `/loop mode:<off\|track\|queue>` | Répétition : désactivée, morceau ou file |
| `/autoplay mode:<on\|off>` | Active/désactive l'enchaînement de titres similaires |
| `/shuffle` | Mélange la file d'attente |
| `/remove position:<n>` | Retire un morceau de la file |
| `/clear` | Vide la file d'attente |
| `/volume level:<0-100>` | Règle le volume (affiche le volume si omis) |
| `/leave` | Déconnecte le bot du salon vocal |
| `/testaudio` | Joue un bip local de 3 s pour tester la voix |
| `/status` | État du bot : uptime, serveurs, sessions, latences, mémoire, outils, processus |
| `/help` | Liste les commandes |

## ✅ Prérequis

- **Node.js 24+**
- **FFmpeg** et **yt-dlp** disponibles dans le `PATH` (inclus dans l'image Docker)
- Un **bot Discord** avec les permissions : *View Channel, Connect, Speak, Send Messages, Embed Links, Use Application Commands*

## 🚀 Démarrage rapide

### Avec Docker (recommandé)

```bash
cp .env.docker.example .env.docker   # renseigne DISCORD_TOKEN et DISCORD_CLIENT_ID
docker compose up -d --build
docker compose logs -f
```

### En local

```bash
npm install
cp .env.example .env                 # renseigne DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
npm run deploy:commands              # enregistre les slash commands
npm run dev                          # tsx watch
```

En production locale : `npm run build && npm start`.

## ⚙️ Configuration

Toutes les variables sont optionnelles sauf mention contraire.

| Variable | Défaut | Description |
|---|---|---|
| `DISCORD_TOKEN` | — | **Requis.** Token du bot |
| `DISCORD_CLIENT_ID` | — | **Requis.** Application ID |
| `DISCORD_GUILD_ID` | — | Serveur de dev (commandes instantanées). Vide → commandes globales |
| `LOG_LEVEL` | `info` | Niveau de log pino |
| `MAX_QUEUE_SIZE` | `100` | Taille max de la file par serveur |
| `MAX_TRACK_DURATION_MINUTES` | `180` | Durée max d'un morceau (0 = illimité) |
| `MAX_STREAM_RETRIES` | `2` | Tentatives de lecture avant d'abandonner un morceau |
| `STREAM_START_TIMEOUT_MS` | `20000` | Délai max avant de considérer qu'un flux n'a pas démarré (puis retry) |
| `IDLE_TIMEOUT_SECONDS` | `300` | Déconnexion auto après inactivité |
| `EMPTY_CHANNEL_TIMEOUT_SECONDS` | `60` | Déconnexion auto quand le salon est vide |
| `COMMAND_COOLDOWN_SECONDS` | `5` | Cooldown anti-spam par défaut |
| `AUTO_DELETE_SECONDS` | `1` | Suppression auto des messages de confirmation (0 = désactivé ; les messages à boutons sont conservés) |
| `SPONSORBLOCK_CATEGORIES` | `sponsor,selfpromo` | Passages ignorés par SponsorBlock |
| `YTDLP_COOKIES_FILE` | — | Cookies `yt-dlp` (vidéos restreintes / anti-bot) |
| `YTDLP_AUTO_UPDATE` | `true` | Met à jour `yt-dlp` au démarrage du conteneur |
| `NOWPLAYING_LIVE` | `true` | Rafraîchit la barre de progression |
| `NOWPLAYING_INTERVAL_MS` | `1000` | Intervalle de rafraîchissement de la carte de lecture (ms) |
| `VOTE_SKIP_MIN` / `VOTE_SKIP_RATIO` | `2` / `0.5` | Seuil du vote-skip |
| `VOLUME_STEP` | `5` | Pas des boutons de volume |
| `SEEK_STEP_SECONDS` | `10` | Pas des boutons de déplacement ⏪/⏩ |
| `VOLUME_HEADROOM_DB` / `VOLUME_RANGE_DB` | `3` / `30` | Courbe de volume perceptuelle (dB) |
| `AUTOCOMPLETE_ENABLED` | `true` | Autocomplétion sur `/play` |
| `PLAYLIST_MAX_ITEMS` | `50` | Nombre max de morceaux importés par playlist |
| `AUTOPLAY_DEFAULT` | `true` | Autoplay (radio) activé par défaut : enchaîne des titres similaires quand la file est vide |
| `AUTOPLAY_MAX_CONSECUTIVE` | `1000` | Plafond de titres enchaînés (0 = illimité) |
| `AUTOPLAY_HISTORY` | `100` | Nombre de titres récents exclus lors du choix du suivant |
| `AUTOPLAY_RETRY_MS` | `30000` | Délai entre deux tentatives quand l'autoplay ne trouve rien (reste connecté) |
| `AUTOPLAY_EMPTY_TIMEOUT_SECONDS` | `1800` | Délai avant déconnexion d'un salon vide quand l'autoplay est actif |
| `QUEUE_PERSIST` | `true` | Persiste les files par salon pour une reprise après redémarrage |
| `QUEUE_PERSIST_DEBOUNCE_MS` | `1000` | Délai d'écriture des files persistées |
| `RESUME_ON_STARTUP` | `true` | Rejoint le dernier salon et reprend la session au démarrage |
| `RESUME_MAX_AGE_MINUTES` | `1440` | Ne reprend que les sessions enregistrées depuis moins de N minutes |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | — | Credentials Spotify (active la résolution des liens Spotify → YouTube) |
| `LYRICS_ENABLED` | `true` | Active `/lyrics` |
| `LYRICS_API_BASE` | `https://lrclib.net` | Base de l'API de paroles |
| `LYRICS_TIMEOUT_MS` | `8000` | Timeout des requêtes de paroles |
| `YTDLP_PATH` / `FFMPEG_PATH` | `yt-dlp` / `ffmpeg` | Chemins des binaires |
| `METADATA_CACHE_TTL_MS` | `600000` | Durée de vie du cache de métadonnées `yt-dlp` (0 = désactivé) |
| `METADATA_CACHE_MAX_ENTRIES` | `500` | Nombre max d'entrées du cache de métadonnées |
| `DATA_DIR` | `data` (`/data` en Docker) | Dossier de persistance (réglages et files par salon) |

## 🐳 Docker

L'image `node:24-bookworm-slim` embarque FFmpeg et `yt-dlp`, et intègre :

- **`HEALTHCHECK`** basé sur le processus (`pgrep`) → état `healthy`
- **`init: true`** → tini en PID 1 (forward des signaux + reap des zombies)
- **`stop_grace_period: 15s`** → laisse le temps de vider les connexions voix et de tuer les `yt-dlp`
- **Arrêt gracieux** : message « déconnexion », destruction des lecteurs, `SIGTERM → SIGKILL` sur les processus enfants
- **Mise à jour `yt-dlp`** au démarrage (`docker-entrypoint.sh`, non bloquante)

## 🏗️ Architecture

```text
Discord
  ↓
discord.js (Client)
  ↓
PlayerManager ──► GuildPlayer (1 par serveur) + QueueManager
                        ↓
                   AudioPipeline ──► AudioProvider
                        ↓                 ↓
                     FFmpeg         YouTubeProvider ──► yt-dlp
                        ↓
                 @discordjs/voice
                        ↓
                  Discord Voice
```

- `GuildPlayer` détient l'état d'une session (serveur + salon vocal) : file, mode boucle, volume, votes de skip, message now-playing. Discord n'autorisant qu'un salon vocal par bot et par serveur, une seule session est active par serveur ; plusieurs serveurs peuvent tourner en parallèle. Une seconde session dans un autre salon du même serveur est refusée avec un message explicite.
- `decideNext()` (fonction pure) détermine le morceau suivant selon le mode boucle.
- Les **URLs sont validées par fournisseur** (hôtes YouTube/SoundCloud/Spotify/Deezer/Apple reconnus, sinon flux direct) et le **flux est résolu juste avant lecture** (évite l'expiration pendant l'attente).
- L'autocomplétion utilise un endpoint de suggestions rapide (jamais `yt-dlp`, trop lent pour la limite de 3 s de Discord).

## 📁 Structure

```text
src/
  commands/        # 1 fichier par commande + barrel + helpers/types
  interactions/    # boutons (musique, pagination queue)
  music/           # GuildPlayer, PlayerManager, QueueManager, decideNext…
  audio/           # AudioPipeline (FFmpeg)
  providers/       # ProviderRegistry (YouTube, SoundCloud, radio, Spotify/Deezer/Apple), AudioProvider
  services/        # suggestions (autocomplete), nowPlaying (progress live)
  ui/              # embeds, boutons, barre de progression
  utils/           # logger, cooldown, time, process
  config/          # env
tests/             # vitest (logique pure)
```

## 🧪 Tests

```bash
npm test
```

Couvre la logique pure : opérations de file, `decideNext` (boucle), cooldowns, seuil de vote-skip, barre de progression, parsing des suggestions et isolation des guildes.

## 🔒 Sécurité

- Le token Discord **n'est jamais versionné** (`.env` et `.env.docker` sont ignorés par Git).
- `yt-dlp` et FFmpeg sont lancés via `spawn()` avec une **liste d'arguments** (`shell: false`) — aucune commande shell construite depuis l'entrée utilisateur.
- Les URLs sont validées par fournisseur avant résolution ; les processus externes ont des timeouts et sont nettoyés à l'arrêt.

## 🛠️ Dépannage

| Symptôme | Piste |
|---|---|
| « An invalid token was provided » | Vérifie `DISCORD_TOKEN` dans `.env.docker` / `.env` |
| `yt-dlp not found` / `FFmpeg not found` | Installe le binaire ou renseigne `YTDLP_PATH` / `FFMPEG_PATH` ; l'état est affiché par `/status` |
| Le bot rejoint mais aucun son | Vérifie les permissions *Connect* + *Speak* et les libs opus ; teste avec `/testaudio` |
| Échec de connexion vocale | Vérifie les permissions du salon et `VOICE_CONNECTION_TIMEOUT_MS`, puis relance la commande |
| `yt-dlp` échoue sur certaines vidéos | Fournis `YTDLP_COOKIES_FILE` (vidéos restreintes/anti-bot) |
| Commandes absentes de Discord | `npm run deploy:commands` puis `Ctrl+R` dans Discord |
| Commandes en double ou « This command is outdated » | Mélange de portées globale/guild : `npm run deploy:commands` (le script vide l'autre portée) puis `Ctrl+R` |

## 🤝 Contribuer

Les contributions sont bienvenues ! Consulte [CONTRIBUTING.md](./CONTRIBUTING.md) et le [Code de conduite](./CODE_OF_CONDUCT.md) avant d'ouvrir une PR. Pour signaler un bug ou proposer une idée, utilise les [issues](https://github.com/MEHDImp4/pulse/issues) ; pour une question, passe par les [Discussions](https://github.com/MEHDImp4/pulse/discussions). Une faille de sécurité se signale en privé (voir [SECURITY.md](./SECURITY.md)).

## 📄 Licence

[MIT](./LICENSE) © 2026 Mehdi Diouri
