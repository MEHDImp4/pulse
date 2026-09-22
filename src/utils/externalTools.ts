import { env } from "../config/env";
import { logger } from "./logger";
import { runProcess } from "./process";

export type ExternalToolName = "ffmpeg" | "yt-dlp";

export interface ExternalToolResult {
  name: ExternalToolName;
  path: string;
  ok: boolean;
  version?: string;
  error?: string;
}

export type ToolRunner = (
  executable: string,
  args: string[],
  options: { timeoutMs: number; maxOutputBytes?: number },
) => Promise<{ stdout: string; stderr: string }>;

let lastResults: readonly ExternalToolResult[] = [];

/** Last startup probe results, for cheap diagnostics (e.g. /status). */
export function getExternalToolStatus(): readonly ExternalToolResult[] {
  return lastResults;
}

function firstLine(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

/** Probes a single binary through `--version`-style output. Never throws. */
export async function checkExternalTool(
  runner: ToolRunner,
  name: ExternalToolName,
  executable: string,
  args: string[],
  timeoutMs = 10_000,
): Promise<ExternalToolResult> {
  try {
    const { stdout } = await runner(executable, args, { timeoutMs, maxOutputBytes: 64_000 });
    return { name, path: executable, ok: true, version: firstLine(stdout) };
  } catch (error) {
    return {
      name,
      path: executable,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Verifies at startup that yt-dlp and FFmpeg are runnable, logging a clear
 * warning instead of failing only on the first /play. Never blocks startup.
 */
export async function verifyExternalTools(runner: ToolRunner = runProcess): Promise<ExternalToolResult[]> {
  const results = await Promise.all([
    checkExternalTool(runner, "ffmpeg", env.ffmpegPath, ["-version"]),
    checkExternalTool(runner, "yt-dlp", env.ytdlpPath, ["--version"]),
  ]);
  lastResults = results;

  for (const result of results) {
    if (result.ok) {
      logger.info(
        { tool: result.name, path: result.path, version: result.version },
        "External tool available",
      );
    } else {
      logger.warn(
        { tool: result.name, path: result.path, err: result.error },
        "External tool unavailable; playback will fail until it is installed in PATH",
      );
    }
  }

  return results;
}
