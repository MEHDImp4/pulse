import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true })));

describe("Docker first-run setup", () => {
  it("generates a 0600 environment file without printing secrets", () => {
    const root = mkdtempSync(join(tmpdir(), "pulse-docker-test-"));
    roots.push(root);
    mkdirSync(join(root, "scripts"));
    copyFileSync("scripts/docker-setup.sh", join(root, "scripts/docker-setup.sh"));
    copyFileSync(".env.docker.example", join(root, ".env.docker.example"));

    const token = "TEST.private-token_01";
    const input = [token, "123456789012345678", "987654321098765432", "n"].join("\n") + "\n";
    const run = spawnSync("sh", ["scripts/docker-setup.sh"], {
      cwd: root, input, encoding: "utf8", timeout: 8_000,
    });

    expect(run.status).toBe(0);
    const env = readFileSync(join(root, ".env.docker"), "utf8");
    expect(env).toContain(`DISCORD_TOKEN=${token}`);
    expect(env).toContain("DISCORD_CLIENT_ID=123456789012345678");
    expect(env).toContain("DISCORD_GUILD_ID=987654321098765432");
    expect(env).toContain("PULSE_DEPLOY_COMMANDS_ON_START=true");
    expect(env).toContain("DASHBOARD_PORT=0");
    expect(statSync(join(root, ".env.docker")).mode & 0o777).toBe(0o600);
    expect(run.stdout).not.toContain(token);
    expect(run.stderr).not.toContain(token);
  });

  it("sets up optional OAuth dashboard without printing its client secret", () => {
    const root = mkdtempSync(join(tmpdir(), "pulse-docker-oauth-"));
    roots.push(root);
    mkdirSync(join(root, "scripts"));
    copyFileSync("scripts/docker-setup.sh", join(root, "scripts/docker-setup.sh"));
    copyFileSync(".env.docker.example", join(root, ".env.docker.example"));
    const secret = "SAFE_OAUTH_TEST_SECRET";
    const input = ["TEST_BOT_TOKEN", "123456789012345678", "", "y", "https://pulse.example.com", secret].join("\n") + "\n";
    const result = spawnSync("sh", ["scripts/docker-setup.sh"], {
      cwd: root, input, encoding: "utf8", timeout: 8_000,
    });
    expect(result.status).toBe(0);
    const env = readFileSync(join(root, ".env.docker"), "utf8");
    expect(env).toContain("DASHBOARD_PORT=8080");
    expect(env).toContain("DASHBOARD_BIND=0.0.0.0");
    expect(env).toContain("DASHBOARD_PUBLIC_URL=https://pulse.example.com");
    expect(env).toContain(`DASHBOARD_CLIENT_SECRET=${secret}`);
    expect(result.stdout).not.toContain(secret);
    expect(result.stderr).not.toContain(secret);
  });

  it("rejects invalid credentials without writing the env file", () => {
    const root = mkdtempSync(join(tmpdir(), "pulse-docker-invalid-"));
    roots.push(root);
    mkdirSync(join(root, "scripts"));
    copyFileSync("scripts/docker-setup.sh", join(root, "scripts/docker-setup.sh"));
    copyFileSync(".env.docker.example", join(root, ".env.docker.example"));
    const run = spawnSync("sh", ["scripts/docker-setup.sh"], {
      cwd: root, input: "secret with spaces\n", encoding: "utf8", timeout: 8_000,
    });
    expect(run.status).not.toBe(0);
    expect(() => readFileSync(join(root, ".env.docker"), "utf8")).toThrow();
  });
});
