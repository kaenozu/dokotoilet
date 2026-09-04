import type { FacilityCategory, ToiletFacility } from "../../src/types";
import { gradeForScore } from "../../src/lib/scoring";

// ChatGPT手動調査プロンプト（docs/manual-research-prompt.md）の出力形式
//
// 規約: 口コミ本文（Google Maps 等のユーザー投稿の転載・ほぼ同一の書き換え）は
//   一切取り込まない。規約上・プライバシー上の理由による（README「データ方針」参照）。
//   取込対象は listing に表示される口コミ「件数」（externalReviewCount）と、
//   調査者が自前の文章で書いた「要約・根拠」（scoreBasis）のみ。
//   旧形式入力に reviewExcerpts（口コミ引用）が残っていても破棄し、warnings に記録する。

export interface ManualEquipment {
  hasWashlet: boolean | null;
  hasMultipurpose: boolean | null;
  hasBabyTable: boolean | null;
  hasPowderRoom: boolean | null;
  isOpen24h: boolean | null;
}

export interface ManualItem {
  name: string;
  category: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  openingHours: string | null;
  cleanlinessScore: number | null;
  confidence: string;
  scoreBasis: string;
  equipment: ManualEquipment;
  googleMapsUrl: string;
  geoQuery?: string;
  // listing上の口コミ総数（本文未取得でも件数だけ記録。「未取込」表示用）
  externalReviewCount?: number | null;
  externalReviewSource?: string;
  // 座標を公開情報から補完した場合の出典メモ（例：「マピオン電話帳」）
  coordSource?: string;
  // run.ts が付与するエリアガード（入力JSONには書かない）
  batchGuard?: BatchGuard;
}

export interface BatchGuard {
  center: [number, number];
  maxKm: number;
}

export interface GeoTarget {
  name: string;
  address: string;
  // 手動調整用の優先クエリ（名称が検索しづらい場合に設定）
  geoQuery?: string;
  // run.ts が付与するエリアガード（入力JSONには書かない）
  guard?: BatchGuard;
}

export type Geocoder = (target: GeoTarget) => Promise<{ lat: number; lng: number } | null>;

export interface ConvertOpts {
  geocode: Geocoder;
}

export interface Converted {
  facilities: ToiletFacility[];
  skipped: { name: string; reason: string }[];
  // 取り込んだが規約上破棄したもの（旧形式の口コミ引用など）。run.ts がコンソールに出す
  warnings: { name: string; reason: string }[];
}

const CATEGORIES: FacilityCategory[] = [
  "department",
  "station",
  "convenience",
  "park",
  "hotel",
  "cafe",
];

const FACILITY_TYPE: Record<FacilityCategory, string> = {
  department: "商業施設・デパート",
  station: "駅・交通施設",
  convenience: "コンビニ",
  park: "公衆トイレ",
  hotel: "ホテル・オフィス",
  cafe: "カフェ・飲食店",
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function placeIdFromUrl(url: string): string | null {
  const m = /place_id:([A-Za-z0-9_-]+)/.exec(url);
  return m ? m[1] : null;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "no-name"
  );
}

export async function convertItems(items: ManualItem[], opts: ConvertOpts): Promise<Converted> {
  const facilities: ToiletFacility[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const warnings: { name: string; reason: string }[] = [];

  for (const item of items) {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) {
      skipped.push({ name: "(無名)", reason: "name が空" });
      continue;
    }
    if (!CATEGORIES.includes(item.category as FacilityCategory)) {
      skipped.push({ name, reason: `category 不正: ${item.category}` });
      continue;
    }
    const category = item.category as FacilityCategory;
    if (typeof item.googleMapsUrl !== "string" || !item.googleMapsUrl.startsWith("http")) {
      skipped.push({ name, reason: "googleMapsUrl 不正（実在確認不可）" });
      continue;
    }

    // 旧形式（口コミ引用つき）入力の防御: 本文は絶対に取り込まず、警告だけ残す
    const legacyQuotes = (item as { reviewExcerpts?: unknown }).reviewExcerpts;
    const quoteCount = Array.isArray(legacyQuotes) ? legacyQuotes.length : 0;
    if (quoteCount > 0) {
      warnings.push({
        name,
        reason: `reviewExcerpts（口コミ本文・転載禁止）を破棄（${quoteCount}件）。件数と要約のみ取り込むこと`,
      });
    }

    // 座標: 調査値が無ければジオコーディング。ダメなら取込不可
    // （入力JSONに直接lat/lngを書く場合は公開情報の座標出典を coordSource に記録する）
    let lat = typeof item.lat === "number" ? item.lat : NaN;
    let lng = typeof item.lng === "number" ? item.lng : NaN;
    const coordNote =
      typeof item.coordSource === "string" && item.coordSource
        ? ` 座標出典: ${item.coordSource}。`
        : "";
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      if (item.address) {
        const g = await opts.geocode({
          name,
          address: item.address,
          geoQuery: item.geoQuery,
          guard: item.batchGuard,
        });
        if (g) {
          lat = g.lat;
          lng = g.lng;
        }
      }
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      skipped.push({ name, reason: "座標なし（ジオコーディング失敗）" });
      continue;
    }

    // スコア: null（判定不能）は中立値3.0＋要確認メモ。レビュー0件扱いでUIは未評価表示
    const lowConfidence = item.confidence === "low" || typeof item.cleanlinessScore !== "number";
    const score = round1(
      typeof item.cleanlinessScore === "number"
        ? Math.min(5, Math.max(1, item.cleanlinessScore))
        : 3.0
    );
    const grade = gradeForScore(score);
    const eq: Partial<ManualEquipment> = item.equipment ?? {};
    // 調査値は3値（null=未確認）。null を false に潰さない
    const bool = (v: unknown): boolean | null =>
      v === true ? true : v === false ? false : null;

    const placeId = placeIdFromUrl(item.googleMapsUrl) ?? slug(name);
    const id = `google-${placeId}`.slice(0, 80);

    const basis = typeof item.scoreBasis === "string" && item.scoreBasis ? item.scoreBasis : "根拠の記載なし";
    facilities.push({
      id,
      name,
      facilityType: FACILITY_TYPE[category],
      category,
      dataSource: "google",
      lat,
      lng,
      address: item.address || "住所不明",
      cleanlinessGrade: grade,
      cleanlinessScore: score,
      equipmentGrade: grade,
      equipmentScore: score,
      subScores: { cleanliness: score, odor: score, supplies: score, comfort: score },
      attributes: {
        hasWashlet: bool(eq.hasWashlet),
        hasMultipurpose: bool(eq.hasMultipurpose),
        hasBabyTable: bool(eq.hasBabyTable),
        // 調査で確認していない項目は true/false と断定せず null（未確認）
        hasNursingRoom: null,
        hasPowderRoom: bool(eq.hasPowderRoom),
        hasOstomate: null,
        isFree: null,
        isOpen24h: bool(eq.isOpen24h),
        hasSoap: null,
        hasAlcohol: null,
        hasPaperTowelOrDryer: null,
        toiletStyle: null,
      },
      openingHours: item.openingHours || "営業時間不明",
      description:
        basis + (lowConfidence ? "（清潔さは判定不能のため中立値。要現地確認）" : ""),
      // 口コミ本文を持たないため常に未評価（reviewCount: 0）。UIは
      // externalReviewCount があれば「口コミ未取込」、なければ「口コミ募集中」と表示する
      reviewCount: 0,
      reviews: [],
      ...(typeof item.externalReviewCount === "number" &&
      Number.isInteger(item.externalReviewCount) &&
      item.externalReviewCount >= 0
        ? {
            externalReviewCount: item.externalReviewCount,
            externalReviewSource:
              typeof item.externalReviewSource === "string" && item.externalReviewSource
                ? item.externalReviewSource.slice(0, 50)
                : "Google Maps",
          }
        : {}),
      facilityNote: `Google Maps掲載情報の手動調査データ（口コミ本文は未取込。信頼度:${item.confidence || "不明"}）。${coordNote}`,
      googleMapsUrl: item.googleMapsUrl,
      officialOpenDataId: `gmaps-${placeId}`.slice(0, 80),
    });
  }

  return { facilities, skipped, warnings };
}
