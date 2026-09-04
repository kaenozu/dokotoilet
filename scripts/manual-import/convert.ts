import type { FacilityCategory, ToiletFacility, ToiletReview } from "../../src/types";
import { gradeForScore } from "../../src/lib/scoring";

// ChatGPT手動調査プロンプト（docs/manual-research-prompt.md）の出力形式
export interface ManualExcerpt {
  text: string;
  rating: number;
  // 引用の確認場所（例：「Google Maps」「Yahoo!マップ」）。Google確認分のみGoogle表記可
  source?: string;
}

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
  reviewExcerpts: ManualExcerpt[];
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
  today?: string;
  maxExcerpts?: number;
}

export interface Converted {
  facilities: ToiletFacility[];
  skipped: { name: string; reason: string }[];
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
  const today = opts.today ?? new Date().toISOString().split("T")[0];
  const maxExcerpts = opts.maxExcerpts ?? 5;
  const facilities: ToiletFacility[] = [];
  const skipped: { name: string; reason: string }[] = [];

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
    const bool = (v: unknown) => v === true;

    const placeId = placeIdFromUrl(item.googleMapsUrl) ?? slug(name);
    const id = `google-${placeId}`.slice(0, 80);

    const excerpts = Array.isArray(item.reviewExcerpts) ? item.reviewExcerpts.slice(0, maxExcerpts) : [];
    const reviews: ToiletReview[] = excerpts
      .filter((e) => e && typeof e.text === "string" && e.text.trim())
      .map((e, i) => ({
        id: `rev-gmaps-${placeId.slice(0, 20)}-${i}`,
        // 出所未確認のため中立表記。Google確認分は source に記録して表示する
        userName: "口コミ引用",
        ...(typeof e.source === "string" && e.source.trim()
          ? { source: e.source.trim().slice(0, 30) }
          : {}),
        rating: typeof e.rating === "number" ? e.rating : 3,
        cleanlinessScore: typeof e.rating === "number" ? e.rating : 3,
        odorScore: typeof e.rating === "number" ? e.rating : 3,
        suppliesScore: typeof e.rating === "number" ? e.rating : 3,
        comment: e.text.trim().slice(0, 200),
        createdAt: today,
        helpfulCount: 0,
      }));

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
        hasNursingRoom: false,
        hasPowderRoom: bool(eq.hasPowderRoom),
        hasOstomate: false,
        isFree: true,
        isOpen24h: bool(eq.isOpen24h),
        hasSoap: false,
        hasAlcohol: false,
        hasPaperTowelOrDryer: false,
        toiletStyle: "both",
      },
      openingHours: item.openingHours || "営業時間不明",
      description:
        basis + (lowConfidence ? "（清潔さは判定不能のため中立値。要現地確認）" : ""),
      reviewCount: reviews.length,
      reviews,
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
      facilityNote: `Google口コミ・自治体調査に基づく手動調査データ（信頼度:${item.confidence || "不明"}）。${coordNote}`,
      googleMapsUrl: item.googleMapsUrl,
      officialOpenDataId: `gmaps-${placeId}`.slice(0, 80),
    });
  }

  return { facilities, skipped };
}
