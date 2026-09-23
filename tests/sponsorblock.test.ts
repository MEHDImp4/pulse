import { describe, expect, it } from "vitest";
import { sponsorblockArgs } from "../src/providers/YtDlpProvider";

describe("sponsorblockArgs", () => {
  it("removes segments in remove mode", () => {
    expect(sponsorblockArgs("remove", "sponsor,selfpromo")).toEqual([
      "--sponsorblock-remove",
      "sponsor,selfpromo",
    ]);
  });

  it("only marks segments in mark mode", () => {
    expect(sponsorblockArgs("mark", "sponsor")).toEqual(["--sponsorblock-mark", "sponsor"]);
  });

  it("returns nothing when disabled", () => {
    expect(sponsorblockArgs("off", "sponsor")).toEqual([]);
  });

  it("returns nothing when no category is configured", () => {
    expect(sponsorblockArgs("remove", "  ")).toEqual([]);
  });
});
