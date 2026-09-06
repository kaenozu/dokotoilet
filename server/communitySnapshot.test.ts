import { describe, expect, it } from "vitest";
import type { CommunityDB } from "./community";
import {
  analyzeCommunitySnapshot,
  assertCommunitySnapshotValid,
  communitySnapshotDigest,
} from "./communitySnapshot";

function sample(): CommunityDB {
  return {
    version: 2,
    toilets: [
      {
        id: "toilet-user-a",
        name: "A",
        facilityType: "公衆トイレ",
        category: "park",
        dataSource: "community",
        lat: 35,
        lng: 139,
        address: "x",
        cleanlinessGrade: "A",
        cleanlinessScore: 4,
        equipmentGrade: "A",
        equipmentScore: 4,
        subScores: { cleanliness: 4, odor: 4, supplies: 4, comfort: 4 },
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
        openingHours: "unknown",
        description: "x",
        reviewCount: 1,
        reviews: [
          {
            id: "rev-a",
            userName: "u",
            rating: 4,
            overallScore: 4,
            cleanlinessScore: 4,
            odorScore: 4,
            suppliesScore: 4,
            comment: "clean",
            createdAt: "2026-09-06",
            helpfulCount: 1,
          },
        ],
      },
    ],
    externalReviews: {
      "osm-node-1": [
        {
          id: "rev-b",
          userName: "u",
          rating: 5,
          overallScore: 5,
          cleanlinessScore: 5,
          odorScore: 5,
          suppliesScore: 5,
          comment: "great",
          createdAt: "2026-09-06",
          helpfulCount: 0,
        },
      ],
    },
    helpfulVotes: { "rev-a": ["ip-1"] },
    reports: [
      {
        id: "report-1",
        toiletId: "osm-node-1",
        reviewId: "rev-b",
        reason: "reason",
        createdAt: "2026-09-06T00:00:00Z",
      },
    ],
    reviewKeys: {
      "rev-a": { ipHash: "ip-1", at: 1 },
      "rev-b": { ipHash: "ip-2", at: 2 },
    },
  };
}

describe("community snapshot migration analysis", () => {
  it("counts and validates references", () => {
    const a = assertCommunitySnapshotValid(sample());
    expect(a.counts).toMatchObject({
      toilets: 1,
      communityReviews: 1,
      externalFacilities: 1,
      externalReviews: 1,
      helpfulVotes: 1,
      reports: 1,
      reviewKeys: 2,
    });
  });

  it("produces a deterministic digest independent of object key insertion order", () => {
    const a = sample();
    const b = sample();
    b.externalReviews = Object.fromEntries(Object.entries(b.externalReviews).reverse());
    expect(communitySnapshotDigest(a)).toBe(communitySnapshotDigest(b));
  });

  it("rejects dangling and mismatched references", () => {
    const db = sample();
    db.helpfulVotes.missing = ["ip"];
    db.reports[0].toiletId = "wrong";
    db.reviewKeys.missing = { ipHash: "x", at: 0 };
    const analysis = analyzeCommunitySnapshot(db);
    expect(analysis.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("helpful vote references missing review"),
        expect.stringContaining("facility mismatch"),
        expect.stringContaining("review key references missing review"),
      ])
    );
    expect(() => assertCommunitySnapshotValid(db)).toThrow("invalid community snapshot");
  });

  it("rejects helpfulCount that disagrees with stored voter cardinality", () => {
    const db = sample();
    db.toilets[0].reviews[0].helpfulCount = 2;
    const analysis = analyzeCommunitySnapshot(db);
    expect(analysis.errors).toContain(
      "helpful count mismatch for rev-a: review=2 votes=1"
    );
  });
});
