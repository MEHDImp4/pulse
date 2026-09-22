import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { hasExited, terminateAll } from "../src/utils/childProcess";

interface FakeProcess extends EventEmitter {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  pid: number;
  kill: (signal?: NodeJS.Signals) => boolean;
}

function fakeProcess(options: { exitOnSigterm?: boolean } = {}): FakeProcess {
  const process = new EventEmitter() as FakeProcess;
  process.exitCode = null;
  process.signalCode = null;
  process.pid = 4242;
  process.kill = vi.fn((signal?: NodeJS.Signals) => {
    if (signal === "SIGTERM" && options.exitOnSigterm) {
      process.signalCode = "SIGTERM";
      queueMicrotask(() => process.emit("exit", 0, "SIGTERM"));
    }
    if (signal === "SIGKILL") {
      process.signalCode = "SIGKILL";
      queueMicrotask(() => process.emit("exit", 0, "SIGKILL"));
    }
    return true;
  });
  return process;
}

const asChild = (process: FakeProcess): ChildProcess => process as unknown as ChildProcess;

describe("hasExited", () => {
  it("is false while the process is alive", () => {
    expect(hasExited(asChild(fakeProcess()))).toBe(false);
  });

  it("is true once an exit code or signal is recorded", () => {
    const process = fakeProcess();
    process.exitCode = 0;
    expect(hasExited(asChild(process))).toBe(true);
  });
});

describe("terminateAll", () => {
  it("resolves immediately for an empty list", async () => {
    await expect(terminateAll([])).resolves.toBeUndefined();
  });

  it("terminates gracefully when the process exits on SIGTERM", async () => {
    const process = fakeProcess({ exitOnSigterm: true });

    await terminateAll([asChild(process)], { graceMs: 100 });

    expect(process.kill).toHaveBeenCalledTimes(1);
    expect(process.kill).toHaveBeenCalledWith("SIGTERM");
    expect(hasExited(asChild(process))).toBe(true);
  });

  it("escalates to SIGKILL when the process ignores SIGTERM", async () => {
    const process = fakeProcess();
    const onForceKill = vi.fn();

    await terminateAll([asChild(process)], { graceMs: 10, onForceKill });

    expect(process.kill).toHaveBeenCalledWith("SIGTERM");
    expect(process.kill).toHaveBeenCalledWith("SIGKILL");
    expect(onForceKill).toHaveBeenCalledTimes(1);
    expect(hasExited(asChild(process))).toBe(true);
  });

  it("does not signal a process that already exited", async () => {
    const process = fakeProcess();
    process.exitCode = 0;

    await terminateAll([asChild(process)], { graceMs: 10 });

    expect(process.kill).not.toHaveBeenCalled();
  });
});
