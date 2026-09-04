// コミュニティ投稿データ（data/community.json）のスナップショット出力。
// 使い方（リポジトリ直下から）:
//   bun scripts/community-ops/export.ts                 # data/backups/ にタイムスタンプ付きで保存
//   bun scripts/community-ops/export.ts --out <path>    # 出力先を指定
// 既定の保存先 data/backups/ は .gitignore の /data/* ルールでgit管理外（バックアップ用）。
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatStats, loadDbFile, type DbFile } from "./store";

export function storePath(): string {
  return (
    process.env.COMMUNITY_STORE_PATH ||
    path.join(process.cwd(), "data", "community.json")
  );
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function stamp(d = new Date()): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function defaultBackupPath(): string {
  return path.join(process.cwd(), "data", "backups", `community-${stamp()}.json`);
}

export async function runExport(
  db: DbFile,
  dest: string,
  sourceLabel: string
): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  // 整形して保存（git運用での人間によるレビューを想定）
  await writeFile(dest, `${JSON.stringify(db, null, 2)}\n`, "utf-8");
  process.stdout.write(`保存先: ${dest}\n`);
  process.stdout.write(`データ: ${formatStats(db, sourceLabel)}\n`);
}

async function main(): Promise<void> {
  const src = storePath();
  const dest = arg("--out") ?? defaultBackupPath();
  const db = await loadDbFile(src); // 壊れていればここでエラー終了
  await runExport(db, dest, src);
}

// import.meta.url での直接実行判定（他スクリプトから import されたときは実行しない）
const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e: unknown) => {
    process.stderr.write(`エラー: ${(e as Error).message}\n`);
    process.exit(1);
  });
}
