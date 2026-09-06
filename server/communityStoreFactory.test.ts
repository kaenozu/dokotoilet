import { describe, expect, it } from "vitest";
import { CommunityStore } from "./community";
import {
  createConfiguredCommunityStore,
  type ConfiguredCommunityStore,
} from "./communityStoreFactory";
import { FirestoreCommunityStore } from "./firestoreCommunityStore";
import type { CommunityRepository } from "./communityRepository";

describe("createConfiguredCommunityStore", () => {
  it("uses JSON by default outside production", () => {
    const result = createConfiguredCommunityStore({ nodeEnv: "test", jsonPath: "/tmp/x.json" });
    expect(result.backend).toBe("json");
    expect(result.store).toBeInstanceOf(CommunityStore);
  });

  it("fails closed when firestore is selected without a client", () => {
    expect(() =>
      createConfiguredCommunityStore({ backend: "firestore", nodeEnv: "production" })
    ).toThrow("no Firestore client");
  });

  it("returns the Firestore implementation directly when a client is injected", () => {
    const firestore = {} as any;
    const result: ConfiguredCommunityStore = createConfiguredCommunityStore({
      backend: "firestore",
      nodeEnv: "production",
      firestore,
    });
    expect(result.backend).toBe("firestore");
    // 継承アダプターではなく、Firestore 実装そのものが返る。
    expect(result.store).toBeInstanceOf(FirestoreCommunityStore);
    expect(result.store).not.toBeInstanceOf(CommunityStore);
  });

  it("satisfies the CommunityRepository contract for both backends", () => {
    const json = createConfiguredCommunityStore({ nodeEnv: "test", jsonPath: "/tmp/x.json" });
    const firestore = createConfiguredCommunityStore({
      backend: "firestore",
      nodeEnv: "production",
      firestore: {} as any,
    });
    const repositories: CommunityRepository[] = [json.store, firestore.store];
    expect(repositories).toHaveLength(2);
  });
});
