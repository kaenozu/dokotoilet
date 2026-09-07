import type { CleanlinessGrade, FacilityCategory, TriState } from "../types";
import { gradeForScore } from "./scoring";

/**
 * 設備・管理条件からの清潔さ推定モデル。
 *
 * 口コミ0件の施設にも「ある程度」の目安を付けるための推定式。設備が
 * 清潔さそのものを保証するわけではないため、以下を厳守する:
 * - 推定は A止まり（ESTIMATE_MAX）。S級は実測レビューのみ
 * - 根拠（basis）を必ず残し、UIで開示する
 * - 不明（null）は加点も減点もしない（「ない」と「未確認」を混同しない）
 */
export const ESTIMATE_MAX = 4.5;

export interface EstimateInput {
  category: FacilityCategory;
  hasWashlet: TriState;
  hasMultipurpose: TriState;
  hasOstomate: TriState;
  hasBabyTable: TriState;
  toiletStyle: "western" | "japanese" | "both" | null;
  isFree: TriState;
  isOpen24h: TriState;
  /** キュレーション済みの著名施設（例：THE TOKYO TOILET）。維持管理体制が明確な場合のみ */
  landmark?: boolean;
}

export interface Estimate {
  score: number;
  grade: CleanlinessGrade;
  basis: string[];
  /** 上限（A止まり）で頭打ちになったか */
  capped: boolean;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function estimateEquipmentScore(input: EstimateInput): Estimate {
  // 著名プロジェクト等のキュレーション枠（維持管理体制が明確）。根拠を開示する
  if (input.landmark) {
    return {
      score: 4.7,
      grade: gradeForScore(4.7),
      basis: ["著名プロジェクト・維持管理体制が明確（キュレーション）"],
      capped: false,
    };
  }

  let score = 3.0;
  const basis = ["基準値3.0（管理状態不明の公衆トイレの中央値）"];

  if (input.hasWashlet === true) {
    score += 0.4;
    basis.push("温水洗浄便座あり＋0.4（維持投資の目安）");
  }
  if (input.hasMultipurpose === true) {
    score += 0.2;
    basis.push("多機能トイレあり＋0.2");
  }
  if (input.hasOstomate === true) {
    score += 0.2;
    basis.push("オストメイト対応＋0.2");
  }
  if (input.hasBabyTable === true) {
    score += 0.1;
    basis.push("ベビー設備あり＋0.1");
  }
  if (input.toiletStyle === "western") {
    score += 0.2;
    basis.push("洋式のみ＋0.2");
  } else if (input.toiletStyle === "both") {
    score += 0.1;
    basis.push("和洋併設＋0.1");
  } else if (input.toiletStyle === "japanese") {
    score -= 0.3;
    basis.push("和式のみ−0.3");
  }
  if (input.category === "department" || input.category === "hotel") {
    score += 0.4;
    basis.push("商業・宿泊施設＋0.4（清掃体制の目安）");
  } else if (input.category === "station" || input.category === "convenience") {
    score += 0.2;
    basis.push("駅・コンビニ＋0.2");
  }
  if (input.isFree === false) {
    score += 0.2;
    basis.push("有料＋0.2（清掃体制の目安）");
  }
  if (input.isOpen24h === false) {
    score += 0.1;
    basis.push("利用時間制限あり＋0.1（管理時間帯あり）");
  }

  score = Math.min(5, Math.max(1, round1(score)));
  let capped = false;
  if (score > ESTIMATE_MAX) {
    score = ESTIMATE_MAX;
    capped = true;
    basis.push(`上限${ESTIMATE_MAX}で頭打ち（S級は実測のみ）`);
  }
  return { score, grade: gradeForScore(score), basis, capped };
}
