import { describe, expect, it } from "vitest";
import { renderProgressBar } from "../src/ui/progress";

describe("renderProgressBar", () => {
  it("shows elapsed only when duration is unknown", () => {
    expect(renderProgressBar(65_000, undefined)).toBe("▶ 1:05");
  });

  it("puts the knob at the end for a full bar", () => {
    const bar = renderProgressBar(100_000, 100);
    expect(bar).toContain("●");
    expect(bar).not.toContain("●─");
  });

  it("puts the knob at the start for an empty bar", () => {
    expect(renderProgressBar(0, 100).startsWith("●")).toBe(true);
  });

  it("includes elapsed and total durations", () => {
    expect(renderProgressBar(30_000, 60)).toContain("0:30 / 1:00");
  });

  it("clamps progress beyond the total", () => {
    expect(() => renderProgressBar(200_000, 60)).not.toThrow();
  });

  it("treats non-positive duration as unknown", () => {
    expect(renderProgressBar(5_000, 0)).toBe("▶ 0:05");
  });
});
