# Pulse — Dashboard local sur Unraid en quelques clics

Ce guide s'applique au **bot Pulse Discord Music** installé avec le
[template Unraid](../templates/unraid/pulse.xml).
Aucun domaine, reverse proxy ou Client Secret OAuth Discord n'est nécessaire
pour utiliser le dashboard **sur un réseau local privé de confiance**.

## Configuration

1. Dans Unraid, ouvrir **Docker → Pulse-Discord-Music → Edit**.
   Si les champs ci-dessous n'apparaissent pas, télécharger le dernier
   template depuis
   `https://raw.githubusercontent.com/MEHDImp4/pulse/master/templates/unraid/pulse.xml`
   et mettre à jour la configuration existante sans supprimer AppData.
2. Mettre **Dashboard - Activer** sur `true`.
3. Régler **Dashboard - Port Web (Unraid)** : `8090` par défaut,
   ou `8095` si `8090` est déjà utilisé. **Il s'agit du port hôte** :
   le port *interne* du conteneur est toujours `8090`.
4. Définir **Dashboard - Mot de passe local** : 12 caractères minimum,
   idéalement un mot de passe long et unique.
5. Garder **Dashboard - Mode de connexion** sur `local`
   (dans les options avancées). Cliquer sur **Apply** et laisser
   le conteneur redémarrer.
6. Ouvrir **Docker → Pulse-Discord-Music → WebUI**, ou saisir dans un navigateur :

   ```text
   http://IP_DE_TON_UNRAID:8090
   ```

   Remplacer `8090` par votre port hôte si vous l'avez changé.
   Se connecter avec le mot de passe du champ Unraid.

Le dashboard affiche les serveurs où Pulse est installé, la file musicale,
la lecture, les commandes de contrôle et les statistiques. **Les sessions
vocales doivent être démarrées dans Discord** via `/play`.

## Désactiver le dashboard

Dans **Docker → Pulse-Discord-Music → Edit**, remettre
**Dashboard - Activer** à `false` puis **Apply**. Le bot musical
continue de fonctionner ; les playlists et réglages AppData sont conservés.

## Problèmes courants

| Symptôme | Vérification |
|---|---|
| Aucun bouton WebUI | Actualiser le template Unraid ; vérifier son champ `WebUI` |
| Page inaccessible | Dashboard activé, conteneur démarré, port hôte libre, réseau `bridge`, mappage `8090/tcp` |
| Mot de passe refusé | Minimum 12 caractères ; vérifier la valeur saisie dans Unraid |
| Message « adresse IP privée » | Ouvrir le site avec l'**IP locale** d'Unraid et non un nom de domaine public |
| Pas de musique dans le dashboard | Rejoindre Discord et lancer `/play` |
| Erreur de port | Changer le **port hôte** (par exemple `8095`), ne pas changer le port interne `8090` |

Les logs sont dans **Docker → Pulse-Discord-Music → Logs**. Si un ancien
conteneur contient encore la variable avancée `DASHBOARD_PORT=8080` ou
`DASHBOARD_PORT=0`, supprimer cette ancienne surcharge ou la remplacer
par `8090` pour la faire correspondre au nouveau mappage.

## Sécurité

- Ne pas rediriger le port du dashboard sur votre box/routeur Internet.
- Le mode local est prévu pour un **LAN privé de confiance** ou un tunnel
  privé. Le mot de passe circule par HTTP : ne pas l'utiliser sur un réseau Wi-Fi
  ouvert ou non fiable sans HTTPS/tunnel chiffré.
- Quiconque connaît ce mot de passe peut administrer **tous** les serveurs
  Discord auxquels Pulse est connecté. Garder ce mot de passe secret.
- Pour rendre le dashboard accessible publiquement, choisir le mode avancé
  **discord** et suivre le guide
  [OAuth2 Discord + reverse proxy HTTPS](DOCKER_INSTALL.md#3-dashboard-web-facultatif).
