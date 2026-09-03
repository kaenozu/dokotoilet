export interface DataSourceComparison {
  id: string;
  name: string;
  badge: string;
  coverage: string;
  cost: string;
  cleanlinessDataLevel: 'High' | 'Medium' | 'Low' | 'Custom';
  pros: string[];
  cons: string[];
  apiSpec: string;
  recommendedRole: string;
}

export const DATA_SOURCES_INFO: DataSourceComparison[] = [
  {
    id: 'google',
    name: 'Google Maps Platform (Places API New)',
    badge: '不採用（有料のため）',
    coverage: '日本全国・全世界（商業施設・駅・コンビニ・飲食店・公園）',
    cost: '毎月$200の無料枠あり / 従量課金制',
    cleanlinessDataLevel: 'High',
    pros: [
      '施設数・座標精度が圧倒的（百貨店、コンビニ、駅ナカ、カフェをすべて網羅）',
      '利用者の口コミ数が膨大で、清潔度情報が自然言語で豊富に含まれる',
    ],
    cons: [
      '従量課金制のため本アプリでは不採用（無料枠超過で課金が発生するリスク）',
      'Google利用規約により、口コミテキストや場所情報の長期ローカル保存（30日超）に制限がある',
      '「トイレ」そのもののオブジェクトではなく、「施設」の口コミから清潔度を抽出・判定する工夫が必要',
    ],
    apiSpec: 'Places API (New) searchNearby, searchByText, Place.fetchFields, Maps JavaScript API',
    recommendedRole: '不採用。地図はOSM/国土地理院タイル、きれい度はユーザー投稿でまかなう方針',
  },
  {
    id: 'osm',
    name: 'OpenStreetMap (OSM / Overpass API)',
    badge: '完全無料・即座に使えるオープンデータ',
    coverage: '全世界の公共トイレ・駅トイレ・公園トイレ',
    cost: '完全無料（ODbLライセンス、APIキー不要）',
    cleanlinessDataLevel: 'Low',
    pros: [
      'APIキー不要でOverpass API（`amenity=toilets`）から即座にリアルタイム取得可能',
      '設備タグが詳細（`wheelchair`（車椅子）, `fee`（有料/無料）, `opening_hours`, `diaper`（おむつ交換台）, `unisex`（男女共用））',
      'データの改変・商用利用・自由なキャッシュやデータベース保存が可能',
    ],
    cons: [
      '「きれい度・清潔さ」そのもののタグはOSM標準ではほぼ定義されていない（設備有無のみ）',
      '小規模な店舗や商業施設内部の個室トイレまでは登録が追いついていない場合がある',
    ],
    apiSpec: 'Overpass QL (`node["amenity"="toilets"](around:radius, lat, lng);`)',
    recommendedRole: '「街頭の公衆トイレ・公園トイレ」の即時ゼロコスト表示と設備タグ補完',
  },
  {
    id: 'opendata',
    name: '自治体オープンデータ (東京都オープンデータカタログ / 各区市町村)',
    badge: '公式公認・バリアフリー詳細データ',
    coverage: '東京都・各自治体が管理する公衆便所・だれでもトイレ・公共施設',
    cost: '完全無料（CC-BY クリエイティブ・コモンズ 表示ライセンス）',
    cleanlinessDataLevel: 'Medium',
    pros: [
      '自治体公式の正確な設備データ（多機能トイレ、オストメイト、おむつ替え台、ベビーキープ、清掃委託状況）',
      '東京都や新宿区、渋谷区、横浜市などがCSV/GeoJSONでオープンデータ公開',
      '公衆トイレの改修・新設履歴（THE TOKYO TOILETなどの最新デザイン公衆トイレ含む）を公式網羅',
    ],
    cons: [
      '各自治体ごとにデータ形式・カラム定義が異なり、全国一括での正規化が必要',
      '民間の百貨店やコンビニ・商業施設のトイレは含まれない',
      '更新頻度が年1〜数回程度とリアルタイム性には欠ける',
    ],
    apiSpec: '東京都オープンデータカタログサイト (catalog.data.metro.tokyo.lg.jp) CSV / CKAN API',
    recommendedRole: '「だれでもトイレ・バリアフリー・公衆トイレ」の信頼性の高い公式スペック保証',
  },
  {
    id: 'community',
    name: 'コミュニティ・クラウドソーシング (ユーザー投稿・口コミ・きれい度投票)',
    badge: 'きれい度に最も直結・リアルタイム',
    coverage: 'ユーザーが実際に利用したあらゆるトイレ',
    cost: '自社データベース運用費のみ（Firestore / Postgres等）',
    cleanlinessDataLevel: 'High',
    pros: [
      '「におい」「便器の清潔さ」「ペーパー補充」「石鹸の有無」など、きめ細やかなきれい度評価を直接収集できる',
      '「今さっき清掃が入った」「ペーパーが切れている」といった超直近の鮮度が高い情報を共有可能',
      'ユーザー同士の投票や写真投稿でマップが自律的に育つ',
    ],
    cons: [
      'サービス初期は投稿が集まりにくいため、初期シードデータ（Google/OSM/オープンデータ）が不可欠',
      'いたずら投稿や不適切なコメントに対するモデレーションやAI検閲が必要',
    ],
    apiSpec: 'Firestore / Cloud SQL / 独自バックエンドAPI',
    recommendedRole: 'きれい度マップの「核」となる清潔度レーティングとリアルタイム報告',
  },
  {
    id: 'specialized',
    name: '特化型既存サービス・研究機関 (連携・参考モデル)',
    badge: '特化領域の参考・提携候補',
    coverage: '多機能トイレ、授乳室・オムツ替えスペース',
    cost: '提携・利用規約による',
    cleanlinessDataLevel: 'High',
    pros: [
      '【Check A Toilet（チェック・ア・トイレ）】NPO法人Checkによる全国7万箇所以上の多目的・車椅子トイレデータベース',
      '【ママパパマップ（ベビマップ）】授乳室・オムツ替え施設の清潔度や写真が日本一充実しているCGMサービス',
      '【日本トイレ研究所】学校や公共トイレの衛生基準・快適性評価の学術的基準を提供',
    ],
    cons: [
      '一般向けAPIが直接公開されていない場合が多く、公式提携やデータ連携の交渉が必要',
    ],
    apiSpec: '各サービスとのアライアンス / オープン連携',
    recommendedRole: 'きれい度評価基準の指標設計（何をもって綺麗とするか）の参考',
  },
];
