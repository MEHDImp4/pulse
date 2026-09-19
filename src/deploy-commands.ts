import { REST, Routes } from "discord.js";
import { commands } from "./commands";
import { env } from "./config/env";
import { logger } from "./utils/logger";

interface PartialGuild {
  id: string;
}

/** Removes the command set of the scope we are not using, so a guild never
 * ends up with both global and guild commands (which shows duplicates and
 * "This command is outdated" in the Discord client). */
async function clearGlobalCommands(rest: REST): Promise<void> {
  await rest.put(Routes.applicationCommands(env.discordClientId), { body: [] });
  logger.info("Cleared global commands");
}

async function clearGuildCommands(rest: REST): Promise<void> {
  const guilds = (await rest.get(Routes.userGuilds())) as PartialGuild[];
  await Promise.all(
    guilds.map((guild) =>
      rest.put(Routes.applicationGuildCommands(env.discordClientId, guild.id), { body: [] }),
    ),
  );
  logger.info({ guilds: guilds.length }, "Cleared guild commands");
}

async function main(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(env.discordToken);
  const body = commands.map((command) => command.data.toJSON());

  if (env.discordGuildId) {
    await rest.put(Routes.applicationGuildCommands(env.discordClientId, env.discordGuildId), { body });
    logger.info({ count: body.length, guild: env.discordGuildId }, "Registered guild commands");
    await clearGlobalCommands(rest);
  } else {
    await rest.put(Routes.applicationCommands(env.discordClientId), { body });
    logger.info({ count: body.length }, "Registered global commands");
    await clearGuildCommands(rest);
  }
}

main().catch((error) => {
  logger.error({ err: error }, "Command deployment failed");
  process.exitCode = 1;
});
