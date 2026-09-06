import { describe, expect, it } from "vitest";
import { resolveCommunityBackend } from "./communityBackend";

describe("resolveCommunityBackend", () => {
  it("defaults to json outside production", () => {
    expect(resolveCommunityBackend(undefined, "test")).toBe("json");
  });

  it("requires an explicit backend in production", () => {
    expect(() => resolveCommunityBackend(undefined, "production")).toThrow(
      "COMMUNITY_BACKEND must be explicitly set"
    );
  });

  it("accepts only json or firestore", () => {
    expect(resolveCommunityBackend("firestore", "production")).toBe("firestore");
    expect(resolveCommunityBackend(" JSON ", "production")).toBe("json");
    expect(() => resolveCommunityBackend("memory", "test")).toThrow(
      "unsupported COMMUNITY_BACKEND"
    );
  });
});
