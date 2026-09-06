import { describe, expect, it } from "vitest";
import type { ToiletFacility, ToiletReview } from "../types";
import {
  canonicalizeSeedOsmFacility,
  externalReviewsForFacility,
  legacyOsmIdForTyped,
  osmFacilityId,
  parseLegacyOsmFacilityId,
  parseTypedOsmFacilityId,
  remapReviewDeltaKeys,
} from "./osmIds";

const review = (id: string): ToiletReview => ({
  id,
  userName: "test",
  rating: 4,
  overallScore: 4,
  cleanlinessScore: 4,
  odorScore: 4,
  suppliesScore: 4,
  comment: id,
  createdAt: "2026-09-05",
  helpfulCount: 0,
});

const facility = (id: string, officialOpenDataId?: string): ToiletFacility => ({
  id,
  name: "test",
  facilityType: "public",
  category: "park",
  dataSource: "osm",
  lat: 35,
  lng: 139,
  address: "test",
  cleanlinessGrade: "B",
  cleanlinessScore: 3,
  equipmentGrade: "B",
  equipmentScore: 3,
  subScores: { cleanliness: 3, odor: 3, supplies: 3, comfort: 3 },
  attributes: {
    hasWashlet: null,
    hasMultipurpose: null,
    hasBabyTable: null,
    hasNursingRoom: null,
    hasPowderRoom: null,
    hasOstomate: null,
    isFree: null,
    isOpen24h: null,
    hasSoap: null,
    hasAlcohol: null,
    hasPaperTowelOrDryer: null,
    toiletStyle: null,
  },
  openingHours: "営業時間未確認",
  description: "",
  reviewCount: 0,
  reviews: [],
  officialOpenDataId,
});

describe("OSM typed facility ids", () => {
  it("uses element type and numeric id", () => {
    expect(osmFacilityId("node", 123)).toBe("osm-node-123");
    expect(osmFacilityId("way", "123")).toBe("osm-way-123");
    expect(osmFacilityId("relation", 9)).toBe("osm-relation-9");
    expect(() => osmFacilityId("area", 1)).toThrow();
  });

  it("parses typed and legacy ids without conflating them", () => {
    expect(parseTypedOsmFacilityId("osm-node-123")).toEqual({ type: "node", numericId: "123" });
    expect(parseTypedOsmFacilityId("osm-123")).toBeNull();
    expect(parseLegacyOsmFacilityId("osm-123")).toEqual({ numericId: "123" });
    expect(parseLegacyOsmFacilityId("osm-node-123")).toBeNull();
    expect(legacyOsmIdForTyped("osm-way-123")).toBe("osm-123");
  });

  it("canonicalizes static seed ids only when official typed id matches the same numeric object", () => {
    expect(canonicalizeSeedOsmFacility(facility("osm-123", "osm-node-123")).id).toBe("osm-node-123");
    expect(canonicalizeSeedOsmFacility(facility("osm-123", "osm-node-999")).id).toBe("osm-123");
  });

  it("remaps legacy local review delta keys without losing reviews", () => {
    const delta = {
      v: 1 as const,
      userToilets: [],
      reviewDeltas: { "osm-123": [review("legacy")], "osm-node-123": [review("typed")] },
    };
    const migrated = remapReviewDeltaKeys(delta, new Map([["osm-123", "osm-node-123"]]));
    expect(migrated.reviewDeltas["osm-node-123"].map((r) => r.id)).toEqual(["legacy", "typed"]);
    expect(migrated.reviewDeltas["osm-123"]).toBeUndefined();
  });

  it("dual-reads legacy external reviews only when the typed numeric id is unambiguous", () => {
    const external = {
      "osm-123": [review("legacy")],
      "osm-node-123": [review("typed")],
    };
    expect(
      externalReviewsForFacility("osm-node-123", external, ["osm-node-123", "osm-node-456"])?.map((r) => r.id)
    ).toEqual(["typed", "legacy"]);
    expect(
      externalReviewsForFacility("osm-node-123", external, ["osm-node-123", "osm-way-123"])?.map((r) => r.id)
    ).toEqual(["typed"]);
  });
});
