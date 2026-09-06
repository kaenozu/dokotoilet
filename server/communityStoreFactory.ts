import { CommunityStore, defaultStorePath } from "./community";
import { resolveCommunityBackend, type CommunityBackend } from "./communityBackend";
import {
  FirestoreCommunityStore,
  type FirestoreLike,
} from "./firestoreCommunityStore";

/**
 * 選択されたバックエンドと、そのバックエンドの具象実装をセットで返す。
 * ルーターは CommunityRepository インターフェースのみに依存するため、
 * Firestore 実装を JSON 実装の継承で包むアダプターは不要になった。
 */
export type ConfiguredCommunityStore =
  | { backend: "json"; store: CommunityStore }
  | { backend: "firestore"; store: FirestoreCommunityStore };

export interface CommunityStoreFactoryOptions {
  backend?: string;
  nodeEnv?: string;
  jsonPath?: string;
  firestore?: FirestoreLike;
}

export function createConfiguredCommunityStore(
  options: CommunityStoreFactoryOptions = {}
): ConfiguredCommunityStore {
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
    store: new FirestoreCommunityStore(options.firestore),
  };
}
