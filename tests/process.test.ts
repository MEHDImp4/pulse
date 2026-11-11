import { describe, expect, it } from "vitest";
import { runProcess } from "../src/utils/process";

describe("runProcess", () => {
  it("captures stdout and stderr separately", async () => {
    const { stdout, stderr } = await runProcess(process.execPath, [
      "-e", "process.stdout.write('hello'); process.stderr.write('notice')",
    ], { timeoutMs: 5_000 });
    expect(stdout).toBe("hello");
    expect(stderr).toBe("notice");
  });

  it("keeps large outputs intact across multiple chunks", async () => {
    const { stdout } = await runProcess(process.execPath, [
      "-e", "process.stdout.write('x'.repeat(200000))",
    ], { timeoutMs: 5_000, maxOutputBytes: 250_000 });
    expect(stdout).toHaveLength(200_000);
    expect(stdout).toBe("x".repeat(200_000));
  });

  it("rejects processes that exceed the output cap", async () => {
    await expect(runProcess(process.execPath, [
      "-e", "process.stdout.write('x'.repeat(10000))",
    ], { timeoutMs: 5_000, maxOutputBytes: 100 })).rejects.toThrow("too much output");
  });

  it("kills tools that do not respond before their deadline", async () => {
    await expect(runProcess(process.execPath, [
      "-e", "setInterval(() => {}, 1000)",
    ], { timeoutMs: 350 })).rejects.toThrow("timed out");
  });
});
