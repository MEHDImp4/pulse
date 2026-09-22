# Security Policy

## 🇬🇧 English

### Supported versions

Security fixes are applied to the latest `master`. There is no long-term support branch.

### Reporting a vulnerability

Please **do not** open a public issue for security problems.

Use GitHub's private reporting instead:

1. Go to the **Security** tab of the repository.
2. Click **Report a vulnerability** (GitHub Security Advisories).

You can also reach the maintainer privately on GitHub: [@MEHDImp4](https://github.com/MEHDImp4).

Please include: a description, reproduction steps, impact, and any suggested fix.

We aim to acknowledge reports within a few days. Credit will be given unless you prefer to stay anonymous.

### Never share secrets

Do **not** paste your Discord token, cookies, or `.env` contents in an issue, PR, or discussion. If you accidentally expose a token, **revoke it immediately** in the [Discord Developer Portal](https://discord.com/developers/applications) and generate a new one.

### Dependencies and known advisories

Dependencies are reviewed weekly via Dependabot and `npm audit`.

- **`tar` via `@discordjs/opus` → `@discordjs/node-pre-gyp`**: `node-pre-gyp` still pins `tar@^6`, so a package-level `overrides` entry forces the patched `tar@^7.5.22`. The chain is only used at install time to extract prebuilt native binaries, not at runtime. Re-check the override on any `@discordjs/opus` bump.
- **`@discordjs/voice`** is intentionally pinned to a `1.0.0-dev` snapshot (Dependabot ignores it). The `1.0.0` line carries the current Discord voice protocol support (DAVE/encryption); the latest stable `0.19.2` predates it, so downgrading is expected to break voice. Re-evaluate on every manual bump, as pre-release builds can change without notice. To evaluate a newer snapshot (e.g. `1.0.0-dev.1790035407-dbb749062`): work on a throwaway branch, run `npm install`, `npm run typecheck` and `npm test`, then verify live audio on a real guild with `/testaudio` + a full `/play`; revert unless audio is confirmed. Automated checks cannot validate live voice.

### Scope

In scope: this repository's source code, Docker setup, and CI workflows.
Out of scope: vulnerabilities in third-party dependencies (report them upstream), and abuse of a bot instance you do not own.

---

## 🇫🇷 Français

### Versions supportées

Les correctifs de sécurité sont appliqués à la dernière version de `master`. Il n'y a pas de branche de support à long terme.

### Signaler une vulnérabilité

Merci de **ne pas** ouvrir d'issue publique pour un problème de sécurité.

Utilise le signalement privé de GitHub :

1. Va dans l'onglet **Security** du dépôt.
2. Clique sur **Report a vulnerability** (GitHub Security Advisories).

Tu peux aussi contacter le mainteneur en privé sur GitHub : [@MEHDImp4](https://github.com/MEHDImp4).

Indique : une description, les étapes de reproduction, l'impact et, si possible, une correction suggérée.

Nous visons une réponse sous quelques jours. Le crédit sera donné, sauf si tu préfères rester anonyme.

### Ne jamais partager de secret

**Ne colle jamais** ton token Discord, tes cookies ou le contenu de `.env` dans une issue, une PR ou une discussion. Si tu exposes un token par accident, **révoque-le immédiatement** dans le [portail développeurs Discord](https://discord.com/developers/applications) et génères-en un nouveau.

### Dépendances et avis connus

Les dépendances sont surveillées chaque semaine par Dependabot et `npm audit`.

- **`tar` via `@discordjs/opus` → `@discordjs/node-pre-gyp`** : `node-pre-gyp` épingle encore `tar@^6`, donc une entrée `overrides` force le `tar@^7.5.22` corrigé. Cette chaîne ne sert qu'à l'installation (extraction des binaires natifs préconstruits), jamais à l'exécution. À revérifier à chaque montée de `@discordjs/opus`.
- **`@discordjs/voice`** est volontairement épinglé à un snapshot `1.0.0-dev` (ignoré par Dependabot). La branche `1.0.0` embarque le support du protocole vocal actuel de Discord (DAVE/chiffrement) ; le dernier stable `0.19.2` est antérieur, donc rétrograder casserait la voix. À réévaluer à chaque montée manuelle, un build pré-release pouvant changer sans préavis. Pour évaluer un snapshot plus récent (ex. `1.0.0-dev.1790035407-dbb749062`) : travaille sur une branche jetable, lance `npm install`, `npm run typecheck` et `npm test`, puis vérifie l'audio réel sur un vrai serveur avec `/testaudio` + un `/play` complet ; reviens en arrière si l'audio n'est pas confirmé. Les vérifications automatiques ne peuvent pas valider la voix en conditions réelles.

### Périmètre

Dans le périmètre : le code source de ce dépôt, la configuration Docker et les workflows CI.
Hors périmètre : les vulnérabilités des dépendances tierces (à signaler en amont) et l'abus d'une instance du bot que tu ne possèdes pas.
