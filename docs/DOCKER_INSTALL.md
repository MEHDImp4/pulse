# Pulse — Installer facilement l'image Docker

Ce guide installe **Pulse avec une image Docker précompilée**. Il n'est pas
nécessaire d'installer Node.js, TypeScript, Python, FFmpeg ni yt-dlp sur le
serveur hôte.

> L'image `ghcr.io/mehdimp4/pulse:latest` est publiée par le workflow
> [Publish Docker image](../.github/workflows/docker-publish.yml). Si elle
> refuse le téléchargement anonyme, rendez le package public dans
> **GitHub → Packages → pulse → Package settings → Change visibility**.
> Le bot n'exige aucun port exposé, sauf si vous activez le dashboard.

## 1. Préparer l'application Discord

1. Dans le [Discord Developer Portal](https://discord.com/developers/applications),
   créer une application puis configurer son **Bot**.
2. Copier le **Bot Token** (à garder secret).
3. Copier l'**Application ID**, aussi appelé Client ID.
4. Inviter le bot avec les scopes `bot` et `applications.commands`.
   Autoriser notamment **View Channels**, **Connect**, **Speak**, **Send Messages**
   et **Embed Links** dans le serveur.
5. Optionnel : copier l'ID du serveur Discord pour publier les commandes
   immédiatement dans ce serveur pendant les essais.

Ne jamais partager le token, le mettre dans Git ni le capturer dans une image.

## 2. Installer sous Docker Compose

Pré-requis : Docker Engine + Docker Compose v2 et Git.

```sh
git clone https://github.com/MEHDImp4/pulse.git
cd pulse
sh scripts/docker-setup.sh
docker compose pull
docker compose up -d
docker compose logs -f bot
```

L'assistant local demande uniquement :
- Bot Token et Application ID ;
- optionnellement, ID du serveur ;
- optionnellement, l'URL HTTPS publique et le Client Secret OAuth2 du dashboard.

Il crée `.env.docker` (permissions `600`), ignoré par Git. Aucune donnée
secrète n'est incorporée dans l'image Docker.

Les options avancées restent modifiables dans `.env.docker`. Redémarrer
après modification :

```sh
docker compose up -d --force-recreate
```

### Enregistrement des slash commands

Par défaut, le bot publie ses commandes à chaque démarrage :

- si `DISCORD_GUILD_ID` est défini, dans ce seul serveur ;
- sinon, à l'échelle globale Discord.

Les commandes sont enregistrées avec l'API Discord, sans devoir installer
Node.js ou exécuter un script séparé sur l'hôte.

Désactiver ce comportement avec `PULSE_DEPLOY_COMMANDS_ON_START=false`.
Pour déclencher la publication manuellement :

```sh
docker compose run --rm bot node dist/deploy-commands.js
```

Quand on change de portée (serveur ↔ globale), les anciennes commandes ne
sont **pas supprimées automatiquement**. Pour nettoyer explicitement une
portée devenue inutile :

```sh
docker compose run --rm bot node dist/deploy-commands.js --clear-global

# Ou un ancien serveur :
docker compose run --rm bot node dist/deploy-commands.js --clear-guild=123456789012345678
```

Cela évite de désinstaller accidentellement les commandes sur d'autres
serveurs. L'apparition des commandes globales peut prendre un peu de temps
après le premier enregistrement.

## 3. Dashboard web facultatif et sécurisé

Le bot peut fonctionner sans **aucun port entrant**.

Pour activer le dashboard de la phase 4, configurer dans `.env.docker` :

```env
DASHBOARD_PORT=8080
DASHBOARD_BIND=0.0.0.0
DASHBOARD_PUBLIC_URL=https://pulse.example.com
DASHBOARD_CLIENT_SECRET=VOTRE_OAUTH_CLIENT_SECRET
```

Dans le Discord Developer Portal → **OAuth2 → Redirects**, ajouter l'URL
exacte :

```text
https://pulse.example.com/oauth/callback
```

Puis utiliser l'overlay Compose :

```sh
docker compose -f docker-compose.yml \
  -f dashboard/docker-compose.dashboard.yml up -d
```

Par défaut, l'overlay rend le dashboard accessible sur
`127.0.0.1:8080` **du serveur hôte**, pour être raccordé à un reverse proxy
HTTPS (Caddy / Nginx / Nginx Proxy Manager). Ne jamais exposer directement
le port HTTP sur Internet.

Si le reverse proxy est dans un autre conteneur Docker, il ne peut pas
joindre automatiquement le `127.0.0.1` de l'hôte. Les deux conteneurs doivent
partager un réseau Docker ou disposer d'une liaison interne sécurisée.

Le dashboard exige OAuth2 Discord et revérifie les droits de gestion du
serveur pour chaque requête API. Ne pas utiliser une URL HTTP publique.

## 4. Installation native Unraid (sans Docker Compose)

**Pulse Discord Music** et le conteneur de monitoring nommé simplement
**Pulse** sont deux applications différentes : ne pas les confondre.

### Méthode A — Template Unraid (disponible immédiatement)

Le template source est
[templates/unraid/pulse.xml](../templates/unraid/pulse.xml).
Sur Unraid 6.10+ l'ancien menu « Template repositories » n'est plus
présent sur de nombreuses versions : pour utiliser un template non
encore répertorié dans Community Applications, vous pouvez l'installer
en une commande dans le terminal Unraid :

```sh
mkdir -p /boot/config/plugins/dockerMan/templates-user
wget -q -O /boot/config/plugins/dockerMan/templates-user/my-pulse-discord-music.xml \
  https://raw.githubusercontent.com/MEHDImp4/pulse/master/templates/unraid/pulse.xml
```

Ensuite, uniquement dans l'interface web : **Docker → Add Container →
Template → Pulse-Discord-Music**.

Renseigner seulement les deux champs requis :
**Discord Bot Token** et **Discord Application ID**, puis cliquez sur
**Apply/Create**. Le conteneur télécharge l'image, corrige les permissions
d'AppData, exécute le bot avec un utilisateur non privilégié et enregistre
automatiquement les slash commands. Aucun port n'est requis pour le bot.

| Option Unraid | Valeur par défaut |
|---|---|
| Repository | `ghcr.io/mehdimp4/pulse:latest` |
| AppData | `/mnt/user/appdata/pulse-discord-music` → `/data` |
| DATA_DIR | `/data` |
| Dashboard | désactivé (`DASHBOARD_PORT=0`) |
| Permissions Linux | amorçage pour AppData, puis utilisateur `node` non privilégié |

Pour récupérer une future version du template, relancer la commande
de téléchargement. Les paramètres de conteneurs existants sont conservés
par Unraid dans leurs propres templates utilisateur.

### Méthode B — Community Applications

Le dépôt inclut désormais `ca_profile.xml`, un template au format
Community Applications et les informations de licence et de support.
**L'application n'apparaîtra pas automatiquement** dans l'onglet Apps :
le propriétaire du projet doit soumettre le dépôt
[MEHDImp4/pulse](https://github.com/MEHDImp4/pulse) sur
[ca.unraid.net/submit/new](https://ca.unraid.net/submit/new), lancer
**Validate** et **Scan**, puis obtenir la validation de l'équipe Unraid.
Le catalogue contient déjà un autre logiciel nommé Pulse ; cette fiche
utilise donc le nom distinct **Pulse Discord Music**.

Une fois approuvée, il suffira d'ouvrir **Apps**, chercher
« Pulse Discord Music » et cliquer **Install**.

### Dashboard sur Unraid

Le dashboard OAuth2 est optionnel et reste désactivé par défaut.
Pour l'activer, renseigner `DASHBOARD_PORT=8080`, `DASHBOARD_PUBLIC_URL`
avec un domaine HTTPS et `DASHBOARD_CLIENT_SECRET`. Ajouter l'URL
`https://votre-domaine/oauth/callback` dans Discord OAuth2 Redirects.

Le template **n'ouvre aucun port HTTP par défaut**. Configurer un
réseau Docker partagé avec Nginx Proxy Manager / Caddy ou ajouter
explicitement un mappage de port sécurisé, avec un reverse proxy TLS.
Ne pas ouvrir directement le port du dashboard sur Internet.

En cas de refus d'accès GHCR, le package est peut-être privé :
aller sur GitHub → Packages → pulse → Package settings, puis rendre
le package public. Ne pas renseigner un token GitHub dans le template
Unraid pour contourner une image privée destinée à être publique.

Ne partagez jamais votre template après avoir renseigné des secrets.

## 5. Build local de développement

Tant que la nouvelle image GHCR n'a pas été publiée, ou si on veut tester
des modifications locales :

```sh
git clone https://github.com/MEHDImp4/pulse.git
cd pulse
sh scripts/docker-setup.sh
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Pour ajouter le dashboard, compléter la commande par
`-f dashboard/docker-compose.dashboard.yml`.

## 6. Mettre à jour et sauvegarder

Pour récupérer la nouvelle image publiée :

```sh
docker compose pull
docker compose up -d
```

Pour utiliser une version fixe, choisir un tag **qui existe dans le registre**.
La variable Compose `PULSE_IMAGE_TAG` se configure dans un fichier
`.env` à la racine ou dans le terminal (et non seulement dans
`.env.docker`, qui sert à l'environnement du conteneur).

Les données sont enregistrées dans le volume persistant `pulse-data`
(`/data`) : files, rôles DJ, playlists, statistiques. Sauvegarder ce volume.
Sur Unraid, sauvegarder `/mnt/user/appdata/pulse`.

```sh
docker compose ps
docker compose logs --tail=150 bot
docker compose exec bot yt-dlp --version
docker compose exec bot ffmpeg -version
```

Si le téléchargement GHCR échoue, vérifier que l'action de publication
a réussi, que le package est **public** et que le tag demandé est disponible.
Si une slash command manque, vérifier les scopes de l'invitation, l'Application
ID, l'ID du serveur et les logs de synchronisation.

Pour éviter de perdre les données, **ne jamais supprimer le volume**
`pulse-data` pendant une réinstallation.
