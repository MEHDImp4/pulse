import { describe, expect, it } from "vitest";
import { resolveRadioEndpoint } from "../src/providers/SafeRadioStream";

describe("resolveRadioEndpoint", () => {
  it("pins a public address from a validated resolver", async () => {
    const result = await resolveRadioEndpoint("https://radio.example.com/live.mp3", {
      resolveHost: async () => [{ address: "8.8.8.8" }],
    });
    expect(result).toMatchObject({
      address: "8.8.8.8",
      family: 4,
    });
  });

  it("rejects private and mixed DNS results", async () => {
    await expect(resolveRadioEndpoint("https://radio.example.com", {
      resolveHost: async () => [{ address: "1.1.1.1" }, { address: "127.0.0.1" }],
    })).rejects.toThrow();
  });

  it("rejects internal hostnames and cloud metadata IP addresses", async () => {
    await expect(resolveRadioEndpoint("http://localhost:8000/live")).rejects.toThrow();
    await expect(resolveRadioEndpoint("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
  });

  it("applies an exact host allowlist to every resolved destination", async () => {
    await expect(resolveRadioEndpoint("https://evil.example.com/live", {
      allowedHosts: ["radio.example.com"],
      resolveHost: async () => [{ address: "8.8.8.8" }],
    })).rejects.toThrow();
  });

  it("rejects URLs with embedded credentials", async () => {
    await expect(resolveRadioEndpoint("https://admin:secret@radio.example.com/live")).rejects.toThrow();
  });
});
