// 既知外部施設（osm-*/google-*/od-*）のレビュー可否を CommunityRepository 経由で復元する。
// リポジトリ直下から実行する。
//
// 背景（#53 で失われたリストア経路の代替）:
//   server.ts は起動時に JSON store の externalReviews キー一覧を既知外部施設として登録する
//   （シード施設は runtime が起動時に登録済み）。#53 以前は外部施設の全レビューを削除しても
//   そのキーが残ったため、レビュー可否は自動で復元された。#53 の curation は空になったキーを
//   削除するようになり、以降はライブ OSM 由来（シード外）の施設が「レビュー0件 + キーなし」
//   になると 404 のまま残る。この CLI はコミュニティデータに痕跡（externalReviews のキー・
//   通報・施設ID）がある外部施設IDを集め、CommunityRepository 契約経由でバックエンドに
//   再登録する。バックアップから復元する場合や --backend firestore で JSON 運用分を
//   Firestore へ引き継ぐ場合にも使える。
//
// 使い方:
//   bun scripts/community-ops/restore.ts                       # JSON store（既定）を dry-run
//   bun scripts/community-ops/restore.ts --apply               # JSON store へ書き込む
//   bun scripts/community-ops/restore.ts --backend firestore   # Firestore バックエンドを dry-run
//   bun scripts/community-ops/restore.ts --backend firestore --apply
//   bun scripts/community-ops/restore.ts --store <path>        # JSON store のパス指定
//   bun scripts/community-ops/restore.ts --from <backup.json>  # バックアップからもIDを収集
//     （#53 の curation で痕跡ごと消えた施設は現行ファイルに残らないため、
//      export.ts のバックアップや git 履歴から取り出したファイルを --from に渡す）
//
// 辞書は「現状のバックエンドに登録済みの既知ID」∪「コミュニティデータに出現する外部施設ID」。
// 既知IDはレビュー0件でもライブ OSM 観測を待たずに投稿可能なまま保たれる。
//
// プライバシー: 施設IDと件数のみを扱い、口コミ本文・IPハッシュ等は一切出力しない。
import { pathToFileURL } from "node:url";
import {
  createConfiguredCommunityStore,
  type ConfiguredCommunityStore,
} from "../../server/communityStoreFactory";
import { isExternalFacilityIdFormat } from "../../server/externalFacilityRegistry";
import { loadRawDb } from "./curate";
import { storePath } from "./export";

const BACKENDS = ["json", "firestore"] as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

function backendFlag(): (typeof BACKENDS)[number] {
  const value = arg("--backend") ?? process.env.COMMUNITY_BACKEND;
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "json") return "json";
  if (normalized === "firestore") return "firestore";
  throw new Error(`不明なバックエンド: ${value}（json / firestore を指定してください）`);
}

async function loadStore(
  backend: "json" | "firestore",
  jsonPath: string
): Promise<ConfiguredCommunityStore> {
  if (backend === "firestore") {
    // Firestore 選択時は runtime と同じ遅延ロード経路を使う（@google-cloud/firestore 必須）。
    const { loadGoogleCloudFirestore } = await import("../../server/communityRuntime");
    return createConfiguredCommunityStore({
      backend,
      nodeEnv: process.env.NODE_ENV,
      firestore: loadGoogleCloudFirestore(),
    });
  }
  return createConfiguredCommunityStore({
    backend,
    nodeEnv: process.env.NODE_ENV,
    jsonPath,
  });
}

/** コミュニティデータ（data/community.json 相当）に出現する外部施設IDを集める。 */
export async function collectExternalFacilityIds(storeFile: string): Promise<string[]> {
  let db;
  try {
    db = await loadRawDb(storeFile);
  } catch (e) {
    // まだデータファイルが無い（初回起動前）なら、復元対象は空として扱う。
    const message = (e as Error)?.message ?? "";
    if (message.includes("読み込み失敗") && message.includes("ENOENT")) {
      return [];
    }
    throw e;
  }
  const ids = new Set<string>();
  for (const id of Object.keys(db.externalReviews ?? {})) {
    if (isExternalFacilityIdFormat(id)) ids.add(id);
  }
  for (const report of db.reports ?? []) {
    if (report.toiletId && isExternalFacilityIdFormat(report.toiletId)) {
      ids.add(report.toiletId);
    }
  }
  for (const toilet of db.toilets ?? []) {
    if (isExternalFacilityIdFormat(toilet.id)) ids.add(toilet.id);
  }
  return [...ids].sort();
}

export interface RestorePlan {
  alreadyKnown: string[];
  restored: string[];
}

export async function planRestore(
  store: ConfiguredCommunityStore,
  dataFile: string = storePath(),
  fromFile?: string
): Promise<RestorePlan> {
  const observed = new Set(await collectExternalFacilityIds(dataFile));
  if (fromFile) {
    for (const id of await collectExternalFacilityIds(fromFile)) observed.add(id);
  }
  const observedIds = [...observed].sort();
  const knownIds = new Set(await store.store.listKnownExternalFacilityIds());
  return {
    alreadyKnown: observedIds.filter((id) => knownIds.has(id)).sort(),
    restored: observedIds.filter((id) => !knownIds.has(id)).sort(),
  };
}

export async function applyRestore(
  store: ConfiguredCommunityStore,
  dataFile: string = storePath(),
  fromFile?: string
): Promise<RestorePlan> {
  const plan = await planRestore(store, dataFile, fromFile);
  if (plan.restored.length > 0) {
    await store.store.registerExternalFacilities(
      plan.restored.map((id) => ({
        id,
        source: id.startsWith("osm-") ? ("osm" as const)
          : id.startsWith("google-") ? ("google" as const)
          : ("od" as const),
        origin: "restore" as const,
      }))
    );
  }
  return plan;
}

function formatPlan(plan: RestorePlan, applied: boolean): string {
  const title = applied
    ? "=== 外部施設の登録を適用しました ==="
    : "=== 外部施設の登録プレビュー（dry-run・変更なし） ===";
  const lines: string[] = [title];
  lines.push(
    `  すでに既知: ${plan.alreadyKnown.length}件${plan.alreadyKnown.length > 0 ? ` (${plan.alreadyKnown.join(", ")})` : ""}`
  );
  lines.push(`  復元対象: ${plan.restored.length}件${plan.restored.length > 0 ? ` (${plan.restored.join(", ")})` : ""}`);
  if (!applied && plan.restored.length > 0) {
    lines.push("");
    lines.push("実行する場合: bun scripts/community-ops/restore.ts --apply");
  }
  if (applied) {
    lines.push("");
    lines.push("次の確認: bun scripts/community-ops/summarize.ts");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const backend = backendFlag();
  const apply = has("--apply");
  const dataFile = arg("--store") ?? process.env.COMMUNITY_STORE_PATH ?? storePath();
  const fromFile = arg("--from");
  const configured = await loadStore(backend, dataFile);
  const plan = apply
    ? await applyRestore(configured, dataFile, fromFile)
    : await planRestore(configured, dataFile, fromFile);
  process.stdout.write(formatPlan(plan, apply) + "\n");
}

// import.meta.url での直接実行判定（他スクリプトから import されたときは実行しない）
const isMain =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e: unknown) => {
    process.stderr.write(`エラー: ${(e as Error).message}\n`);
    process.exit(1);
  });
}
