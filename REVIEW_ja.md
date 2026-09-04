# kaenozu/dokotoilet（きれいトイレ）コードレビュー

- レビュー日: 2026-09-04
- 対象: https://github.com/kaenozu/dokotoilet（`main` を浅くクローンして確認）
- 検証: `bun run lint` / `bun run test` / `bun run build` を実機で実行済み

---

## 1. 概要

公衆トイレの「きれい度」を地図で共有するアプリ「きれいトイレ（どこトイレ）」。

- 作成は 2026-09-03（レビュー時点で約2日）。star / issue / fork は 0、**LICENSE ファイルなし**
- **google-gemini/aistudio-repository-template から生成**されたリポジトリで、AI Studio 由来の残骸が随所に残っている（後述 P1）
- 技術スタック: React 19 + Vite 6 + Tailwind CSS 4 + Leaflet（クライアント）/ Express 4 + helmet + express-rate-limit（サーバー）/ Vitest / Bun
- 全体で約 13,000 行だが、大半は生成済みシードデータ

**シードデータの内訳**

| ファイル | 内容 | 件数 |
|---|---|---|
| `src/data/googleSeed.ts` | Google手動調査（ChatGPT/Deep Research 経由） | 30施設 ＋ 口コミ引用28件 |
| `src/data/kumagayaSeed.ts` | 熊谷市オープンデータ「公衆トイレ一覧」 | 126施設 |
| `src/data/realOsmSeed.ts` | Overpass 全滅時のフォールバック用 OSM 生ノード | 84件 |
| `src/data/toilets.ts` | 手動検証済み OSM 施設（渋谷中心） | 10施設 |

**検証結果**

- `bun run lint`（tsc --noEmit）→ ✅
- `bun run test`（vitest）→ ✅ 55/55 成功（5ファイル）
- `bun run build` → ✅（クライアント 627kB / gzip 148.6kB。Vite の 500kB 超過警告あり）

---

## 2. 良い点（これは維持すべき）

1. **バリデーションが純関数化されテストされている**
   `server/community.ts` の `validateToiletInput / validateReviewInput / validateReportInput` が pure 関数として切り出され、25 本のテストでカバーされている。グレード判定 `gradeForScore` もサーバーとクライアントで共通化済み（3箇所に分散していた判定ロジックを1本化した形跡あり）。
2. **データ方針が README に明文化され、コードもそれに従っている**
   「モックなし」「OSM タグ欠落時は楽観的に true にしない」「reviewCount===0 は未評価扱い」といった方針が実際に守られている。この誠実さは貴重。
3. **OSM 取得層が堅牢**
   Overpass ミラーを順にフェイルオーバー（各8秒タイムアウト）、15分 TTL + LRU 上限 200 のキャッシュ、さらに実在 OSM シードへのフォールバック。UA も連絡先付きで ODbL ポリシーに配慮。
4. **データ取込パイプラインが再現可能**
   手動調査と自治体オープンデータの取込がスクリプト + テストとしてコミットされている。`passesGuard`（同名異地の誤配置防止）や、熊谷市 CSV の緯度経度重複列という罠への対処までテスト化。
5. **MVP としては十分なセキュリティ配慮**
   helmet + CSP 調整、ルート別レート制限、コメント内 URL 拒否、IP はソルト付き SHA-256 ハッシュのみ保存、ファイル書き込みは atomic（tmp + rename）。

---

## 3. 改善点と修正方針

### 3.1 🔴 高優先度（本番公開前に必ず対応）

#### H1. Google 口コミ本文の転載が Terms / プライバシー違反リスク
`src/data/googleSeed.ts` に「Google口コミより引用」として **28件の口コミ本文**がそのままバンドルされ、アプリ内でレビュー表示される。

- 問題: Places API が有料だからと API を避けつつ、**手動調査で Google Maps のユーザー口コミ文を複製して配布**するのは Google の利用規約違反になり得る。投稿者本人の同意もない。API を避けたことが免責になるわけではない。
- 修正方針:
  - 出荷物から口コミ本文を除去し、保持するのは「数値情報（`externalReviewCount` 等）」「座標・設備」「自前で書いた施設サマリ」に限定する。
  - 口コミの要約文も「Google の文言の転載」にならないよう自前の表現で書く規約を `scripts/manual-import/convert.ts` と README に追加し、再インポート時も守る。
  - どうしても引用を残す場合は明示的な出典表記 + 削除依頼窓口を用意する（それでも推奨しない）。
- 実施状況（2026-09-04）: **対応済み**。`googleSeed.ts` の引用28件・入力JSONの引用28件を除去し、`convert.ts` は `reviewExcerpts` を破棄して警告するよう変更。README / `docs/manual-research-prompt.md` / `docs/review-excerpt-prompt.md` に転載禁止規約を追記。

#### H2. コミュニティデータの永続化・モデレーション経路の欠如
`server/community.ts` の保存先は JSON ファイル（`data/community.json`、`COMMUNITY_STORE_PATH` で変更可）。

- 問題:
  1. Cloud Run 等の ephemeral FS では再起動で消える（README も認めているが「本格運用は差し替え」のままだと本番で即データ消失）。
  2. 複数レプリカ構成ではインスタンスごとに atomic rename するため、書き込みが互いに上書きし合う（ファイルストアは単一プロセス前提）。
  3. **通報（モデレーションキュー）を書き込むだけで、読み出して処理する管理 API / UI が一切存在しない**。実質、モデレーション不能。
  4. `COMMUNITY_SALT` 未設定時は起動ごとにランダム生成されるため、再起動のたびに「役に立った投票は IP 毎に1回」ガードがリセットされ二重投票できる。
- 修正方針:
  - `CommunityStore` インターフェースは差し替えを想定して作られているので、本番投入前に Firestore / Postgres 実装を用意する（README の想定通り）。複数レプリカ対応も同時に解決する。
  - `GET /api/admin/reports`（`ADMIN_TOKEN` 環境変数等で保護）+ レビュー削除エンドポイント + 最小限の管理画面を追加する。最低限でも、レポートを一覧出力するスクリプトを用意する。
  - デプロイ時に `COMMUNITY_SALT` を固定の環境変数として設定する。

#### H3. LICENSE なし ＋ データライセンスの整理
- 問題: リポジトリに LICENSE がない。OSM 由来データ（ODbL）と熊谷市データ（CC-BY 相当）の帰属表示は `facilityNote` / README にあるが、派生データベースの扱いやライセンス条件の明記がない。
- 修正方針:
  - コード用に LICENSE（MIT / Apache-2.0 等）を追加。
  - README に「データとライセンス」節を設け、OSM の ODbL 帰属・シェアアライク条件、熊谷市データの出典ページへのリンクを明記。Google 由来の本文転載は H1 の方針で撤去する。

### 3.2 🟠 中優先度（バグ）

#### M1. 未使用のフィルタ状態が残っている
`FilterState.category` / `minGrade` / `onlyFree` は `src/App.tsx` の初期状態に定義されているが、フィルタリングロジックでは一切使われていない。逆に `onlyBabyTable` はロジック（`App.tsx` 194行目）があるのに UI のトグルが存在しない。

- 修正方針: フィールドごとに「実装する or 型ごと削除する」を決める。実装するなら Header にカテゴリチップ / グレード選択 UI を追加し、フィルタ述語を純関数（例 `src/lib/filter.ts`）に抽出してテストを書く。使わないなら `FilterState` と初期値から削除。

- 実施状況（2026-09-04）: **対応済み**。未使用の4フィールドを `FilterState` から削除し、絞り込み・ソートを `src/lib/filter.ts` の純関数に抽出（9テスト追加）。

#### M2. 「清潔度順にソート」という表示が嘘
`src/components/ToiletList.tsx` は「清潔度順にソート」と表示するが、`filteredToilets`（`App.tsx`）は単なる `.filter()` でソートしていない。

- 修正方針: ソートを追加する（評価済みは `cleanlinessScore` 降順、未評価は `equipmentScore` 降順で後ろに置く等）。実装しないならラベルを削除する。

- 実施状況（2026-09-04）: **対応済み**。一覧を「評価済み → 実測平均降順、未評価 → 設備推定降順（id決定的タイブレーク）」でソートし、ラベル文言と一致させた。

#### M3. 新規登録時に自動生成される「初回レビュー」が不整合
`src/components/AddToiletModal.tsx` は新規トイレに `reviewCount: 1` と「情報登録者」名義の自動レビュー（`helpfulCount: 1` = 自己投票）を付与する。一方サーバー側（`community.ts` の POST /toilets）は同じ施設を `reviewCount: 0` / `reviews: []` で保存する。クライアントは 201 レスポンスでサーバー版に置き換えないため、**登録者と他のユーザーで表示が食い違う**。「モックなし」方針とも矛盾する。

- 修正方針: 自動レビュー生成をやめ、登録時は `reviewCount: 0` でサーバーに合わせる。登録者の評価は登録後に通常のレビュー投稿フローへ誘導する（またはレビュー API 経由で1件本物のレビューとして送る）。`handleAddToilet` ではサーバー応答を正として state を置換する。

- 実施状況（2026-09-04）: **対応済み**。自動生成レビュー（`helpfulCount: 1` の自己票）を廃止してサーバーと同様 `reviewCount: 0` に統一。`handleAddToilet` は 201 応答のサーバー版を正として state を同期する。

#### M4. 石鹸 / ペーパー確認チェックボックスが機能していない
`ReviewModal.tsx` は `hasSoapConfirmed` / `hasPaperConfirmed` を収集するが、サーバーに送信されず、施設属性にも反映されない（反映されるのは `hasWashletConfirmed` のみ）。

- 修正方針: `ToiletReview` に soap / paper の確認フィールドを追加してサーバーのバリデーションと施設属性の更新まで一気通貫で実装するか、実装しないならこの2つのチェックボックス自体を UI から削除する。

- 実施状況（2026-09-04）: **対応済み**。二案のうち「削除」を選択（既存の便座確認も下流で未使用のため、未配線フィールドを増やすのを避けた）。`ReviewModal.tsx` から該当チェックボックスと state を除去。

#### M5. OSM / Google / オープンデータ施設への口コミが端末ローカルのみ
レビュー投稿はサーバーの `/api/community/toilets/:id/reviews` に送るが、サーバーにはコミュニティ登録トイレしか存在しないため、大半の施設（OSM・Google・OD）は 404 → ローカル保存にフォールバックする。つまり「きれい度の共有」という目玉機能が、実際にはコミュニティ登録施設だけでしか他端末と共有されない。

- 修正方針: サーバーがコミュニティテーブル内の存在ではなく **ID 形式（`osm-*` / `google-*` / `od-*` / `toilet-user-*`）でレビューを受け付ける**ようにして、全施設の口コミを共有可能にする（重複ガードは維持）。ローカル限定を仕様とするなら、その旨を README と UI に明記する。

- 実施状況（2026-09-04）: **対応済み**。サーバーを v2（`externalReviews`）化し、`osm-*` / `google-*` / `od-*` の口コミを受付・共有。クライアントは起動時・投稿成功時に共有レビューを重ね合わせる（`src/lib/externalReviews.ts`、テスト4件）。

#### M6. localStorage にシードが固定され、既存ユーザーに更新が届かない
初回マウントで `SEED_TOILETS`（= シード統合結果）が `toilet_cleanliness_map_real_v3` として保存され、以後はそれが優先される。`googleSeed` / `kumagayaSeed` を更新してリリースしても、**過去にアクセスしたユーザーには新しい施設が一切表示されない**。さらに変更のたびに「シード全体 + OSM 取得分」を毎回シリアライズして保存するため、quota（約5MB）に近づく。

- 修正方針: localStorage には「ユーザー生成の差分」（投稿レビュー・投票・追加施設）だけを保存し、起動時は常に最新シードとマージする。OSM 取得分は別キーに分けて上限を設ける（キャッシュ扱い）。シード形式が変わったらストレージキーをバンプする。

- 実施状況（2026-09-04）: **対応済み**。localStorage にはユーザーデルタのみ保存（`kirei-toilet-delta-v1`）し、起動時は常に最新バンドルシードへマージ。OSM 取得分は別キーの上限付きキャッシュ（600件）に分離。旧 v3 / v2 全体スナップショットから自動移行し旧キーは削除。サーバー同期済みレビューはローカルに残さない（git運用でのサーバー側削除が復活しない）。`src/lib/localDeltas.ts`（13テスト）。

#### M7. その他の細かいバグ・改善
- 役に立った投票の楽観的更新: サーバーが「投票済み」を返すとカウントが巻き戻る（軽微）。オフライン投票はローカルに残るだけで再送されない。
- OSM 取得失敗時のトーストが「実在公衆トイレ（OSM）の取得を完了しました。」と成功風の文言になっている（`App.tsx`）。
- `server.ts` の OSM プロキシはエラーを `console.info` + 空ペイロードで握りつぶすため、障害の可視性が低い。エラーは `console.error` で出し、レスポンスにも `source: "fallback"` 等を付けると調査しやすい。
- `/api/osm/toilets` の `lat` / `lng` / `radius` に範囲・有限値チェックがない（`NaN` / `Infinity` がクエリとキャッシュキーに入り得る）。

### 3.3 🟡 低優先度（整理・品質）

#### P1. AI Studio テンプレートの残骸
- `package.json` の `name` が `"react-example"`（AI Studio テンプレートのまま）
- `metadata.json` が `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` を宣言しているが、**コード内に Gemini 利用は一切ない**
- `.env.example` は未使用の `GEMINI_API_KEY` / `APP_URL` を記載（実際の環境変数は `PORT` / `COMMUNITY_SALT` / `COMMUNITY_STORE_PATH`）
- `vite.config.ts` に文字化けコメント（"Do not modifyâ…"）と `DISABLE_HMR` のスキャフォールドが残る
- `tsconfig.json` に `experimentalDecorators` 等の不要オプション

- 修正方針: `name` の変更、`metadata.json` の能力宣言の訂正（または Gemini 機能の実装 or 宣言削除）、`.env.example` を実変数に合わせる、コメント整理、tsconfig の不要オプション削除。

#### P2. コードの配置・重複
- `isEvaluated` / `getGradeColor` が `src/components/ToiletMap.tsx` から export され、`ToiletList.tsx` / `ToiletDetails.tsx` が import している（コンポーネント間の暗黙結合）。→ `src/lib/` へ移動。
- カテゴリ → 日本語ラベルのマッピングが `server.ts`（OSM 変換）/ `community.ts`（POST /toilets）/ `AddToiletModal.tsx` の3箇所に重複。→ `lib` の1関数に集約。
- レビュー平均スコア計算が `App.tsx` の `applyLocalReview` と `community.ts` の `addReview` に重複。→ 共有ヘルパーに集約（サーバー側にテストがあるのでそれを正とする）。

#### P3. マップのパフォーマンス
マーカー描画 effect の依存に `onSelectToilet` があり、`App.tsx` は毎レンダー新しいインライン関数を渡すため、**App が再レンダーするたびに全マーカーを clear + 再生成**している。施設が数百件になると無視できない。

- 修正方針: `onSelectToilet` を `useCallback` で安定化する（または effect の依存から外す）。詳細パネルの開閉でレイアウト幅が変わるため `map.invalidateSize()` の呼び出し（ResizeObserver 等）も追加する。

#### P4. バンドルサイズ
クライアントが 627kB（gzip 148.6kB）の単一チャンクで、Vite が 500kB 超過を警告している。

- 修正方針: `rollupOptions.output.manualChunks` で `leaflet` / `react` を vendor 分割するか、ルートを遅延ロードする。

#### P5. サーバー入力の検証強化
- 上記 M7 のとおり、`/api/osm/toilets` のクエリパラメータ（緯度経度の範囲、`radius` の上限、有限値）を明示的に検証する。

---

## 4. 総評

**2日でここまで作るのは相当優秀。** 構成は小さく読みやすく、バリデーションの純関数化とテスト（55本すべて成功）、データ方針の明文化、OSM ミラー + キャッシュ + フォールバックの堅牢化まで、MVP の域を超えた設計思想と実行力がある。lint / test / build も CI 前提で整っている。

一方で「Google 口コミ本文の転載」「ファイル保存 + モデレーション不能」「自動生成レビューとサーバー側の不整合」は、公開・運用を始める前に必ず潰したい項目。特に H1 はサービス継続に関わる法的リスクなので最優先で対応するのがよい。

優先順位の目安:

1. H1（Google 口コミ文撤去）→ H2（ストア差し替え・管理API・SALT固定）→ H3（LICENSE 追加）
2. M1〜M4（実害のあるバグ）は小さいのでまとめて修正するのがおすすめ
3. M5・M6（共有範囲とシード更新の設計）は方針決めが必要なので、ユーザーストーリーと合わせて判断する
4. P1〜P5 は暇なときに

---

*このレビューはリポジトリをローカルにクローンし、`bun run lint` / `bun run test` / `bun run build` を実行した上で作成しています。*
