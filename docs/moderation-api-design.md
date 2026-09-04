# モデレーション管理API 設計案（通報キュー）

- ステータス: 設計案（レビュー用）
- 対象: `server/community.ts`（CommunityStore）と Express ルーター
- 関連する既知の制約: ストアは JSON ファイル保存・単一プロセス前提。Cloud Run 等の
  ephemeral / 複数レプリカ構成への移行（Firestore/Postgres）は CommunityStore の
  インターフェースを維持したまま後続対応する（本設計はその差し替えを妨げない）

## 1. 現状と課題

- 通報は `POST /api/community/reviews/:reviewId/report` で `db.reports` に積まれるだけで、
  **読み出す手段が存在しない**（管理画面・API とも無い）
- `StoredReport` = `{ id, toiletId, reviewId, reason, createdAt }`
- レビューは各施設（`toilets[].reviews`）にインラインで保存され、`reviewCount` /
  `cleanlinessScore` / `cleanlinessGrade` はレビュー一覧から再計算される
- 重複投稿ガード用の `reviewKeys[reviewId] = { ipHash, at }`、投票記録
  `helpfulVotes[reviewId] = ipHash[]` が存在する（削除時はこれらも掃除する必要がある）
- データベース `version: 1`。`reports` に解決状態の概念がない

## 2. 方針

1. **認証は共有シークレット（`ADMIN_TOKEN` 環境変数）+ Bearer トークン**。
   ユーザーアカウント基盤が無い MVP ではこれが最小。`timingSafeEqual` で比較し、
   トークンをログに出さない。
2. **管理ルーターは `/api/admin` に分離**し、認証ミドルウェアを通過したものだけ公開。
   `ADMIN_TOKEN` 未設定なら管理ルーター自体をマウントしない（環境によっては
   管理機能を完全に無効化できる）。
3. **レポートは「開封（open）/ 解決（resolved）」の2状態**で管理。
   解決は「問題なしと判断（対応不要）」と「レビュー削除で対応」の2種類を記録できるようにする。
4. **削除はカスケード**。レビュー削除時に、
   - 対象レビューを `toilets[].reviews` から除去
   - `reviewCount` を減算し、残レビューの平均で `cleanlinessScore` / `cleanlinessGrade`
     を再計算（0件になったら `equipmentScore` / `equipmentGrade` に戻す＝未評価扱い）
   - `reviewKeys` / `helpfulVotes` のエントリを掃除
   - 関連する `reports` を `resolved`（種別: review_deleted）で閉じる
   - `moderationLog` に監査記録を追記
5. **監査ログ（`moderationLog`）** を追加し、誰（トークンの持ち主）がいつ何をしたかを
   残す。1オペレーター前提でも「消えたレビュー」の調査ができるようにする。
6. DB スキーマは `version: 2` に引き上げ、`load()` で v1 からの移行
   （既存 reports は status なし → `open` 扱い）を行う。

## 3. API 設計

共通: すべて `Authorization: Bearer <ADMIN_TOKEN>` 必須。
失敗時は `401 { error: "unauthorized" }`。JSON ボディ上限・レート制限は
コミュニティ API と同じ方針（`/api/` の 60回/分 が既に効く）。

### 3-1. 通報一覧

`GET /api/admin/reports?status=open&limit=50&offset=0`

- `status`: `open`（既定）/ `resolved` / `all`
- 応答はレポート単体ではなく「レビュー + 施設コンテキスト」を JOIN した形で返す

```json
{
  "reports": [
    {
      "reportId": "report-xxxx",
      "reason": "スパムらしいURLが含まれる",
      "createdAt": "2026-09-04T09:00:00.000Z",
      "status": "open",
      "toilet": { "id": "osm-123", "name": "渋谷駅 公衆トイレ", "lat": 35.65, "lng": 139.7 },
      "review": {
        "id": "rev-yyyy",
        "userName": "広告くん",
        "comment": "詳細はこちら→ www.spam.example",
        "rating": 5,
        "createdAt": "2026-09-03",
        "helpfulCount": 0
      },
      "ipHashPrefix": "a3f9c2…"
    }
  ],
  "total": 12
}
```

- `ipHashPrefix`: 同一投稿者（同一 IP ハッシュ）の通報・レビューが他にないか
  目視パターン確認するための先頭8〜12文字（ハッシュ全体は返さない）。
  レビューID → `reviewKeys[reviewId].ipHash` から取得（レビューが既に無い場合は省略）。

### 3-2. 対応不要として解決

`POST /api/admin/reports/:reportId/resolve`

```json
{ "note": "問題なしと判断（任意メモ）" }
```

- 応答: `200 { ok: true }`
- レビューは削除せず、レポートを `resolved`（種別: dismissed）にする。

### 3-3. レビュー削除（カスケード）

`DELETE /api/admin/reviews/:reviewId`

```json
{ "reason": "スパムURLを含むため削除（必須）" }
```

- 応答: `200 { ok: true, removedFrom: { toiletId, toiletName }, reviewCountAfter }`
- 対象レビューが無い場合は `404 { error: "review not found" }`
- 紐づく `reports` はすべて `resolved`（種別: review_deleted）で閉じる。

### 3-4. （任意）施設ごと削除

`DELETE /api/admin/toilets/:toiletId`

- コミュニティ投稿トイレ自体がスパムの場合に使用（初期実装では省略可）。
- カスケード: 施設・レビュー・`reviewKeys`・`helpfulVotes`・関連 reports を削除。

### 3-5. （任意）監査ログ参照

`GET /api/admin/log?limit=50`

- `moderationLog` の末尾（新しい順）を返す。

## 4. CommunityStore 実装方針

既存の `CommunityStore`（`community.ts`）にメソッドを追加する方針。
「ファイル保存」のままでも「単一インスタンス前提」の注記を維持すれば差し替え可能。

### 4-1. スキーマ変更（v2）

```ts
export interface StoredReport {
  id: string;
  toiletId: string;
  reviewId: string;
  reason: string;
  createdAt: string;
  status: "open" | "resolved";      // v1 からの移行で "open" を補う
  resolvedAt?: string;
  resolution?: "dismissed" | "review_deleted" | "toilet_deleted";
  adminNote?: string;
}

export interface ModerationLogEntry {
  id: string;                        // "mod-<uuid>"
  at: string;                        // ISO
  action: "report_resolved" | "review_deleted" | "toilet_deleted";
  reviewId?: string;
  toiletId?: string;
  reportIds?: string[];
  reason?: string;                   // オペレーター入力 or 自動（report の reason）
}

export interface CommunityDB {
  version: 2;
  toilets: ToiletFacility[];
  helpfulVotes: Record<string, string[]>;
  reports: StoredReport[];
  reviewKeys: Record<string, ReviewKey>;
  moderationLog: ModerationLogEntry[];
}
```

- `load()`: `parsed.version < 2` なら `reports[].status = "open"` を補完し
  `moderationLog: []` を初期化して v2 として扱う（ファイル自体は次回 save で v2 化）。

### 4-2. 追加メソッド（シグネチャ案）

```ts
// 一覧（JOIN 用の最小データだけ store が用意し、整形はルーターで行う）
async listReports(opts: { status?: "open" | "resolved" | "all"; limit?: number; offset?: number })
  : Promise<{ reports: StoredReport[]; total: number }>;

async resolveReport(reportId: string, note?: string)
  : Promise<{ ok: boolean; found: boolean }>;

async deleteReview(reviewId: string, reason: string, reportIds?: string[])
  : Promise<{ ok: boolean; found: boolean; toiletId?: string; reviewCountAfter?: number }>;

async deleteCommunityToilet(toiletId: string, reason: string)
  : Promise<{ ok: boolean; found: boolean }>;   // 任意実装

// 内部ヘルパー
private recomputeAfterReviewRemoval(t: ToiletFacility): void;
private appendModerationLog(entry: Omit<ModerationLogEntry, "id" | "at">): void;
```

### 4-3. スコア再計算ルール（既存 addReview の逆操作）

`addReview` が「全レビューの `rating` 平均 → `cleanlinessScore` / `gradeForScore`」を
行っているので、削除時は同じ式を逆に適用する:

```ts
private recomputeAfterReviewRemoval(t: ToiletFacility) {
  t.reviews = t.reviews.filter(r => /* 削除対象以外 */);
  t.reviewCount = t.reviews.length;
  if (t.reviewCount === 0) {
    // 実測が無くなったら設備推定に戻す（シード/OSM 変換と同じ「未評価」表現）
    t.cleanlinessScore = t.equipmentScore;
    t.cleanlinessGrade = t.equipmentGrade;
    delete t.lastCleaned;
    return;
  }
  const avg = t.reviews.reduce((s, r) => s + r.rating, 0) / t.reviewCount;
  t.cleanlinessScore = Math.round(avg * 10) / 10;
  t.cleanlinessGrade = gradeForScore(t.cleanlinessScore);
}
```

注意: 現行 `addReview` は `t.lastCleaned = "たった今（利用者が確認）"` を表示文字列として
上書きしており、削除で0件になった際にこの文言が残らないよう `delete t.lastCleaned` を
行う（型上は optional なので削除可能）。

### 4-4. カスケード掃除（deleteReview）

```ts
async deleteReview(reviewId, reason, reportIds?) {
  const db = await this.load();
  const t = db.toilets.find((x) => x.reviews.some((r) => r.id === reviewId));
  if (!t) return { ok: false, found: false };
  // 1. reviews から除去しスコア再計算（上記ヘルパー）
  // 2. reviewKeys / helpfulVotes から reviewId を削除
  // 3. 対象レポートを resolved（resolution: "review_deleted"）で閉じる。
  //    明示された reportIds 以外にも同一 reviewId の open レポートは全部閉じる
  // 4. moderationLog に追記
  // 5. await this.save()
  return { ok: true, found: true, toiletId: t.id, reviewCountAfter: t.reviewCount };
}
```

### 4-5. 保存の直列化と整合性

- 既存の `save()` は `this.queue` による直列化 + tmp→rename の atomic write。
  追加メソッドも「`await this.load()` → メモリ上で一括変更 → `await this.save()`」の
  既存パターンに従う（途中で `await` を挟まない＝変更中に他リクエストが割り込まない）。
- 制約の明記: ファイルストアは単一プロセス前提。複数レプリカで動かす場合は
  本メソッド群ごと Firestore/Postgres 実装へ差し替える（シグネチャが増えるだけで
  インターフェース破壊は避ける）。

## 5. ルーター実装方針（server/admin.ts 新設 or community.ts 追記）

- `createAdminRouter(store, token)` を新設。`community.ts` から分離して
  `server.ts` で `app.use("/api/admin", createAdminRouter(...))` する。
- 認証ミドルウェア:

```ts
function requireAdmin(token: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const provided = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const a = Buffer.from(provided);
    const b = Buffer.from(token);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}
```

- `server.ts` 側のマウント条件:

```ts
const adminToken = process.env.ADMIN_TOKEN;
if (adminToken) {
  app.use("/api/admin", createAdminRouter(communityStore, adminToken));
} else {
  console.warn("ADMIN_TOKEN 未設定: 管理APIは無効（通報はログのみ蓄積）");
}
```

- `ADMIN_TOKEN` は `.env.example` に追記し、README（コミュニティ投稿API節）に
  使い方を1行足す。

## 6. テスト方針

既存の `server/community.test.ts` の流儀（一時ディレクトリ + `CommunityStore` +
バリデーションの単体テスト）に合わせる:

1. **Store 単体**
   - 通報 → `listReports({status:"open"})` に出る / JOIN 用データが取れる
   - `resolveReport` で status が `resolved` になり `total` から減る
   - `deleteReview` でレビューが消え、`reviewCount` / `cleanlinessScore` が再計算される
     - 複数レビュー → 平均が残りレビューだけになる
     - 最後の1件 → `equipmentScore` / `equipmentGrade` に戻り未評価扱いになる
   - `reviewKeys` / `helpfulVotes` / 関連 `reports` の掃除と `moderationLog` の追記
   - v1 形式（reports に status なし）をロードしたら v2 へ移行される
2. **ルーター認証**
   - トークンなし / 誤トークン → 401
   - 正トークン → 一覧・解決・削除が 200
3. **カスケード端から端まで**: 通報 → 管理一覧 → レビュー削除 → 公開 API
   `GET /api/community/toilets` に当該レビューが残らないこと

## 7. 初期実装のスコープ（推奨）

| 項目 | 推奨 |
|---|---|
| 一覧（status/limit/offset + JOIN） | ✅ |
| 解決（dismissed） | ✅ |
| レビュー削除（カスケード + 再計算） | ✅ |
| 施設ごと削除 | 後回し（`deleteCommunityToilet` はシグネチャだけ用意） |
| 監査ログ参照 GET /api/admin/log | 後回し（DB には書き、エンドポイントは次フェーズ） |
| 管理 UI | 別設計（このAPI を叩く最小画面を次フェーズで） |

## 8. 未決事項（レビューしてほしい点）

1. `ADMIN_TOKEN` 方式でよいか（利用者が増えたらオペレーターアカウント + ロールへ）
2. `ipHashPrefix` を管理 API の応答に含めてよいか（プライバシー vs 同一投稿者検知）
3. レビュー削除後のスコアは「残レビュー平均」でよいか
   （0件になった施設は未評価に戻す、でよいか）
4. 通報は「1レビュー=複数通報」を許す現状のままでよいか
   （最初の1件だけ保持し、重複通報はカウント+1 する方式に変えるか）
