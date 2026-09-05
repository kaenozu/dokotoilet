import { describe, expect, it } from "vitest";
import { osmCacheKey, resolveCommunitySalt } from "./runtime";

describe("resolveCommunitySalt", () => {
  it("uses the configured salt when present", () => {
    expect(resolveCommunitySalt("production", " fixed-salt ")).toBe("fixed-salt");
  });

  it("fails closed in production when missing", () => {
    expect(() => resolveCommunitySalt("production", undefined)).toThrow(
      "COMMUNITY_SALT is required in production"
    );
    expect(() => resolveCommunitySalt("production", "   ")).toThrow(
      "COMMUNITY_SALT is required in production"
    );
  });

  it("allows an ephemeral development salt", () => {
    const salt = resolveCommunitySalt("development", undefined);
    expect(salt.length).toBeGreaterThan(10);
  });
});

describe("osmCacheKey", () => {
  it("keeps nearby but distinct centers separate", () => {
    expect(osmCacheKey(35.65901, 139.70061, 2000)).not.toBe(
      osmCacheKey(35.65991, 139.70061, 2000)
    );
  });

  it("includes radius", () => {
    expect(osmCacheKey(35.659, 139.7006, 1500)).not.toBe(
      osmCacheKey(35.659, 139.7006, 2000)
    );
  });
});
