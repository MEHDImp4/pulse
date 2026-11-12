import { REST, Routes } from "discord.js";
import { commands } from "./commands";
import { env } from "./config/env";
import { logger } from "./utils/logger";

/** Register commands only within the configured scope.
 * Never clear all guilds automatically: /users/@me/guilds requires an OAuth
 * user token, not the bot token, and removing other scopes is destructive.
 */
async function main(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(env.discordToken);
  const body = commands.map((command) => command.data.toJSON());
  const args = process.argv.slice(2);

  if (args.length === 1 && args[0] === "--clear-global") {
    await rest.put(Routes.applicationCommands(env.discordClientId), { body: [] });
    logger.info("Explicitly cleared global commands");
    return;
  }

  if (args.length === 1 && args[0].startsWith("--clear-guild=")) {
    const guildId = args[0].slice("--clear-guild=".length);
    if (!/^\d{15,22}$/.test(guildId)) throw new Error("Invalid Discord guild ID");
    await rest.put(Routes.applicationGuildCommands(env.discordClientId, guildId), { body: [] });
    logger.info({ guildId }, "Explicitly cleared guild commands");
    return;
  }

  if (args.length > 0) {
    throw new Error("Usage: deploy-commands [--clear-global|--clear-guild=ID]");
  }

  if (env.discordGuildId) {
    await rest.put(Routes.applicationGuildCommands(env.discordClientId, env.discordGuildId), { body });
    logger.info({ count: body.length, guild: env.discordGuildId }, "Registered guild slash commands");
  } else {
    await rest.put(Routes.applicationCommands(env.discordClientId), { body });
    logger.info({ count: body.length }, "Registered global slash commands");
  }
}

main().catch((error) => {
  logger.error({ err: error }, "Discord slash command registration failed");
  process.exitCode = 1;
});
