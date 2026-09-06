import { describe, expect, it } from "vitest";
import { applyFirestoreMigrationPlan } from "./communityMigrationApply";
import type { FirestoreMigrationPlan } from "./communityMigrationPlan";

class FakeDoc {
  constructor(
    private map: Map<string, any>,
    public id: string,
    private beforeSet?: (id: string) => void
  ) {}
  async get() {
    return {
      exists: this.map.has(this.id),
      id: this.id,
      data: () => this.map.get(this.id),
    };
  }
  async create(data: any) {
    if (this.map.has(this.id)) throw new Error("already exists");
    this.map.set(this.id, structuredClone(data));
  }
  async set(data: any) {
    this.beforeSet?.(this.id);
    this.map.set(this.id, structuredClone(data));
  }
}

class FakeCollection {
  constructor(
    private map: Map<string, any>,
    private beforeSet?: (id: string) => void
  ) {}
  doc(id = "auto") { return new FakeDoc(this.map, id, this.beforeSet); }
  where() { return this as any; }
  async get() {
    return {
      docs: [...this.map.entries()].map(([id, value]) => ({
        exists: true,
        id,
        data: () => value,
      })),
    };
  }
}

class FakeDb {
  data = new Map<string, Map<string, any>>();
  failOnceOnId?: string;
  private failed = false;

  collection(name: string) {
    let map = this.data.get(name);
    if (!map) {
      map = new Map();
      this.data.set(name, map);
    }
    return new FakeCollection(map, (id) => {
      if (id === this.failOnceOnId && !this.failed) {
        this.failed = true;
        throw new Error(`injected failure: ${id}`);
      }
    }) as any;
  }
  async runTransaction() { throw new Error("not used"); }
}

const plan: FirestoreMigrationPlan = {
  sourceDigest: "source",
  documents: [
    { collection: "reviews", id: "a", data: { value: 1 } },
    { collection: "reports", id: "b", data: { value: 2 } },
  ],
  countsByCollection: { reviews: 1, reports: 1 },
};

describe("applyFirestoreMigrationPlan", () => {
  it("is dry-run by default", async () => {
    const db = new FakeDb();
    const result = await applyFirestoreMigrationPlan(db as any, plan);
    expect(result.applied).toBe(false);
    expect(db.data.size).toBe(0);
  });

  it("can be rerun idempotently and converges to the plan", async () => {
    const db = new FakeDb();
    await applyFirestoreMigrationPlan(db as any, plan, { apply: true });
    await applyFirestoreMigrationPlan(db as any, plan, { apply: true });
    expect(db.data.get("reviews")?.get("a")).toEqual({ value: 1 });
    expect(db.data.get("reports")?.get("b")).toEqual({ value: 2 });
    expect(db.data.get("reviews")?.size).toBe(1);
    expect(db.data.get("reports")?.size).toBe(1);
  });

  it("resumes safely after a partial write failure", async () => {
    const db = new FakeDb();
    db.failOnceOnId = "b";
    await expect(
      applyFirestoreMigrationPlan(db as any, plan, { apply: true })
    ).rejects.toThrow("injected failure");
    expect(db.data.get("reviews")?.get("a")).toEqual({ value: 1 });
    expect(db.data.get("reports")?.has("b")).toBe(false);

    await applyFirestoreMigrationPlan(db as any, plan, { apply: true });
    expect(db.data.get("reviews")?.get("a")).toEqual({ value: 1 });
    expect(db.data.get("reports")?.get("b")).toEqual({ value: 2 });
  });
});
