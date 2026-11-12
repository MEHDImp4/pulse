# Contributing to Pulse

🇫🇷 [Français](#-français) · 🇬🇧 [English](#-english)

---

## 🇬🇧 English

Thanks for your interest in contributing! Here's how to get started.

### Setup

```bash
npm install
cp .env.example .env   # set DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
npm run deploy:commands
npm run dev
```

### Before opening a PR

```bash
npm run typecheck   # TypeScript check (src + tests)
npm test            # unit tests
```

CI (build + tests) must pass before a PR can be merged.

### Project conventions

- **UI language**: French (bot messages). Errors are prefixed `❌`, info `ℹ️`.
- **Commands**: one file per command in `src/commands/`, exporting a `CommandDefinition`, added to the barrel `src/commands/index.ts`. Add a `usage` string and an optional `cooldownSeconds`.
- **External processes**: always `spawn()` with `shell: false` and an argument list — never a shell command built from user input.
- **Logging**: via pino (`src/utils/logger.ts`).
- **Tests**: vitest, for pure logic (queue, loop `decideNext`, cooldowns, vote threshold, progress, parsing).
- **Secrets**: never commit tokens or cookies. `.env` and `.env.docker` are git-ignored.

### Adding a command

1. Create `src/commands/mycommand.ts` exporting `mycommand: CommandDefinition`.
2. Add it to the array in `src/commands/index.ts`.
3. Add a pure test under `tests/` if it has logic worth testing.
4. Update the command tables in `README.md` and `README.fr.md`.

### Commit messages

Clear, imperative messages, ideally prefixed: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `ci:`.

### Good first issues

New to the project? Look for issues labeled [`good first issue`](https://github.com/MEHDImp4/pulse/labels/good%20first%20issue) — they're scoped to be approachable. Feel free to ask questions in the issue or in [Discussions](https://github.com/MEHDImp4/pulse/discussions).

---

## 🇫🇷 Français

Merci de l'intérêt porté au projet ! Voici comment commencer.

### Mise en place

```bash
npm install
cp .env.example .env   # renseigne DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
npm run deploy:commands
npm run dev
```

### Avant de proposer une PR

```bash
npm run typecheck   # vérification TypeScript (src + tests)
npm test            # tests unitaires
```

La CI (build + tests) doit passer pour qu'une PR soit fusionnée.

### Conventions du projet

- **Langue de l'UI** : français (messages du bot). Erreurs préfixées `❌`, infos préfixées `ℹ️`.
- **Commandes** : un fichier par commande dans `src/commands/`, export d'un `CommandDefinition`, ajout au barrel `src/commands/index.ts`. Ajoute une chaîne `usage` et un `cooldownSeconds` optionnel.
- **Processus externes** : toujours `spawn()` avec `shell: false` et une liste d'arguments — jamais de commande shell construite depuis une entrée utilisateur.
- **Logs** : via pino (`src/utils/logger.ts`).
- **Tests** : vitest, pour la logique pure (file, boucle `decideNext`, cooldowns, seuil de vote, progression, parsing).
- **Secrets** : ne jamais committer de token ou cookie. `.env` et `.env.docker` sont ignorés par Git.

### Ajouter une commande

1. Crée `src/commands/macommande.ts` exportant `macommande: CommandDefinition`.
2. Ajoute-la au tableau dans `src/commands/index.ts`.
3. Ajoute un test pur sous `tests/` si elle contient de la logique à tester.
4. Mets à jour les tableaux de commandes dans `README.md` et `README.fr.md`.

### Messages de commit

Messages clairs et à l'impératif, idéalement préfixés : `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `ci:`.

### Bonnes premières issues

Nouveau sur le projet ? Cherche les issues labellisées [`good first issue`](https://github.com/MEHDImp4/pulse/labels/good%20first%20issue) — elles sont pensées pour être accessibles. N'hésite pas à poser des questions dans l'issue ou dans les [Discussions](https://github.com/MEHDImp4/pulse/discussions).
