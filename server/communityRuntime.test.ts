import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCommunityRuntime } from "./communityRuntime";
import type {
  FirestoreCollectionLike,
  FirestoreDocumentRefLike,
  FirestoreDocumentSnapshotLike,
  FirestoreLike,
} from "./firestoreCommunityStore";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

class FakeDoc implements FirestoreDocumentRefLike {
  constructor(
    readonly id: string,
    private readonly dataMap: Map<string, Record<string, unknown>>,
    private readonly onCreate: () => void
  ) {}

  async get(): Promise<FirestoreDocumentSnapshotLike> {
    const value = this.dataMap.get(this.id);
    return { exists: value !== undefined, id: this.id, data: () => value };
  }

  async create(data: Record<string, unknown>): Promise<void> {
    this.onCreate();
    if (this.dataMap.has(this.id)) {
      const error = new Error("already exists") as Error & { code?: number };
      error.code = 6;
      throw error;
    }
    this.dataMap.set(this.id, structuredClone(data));
  }

  async set(data: Record<string, unknown>): Promise<void> {
    this.dataMap.set(this.id, structuredClone(data));
  }
}

class FakeCollection implements FirestoreCollectionLike {
  constructor(
    private readonly dataMap: Map<string, Record<string, unknown>>,
    private readonly onCreate: () => void,
    private readonly filter?: { field: string; value: unknown }
  ) {}

  doc(id = "auto"): FirestoreDocumentRefLike {
    return new FakeDoc(id, this.dataMap, this.onCreate);
  }

  where(field: string, _op: "==", value: unknown): FirestoreCollectionLike {
    return new FakeCollection(this.dataMap, this.onCreate, { field, value });
  }

  async get() {
    return {
      docs: [...this.dataMap.entries()]
        .filter(([, data]) => !this.filter || data[this.filter.field] === this.filter.value)
        .map(([id, data]) => ({ exists: true, id, data: () => data })),
    };
  }
}

class FakeFirestore implements FirestoreLike {
  readonly collections = new Map<string, Map<string, Record<string, unknown>>>();
  createCalls = 0;

  collection(name: string): FirestoreCollectionLike {
    let data = this.collections.get(name);
    if (!data) {
      data = new Map();
      this.collections.set(name, data);
    }
    return new FakeCollection(data, () => {
      this.createCalls += 1;
    });
  }

  async runTransaction<T>(): Promise<T> {
    throw new Error("transaction not used in runtime wiring test");
  }
}

describe("createCommunityRuntime", () => {
  it("keeps JSON mode local and never loads Firestore", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "community-runtime-"));
    tempDirs.push(dir);
    const runtime = await createCommunityRuntime({
      backend: "json",
      nodeEnv: "test",
      jsonPath: path.join(dir, "community.json"),
      loadFirestore: () => {
        throw new Error("must not load Firestore in JSON mode");
      },
      initialExternalFacilities: [
        { id: "osm-node-1", source: "osm", origin: "static-seed" },
      ],
    });

    expect(runtime.backend).toBe("json");
    expect(await runtime.isKnownExternalFacility("osm-node-1")).toBe(true);
    expect(await runtime.isKnownExternalFacility("osm-node-2")).toBe(false);
    await runtime.observeExternalFacilities([
      { id: "osm-node-2", source: "osm", origin: "live-osm" },
    ]);
    expect(await runtime.isKnownExternalFacility("osm-node-2")).toBe(true);

    const restarted = await createCommunityRuntime({
      backend: "json",
      nodeEnv: "test",
      jsonPath: path.join(dir, "community.json"),
      initialExternalFacilities: [],
    });
    expect(await restarted.isKnownExternalFacility("osm-node-2")).toBe(true);
  });

  it("persists and validates external facilities through Firestore", async () => {
    const db = new FakeFirestore();
    const initial = [
      { id: "google-seed-1", source: "google", origin: "static-seed" },
    ] as const;
    const runtime = await createCommunityRuntime({
      backend: "firestore",
      nodeEnv: "test",
      firestore: db,
      initialExternalFacilities: [...initial],
    });

    expect(runtime.backend).toBe("firestore");
    expect(await runtime.isKnownExternalFacility("google-seed-1")).toBe(true);
    expect(await runtime.isKnownExternalFacility("osm-node-9")).toBe(false);

    db.createCalls = 0;
    await runtime.observeExternalFacilities([
      { id: "osm-node-9", source: "osm", origin: "live-osm" },
    ]);
    expect(db.createCalls).toBe(1);
    expect(await runtime.isKnownExternalFacility("osm-node-9")).toBe(true);
    expect(db.collections.get("external_facilities")?.get("osm-node-9")).toMatchObject({
      source: "osm",
      origin: "live-osm",
    });

    await runtime.observeExternalFacilities([
      { id: "osm-node-9", source: "osm", origin: "live-osm" },
    ]);
    expect(db.createCalls).toBe(1);

    // A process restart may attempt create-if-absent registration again. It must
    // remain safe and preserve the durable registry rather than failing startup.
    const restarted = await createCommunityRuntime({
      backend: "firestore",
      nodeEnv: "test",
      firestore: db,
      initialExternalFacilities: [...initial],
    });
    expect(await restarted.isKnownExternalFacility("google-seed-1")).toBe(true);
  });
});
