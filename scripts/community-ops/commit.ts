// コミュニティ投稿データのコミット補助（git運用）。
// 使い方（リポジトリ直下から）:
//   bun scripts/community-ops/commit.ts             # dry-run: 差分サマリ＋コミットメッセージ案の表示のみ
//   bun scripts/community-ops/commit.ts --commit    # 上記表示後、git add data/community.json + git commit を実行
//   bun scripts/community-ops/commit.ts --counts-only
// 対象は data/community.json のみ（.gitignore で追跡対象はこの1ファイル）。
// push は一切行わない。コミットメッセージは差分から自動生成する。
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildCommitBody,
  buildCommitSubject,
  diffStores,
  emptyDb,
  formatDiff,
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

function repoRelative(filePath: string): string | null {
  const rel = path.relative(process.cwd(), filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

function readGitHead(filePath: string): string | null {
  const rel = repoRelative(filePath);
  if (!rel) return null;
  try {
    return execFileSync("git", ["show", `HEAD:${rel}`], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

async function loadOld(spec: string | undefined, newPath: string): Promise<DbFile> {
  if (!spec || spec === "HEAD") {
    const raw = readGitHead(newPath);
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
  const doCommit = has("--commit");
  const countsOnly = has("--counts-only");
  const newPath = arg("--new") ?? storePath();

  const newDb = await loadDbFile(newPath); // 無ければエラー終了
  const oldDb = await loadOld(arg("--old"), newPath);
  const diff = diffStores(oldDb, newDb);

  if (isDiffEmpty(diff)) {
    process.stdout.write("差分なし（コミット対象なし）\n");
    return;
  }

  const subject = buildCommitSubject(diff);
  const body = buildCommitBody(diff);
  if (!subject) return;

  process.stdout.write(formatDiff(diff, { countsOnly }) + "\n");
  process.stdout.write("\n=== コミットメッセージ案 ===\n");
  process.stdout.write(`${subject}\n\n${body}\n\n`);

  const rel = repoRelative(newPath);
  if (!rel) {
    process.stderr.write(
      `注意: ${newPath} はリポジトリ外のため自動コミット対象外です（git add/commit は手動で）\n`
    );
    return;
  }

  if (!doCommit) {
    process.stdout.write(
      `実行する場合: bun scripts/community-ops/commit.ts --commit\n`
    );
    return;
  }

  execFileSync("git", ["add", "--", rel], { stdio: "inherit" });
  execFileSync("git", ["commit", "-m", subject, "-m", body], {
    stdio: "inherit",
  });
  process.stdout.write("コミットしました（push は未実行）\n");
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
