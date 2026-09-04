// コミュニティ投稿データ（data/community.json）の差分サマリ（git運用のレビュー用）。
// 使い方（リポジトリ直下から）:
//   bun scripts/community-ops/summarize.ts                          # 作業ツリー vs HEAD
//   bun scripts/community-ops/summarize.ts --old <path|empty>       # 比較元を指定（empty=空DB）
//   bun scripts/community-ops/summarize.ts --new <path>             # 比較先を指定（既定: data/community.json）
//   bun scripts/community-ops/summarize.ts --counts-only            # 本文・理由を出さず件数のみ
// HEAD にまだ data/community.json が無い（初回コミット前）場合は「空」として扱う。
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  diffStores,
  emptyDb,
  formatDiff,
  formatStats,
  isDiffEmpty,
  loadDbFile,
  parseDb,
  type DbFile,
} from "./store";
import { storePath } from "./export";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

/** リポジトリ内パス（git ref 用に / 区切り）。リポジトリ外なら null */
export function repoRelative(filePath: string): string | null {
  const rel = path.relative(process.cwd(), filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

/** git の特定 ref からファイル本文を読む。無ければ null（未追跡・初回など） */
export function readGitFile(ref: string, filePath: string): string | null {
  const rel = repoRelative(filePath);
  if (!rel) return null;
  try {
    return execFileSync("git", ["show", `${ref}:${rel}`], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

async function loadOld(spec: string | undefined, newPath: string): Promise<DbFile> {
  if (!spec || spec === "HEAD") {
    const raw = readGitFile("HEAD", newPath);
    if (raw === null) return emptyDb();
    try {
      return parseDb(raw, "HEAD");
    } catch {
      return emptyDb();
    }
  }
  if (spec === "empty") return emptyDb();
  return loadDbFile(spec);
}

async function main(): Promise<void> {
  const newPath = arg("--new") ?? storePath();
  const countsOnly = has("--counts-only");

  let newDb: DbFile;
  try {
    newDb = await loadDbFile(newPath);
  } catch (e) {
    process.stderr.write(`エラー: ${(e as Error).message}\n`);
    process.exit(1);
    return;
  }

  const oldDb = await loadOld(arg("--old"), newPath);
  const diff = diffStores(oldDb, newDb);
  const oldLabel = `HEAD:${repoRelative(newPath) ?? newPath}`;
  process.stdout.write(formatStats(oldDb, oldLabel) + "\n");
  process.stdout.write(formatStats(newDb, newPath) + "\n");
  if (isDiffEmpty(diff)) {
    process.stdout.write("\n差分なし\n");
    return;
  }
  process.stdout.write("\n" + formatDiff(diff, { countsOnly }) + "\n");
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
