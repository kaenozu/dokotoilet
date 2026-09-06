import { describe, expect, it } from "vitest";
import { CommunityStore } from "./community";
import {
  FirestoreCommunityStoreAdapter,
  createConfiguredCommunityStore,
} from "./communityStoreFactory";

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

  it("returns a router-compatible adapter when a Firestore client is injected", () => {
    const firestore = {} as any;
    const result = createConfiguredCommunityStore({
      backend: "firestore",
      nodeEnv: "production",
      firestore,
    });
    expect(result.backend).toBe("firestore");
    expect(result.store).toBeInstanceOf(FirestoreCommunityStoreAdapter);
    expect(result.store).toBeInstanceOf(CommunityStore);
  });
});
