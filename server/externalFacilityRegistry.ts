import { INITIAL_TOILETS } from "../src/data/toilets";
import { canonicalizeSeedOsmFacility } from "../src/lib/osmIds";

// Google Place ID 相当の英数字のほか、自治体OD由来の日本語施設名 id も許容する。
// server/community.ts の EXTERNAL_FACILITY_ID_RE と同じ形式を扱う。
const EXTERNAL_FACILITY_ID_RE = /^(osm|google|od)-[\p{L}\p{N}_-]{1,80}$/u;

const STATIC_FACILITY_ID_ALIASES = new Map<string, string>(
  INITIAL_TOILETS.map((facility) => {
    const canonical = canonicalizeSeedOsmFacility(facility);
    return [facility.id, canonical.id] as const;
  }).filter(([before, after]) => before !== after)
);

export function isExternalFacilityIdFormat(id: unknown): id is string {
  return typeof id === "string" && EXTERNAL_FACILITY_ID_RE.test(id);
}

export class ExternalFacilityRegistry {
  private readonly ids = new Set<string>();

  constructor(initialIds: Iterable<unknown> = []) {
    this.registerMany(initialIds);
  }

  register(id: unknown): boolean {
    if (!isExternalFacilityIdFormat(id)) return false;
    this.ids.add(id);

    const canonicalAlias = STATIC_FACILITY_ID_ALIASES.get(id);
    if (canonicalAlias && isExternalFacilityIdFormat(canonicalAlias)) {
      this.ids.add(canonicalAlias);
    }

    return true;
  }

  registerMany(ids: Iterable<unknown>): void {
    for (const id of ids) this.register(id);
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  get size(): number {
    return this.ids.size;
  }
}
