import { describe, expect, it } from "vitest";
import {
  checkExternalTool,
  getExternalToolStatus,
  verifyExternalTools,
  type ToolRunner,
} from "../src/utils/externalTools";

describe("checkExternalTool", () => {
  it("reports success and the first version line", async () => {
    const runner: ToolRunner = async () => ({ stdout: "ffmpeg version 7.0\nbuilt with gcc", stderr: "" });
    const result = await checkExternalTool(runner, "ffmpeg", "ffmpeg", ["-version"]);
    expect(result.ok).toBe(true);
    expect(result.version).toBe("ffmpeg version 7.0");
  });

  it("captures the error when the binary cannot be spawned", async () => {
    const runner: ToolRunner = async () => {
      throw new Error("spawn ffmpeg ENOENT");
    };
    const result = await checkExternalTool(runner, "ffmpeg", "ffmpeg", ["-version"]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ENOENT");
  });
});

describe("verifyExternalTools", () => {
  it("probes both tools with the configured paths", async () => {
    const probed: string[] = [];
    const runner: ToolRunner = async (executable) => {
      probed.push(executable);
      return { stdout: `${executable} 1.0\n`, stderr: "" };
    };

    const results = await verifyExternalTools(runner);

    expect(probed).toEqual(["ffmpeg", "yt-dlp"]);
    expect(results.map((result) => result.name)).toEqual(["ffmpeg", "yt-dlp"]);
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("caches the last probe results for cheap diagnostics", async () => {
    const runner: ToolRunner = async (executable) => ({ stdout: `${executable} 1.0\n`, stderr: "" });

    await verifyExternalTools(runner);

    const status = getExternalToolStatus();
    expect(status.map((result) => result.name)).toEqual(["ffmpeg", "yt-dlp"]);
    expect(status.every((result) => result.ok)).toBe(true);
  });
});
