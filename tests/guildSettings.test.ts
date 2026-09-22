import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_GUILD_SETTINGS,
  GuildSettingsStore,
  mergeSettings,
  sanitizeSettings,
} from "../src/music/GuildSettingsStore";

describe("sanitizeSettings", () => {
  it("keeps valid values", () => {
    expect(sanitizeSettings({ volume: 30, loopMode: "track", autoplay: true, filter: "8d" })).toEqual({
      volume: 30,
      loopMode: "track",
      autoplay: true,
      filter: "8d",
    });
  });

  it("clamps and rounds the volume", () => {
    expect(sanitizeSettings({ volume: 250 }).volume).toBe(100);
    expect(sanitizeSettings({ volume: -10 }).volume).toBe(0);
    expect(sanitizeSettings({ volume: 42.6 }).volume).toBe(43);
  });

  it("falls back to defaults for invalid input", () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_GUILD_SETTINGS);
    expect(sanitizeSettings({ volume: "loud", loopMode: "nope" })).toEqual(DEFAULT_GUILD_SETTINGS);
  });
});

describe("mergeSettings", () => {
  it("updates only the provided field", () => {
    expect(mergeSettings({ volume: 20, loopMode: "off", autoplay: true, filter: "off" }, { loopMode: "queue" })).toEqual({
      volume: 20,
      loopMode: "queue",
      autoplay: true,
      filter: "off",
    });
  });
});

describe("GuildSettingsStore", () => {
  const dirs: string[] = [];

  function tempFile(): string {
    const dir = mkdtempSync(join(tmpdir(), "pulse-settings-"));
    dirs.push(dir);
    return join(dir, "guild-settings.json");
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("returns defaults for unknown sessions", () => {
    const store = new GuildSettingsStore(tempFile(), 0);
    expect(store.get("g1:chan", "g1")).toEqual(DEFAULT_GUILD_SETTINGS);
  });

  it("persists and reloads session settings", () => {
    const file = tempFile();
    const store = new GuildSettingsStore(file, 0);
    store.update("g1:chan", "g1", { volume: 35 });
    store.update("g1:chan", "g1", { loopMode: "queue" });
    store.flush();

    const reloaded = new GuildSettingsStore(file, 0);
    reloaded.load();
    expect(reloaded.get("g1:chan", "g1")).toEqual({ volume: 35, loopMode: "queue", autoplay: true, filter: "off" });
  });

  it("keeps different sessions of the same guild independent", () => {
    const file = tempFile();
    const store = new GuildSettingsStore(file, 0);
    store.update("g1:chanA", "g1", { volume: 10 });
    store.update("g1:chanB", "g1", { volume: 80 });

    expect(store.get("g1:chanA", "g1").volume).toBe(10);
    expect(store.get("g1:chanB", "g1").volume).toBe(80);
  });

  it("falls back to guild defaults for a fresh session", () => {
    const file = tempFile();
    writeFileSync(
      file,
      JSON.stringify({ version: 2, guilds: { g1: { volume: 20, loopMode: "track" } }, sessions: {} }),
      "utf8",
    );

    const store = new GuildSettingsStore(file, 0);
    store.load();
    expect(store.get("g1:brand-new", "g1")).toEqual({ volume: 20, loopMode: "track", autoplay: true, filter: "off" });
  });

  it("migrates the legacy v1 flat format into guild defaults", () => {
    const file = tempFile();
    writeFileSync(file, JSON.stringify({ g1: { volume: 30, loopMode: "queue" } }), "utf8");

    const store = new GuildSettingsStore(file, 0);
    store.load();
    expect(store.get("g1:any-chan", "g1")).toEqual({ volume: 30, loopMode: "queue", autoplay: true, filter: "off" });
  });

  it("persists the autoplay toggle", () => {
    const file = tempFile();
    const store = new GuildSettingsStore(file, 0);
    store.update("g1:chan", "g1", { autoplay: true });
    store.flush();

    const reloaded = new GuildSettingsStore(file, 0);
    reloaded.load();
    expect(reloaded.get("g1:chan", "g1").autoplay).toBe(true);
  });

  it("moves session overrides to a new id", () => {
    const store = new GuildSettingsStore(tempFile(), 0);
    store.update("g1:chanA", "g1", { volume: 15 });

    store.moveSession("g1:chanA", "g1:chanB");

    expect(store.get("g1:chanA", "g1")).toEqual(DEFAULT_GUILD_SETTINGS);
    expect(store.get("g1:chanB", "g1").volume).toBe(15);
  });

  it("ignores moveSession for an unknown source", () => {
    const store = new GuildSettingsStore(tempFile(), 0);
    expect(() => store.moveSession("g1:none", "g1:other")).not.toThrow();
    expect(store.get("g1:other", "g1")).toEqual(DEFAULT_GUILD_SETTINGS);
  });

  it("recovers from a corrupt file using defaults", () => {
    const file = tempFile();
    writeFileSync(file, "{ not valid json", "utf8");
    const store = new GuildSettingsStore(file, 0);
    store.load();
    expect(store.get("g1:chan", "g1")).toEqual(DEFAULT_GUILD_SETTINGS);
  });
});
