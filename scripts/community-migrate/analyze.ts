import { promises as fs } from "node:fs";
import path from "node:path";
import type { CommunityDB } from "../../server/community";
import { analyzeCommunitySnapshot } from "../../server/communitySnapshot";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const filePath = path.resolve(
    argValue("--in") ?? process.env.COMMUNITY_STORE_PATH ?? "data/community.json"
  );
  const raw = await fs.readFile(filePath, "utf-8");
  const db = JSON.parse(raw) as CommunityDB;
  const analysis = analyzeCommunitySnapshot(db);

  const output = {
    mode: "dry-run",
    input: filePath,
    ...analysis,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (analysis.errors.length > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
