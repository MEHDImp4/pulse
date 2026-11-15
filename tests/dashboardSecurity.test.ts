import { describe, expect, it } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { canManageGuild, DashboardSessionStore, secureEquals, isValidDashboardAction, LocalDashboardAuth, isLocalDashboardHost } from "../src/dashboard/security";

describe("OAuth dashboard access control", () => {
  it("allows owner, administrator and ManageGuild, denies others", () => {
    expect(canManageGuild({ id: "1", name: "A", permissions: "0", owner: true })).toBe(true);
    expect(canManageGuild({ id: "1", name: "A", permissions: String(PermissionFlagsBits.ManageGuild) })).toBe(true);
    expect(canManageGuild({ id: "1", name: "A", permissions: String(PermissionFlagsBits.Administrator) })).toBe(true);
    expect(canManageGuild({ id: "1", name: "A", permissions: "0" })).toBe(false);
    expect(canManageGuild({ id: "1", name: "A", permissions: "invalid" })).toBe(false);
  });
  it("requires non-empty equal state and CSRF tokens", () => {
    expect(secureEquals("abc", "abc")).toBe(true);
    expect(secureEquals("abc", "xyz")).toBe(false);
    expect(secureEquals("", "")).toBe(false);
  });
  it("bounds sessions, expires them, and revokes on logout", () => {
    let now = 100;
    const store = new DashboardSessionStore(() => now, 2);
    const a = store.create();
    const b = store.create();
    const c = store.create();
    expect(store.get(a.id)).toBeUndefined();
    expect(store.get(b.id)).toBeDefined();
    expect(store.get(c.id)).toBeDefined();
    store.revoke(b.id);
    expect(store.get(b.id)).toBeUndefined();
    now += 86_400_001;
    expect(store.get(c.id)).toBeUndefined();
  });
  it("rejects invalid action payloads", () => {
    expect(isValidDashboardAction(null)).toBe(false);
    expect(isValidDashboardAction({ action: "skip" })).toBe(true);
    expect(isValidDashboardAction({ action: 123 })).toBe(false);
  });
});

describe("Unraid local dashboard authentication", () => {
  it("requires a sufficiently long password and compares without plain-text session secrets", () => {
    expect(() => new LocalDashboardAuth("short")).toThrow("12");
    const auth = new LocalDashboardAuth("uniQue-long-LAN-password");
    expect(auth.check("wrong", "192.168.1.20")).toBe("denied");
    expect(auth.check("uniQue-long-LAN-password", "192.168.1.20")).toBe("ok");
    expect(auth.check("uniQue-long-LAN-passwordx", "192.168.1.20")).toBe("denied");
  });

  it("blocks repeated failed logins per remote address and resets after 10 minutes", () => {
    let now = 1_000;
    const auth = new LocalDashboardAuth("another-very-long-password", () => now);
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(auth.check("invalid", "10.0.0.50")).toBe("denied");
    }
    expect(auth.check("another-very-long-password", "10.0.0.50")).toBe("limited");
    // Other LAN clients still can authenticate.
    expect(auth.check("another-very-long-password", "10.0.0.51")).toBe("ok");
    now += 10 * 60_000 + 1;
    expect(auth.check("another-very-long-password", "10.0.0.50")).toBe("ok");
  });

  it("limits the Host header to private IPs and localhost to resist DNS rebinding", () => {
    for (const host of [
      "192.168.1.10:8090", "10.0.0.20:8095", "172.17.0.1:8090",
      "100.80.10.20:8090", "127.0.0.1:8090", "localhost:8090",
      "[::1]:8090", "[fd00::10]:8090",
    ]) {
      expect(isLocalDashboardHost(host), host).toBe(true);
    }
    for (const host of [
      undefined, "", "example.com:8090", "192.168.1.10.evil.com:8090",
      "8.8.8.8:8090", "172.32.1.2:8090", "100.128.0.10:8090",
      "http://192.168.1.10:8090", "192.168.1.10:8090/evil",
    ]) {
      expect(isLocalDashboardHost(host), String(host)).toBe(false);
    }
  });

  it("expires local-password sessions through the existing session store", () => {
    let now = 1_000;
    const store = new DashboardSessionStore(() => now);
    const { id, session } = store.create();
    session.userId = "local-admin";
    session.localAuthenticated = true;
    session.expiresAt = now + 60 * 60_000;
    expect(store.get(id)?.localAuthenticated).toBe(true);
    now += 60 * 60_000 + 1;
    expect(store.get(id)).toBeUndefined();
  });
});
