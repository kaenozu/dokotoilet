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

  it("does not publish or later resurrect a mutation whose persistence failed", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "community-rollback-"));
    const file = path.join(dir, "community.json");
    const store = new CommunityStore(file);

    expect(await store.getToilets()).toEqual([]);
    await fs.mkdir(file);
    await expect(store.addToilet(seedToilet())).rejects.toBeInstanceOf(Error);

    await fs.rm(file, { recursive: true, force: true });
    expect(await store.getToilets()).toEqual([]);
    expect(
      (await store.addReview("toilet-user-r1", review("must-not-exist"), "ip-a"))
        .error
    ).toBe("not_found");

    await store.addToilet(seedToilet());
    const added = await store.addReview(
      "toilet-user-r1",
      review("recovered"),
      "ip-a"
    );
    expect(added.error).toBeUndefined();

    const reloaded = new CommunityStore(file);
    const toilets = await reloaded.getToilets();
    expect(toilets).toHaveLength(1);
    expect(toilets[0].reviews).toHaveLength(1);
    expect(toilets[0].reviews[0].comment).toBe("recovered");
  });

  it("serializes concurrent mutations so no review update is lost", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "community-concurrent-"));
    const file = path.join(dir, "community.json");
    const store = new CommunityStore(file);
    await store.addToilet(seedToilet());

    const count = 12;
    const results = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        store.addReview(
          "toilet-user-r1",
          review(`concurrent-${i}`),
          `ip-${i}`
        )
      )
    );

    expect(results.every((result) => result.error === undefined)).toBe(true);

    const inMemory = await store.getToilets();
    expect(inMemory[0].reviewCount).toBe(count);
    expect(inMemory[0].reviews).toHaveLength(count);

    const reloaded = new CommunityStore(file);
    const persisted = await reloaded.getToilets();
    expect(persisted[0].reviewCount).toBe(count);
    expect(persisted[0].reviews).toHaveLength(count);
    expect(new Set(persisted[0].reviews.map((r) => r.comment)).size).toBe(count);
  });
});
