<h1 align="center">Pulse</h1>

<p align="center"><strong>Ta musique. Ton serveur. Tes règles.</strong></p>

<p align="center">Un bot musical Discord auto-hébergé : lecture interactive, playlists personnelles, commandes communautaires et dashboard web facultatif.</p>

<p align="center"><strong>TypeScript · discord.js · yt-dlp · FFmpeg</strong></p>

<p align="center">
  <a href="https://github.com/MEHDImp4/pulse/actions/workflows/ci.yml"><img src="https://github.com/MEHDImp4/pulse/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI" /></a>
  <a href="https://github.com/MEHDImp4/pulse/actions/workflows/docker-publish.yml"><img src="https://github.com/MEHDImp4/pulse/actions/workflows/docker-publish.yml/badge.svg?branch=master" alt="Publication Docker" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Licence-MIT-8A73FF.svg" alt="Licence MIT" /></a>
</p>

<p align="center">
  <a href="#installation-rapide">Installation</a> ·
  <a href="#unraid">Unraid</a> ·
  <a href="#commandes-discord">Commandes</a> ·
  <a href="#dashboard-web-facultatif">Dashboard</a> ·
  <a href="README.md">English</a>
</p>

---

## Pourquoi Pulse ?

Pulse te permet d'écouter de la musique avec tes amis dans les salons vocaux Discord, en gardant le contrôle sur l'hébergement et les données du bot. Il fonctionne sur **Unraid, Docker, un VPS ou un PC**, avec des files d'attente indépendantes pour chaque serveur.

| Musique | Communauté | Auto-hébergement |
|:--|:--|:--|
| Recherche et playlists YouTube | Favoris et playlists personnelles | Image Docker précompilée |
| SoundCloud et radios publiques compatibles | Rôles DJ configurables et vote-skip | Template Docker Unraid |
| Liens Spotify, Deezer et Apple Music¹ | Fair Queue et boutons Discord | Synchronisation automatique des slash commands |
| Autoplay, filtres audio et paroles | Files d'attente indépendantes | Dashboard OAuth2 facultatif |

¹ **À savoir :** Spotify, Deezer et Apple Music sont utilisés pour leurs **métadonnées** (titres, artistes, playlists compatibles). Pulse recherche ensuite des morceaux correspondants auprès de ses fournisseurs audio. Il ne lit pas directement les flux audio premium de ces plateformes. L'importation des playlists Spotify nécessite un compte OAuth propriétaire ou collaborateur de la playlist ; Apple Music nécessite un jeton développeur pour les playlists du catalogue.

## Installation rapide

### 1. Préparer Discord

1. Ouvre le [Discord Developer Portal](https://discord.com/developers/applications).
2. Crée une application, configure le **Bot** et récupère son **Bot Token**.
3. Copie l'**Application ID** (Client ID) depuis *General Information*.
4. Invite le bot sur ton serveur avec les scopes `bot` et `applications.commands` ainsi que les permissions **Voir les salons**, **Se connecter**, **Parler**, **Envoyer des messages** et **Intégrer des liens**.
5. Facultatif : récupère l'identifiant de ton serveur Discord pour enregistrer les commandes immédiatement sur ce serveur de test.

> **Ne partage jamais ton Bot Token.** Il ne doit pas apparaître dans un commit, une issue ou une capture d'écran. Si tu l'exposes, régénère-le depuis le portail Discord.

### 2. Choisir l'installation

| Système | Méthode conseillée |
|---|---|
| **Unraid** | [Template Docker natif](#unraid) |
| **Linux / VPS avec Docker** | [Docker Compose](#docker-compose) |
| **Développement** | [Installation Node.js](#installation-depuis-le-code-source) |

### Unraid

Pulse dispose d'un [template Unraid](templates/unraid/pulse.xml) nommé **Pulse-Discord-Music**. Il ne nécessite aucune installation manuelle de Node.js, FFmpeg ou yt-dlp sur Unraid.

Tant que le projet n'a pas été accepté dans le catalogue **Community Applications**, installe son modèle une seule fois depuis le terminal d'Unraid :

```sh
mkdir -p /boot/config/plugins/dockerMan/templates-user
wget -q -O /boot/config/plugins/dockerMan/templates-user/my-pulse-discord-music.xml \
  https://raw.githubusercontent.com/MEHDImp4/pulse/master/templates/unraid/pulse.xml
```

Ensuite, dans l'interface Unraid, ouvre **Docker → Add Container → Template → Pulse-Discord-Music**.

| Champ | Configuration |
|---|---|
| **Discord Bot Token** | Ton token secret |
| **Discord Application ID** | L'Application ID numérique |
| AppData | `/mnt/user/appdata/pulse-discord-music` (par défaut) |
| Dashboard | Désactivé par défaut |

Clique sur **Apply**. Pulse téléchargera son image Docker, sauvegardera ses données dans `/data` et enregistrera automatiquement les commandes Discord au démarrage.

Le template et le fichier `ca_profile.xml` sont présents dans le dépôt, mais **Pulse Discord Music n'est pas automatiquement référencé dans Community Applications** : une soumission et une validation par Unraid restent nécessaires.

[Guide détaillé Unraid](docs/DOCKER_INSTALL.md#4-installation-native-unraid-sans-docker-compose)

> Image : `ghcr.io/mehdimp4/pulse:latest`. Pour une installation sans authentification, son package GHCR doit être **public**. Si le téléchargement échoue, vérifie sa visibilité et le workflow de publication.

### Docker Compose

Prérequis : Docker Engine, Docker Compose v2 et Git.

```sh
git clone https://github.com/MEHDImp4/pulse.git
cd pulse

# Assistant de configuration local
sh scripts/docker-setup.sh

docker compose pull
docker compose up -d
docker compose logs -f bot
```

L'assistant crée le fichier privé `.env.docker` en te demandant le token, l'Application ID et, éventuellement, les paramètres du dashboard. Les playlists et réglages sont conservés dans le volume persistant `pulse-data`.

Pour mettre Pulse à jour :

```sh
docker compose pull
docker compose up -d
```

Pour compiler une image Docker localement, consulte le [guide Docker](docs/DOCKER_INSTALL.md).

### Installation depuis le code source

Prérequis : **Node.js 24.17+**, FFmpeg et yt-dlp.

```sh
git clone https://github.com/MEHDImp4/pulse.git
cd pulse
npm ci
cp .env.example .env

# Renseigner DISCORD_TOKEN et DISCORD_CLIENT_ID dans .env
npm run deploy:commands
npm run dev
```

Définis `DISCORD_GUILD_ID` pour enregistrer les commandes sur un seul serveur de test. Pour une exécution compilée : `npm run build` puis `npm start`.

## Commandes Discord

Rejoins un salon vocal, puis utilise `/play` pour lancer une musique. Les commandes sont proposées directement dans l'interface de Discord.

| Commande | Fonction |
|---|---|
| `/play query:<titre ou URL>` | Recherche ou ajoute une musique ; reconnaît aussi certaines playlists |
| `/search query:<titre>` | Affiche jusqu'à 5 résultats dans un menu privé |
| `/playlist url:<URL> [limit:<n>]` | Importe une playlist compatible |
| `/queue` et `/nowplaying` | Affiche la file et le morceau actuel |
| `/pause`, `/resume`, `/skip`, `/stop` | Contrôle la lecture |
| `/playnext`, `/previous`, `/remove`, `/shuffle`, `/clear` | Gère la file d'attente |
| `/loop`, `/autoplay`, `/filter`, `/volume`, `/seek` | Personnalise l'écoute |
| `/favorite add`, `list`, `play`, `remove` | Gère tes favoris |
| `/myplaylist save`, `list`, `load`, `delete` | Sauvegarde et recharge tes playlists |
| `/djrole add`, `remove`, `list` | Configure les rôles DJ |
| `/fairqueue` | Alterne les demandes entre les utilisateurs |
| `/voteskip` | Vote pour passer un morceau |
| `/lyrics` | Recherche les paroles disponibles |
| `/status`, `/testaudio`, `/help`, `/leave` | Diagnostic, aide et déconnexion |

Certaines actions affectant tous les utilisateurs nécessitent un rôle DJ configuré ou la permission Discord **Gérer le serveur**. La commande `/fairqueue` réorganise la file une fois ; ce n'est pas un mode permanent.

Les résultats de `/search` sont accessibles uniquement à leur demandeur dans le salon vocal d'origine et expirent au bout de deux minutes.

## Dashboard web facultatif

Pulse possède un tableau de bord responsive avec authentification **Discord OAuth2** :

- Liste des serveurs que tu es autorisé à gérer et sur lesquels le bot est présent.
- Morceau en cours, volume, lecture/pause, skip et arrêt.
- Ajout et réorganisation des musiques par glisser-déposer.
- Statistiques par serveur : titres et artistes populaires, nombre de lectures.

**Le dashboard est désactivé par défaut.** Pour Docker Compose :

1. Ajoute dans `.env.docker` :

   ```dotenv
   DASHBOARD_PORT=8080
   DASHBOARD_PUBLIC_URL=https://pulse.example.com
   DASHBOARD_CLIENT_SECRET=TON_DISCORD_OAUTH_CLIENT_SECRET
   ```

2. Dans le [Discord Developer Portal](https://discord.com/developers/applications), ajoute l'URL de redirection exacte `https://pulse.example.com/oauth/callback` dans **OAuth2 → Redirects**.
3. Lance l'extension Compose du dashboard :

   ```sh
   docker compose -f docker-compose.yml \
     -f dashboard/docker-compose.dashboard.yml up -d
   ```

4. Configure un **reverse proxy HTTPS** (Nginx Proxy Manager, Caddy ou Nginx). Le port est exposé uniquement sur `127.0.0.1` côté hôte par le fichier Compose fourni. Si le proxy est aussi dans Docker, configure un réseau partagé adapté.

**N'expose jamais directement le port HTTP du dashboard sur Internet.** Le contrôle distant s'applique à un lecteur Discord déjà connecté. Sur Unraid, consulte le [guide du dashboard](docs/DOCKER_INSTALL.md#dashboard-sur-unraid).

## Configuration et sauvegardes

Seuls `DISCORD_TOKEN` et `DISCORD_CLIENT_ID` sont obligatoires.

| Variable | Valeur par défaut | Rôle |
|---|---|---|
| `DISCORD_GUILD_ID` | Vide | Commandes limitées à un serveur de test |
| `DATA_DIR` | `/data` sous Docker | Données persistantes |
| `MAX_QUEUE_SIZE` | `100` | Limite de la file d'attente |
| `PLAYLIST_MAX_ITEMS` | `50` | Limite d'import d'une playlist |
| `AUTOPLAY_DEFAULT` | `true` | Lecture de suggestions automatiques |
| `QUEUE_PERSIST` | `true` | Restauration des files d'attente |
| `NOWPLAYING_INTERVAL_MS` | `5000` | Fréquence d'actualisation du morceau actuel |
| `METADATA_MAX_CONCURRENT` | `3` | Limite les recherches de métadonnées simultanées |
| `DASHBOARD_PORT` | `0` | Active ou désactive le dashboard |

Les options détaillées se trouvent dans [`.env.docker.example`](.env.docker.example) et [`.env.example`](.env.example).

**Sauvegarde tes données** avant une réinstallation : le volume `pulse-data` sous Docker Compose, ou `/mnt/user/appdata/pulse-discord-music` sous Unraid. Les fichiers contiennent les playlists, favoris, files d'attente, rôles DJ et statistiques.

## Architecture

```text
Commandes Discord / boutons        Dashboard OAuth2 (facultatif)
               │                               │
               └───────────────┬───────────────┘
                               ▼
                         PlayerManager
                      ├─ lecteurs par serveur
                      ├─ files et préférences
                      └─ rôles DJ
                               │
                               ▼
                    Fournisseurs audio / metadata
                   YouTube · SoundCloud · radio
                   Spotify · Deezer · Apple Music¹
                               │
                               ▼
                        yt-dlp + FFmpeg
                               │
                               ▼
                          Discord Voice
```

Pulse met en cache temporairement certaines métadonnées et limite les recherches simultanées. Il gère les reprises après certaines erreurs de streaming et ne conserve **pas de téléchargement permanent des fichiers audio**.

## Dépannage

| Problème | Vérifications |
|---|---|
| Téléchargement de l'image refusé | Vérifier le [workflow Docker](https://github.com/MEHDImp4/pulse/actions/workflows/docker-publish.yml) et la visibilité publique du package GHCR |
| Commandes Discord absentes | Vérifier l'Application ID, les scopes d'invitation, `DISCORD_GUILD_ID` et les logs |
| Pas de son | Tester `/testaudio`, consulter les logs et vérifier la disponibilité de la source |
| Playlist vide | Vérifier le lien, les restrictions du fournisseur et `PLAYLIST_MAX_ITEMS` |
| Données Unraid non sauvegardées | Vérifier le montage de l'AppData vers `/data` |
| Connexion au dashboard impossible | Vérifier HTTPS, l'URL de redirection OAuth2, le Client Secret et les permissions Discord |

Sous Docker Compose : `docker compose logs --tail=100 bot`. Sous Unraid : **Docker → Pulse-Discord-Music → Logs**.

Pour signaler un bug : [GitHub Issues](https://github.com/MEHDImp4/pulse/issues). **Ne joins jamais de token, cookie ou fichier `.env`.**

## Développement, sécurité et contribution

```sh
npm ci
npm run typecheck
npm run build
npm test
docker build -t pulse:test .
```

La CI teste TypeScript, les fonctionnalités et la construction Docker ; CodeQL analyse la sécurité. Un test réel de lecture vocale Discord reste indispensable après les modifications de la couche audio.

- [Contribuer au projet](CONTRIBUTING.md)
- [Politique de sécurité et signalement privé](SECURITY.md)
- [Guide d'installation Docker / Unraid](docs/DOCKER_INSTALL.md)
- [Cahier des charges initial](docs/CAHIER_DES_CHARGES.md)
- [Issues et suggestions](https://github.com/MEHDImp4/pulse/issues)

Pulse est distribué sous [licence MIT](LICENSE) et n'est affilié à aucune plateforme musicale ni à Discord. Respecte les conditions d'utilisation des fournisseurs audio et la législation applicable.

<p align="center"><strong>Écouter ensemble. Héberger soi-même.</strong></p>

<p align="center"><a href="#pulse">Retour en haut</a> · <a href="README.md">English</a></p>
