# きれいトイレ

公衆トイレの「きれい度」を地図で共有するアプリ。
データ元は OpenStreetMap（Overpass API・リアルタイム取得）とユーザー投稿。
Google Maps / Places API は有料のため不採用（地図タイルは OSM / 国土地理院）。

## 開発

```bash
bun install
bun run dev      # http://localhost:3000（tsx + Vite）
bun run lint     # tsc --noEmit
bun run test     # vitest
bun run build    # vite build + server bundle → dist/
bun start        # 本番起動（dist/server.cjs）
```

本番起動ポートは `process.env.PORT`（未設定時は 3000）。

## シードデータ生成手順（`src/data/`）

1. Overpass API で取得する（例: 渋谷周辺の公衆トイレ）。

   ```ql
   [out:json][timeout:25];
   nwr["amenity"="toilets"](around:3000,35.6590,139.7006);
   out center 100;
   ```

   結果を `/tmp/unique_osm.json` として保存する。
2. `tmp/gen_toilets.js` で `src/data/toilets.ts` を生成する（git 管理外の手元スクリプト）。

   ```bash
   node tmp/gen_toilets.js
   ```

3. フォールバック用の生ノード抜粋は `src/data/realOsmSeed.ts` に手動で追加する
   （Overpass 3ミラー全滅時に半径約4km以内を返す）。

## コミュニティ投稿API（`server/community.ts`）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/community/toilets` | 共有トイレ一覧＋外部施設（OSM/Google/OD）の共有レビュー（`externalReviews`） |
| POST | `/api/community/toilets` | 新規登録（バリデーション・ID重複409） |
| POST | `/api/community/toilets/:id/reviews` | 口コミ投稿（重複409・スパムURL400）。対象はコミュニティ登録トイレに限らず `osm-*` / `google-*` / `od-*` の全施設ID |
| POST | `/api/community/reviews/:id/helpful` | 役に立った投票（IP毎1回） |
| POST | `/api/community/reviews/:id/report` | 通報（コミュニティ登録・外部施設の両方のレビューが対象） |

- 投稿系は 10回/分・IP、投票系は 30回/分・IP のレート制限。
- 保存先は `data/community.json`（`COMMUNITY_STORE_PATH` で変更可）。
  **データはgit管理で運用する**（`.gitignore` で `data/community.json` のみ追跡）。
  再起動・デプロイ後の復元と、投稿内容の差分レビュー・手動キュレーションにgitを使う。
  コミットのタイミングは投稿が溜まったとき or 運用スクリプト（任意）で定期化する。
  なお、Cloud Run 等の ephemeral FS では**再起動時に未コミット分が消える**ため、
  コミット前に消えても良い量か、永続ボリュームの併用を検討すること。
  運用スクリプト（`scripts/community-ops/`、リポジトリ直下から実行）:
  - 差分サマリ（作業ツリー vs HEAD、`--old`/`--new`/`--counts-only` オプション）:
    `bun scripts/community-ops/summarize.ts`
  - スナップショット出力（既定 `data/backups/community-<時刻>.json`、git管理外）:
    `bun scripts/community-ops/export.ts`
  - コミット補助（既定はdry-runでメッセージ案の表示のみ。`--commit` で
    `git add data/community.json` + commit を実行。push はしない）:
    `bun scripts/community-ops/commit.ts`
  - 通報対応（`list` で一覧、`resolve <reportId>` は既定dry-runの削除プレビュー。
    `--apply` で該当レビューを削除し、同一レビューへの全通報・投票・重複ガードを
    掃除してスコアを再計算したうえで書き込む）:
    `bun scripts/community-ops/curate.ts resolve <reportId> --apply`
- `COMMUNITY_SALT` は**必ず固定値**を設定すること（未設定だと起動毎にランダムになり、
  「IP毎1回」の投票・重複ガードが再起動のたびにリセットされる）。
  IPはソルト付きSHA-256ハッシュのみ保存し、ハッシュはAPI応答に含めない。
- 口コミはコミュニティ登録トイレに加え、OSM取得・Google手動調査・自治体ODの施設
  （`osm-*` / `google-*` / `od-*`）へも投稿でき、他端末と共有される（M5対応）。
  フロントは起動時に `externalReviews` を取得してシード施設へ重ねる。
- フロントはAPI不通時に localStorage のみのローカル動作にフォールバックする。

## Google手動調査データの取込（`scripts/manual-import/`）

Places APIは使わず、ChatGPT等による手動リサーチ結果（JSON）を取込む。

1. `docs/manual-research-prompt.md` をChatGPT（Deep Research推奨）に貼って調査する
2. 出力JSONを `scripts/manual-import/inputs/{エリア}.json` に保存する
3. 取込実行（座標欠落分はNominatimで補完、1.2秒間隔）:

   ```bash
   bun scripts/manual-import/run.ts --in scripts/manual-import/inputs/shibuya-01.json
   ```

   `src/data/googleSeed.ts` が生成される。スキップ理由はコンソールに出る
   （座標特定不能・形式不正は取込不可）。
4. 判定不能（score null）は中立値3.0＋要確認メモで取込む。UI上は未評価表示。
5. 設備は `true`（あり） / `false`（なし） / `null`（未確認）の3値で格納する。
   未調査の項目は `null` にし、`false`（確認済みで無い）と区別する。
6. **規約：口コミ本文の転載禁止**。Google Maps 等のユーザー投稿の本文（および
   ほぼ同一の書き換え）は、規約・プライバシー上の理由から取り込まない。取り込むのは
   listing の口コミ「件数」（`externalReviewCount`）と、調査者が自前の文章で書いた
   傾向要約（`scoreBasis`）のみ。`convert.ts` は旧形式の `reviewExcerpts`（口コミ引用）を
   検出すると破棄し `warn:` をコンソールに出力する。調査プロンプト
   `docs/manual-research-prompt.md` も引用収集を要求しない（2026-09 改定）。

## 自治体オープンデータの取込（`scripts/opendata-import/`）

初弾として熊谷市「公衆トイレ一覧」（くまっぷオープンデータ、2023年10月2日掲載、126件）を取込済み。
出典表記は各施設の `facilityNote` と本READMEで行う（CC-BY 相当の帰属表示）。

```bash
bun scripts/opendata-import/run-kumagaya.ts            # inputs のCSVから生成
bun scripts/opendata-import/run-kumagaya.ts --fetch    # 公式URLから再取得して生成
```

注意：公式CSVは緯度/経度列が重複している（前半は空、後半に実値）。
`mapKumagayaRows` は最終出現を採用する。他自治体を追加する際は列定義を確認すること。

## データ方針

- `cleanlinessScore` / `cleanlinessGrade` は実測レビュー平均。
  `reviewCount === 0` の施設は設備推定値（`equipmentScore` / `equipmentGrade`）を
  表示用に入れるが、UI上は「未評価」としてランク表示しない。
- スコア→グレード判定は `src/lib/scoring.ts` の `gradeForScore` に一本化すること。
- 設備フラグは `true`（あり） / `false`（なし） / `null`（未確認）の3値。
  OSM タグ欠落時は楽観的に true にせず `null`（未確認）にする
  （例: `hasSoap` は `soap=yes` のみ true、`isFree` は `fee=no` のみ true で
  `fee` タグ欠落を「無料」と断定しない。変換は `src/lib/osm.ts` に一本化）。
- **口コミ本文の転載禁止**：外部サイト（Google Maps 等）のユーザー投稿本文を
  アプリ・リポジトリに転載しない（規約・プライバシー上の理由）。
  `src/data/googleSeed.ts` は口コミ本文を含まない（過去の引用は 2026-09 に除去済み）。
  Google 由来施設のスコアは件数と要約に基づく手動判断値で、`reviewCount === 0` のため
  UI上は「未評価（口コミ未取込）」として扱う。

## ライセンスとデータ帰属

- コード: MIT License（`LICENSE` 参照）。
- 同梱データ（`src/data/` 配下のシード・生成物）はコードのライセンス対象外で、出典ごとの条件に従う。
  - **OpenStreetMap 由来**（`src/data/realOsmSeed.ts`・`src/data/toilets.ts`、
    OSM リアルタイム取得の変換結果）: © OpenStreetMap contributors, ODbL。
    抽出・再利用は ODbL 条件（派生 DB のシェアアライク等）に従うこと。
    https://www.openstreetmap.org/copyright
  - **熊谷市「公衆トイレ一覧」**（くまっぷオープンデータ、2023年10月2日掲載）: CC-BY 相当。
    出典: https://www2.wagmap.jp/kumagaya/OpenData
  - **Google Maps 由来の手動調査データ**（`src/data/googleSeed.ts`）: 事実情報（座標・設備・
    口コミ件数）と調査者が自前で書いた要約のみで、ユーザー投稿本文は含まない（転載禁止方針）。
    「Google」は Google LLC の商標。
- 地図タイルは © OpenStreetMap contributors（ODbL）および国土地理院。帰属は地図上のコントロールに常時表示。
- コミュニティ投稿（口コミ・施設登録）は投稿者のコンテンツ。削除依頼・モデレーションは
  `scripts/community-ops/` の運用フローで対応する。
