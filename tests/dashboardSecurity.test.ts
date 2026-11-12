import { describe, expect, it } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { canManageGuild, DashboardSessionStore, secureEquals, isValidDashboardAction } from "../src/dashboard/security";

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
