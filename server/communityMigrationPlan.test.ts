import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { reviewDedupId } from "./shared/dedup";
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

  it("derives review_dedup ids from the normalized comment (production key formula)", () => {
    const plan = buildFirestoreMigrationPlan(db());
    const dedupIds = plan.documents
      .filter((d) => d.collection === "review_dedup")
      .map((d) => d.id);
    // reviewDedupId は正規形（trim + 空白圧縮 + 小文字化）から導出する。生コメント
    // ベースの旧式 ID（"CLEAN" をそのままハッシュ）とは必ず異なる。
    expect(dedupIds).toContain(reviewDedupId("toilet-user-a", "ip-1", "clean"));
    expect(dedupIds).not.toContain(
      crypto.createHash("sha256").update("toilet-user-a|ip-1|CLEAN").digest("hex")
    );
  });

  it("collapses legacy reviews whose normalized comments share one dedup id", () => {
    const snapshot = db();
    // 正規化以前のレガシー行: 同一 facility + 同一 IP + 大文字小文字違いの本文。
    // 生コメント式の旧キーでは 2 ドキュメントだったのが、正規形キーでは 1 つに畳まれる。
    snapshot.toilets[0].reviews = [
      { ...snapshot.toilets[0].reviews[0], id: "rev-a", comment: "clean" },      {
        ...snapshot.toilets[0].reviews[0],
        id: "rev-c",
        comment: "CLEAN  ",
        helpfulCount: 0,
      },
    ];
    snapshot.toilets[0].reviewCount = 2;
    snapshot.reviewKeys["rev-c"] = { ipHash: "ip-1", at: 5000 };

    const plan = buildFirestoreMigrationPlan(snapshot);
    // rev-a/rev-c（同一正規形）は 1 つに、異なる IP の rev-b はそのまま残る → 計 2
    const dedupDocs = plan.documents.filter((d) => d.collection === "review_dedup");
    expect(dedupDocs).toHaveLength(2);
    const collapsed = dedupDocs.find((d) => d.id === reviewDedupId("toilet-user-a", "ip-1", "clean"));
    // validUntil が新しい方（rev-c, at: 5000）を残す
    expect(collapsed?.data.reviewId).toBe("rev-c");
    expect(collapsed?.data.validUntil).toBe(5000 + 24 * 60 * 60 * 1000);
    // 異なる IP の rev-b は影響を受けない
    expect(dedupDocs.map((d) => d.id)).toContain(
      reviewDedupId("osm-node-1", "ip-2", "great")
    );
  });
});
