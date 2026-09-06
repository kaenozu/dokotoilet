import {
  CommunityStore,
  defaultStorePath,
  type ReviewInput,
} from "./community";
import { resolveCommunityBackend, type CommunityBackend } from "./communityBackend";
import {
  FirestoreCommunityStore,
  type FirestoreLike,
} from "./firestoreCommunityStore";
import type { ToiletFacility, ToiletReview } from "../src/types";

/**
 * Compatibility adapter while the existing router is typed against CommunityStore.
 * It delegates every public storage operation to the Firestore implementation and
 * never invokes the JSON persistence methods inherited from CommunityStore.
 */
export class FirestoreCommunityStoreAdapter extends CommunityStore {
  private readonly inner: FirestoreCommunityStore;

  constructor(db: FirestoreLike) {
    super("__firestore_backend_does_not_use_json__");
    this.inner = new FirestoreCommunityStore(db);
  }

  override getToilets(): Promise<ToiletFacility[]> {
    return this.inner.getToilets();
  }

  override getExternalReviews(): Promise<Record<string, ToiletReview[]>> {
    return this.inner.getExternalReviews();
  }

  override addToilet(t: ToiletFacility): Promise<{ added: boolean }> {
    return this.inner.addToilet(t);
  }

  override addReview(facilityId: string, input: ReviewInput, ipHash: string) {
    return this.inner.addReview(facilityId, input, ipHash);
  }

  override voteHelpful(reviewId: string, ipHash: string) {
    return this.inner.voteHelpful(reviewId, ipHash);
  }

  override addReport(facilityId: string, reviewId: string, reason: string) {
    return this.inner.addReport(facilityId, reviewId, reason);
  }

  registerExternalFacilities(...args: Parameters<FirestoreCommunityStore["registerExternalFacilities"]>) {
    return this.inner.registerExternalFacilities(...args);
  }

  isKnownExternalFacility(...args: Parameters<FirestoreCommunityStore["isKnownExternalFacility"]>) {
    return this.inner.isKnownExternalFacility(...args);
  }
}

export interface CommunityStoreFactoryOptions {
  backend?: string;
  nodeEnv?: string;
  jsonPath?: string;
  firestore?: FirestoreLike;
}

export function createConfiguredCommunityStore(
  options: CommunityStoreFactoryOptions = {}
): { backend: CommunityBackend; store: CommunityStore } {
  const backend = resolveCommunityBackend(options.backend, options.nodeEnv);
  if (backend === "json") {
    return {
      backend,
      store: new CommunityStore(options.jsonPath ?? defaultStorePath()),
    };
  }

  if (!options.firestore) {
    throw new Error("Firestore backend selected but no Firestore client was provided");
  }
  return {
    backend,
    store: new FirestoreCommunityStoreAdapter(options.firestore),
  };
}
