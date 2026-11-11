import { spawn } from "node:child_process";

export interface RunProcessOptions {
  timeoutMs: number;
  maxOutputBytes?: number;
}

/**
 * Spawn an external tool with bounded output and deadline. Collect Buffer
 * chunks and concatenate only once: repeated string concatenation formerly
 * copied the entire output on every stdout/stderr event.
 */
export async function runProcess(
  executable: string,
  args: string[],
  options: RunProcessOptions,
): Promise<{ stdout: string; stderr: string }> {
  const maxOutputBytes = options.maxOutputBytes ?? 2_000_000;

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(error);
    };

    const timer = setTimeout(() => {
      fail(new Error(`${executable} timed out after ${options.timeoutMs} ms`));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maxOutputBytes) {
        fail(new Error(`${executable} produced too much output`));
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (settled) return;
      stderrBytes += chunk.byteLength;
      if (stderrBytes > maxOutputBytes) {
        fail(new Error(`${executable} produced too much output`));
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => fail(error));

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stderr = Buffer.concat(stderrChunks, stderrBytes).toString("utf8");
      if (code !== 0) {
        reject(new Error(`${executable} exited with code ${code}: ${stderr.trim().slice(-8000)}`));
        return;
      }
      resolve({
        stdout: Buffer.concat(stdoutChunks, stdoutBytes).toString("utf8"),
        stderr,
      });
    });
  });
}
