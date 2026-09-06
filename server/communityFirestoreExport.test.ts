import { describe, expect, it } from "vitest";
import type { CommunityDB } from "./community";
import { buildFirestoreMigrationPlan } from "./communityMigrationPlan";
import { applyFirestoreMigrationPlan } from "./communityMigrationApply";
import { exportCommunitySnapshotFromFirestore } from "./communityFirestoreExport";
import { communitySemanticDigest } from "./communityParity";

class Doc {
  constructor(private map: Map<string, any>, public id: string) {}
  async get() { return { exists: this.map.has(this.id), id: this.id, data: () => this.map.get(this.id) }; }
  async create(data: any) { if (this.map.has(this.id)) throw new Error("already exists"); this.map.set(this.id, structuredClone(data)); }
  async set(data: any) { this.map.set(this.id, structuredClone(data)); }
}
class Col {
  constructor(private map: Map<string, any>, private filters: Array<[string, unknown]> = []) {}
  doc(id = "auto") { return new Doc(this.map, id); }
  where(field: string, _op: "==", value: unknown) { return new Col(this.map, [...this.filters, [field, value]]); }
  async get() {
    return {
      docs: [...this.map.entries()]
        .filter(([, v]) => this.filters.every(([f, e]) => v[f] === e))
        .map(([id, value]) => ({ exists: true, id, data: () => structuredClone(value) })),
    };
  }
}
class Db {
  data = new Map<string, Map<string, any>>();
  collection(name: string) {
    let map = this.data.get(name);
    if (!map) { map = new Map(); this.data.set(name, map); }
    return new Col(map) as any;
  }
  async runTransaction() { throw new Error("not used"); }
}

function source(): CommunityDB {
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
        createdAt: "2026-09-06T00:00:00.000Z",
      },
    ],
    reviewKeys: {
      "rev-a": { ipHash: "ip-1", at: 1000 },
      "rev-b": { ipHash: "ip-2", at: 2000 },
    },
  };
}

describe("Firestore reverse export", () => {
  it("round-trips a migrated JSON snapshot with semantic parity", async () => {
    const db = new Db();
    const original = source();
    const plan = buildFirestoreMigrationPlan(original);
    await applyFirestoreMigrationPlan(db as any, plan, { apply: true });
    const exported = await exportCommunitySnapshotFromFirestore(db as any);
    expect(communitySemanticDigest(exported)).toBe(communitySemanticDigest(original));
  });
});
