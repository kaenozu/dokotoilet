export type CleanlinessGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export type FacilityCategory =
  | 'department' // 百貨店・商業施設
  | 'station'    // 駅・地下鉄
  | 'convenience'// コンビニ
  | 'park'       // 公園・公衆トイレ
  | 'hotel'      // ホテル・オフィス
  | 'cafe';      // カフェ・飲食店

export type DataSourceType =
  | 'google'    // Google Maps / Places API
  | 'osm'       // OpenStreetMap (amenity=toilets)
  | 'opendata'  // 自治体オープンデータ (東京都等)
  | 'community';// コミュニティ・ユーザー報告

/** 設備の存在状態: true=あり / false=なし / null=未確認（不明）。
 * 「設備がない」と「まだ調べていない」は明確に区別する（レビューP1対応）。 */
export type TriState = boolean | null;

export interface ToiletAttributes {
  hasWashlet: TriState;            // 温水洗浄便座（ウォシュレット）
  hasMultipurpose: TriState;       // 多機能・だれでもトイレ
  hasBabyTable: TriState;          // おむつ交換台 / ベビーシート
  hasNursingRoom: TriState;        // 授乳室
  hasPowderRoom: TriState;         // パウダールーム・ドレッサー
  hasOstomate: TriState;           // オストメイト対応
  isFree: TriState;                // 無料で利用可能
  isOpen24h: TriState;             // 24時間利用可能
  hasSoap: TriState;               // ハンドソープあり
  hasAlcohol: TriState;            // 除菌アルコール設置
  hasPaperTowelOrDryer: TriState;  // ペーパータオルまたはハンドドライヤー
  toiletStyle: 'western' | 'japanese' | 'both' | null; // 洋式・和式（null=未確認）
}

export interface SubScores {
  cleanliness: number; // 便器・床の清潔度 (1.0 - 5.0)
  odor: number;        // におい・消臭状態 (1.0 - 5.0)
  supplies: number;    // 備品充実度 (石鹸・ペーパー・除菌) (1.0 - 5.0)
  comfort: number;     // 快適度・広さ・照明 (1.0 - 5.0)
}

export interface ToiletReview {
  id: string;
  userName: string;
  // 引用の出所（例：「Google Maps」「Yahoo!マップ」）。取込データのみ。
  // undefined＝出所未確認。Google確認分以外をGoogle表記してはならない
  source?: string;
  userRole?: string;
  /** 総合満足度 1-5（正式フィールド。旧データは無く rating のみ持つ） */
  overallScore?: number;
  /** 総合満足度 1-5 の旧名（overallScore 導入前の保存データ互換用の別名） */
  rating: number;
  /** 便器・床の清潔さ 1-5（独立に集計して cleanlinessScore へ） */
  cleanlinessScore: number;
  /** におい・換気状態 1-5（独立に集計） */
  odorScore: number;
  /** 備品（石鹸・ペーパー・除菌）1-5（独立に集計） */
  suppliesScore: number;
  comment: string;
  createdAt: string;
  lastCleanedTime?: string;
  tags?: string[];
  helpfulCount: number;
  hasWashletConfirmed?: boolean;
  isCleanConfirmed?: boolean;
}

export interface ToiletFacility {
  id: string;
  name: string;
  facilityType: string;
  category: FacilityCategory;
  dataSource: DataSourceType;
  lat: number;
  lng: number;
  address: string;
  floorInfo?: string;
  // 実測レビューの「清潔さ次元」平均のランク・スコア。reviewCount === 0 の場合は
  // 設備推定値を表示用に入れるが、UI上は「未評価」として扱うこと（isEvaluated参照）
  cleanlinessGrade: CleanlinessGrade;
  cleanlinessScore: number; // 1.0 - 5.0（便器・床の清潔さの実測平均）
  /** 総合満足度の実測平均（口コミ1件以上で設定。0件は未定義＝未評価） */
  overallScore?: number;
  // 設備タグからの推定ランク・スコア（実測ではない）
  equipmentGrade: CleanlinessGrade;
  equipmentScore: number; // 1.0 - 5.0
  // 設備推定の内訳（口コミ表示は reviews から次元別に導出。comfort は入力項目が
  // ないため常にこの推定値）
  subScores: SubScores;
  attributes: ToiletAttributes;
  openingHours: string;
  description: string;
  lastCleaned?: string;
  photos?: string[];
  reviewCount: number;
  reviews: ToiletReview[];
  // 外部（Google Maps等）のlisting上に表示される口コミ総数。未取得でも件数だけ
  // 記録し、「口コミなし」と「未取込」を区別するために使う。undefined＝不明
  externalReviewCount?: number;
  externalReviewSource?: string;
  facilitySummary?: string;
  // 施設メモ。旧aiSummary（AIが生成したものではないため改名）
  facilityNote?: string;
  pros?: string[];
  cons?: string[];
  tips?: string;
  googleMapsUrl?: string;
  officialOpenDataId?: string;
}

export interface FilterState {
  dataSource: string;
  onlyHighCleanliness: boolean; // Grade S & A (score >= 4.0)
  onlyWashlet: boolean;
  onlyMultipurpose: boolean;
  onlyPowderRoom: boolean;
  only24h: boolean;
  searchQuery: string;
}

export interface CityPreset {
  name: string;
  lat: number;
  lng: number;
  zoom: number;
}
