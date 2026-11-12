import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { PermissionsBitField, PermissionFlagsBits } from "discord.js";
import { DjRoleStore } from "../src/music/DjRoleStore";
import { canUseDjControls } from "../src/utils/permissions";

describe("DJ roles", () => {
  it("persists guild-scoped roles and allows an assigned member", () => {
    const dir = mkdtempSync(join(tmpdir(), "pulse-dj-"));
    try {
      const path = join(dir, "roles.json");
      const store = new DjRoleStore(path);
      const id = "123456789012345678";
      expect(store.addRole("g1", id)).toBe(true);
      expect(store.addRole("g1", id)).toBe(false);
      expect(store.getRoles("g2")).toEqual([]);
      expect(new DjRoleStore(path).getRoles("g1")).toEqual([id]);
      expect(canUseDjControls(new PermissionsBitField([]), [id], store.getRoles("g1"))).toBe(true);
      expect(canUseDjControls(new PermissionsBitField([]), [id], store.getRoles("g2"))).toBe(false);
      expect(canUseDjControls(new PermissionsBitField([PermissionFlagsBits.ManageGuild]))).toBe(true);
      expect(store.removeRole("g1", id)).toBe(true);
      expect(store.getRoles("g1")).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
