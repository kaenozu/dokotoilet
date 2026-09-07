import { INITIAL_TOILETS } from "../src/data/toilets";
import { canonicalizeSeedOsmFacility } from "../src/lib/osmIds";

// Google Place ID 相当の英数字のほか、自治体OD由来の日本語施設名 id も許容する。
// server/community.ts の EXTERNAL_FACILITY_ID_RE と同じ形式を扱う。
const EXTERNAL_FACILITY_ID_RE = /^(osm|google|od)-(?:[\p{L}\p{N}_-]){1,80}$/u;

const STATIC_FACILITY_ID_ALIASES = new Map<string, string>(
  INITIAL_TOILETS.map((facility) => {
    const canonical = canonicalizeSeedOsmFacility(facility);
    return [facility.id, canonical.id] as const;
  }).filter(([before, after]) => before !== after)
);

/**
 * 施設IDの正準形（NFC）。IDは externalReviews のキー / external_facilities の
 * ドキュメントIDとしてそのまま使われるため、見た目が同じでも符号化が違う文字列
 * （ハングル Jamo、分解済み Latin/Kana など）が別施設として登録されるのを防ぐ。
 * osm|google|od 接頭辞を持たないid（community の toilet-user-* 等）は無変更で返す。
 */
export function canonicalizeExternalFacilityId(id: string): string {
  if (!/^(osm|google|od)-/u.test(id)) return id;
  return id.normalize("NFC");
}

export function isExternalFacilityIdFormat(id: unknown): id is string {
  if (typeof id !== "string") return false;
  // 正準形に対してのみ判定する。文字セットに combining mark（\p{M}）は含まれないため、
  // 正準化で長さが増えることはない（分解型の入力は合成されて短くなるだけ）。
  return EXTERNAL_FACILITY_ID_RE.test(canonicalizeExternalFacilityId(id));
}

export class ExternalFacilityRegistry {
  private readonly ids = new Set<string>();

  constructor(initialIds: Iterable<unknown> = []) {
    this.registerMany(initialIds);
  }

  register(id: unknown): boolean {
    if (!isExternalFacilityIdFormat(id)) return false;
    // 正準形を格納する。分解型（Jamo等）で登録しても正準キーでヒットするように。
    const canonicalId = canonicalizeExternalFacilityId(id as string);
    this.ids.add(canonicalId);

    const canonicalAlias = STATIC_FACILITY_ID_ALIASES.get(canonicalId);
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
