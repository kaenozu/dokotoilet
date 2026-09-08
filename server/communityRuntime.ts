import { createRequire } from "node:module";
import path from "node:path";
import { GOOGLE_SEED } from "../src/data/googleSeed";
import { KUMAGAYA_SEED } from "../src/data/kumagayaSeed";
import { INITIAL_TOILETS } from "../src/data/toilets";
import { canonicalizeSeedOsmFacility } from "../src/lib/osmIds";
import { resolveCommunityBackend, type CommunityBackend } from "./communityBackend";
import type {
  CommunityRepository,
  ExternalFacilityObservation,
} from "./communityRepository";
import {
  canonicalizeExternalFacilityId,
  ExternalFacilityRegistry,
  isExternalFacilityIdFormat,
} from "./externalFacilityRegistry";
import { createConfiguredCommunityStore } from "./communityStoreFactory";
import type { FirestoreLike } from "./firestoreCommunityStore";

export interface CommunityRuntime {
  backend: CommunityBackend;
  /** ルーター・運用スクリプトは CommunityRepository 契約のみを前提とする。 */
  store: CommunityRepository;
  isKnownExternalFacility(facilityId: string): boolean | Promise<boolean>;
  observeExternalFacilities(facilities: ExternalFacilityObservation[]): Promise<void>;
}

export interface CommunityRuntimeOptions {
  backend?: string;
  nodeEnv?: string;
  jsonPath?: string;
  firestore?: FirestoreLike;
  loadFirestore?: () => FirestoreLike;
  initialExternalFacilities?: ExternalFacilityObservation[];
}

function sourceForId(id: string): ExternalFacilityObservation["source"] | null {
  if (id.startsWith("osm-")) return "osm";
  if (id.startsWith("google-")) return "google";
  if (id.startsWith("od-")) return "od";
  return null;
}

function addStaticObservation(
  out: Map<string, ExternalFacilityObservation>,
  id: unknown,
  legacyId?: string
): void {
  if (!isExternalFacilityIdFormat(id)) return;
  // 正準IDをキーにすることで、同一正準形の静的観測（legacy/canonical両方）が
  // 重複キーを作らない。legacyId は生の値のまま保持する。
  const canonicalId = canonicalizeExternalFacilityId(id as string);
  const source = sourceForId(canonicalId);
  if (!source) return;
  out.set(canonicalId, {
    id: canonicalId,
    source,
    origin: "static-seed",
    ...(legacyId && legacyId !== canonicalId ? { legacyId } : {}),
  });
}

/** Static external facilities that the shipped client can address before live OSM runs. */
export function defaultExternalFacilityObservations(): ExternalFacilityObservation[] {
  const out = new Map<string, ExternalFacilityObservation>();

  for (const facility of INITIAL_TOILETS) {
    addStaticObservation(out, facility.id);
    const canonical = canonicalizeSeedOsmFacility(facility);
    if (canonical.id !== facility.id) {
      addStaticObservation(out, canonical.id, facility.id);
    }
  }
  for (const facility of GOOGLE_SEED) addStaticObservation(out, facility.id);
  for (const facility of KUMAGAYA_SEED) addStaticObservation(out, facility.id);

  return [...out.values()];
}

/**
 * Loads the official SDK only when Firestore is explicitly selected.
 * Keeping the require dynamic preserves the JSON development path and gives a
 * clear startup failure if package metadata and runtime deployment drift.
 */
export function loadGoogleCloudFirestore(): FirestoreLike {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  try {
    const mod = require("@google-cloud/firestore") as {
      Firestore: new () => FirestoreLike;
    };
    return new mod.Firestore();
  } catch (cause) {
    throw new Error(
      "Firestore backend selected but @google-cloud/firestore could not be loaded",
      { cause }
    );
  }
}

export async function createCommunityRuntime(
  options: CommunityRuntimeOptions = {}
): Promise<CommunityRuntime> {
  const backend = resolveCommunityBackend(options.backend, options.nodeEnv);
  const initial =
    options.initialExternalFacilities ?? defaultExternalFacilityObservations();
  const registry = new ExternalFacilityRegistry(initial.map((item) => item.id));

  const firestore =
    backend === "firestore"
      ? options.firestore ??
        (options.loadFirestore ?? loadGoogleCloudFirestore)()
      : undefined;
  // 判別ユニオンなので、backend の分岐で store の具象型も絞り込める。
  const configured = createConfiguredCommunityStore({
    backend,
    nodeEnv: options.nodeEnv,
    jsonPath: options.jsonPath,
    firestore,
  });

  // Existing JSON reviews remain accepted review targets. Firestore migrations
  // create external_facilities explicitly; this local registration is only for
  // the legacy JSON validator path.
  registry.registerMany(Object.keys(await configured.store.getExternalReviews()));

  // JSON stores known external IDs as empty review arrays so the registry survives restart.
  if (configured.backend === "json") {
    await configured.store.registerExternalFacilities(initial);
  }

  if (configured.backend === "firestore") {
    const firestoreStore = configured.store;
    await firestoreStore.registerExternalFacilities(initial);
    return {
      backend,
      store: firestoreStore,
      isKnownExternalFacility: async (facilityId) => {
        const canonical = canonicalizeExternalFacilityId(facilityId);
        if (registry.has(canonical)) return true;
        const known = await firestoreStore.isKnownExternalFacility(canonical);
        if (known) registry.register(canonical);
        return known;
      },
      observeExternalFacilities: async (facilities) => {
        const unseen = facilities
          .map((item) => ({ ...item, id: canonicalizeExternalFacilityId(item.id) }))
          .filter((item) => !registry.has(item.id));
        if (unseen.length === 0) return;
        await firestoreStore.registerExternalFacilities(unseen);
        registry.registerMany(unseen.map((item) => item.id));
      },
    };
  }

  return {
    backend,
    store: configured.store,
    isKnownExternalFacility: (facilityId) =>
      registry.has(canonicalizeExternalFacilityId(facilityId)),
    observeExternalFacilities: async (facilities) => {
      // JSONバックエンドでは store.registerExternalFacilities が externalReviews の
      // キーを作るため、ここで正準IDへ写像してから永続登録する。
      const normalized = facilities.map((item) => ({
        ...item,
        id: canonicalizeExternalFacilityId(item.id),
      }));
      await configured.store.registerExternalFacilities(normalized);
      registry.registerMany(normalized.map((item) => item.id));
    },
  };
}
