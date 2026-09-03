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

export interface ToiletAttributes {
  hasWashlet: boolean;            // 温水洗浄便座（ウォシュレット）
  hasMultipurpose: boolean;       // 多機能・だれでもトイレ
  hasBabyTable: boolean;          // おむつ交換台 / ベビーシート
  hasNursingRoom: boolean;        // 授乳室
  hasPowderRoom: boolean;         // パウダールーム・ドレッサー
  hasOstomate: boolean;           // オストメイト対応
  isFree: boolean;                // 無料で利用可能
  isOpen24h: boolean;             // 24時間利用可能
  hasSoap: boolean;               // ハンドソープあり
  hasAlcohol: boolean;            // 除菌アルコール設置
  hasPaperTowelOrDryer: boolean;  // ペーパータオルまたはハンドドライヤー
  toiletStyle: 'western' | 'japanese' | 'both'; // 洋式・和式
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
  userRole?: string;
  rating: number;             // 1-5
  cleanlinessScore: number;   // 1-5
  odorScore: number;          // 1-5
  suppliesScore: number;      // 1-5
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
  // 実測レビュー平均のランク・スコア。reviewCount === 0 の場合は設備推定値を
  // 表示用に入れるが、UI上は「未評価」として扱うこと（isEvaluated参照）
  cleanlinessGrade: CleanlinessGrade;
  cleanlinessScore: number; // 1.0 - 5.0
  // 設備タグからの推定ランク・スコア（実測ではない）
  equipmentGrade: CleanlinessGrade;
  equipmentScore: number; // 1.0 - 5.0
  subScores: SubScores;
  attributes: ToiletAttributes;
  openingHours: string;
  description: string;
  lastCleaned?: string;
  photos?: string[];
  reviewCount: number;
  reviews: ToiletReview[];
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
  category: string;
  dataSource: string;
  minGrade: CleanlinessGrade | 'all';
  onlyWashlet: boolean;
  onlyMultipurpose: boolean;
  onlyBabyTable: boolean;
  onlyPowderRoom: boolean;
  only24h: boolean;
  onlyFree: boolean;
  onlyHighCleanliness: boolean; // Grade S & A (score >= 4.0)
  searchQuery: string;
}

export interface CityPreset {
  name: string;
  lat: number;
  lng: number;
  zoom: number;
}
