import { describe, expect, it } from "vitest";
import type { ToiletReview } from "../types";
import {
  canonicalizeExternalFacilityId,
  canonicalizeExternalReviewKeys,
} from "./facilityIds";

describe("canonicalizeExternalFacilityId", () => {
  it("maps decomposed forms to the composed canonical id", () => {
    expect(canonicalizeExternalFacilityId("google-cafe\u0301")).toBe("google-café");
    expect(canonicalizeExternalFacilityId("google-\u1100\u1161")).toBe("google-가");
    expect(canonicalizeExternalFacilityId("od-\u30AB\u3099")).toBe("od-ガ");
  });

  it("leaves canonical and non-external ids untouched", () => {
    expect(canonicalizeExternalFacilityId("google-가")).toBe("google-가");
    expect(canonicalizeExternalFacilityId("toilet-user-cafe\u0301")).toBe(
      "toilet-user-cafe\u0301"
    );
    // 冪等
    const once = canonicalizeExternalFacilityId("od-\u30AB\u3099A");
    expect(canonicalizeExternalFacilityId(once)).toBe(once);
  });

  it("is the same implementation the server re-exports (anti-fork tripwire)", async () => {
    const serverModule = await import("../../server/externalFacilityRegistry");
    expect(serverModule.canonicalizeExternalFacilityId).toBe(
      canonicalizeExternalFacilityId
    );
  });
});

describe("canonicalizeExternalReviewKeys", () => {
  const review = (id: string): ToiletReview =>
    ({
      id,
      userName: "たろう",
      rating: 5,
      overallScore: 5,
      cleanlinessScore: 5,
      odorScore: 4,
      suppliesScore: 4,
      comment: "コメント",
      createdAt: "2026-01-01",
      helpfulCount: 0,
    }) as ToiletReview;

  it("folds decomposed keys into the canonical bucket", () => {
    const out = canonicalizeExternalReviewKeys({
      "google-\u1100\u1161": [review("r1")],
      "google-가": [review("r2")],
    });
    expect(Object.keys(out)).toEqual(["google-가"]);
    // マージ順はソースの走査順（最初に現れた方のバケツを基底にする）
    expect(out["google-가"].map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("deduplicates reviews by id when merging same-canonical keys", () => {
    const out = canonicalizeExternalReviewKeys({
      "google-\u1100\u1161": [review("r1")],
      "google-가": [review("r1"), review("r2")],
    });
    expect(out["google-가"].map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("passes canonical-only maps through unchanged", () => {
    const input = { "od-熊谷駅": [review("r1")], "osm-node-1": [] };
    expect(canonicalizeExternalReviewKeys(input)).toEqual(input);
  });
});
