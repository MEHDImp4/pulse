import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Unraid Community Applications template", () => {
  const xml = readFileSync("templates/unraid/pulse.xml", "utf8");
  const profile = readFileSync("ca_profile.xml", "utf8");
  it("publishes a distinctive Discord-specific app and a pinned template URL", () => {
    expect(xml).toContain("<Name>Pulse-Discord-Music</Name>");
    expect(xml).toContain("<Repository>ghcr.io/mehdimp4/pulse:latest</Repository>");
    expect(xml).toContain("<TemplateURL>https://raw.githubusercontent.com/MEHDImp4/pulse/master/templates/unraid/pulse.xml</TemplateURL>");
    expect(xml).toContain("<License>MIT</License>");
    expect(profile).toContain("<CommunityApplications>");
    expect(profile).toContain("<Profile>");
  });
  it("keeps persistent data and bot credentials explicit", () => {
    expect(xml).toMatch(/Target="\/data"[^>]*Type="Path"/);
    expect(xml).toMatch(/Target="DATA_DIR" Default="\/data"/);
    for (const key of ["DISCORD_TOKEN", "DASHBOARD_CLIENT_SECRET", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REFRESH_TOKEN", "APPLE_MUSIC_DEVELOPER_TOKEN"]) {
      const entry = xml.split("\n").find((line) => line.includes(`Target="${key}"`));
      expect(entry).toContain('Mask="true"');
    }
  });
  it("does not expose a dashboard HTTP port by default", () => {
    expect(xml).toContain('Target="DASHBOARD_PORT" Default="0"');
    expect(xml).not.toMatch(/Type="Port"/);
    expect(xml).toContain("--cap-add=CHOWN");
    expect(xml).toContain("--cap-add=SETUID");
    expect(xml).toContain("--cap-add=SETGID");
  });
});
