import type { CleanlinessGrade, FacilityCategory } from '../types';

// 実測レビューが1件でもあるか。無い場合は設備推定値しかないため「未評価」扱い
export const isEvaluated = (toilet?: { reviewCount?: number } | null) =>
  (toilet?.reviewCount ?? 0) > 0;

/**
 * 評価の出所（3段階）。口コミ0件の初期状態でもマップに意味を持たせるため、
 * 実測が無い施設は根拠の種類に応じてグレードを「調査」「推定」として表示する。
 * - measured: 実測口コミあり（reviewCount > 0）
 * - survey: Google手動調査ベース（外部口コミ件数ありの手動判断値）
 * - estimated: 設備・ヒューリスティクスからの推定値
 */
export type EvaluationKind = 'measured' | 'survey' | 'estimated';

interface EvaluationSource {
  reviewCount?: number;
  dataSource?: string;
  externalReviewCount?: number;
}

export const evaluationKind = (toilet?: EvaluationSource | null): EvaluationKind => {
  if ((toilet?.reviewCount ?? 0) > 0) return 'measured';
  if (toilet?.dataSource === 'google' && (toilet?.externalReviewCount ?? 0) > 0)
    return 'survey';
  return 'estimated';
};

export interface GradeDisplay {
  grade: CleanlinessGrade | null;
  score: number | null;
  kind: EvaluationKind;
}

/**
 * 一覧・地図・詳細で共通の「表示用グレード」。実測が無ければ調査/推定値を出す。
 * 未スコアのコミュニティ登録トイレ（登録直後。AddToiletModal と server POST /toilets が
 * cleanliness/equipment を null のまま生成する）は grade/score が null になる。
 * 呼び出し側は必ず null を「未評価」表示として扱うこと（各コンポーネントでガード済み）。
 */
export const displayGrade = (toilet: {
  reviewCount: number;
  dataSource: string;
  externalReviewCount?: number;
  cleanlinessGrade: CleanlinessGrade | null;
  cleanlinessScore: number | null;
  equipmentGrade: CleanlinessGrade | null;
  equipmentScore: number | null;
}): GradeDisplay => {
  const kind = evaluationKind(toilet);
  if (kind === 'measured')
    return { grade: toilet.cleanlinessGrade, score: toilet.cleanlinessScore, kind };
  if (kind === 'survey')
    return { grade: toilet.cleanlinessGrade, score: toilet.cleanlinessScore, kind };
  return { grade: toilet.equipmentGrade, score: toilet.equipmentScore, kind };
};

/** グレード表示の出所ラベル（実測と推定系を混同させないための接頭辞） */
export const evaluationKindLabel = (kind: EvaluationKind): string => {
  switch (kind) {
    case 'measured':
      return '実測';
    case 'survey':
      return '調査';
    case 'estimated':
      return '推定';
  }
};

export const getGradeColor = (grade: CleanlinessGrade | null | undefined) => {
  switch (grade) {
    case 'S':
      return {
        bg: 'bg-emerald-500',
        text: 'text-emerald-700',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-300',
        hex: '#10B981',
        label: 'S級 (極上・超清潔)',
      };
    case 'A':
      return {
        bg: 'bg-sky-500',
        text: 'text-sky-700',
        badge: 'bg-sky-50 text-sky-700 border-sky-300',
        hex: '#0284C7',
        label: 'A級 (清潔・快適)',
      };
    case 'B':
      return {
        bg: 'bg-amber-500',
        text: 'text-amber-700',
        badge: 'bg-amber-50 text-amber-700 border-amber-300',
        hex: '#F59E0B',
        label: 'B級 (標準・利用可)',
      };
    case 'C':
      return {
        bg: 'bg-orange-500',
        text: 'text-orange-700',
        badge: 'bg-orange-50 text-orange-700 border-orange-300',
        hex: '#EA580C',
        label: 'C級 (やや難あり)',
      };
    case 'D':
      return {
        bg: 'bg-rose-500',
        text: 'text-rose-700',
        badge: 'bg-rose-50 text-rose-700 border-rose-300',
        hex: '#EF4444',
        label: 'D級 (緊急用)',
      };
    default:
      return {
        bg: 'bg-slate-500',
        text: 'text-slate-700',
        badge: 'bg-slate-50 text-slate-700 border-slate-300',
        hex: '#64748B',
        label: '未評価',
      };
  }
};

/**
 * カテゴリ → 表示用施設タイプ文言。
 * server/community.ts（POST /api/community/toilets）と
 * scripts/manual-import/convert.ts、src/components/AddToiletModal.tsx で共用。
 * サーバー側はこのファイルを直接 import できない（クライアント型に依存するため
 * dist バンドルで共用する）ので、文言を変更する場合は server/community.ts 側も合わせる。
 */
export const facilityTypeForCategory = (category: FacilityCategory): string => {
  switch (category) {
    case 'department':
      return '商業施設・デパート';
    case 'station':
      return '駅・交通施設';
    case 'convenience':
      return 'コンビニ';
    case 'park':
      return '公衆トイレ';
    case 'hotel':
      return 'ホテル・オフィス';
    case 'cafe':
      return 'カフェ・飲食店';
    default:
      return 'その他施設';
  }
};
