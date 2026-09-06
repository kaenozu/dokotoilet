import { describe, expect, it } from "vitest";
import type { CommunityDB } from "./community";
import { buildFirestoreMigrationPlan, migrationPlanDigest } from "./communityMigrationPlan";

function db(): CommunityDB {
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
            odorScore: 3,
            suppliesScore: 2,
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
      "rev-a": { ipHash: "ip-1", at: 1000 },
      "rev-b": { ipHash: "ip-2", at: 2000 },
    },
  };
}

describe("buildFirestoreMigrationPlan", () => {
  it("expands the JSON snapshot into normalized deterministic collections", () => {
    const plan = buildFirestoreMigrationPlan(db());
    expect(plan.countsByCollection).toMatchObject({
      community_toilets: 1,
      facility_aggregates: 2,
      external_facilities: 1,
      reviews: 2,
      review_dedup: 2,
      helpful_votes: 1,
      reports: 1,
    });
    expect(plan.documents.find((d) => d.collection === "community_toilets")?.data).not.toHaveProperty("reviews");
    expect(plan.documents.find((d) => d.collection === "external_facilities")?.data).toMatchObject({
      id: "osm-node-1",
      source: "osm",
      origin: "migration",
    });
  });

  it("is idempotent at the plan level", () => {
    const first = buildFirestoreMigrationPlan(db());
    const second = buildFirestoreMigrationPlan(db());
    expect(second.documents).toEqual(first.documents);
    expect(migrationPlanDigest(second)).toBe(migrationPlanDigest(first));
  });
});
