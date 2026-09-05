import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { CommunityStore } from "./community";

const seedToilet = (): any => ({
  id: "toilet-user-r1",
  name: "B",
  facilityType: "公衆トイレ",
  category: "park",
  dataSource: "community",
  lat: 35,
  lng: 139,
  address: "x",
  cleanlinessGrade: "B",
  cleanlinessScore: 3.4,
  equipmentGrade: "B",
  equipmentScore: 3.4,
  subScores: { cleanliness: 3.4, odor: 3.4, supplies: 3.4, comfort: 3.4 },
  attributes: {
    hasWashlet: false,
    hasMultipurpose: false,
    hasBabyTable: false,
    hasNursingRoom: false,
    hasPowderRoom: false,
    hasOstomate: false,
    isFree: true,
    isOpen24h: false,
    hasSoap: false,
    hasAlcohol: false,
    hasPaperTowelOrDryer: false,
    toiletStyle: "both",
  },
  openingHours: "x",
  description: "x",
  reviewCount: 0,
  reviews: [],
});

const review = (comment: string): any => ({
  userName: "tester",
  overallScore: 4,
  cleanlinessScore: 4,
  odorScore: 4,
  suppliesScore: 4,
  comment,
});

describe("CommunityStore persistence failures", () => {
  it("fails closed on corrupt JSON and leaves the source file untouched", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "community-corrupt-"));
    const file = path.join(dir, "community.json");
    const corrupt = "{ not-valid-json";
    await fs.writeFile(file, corrupt, "utf-8");

    const store = new CommunityStore(file);
    await expect(store.getToilets()).rejects.toBeInstanceOf(Error);
    await expect(store.addToilet(seedToilet())).rejects.toBeInstanceOf(Error);
    expect(await fs.readFile(file, "utf-8")).toBe(corrupt);
  });

  it("recovers the serialized write queue after one filesystem failure", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "community-recover-"));
    const file = path.join(dir, "community.json");
    const store = new CommunityStore(file);

    // load() first so the store is initialized, then make the destination invalid for rename().
    expect(await store.getToilets()).toEqual([]);
    await fs.mkdir(file);
    await expect(store.addToilet(seedToilet())).rejects.toBeInstanceOf(Error);

    // Repair the filesystem. A poisoned promise queue would make this second save fail immediately.
    await fs.rm(file, { recursive: true, force: true });
    const added = await store.addReview("toilet-user-r1", review("recovered"), "ip-a");
    expect(added.error).toBeUndefined();

    const reloaded = new CommunityStore(file);
    const toilets = await reloaded.getToilets();
    expect(toilets).toHaveLength(1);
    expect(toilets[0].reviews).toHaveLength(1);
    expect(toilets[0].reviews[0].comment).toBe("recovered");
  });
});
