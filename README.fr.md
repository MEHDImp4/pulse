<p align="center"><img src="assets/pulse-icon.png" width="128" height="128" alt="Pulse — logo casque et onde musicale" /></p>

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
| Autoplay, filtres audio et paroles | Files d'attente indépendantes | Dashboard local ou OAuth2 facultatif |

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

Les commandes de lecture (`/play`, `/playnext`, `/playlist`) utilisent des confirmations **privées et temporaires** (durée réglée par `AUTO_DELETE_SECONDS`, 1 seconde par défaut). Le panneau **Lecture en cours** est envoyé séparément dans le salon, reste accessible à tous avec ses boutons et est réutilisé au lieu d'être dupliqué. Pulse doit avoir les permissions **Envoyer des messages** et **Intégrer des liens** dans ce salon.



**Cache de toute la file (nouveau) :** Pulse télécharge progressivement **tous les titres compatibles en attente**, pas seulement le prochain, en conservant l'audio compressé dans `DATA_DIR/audio-cache`. Les morceaux prioritaires sont ceux proches du début de la file. Un cache disque **global de 1 Go** est partagé entre les serveurs, avec **deux téléchargements simultanés** et **64 Mo maximum par titre**. Les titres déjà téléchargés sont réutilisés après un redémarrage ; le cache élimine les éléments moins prioritaires lorsqu'il atteint sa limite. Les flux radio en direct et les pistes non compatibles ne sont pas téléchargés. Le préchargement audio de la prochaine piste reste actif pour éviter le délai de décodage à la transition. Options : `CACHE_QUEUE_AUDIO`, `QUEUE_CACHE_MAX_MB`, `QUEUE_CACHE_TRACK_MAX_MB`, `QUEUE_CACHE_CONCURRENCY`, `QUEUE_CACHE_DOWNLOAD_TIMEOUT_MS`.

**Diagnostic de stabilité :** `/status` affiche maintenant les transitions mesurées en millisecondes (moyenne, p95 sur les 50 dernières), les récupérations après blocage, le nombre de lectures depuis le cache et les morceaux de la file encore en téléchargement. Les statistiques sont limitées à la session du serveur et ne contiennent pas les titres ou identifiants des autres serveurs. Une transition de plus d'une seconde est signalée dans les logs. Ces mesures correspondent au délai observé par le bot pour démarrer le morceau suivant, et non à une mesure acoustique de silence.

Le cache accélère fortement les transitions pour les titres entièrement téléchargés, mais ne peut pas garantir **zéro interruption** : le réseau, un téléchargement inachevé, les restrictions d'une source ou un disque plein peuvent encore entraîner une attente. L'activation implique du trafic réseau et l'utilisation de l'espace disque configuré.

**Transitions musicales plus rapides :** lorsqu’un morceau possède une durée connue et qu’un suivant est en attente, Pulse commence à préparer son flux audio **25 secondes avant la fin**. Une seule piste est préchargée par serveur ; les flux abandonnés sont arrêtés automatiquement si la file est modifiée, si la lecture est interrompue ou si une préparation échoue. Le préchargement ne garantit pas zéro silence en cas de réseau lent ou de piste sans durée connue. Options Docker/Unraid : `PRELOAD_NEXT_TRACK`, `PRELOAD_LEAD_SECONDS`, `PRELOAD_TIMEOUT_MS` et `PRELOAD_SWITCH_WAIT_MS`.

| Commande | Fonction |
|---|---|
| `/play query:<titre ou URL>` | Recherche ou ajoute une musique ; reconnaît aussi certaines playlists |
| `/search query:<titre>` | Affiche jusqu'à 5 résultats dans un menu privé |
| `/playlist url:<URL> [limit:<n>]` | Importe une playlist compatible |
| `/queue` et `/nowplaying` | Affiche la file et le morceau actuel |
| `/pause`, `/resume`, `/skip`, `/stop` | Contrôle la lecture |
| `/playnext`, `/previous`, `/remove`, `/shuffle`, `/clear` | Gère la file d'attente |
| `/loop`, `/autoplay`, `/filter`, `/volume`, `/seek` | Personnalise l'écoute |
| `/quality [normalize] [trim_silence] [fade] [crossfade]` | Qualité audio, silences, fondus et crossfade facultatif |
| `/favorite add`, `list`, `play`, `remove` | Gère tes favoris |
| `/myplaylist save`, `list`, `load`, `delete` | Sauvegarde et recharge tes playlists |
| `/djrole add`, `remove`, `list` | Configure les rôles DJ |
| `/fairqueue` | Alterne les demandes entre les utilisateurs |
| `/party [mode:on|off] [limite:1..10]` | Mode soirée continu : file équitable et limite de titres par personne |
| `/voteskip` | Vote pour passer un morceau |
| `/lyrics` | Recherche les paroles disponibles |
| `/status`, `/testaudio`, `/help`, `/leave` | Diagnostic (temps de transition, erreurs, préchargement par serveur), aide et déconnexion |

Certaines actions affectant tous les utilisateurs nécessitent un rôle DJ configuré ou la permission Discord **Gérer le serveur**. La commande `/fairqueue` réorganise la file une fois. `/party mode:on` active le mode permanent.

Les résultats de `/search` sont accessibles uniquement à leur demandeur dans le salon vocal d'origine et expirent au bout de deux minutes.

### Qualité audio et crossfade

`/quality` règle la qualité sonore **pour le salon vocal** : `normalize:true` active l'égalisation de sonie via FFmpeg (indépendamment de Bass Boost, 8D, etc.), `trim_silence:true` retire les silences **au tout début** des musiques (pas au milieu), et `fade:0..5` règle les fondus de début/fin. Tous les réglages sont mémorisés et désactivables. **La normalisation et la suppression des silences sont désactivées par défaut** pour ne pas modifier les morceaux sans consentement. Le fondu historique reste à **2 secondes** par défaut.

`/quality crossfade:3` active un **vrai chevauchement audio** de trois secondes : lorsque les deux pistes non live ont une durée connue et sont **déjà entièrement en cache**, FFmpeg mélange la fin de la première avec le début de la seconde. Un seul flux mélangé poursuit ensuite la lecture de la seconde. Le crossfade est **désactivé par défaut** ; il fonctionne avec le filtre `off` et la suppression des silences désactivée, et retombe automatiquement sur le préchargement classique si une piste manque, si la file change, si le réseau est lent ou si les durées ne sont pas fiables. Les commandes manuelles `/skip` et `/seek` conservent leur comportement standard.

Attention : le crossfade raccourcit volontairement la séparation entre deux titres, et une durée de piste incorrecte peut provoquer un décalage. Tester d'abord `crossfade:2` ou `crossfade:3` sur une petite file de morceaux déjà en cache. Les fonctions d'atténuation et normalisation peuvent augmenter légèrement la charge CPU.

### Mode soirée et file interactive

Le **Party Mode** (`/party mode:on`) maintient un ordre équitable automatiquement lorsque des morceaux sont ajoutés, retirés ou joués. Chaque personne est limitée à **3 morceaux en attente par défaut** (`/party limite:5` pour ajuster de 1 à 10). Les titres déjà présents sont conservés et réorganisés, la limite s'appliquant uniquement aux nouveaux ajouts. Seuls les DJ peuvent activer/désactiver le mode ou changer la limite. La boucle d'un seul morceau est automatiquement désactivée en mode soirée afin de ne pas bloquer les demandes. `/party mode:off` restaure une gestion manuelle de la file.

Avec `/queue`, un **menu déroulant** permet désormais de sélectionner l'un des morceaux de la page. Les DJ présents dans le salon vocal peuvent ensuite le monter, le descendre ou le supprimer depuis un panneau privé. Une sélection devenue obsolète après changement de la file est refusée ; en Party Mode, le déplacement manuel est désactivé pour conserver l'équité.

Le dashboard facultatif affiche le mode soirée, la limite par utilisateur, le nombre de titres déjà en cache, les téléchargements en cours ainsi que les mesures de transition audio déjà disponibles via `/status`. Il propose un accès local avec mot de passe (sur Unraid) ou Discord OAuth2/HTTPS en option avancée. Les actions exigent une session authentifiée et une protection CSRF.

## Dashboard web facultatif

Pulse possède un tableau de bord responsive pour les commandes de lecture,
les files d'attente, le Party Mode, le cache audio et les statistiques.

**Installation locale sur Unraid, sans OAuth2 Discord :**

1. Dans **Docker → Pulse-Discord-Music → Edit**, mettre
   **Dashboard - Activer** sur `true`.
2. Choisir le **Dashboard - Port Web (Unraid)** : `8090` par défaut,
   ou un autre port libre (`8095` par exemple).
3. Définir un **mot de passe local** unique d'au moins 12 caractères,
   garder le mode avancé `auto` (ou `local` si d'anciens secrets OAuth restent configurés), puis cliquer sur **Apply**.
4. Ouvrir le bouton **WebUI** du conteneur ou
   `http://IP_UNRAID:PORT_CHOISI`, puis entrer le mot de passe.

**Aucun domaine, certificat, client secret ni redirect OAuth n'est requis pour
cet accès LAN.** Le mode local donne l'administration de tous les serveurs
où Pulse est présent à la personne qui possède le mot de passe. Ne jamais
exposer directement ce port HTTP sur Internet ou sur un Wi-Fi non fiable.

[Petit tutoriel illustré par étapes](docs/UNRAID_DASHBOARD.md) ·
[Guide complet Docker et Unraid](docs/DOCKER_INSTALL.md)

**Mode distant avancé, avec Discord OAuth2 et HTTPS :**

```dotenv
DASHBOARD_ENABLED=true
DASHBOARD_AUTH_MODE=discord
DASHBOARD_PORT=8080
DASHBOARD_PUBLIC_URL=https://pulse.example.com
DASHBOARD_CLIENT_SECRET=TON_DISCORD_OAUTH_CLIENT_SECRET
```

Déclarer `https://pulse.example.com/oauth/callback` dans
**Discord Developer Portal → OAuth2 → Redirects**, puis lancer
l'overlay `dashboard/docker-compose.dashboard.yml` derrière un
**reverse proxy HTTPS**. Le mode OAuth vérifie les droits Discord
« Gérer le serveur » à chaque requête.

## Configuration et sauvegardes

Seuls `DISCORD_TOKEN` et `DISCORD_CLIENT_ID` sont obligatoires.

| Variable | Valeur par défaut | Rôle |
|---|---|---|
| `DISCORD_GUILD_ID` | Vide | Commandes limitées à un serveur de test |
| `DATA_DIR` | `/data` sous Docker | Données persistantes |
| `MAX_QUEUE_SIZE` | `100` | Limite de la file d'attente |
| `PLAYBACK_MAX_PENDING` | `12` | Maximum de commandes musicales en attente par serveur |
| `PLAYBACK_WAIT_TIMEOUT_MS` | `30000` | Attente maximale avant abandon d’une demande, en ms |
| `PLAYLIST_MAX_ITEMS` | `50` | Limite d'import d'une playlist |
| `AUTOPLAY_DEFAULT` | `true` | Lecture de suggestions automatiques |
| `QUEUE_PERSIST` | `true` | Restauration des files d'attente |
| `NOWPLAYING_INTERVAL_MS` | `5000` | Fréquence d'actualisation du morceau actuel |
| `METADATA_MAX_CONCURRENT` | `3` | Limite les recherches de métadonnées simultanées |
| `DASHBOARD_ENABLED` | `false` | Active ou désactive le dashboard |
| `DASHBOARD_PORT` | `8090` si activé | Port HTTP interne ; configurer le port hôte dans Unraid |
| `DASHBOARD_AUTH_MODE` | `local` | Connexion locale par mot de passe ou Discord OAuth2 |
| `DASHBOARD_PASSWORD` | Vide | Obligatoire en mode local activé, 12 caractères minimum |

Les options détaillées se trouvent dans [`.env.docker.example`](.env.docker.example) et [`.env.example`](.env.example).

**Sauvegarde tes données** avant une réinstallation : le volume `pulse-data` sous Docker Compose, ou `/mnt/user/appdata/pulse-discord-music` sous Unraid. Les fichiers contiennent les playlists, favoris, files d'attente, rôles DJ et statistiques.

## Architecture

```text
Commandes Discord / boutons        Dashboard local / OAuth2 (facultatif)
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

Pulse conserve en cache disque les fichiers audio compressés compatibles dans la limite configurée et met en cache temporairement certaines métadonnées. Il limite les recherches simultanées et gère les reprises après certaines erreurs de streaming.

## Dépannage

| Problème | Vérifications |
|---|---|
| Téléchargement de l'image refusé | Vérifier le [workflow Docker](https://github.com/MEHDImp4/pulse/actions/workflows/docker-publish.yml) et la visibilité publique du package GHCR |
| Commandes Discord absentes | Vérifier l'Application ID, les scopes d'invitation, `DISCORD_GUILD_ID` et les logs |
| Pas de son | Tester `/testaudio`, consulter les logs et vérifier la disponibilité de la source |
| Playlist vide | Vérifier le lien, les restrictions du fournisseur et `PLAYLIST_MAX_ITEMS` |
| Données Unraid non sauvegardées | Vérifier le montage de l'AppData vers `/data` |
| Connexion au dashboard impossible | En local : vérifier `DASHBOARD_ENABLED`, le port 8090, l'IP privée et le mot de passe. En OAuth : vérifier HTTPS et les redirects Discord |

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
- [Activer le dashboard local sur Unraid](docs/UNRAID_DASHBOARD.md)
- [Cahier des charges initial](docs/CAHIER_DES_CHARGES.md)
- [Issues et suggestions](https://github.com/MEHDImp4/pulse/issues)

Pulse est distribué sous [licence MIT](LICENSE) et n'est affilié à aucune plateforme musicale ni à Discord. Respecte les conditions d'utilisation des fournisseurs audio et la législation applicable.

<p align="center"><strong>Écouter ensemble. Héberger soi-même.</strong></p>

<p align="center"><a href="#pulse">Retour en haut</a> · <a href="README.md">English</a></p>
