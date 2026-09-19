import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { describe, expect, it } from "vitest";
import { canUseDjControls } from "../src/utils/permissions";

describe("canUseDjControls", () => {
  it("allows members with Manage Guild", () => {
    expect(canUseDjControls(new PermissionsBitField([PermissionFlagsBits.ManageGuild]))).toBe(true);
  });

  it("rejects members without Manage Guild", () => {
    expect(canUseDjControls(new PermissionsBitField([]))).toBe(false);
    expect(canUseDjControls(new PermissionsBitField([PermissionFlagsBits.Connect]))).toBe(false);
  });

  it("rejects missing permissions", () => {
    expect(canUseDjControls(null)).toBe(false);
    expect(canUseDjControls(undefined)).toBe(false);
  });
});
