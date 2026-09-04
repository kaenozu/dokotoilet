// 熊谷市OD取込: bun scripts/opendata-import/run-kumagaya.ts [--fetch]
// 既定は inputs のCSVを使用。--fetch で公式URLから再取得する。
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { KUMAGAYA_CSV_URL, mapKumagayaRows, parseCsv } from "./kumagaya";

const root = process.cwd();
const inputPath = path.join(root, "scripts", "opendata-import", "inputs", "kumagaya-toilets-20231002.csv");
const outPath = path.join(root, "src", "data", "kumagayaSeed.ts");

let buf: Buffer;
if (process.argv.includes("--fetch")) {
  const res = await fetch(KUMAGAYA_CSV_URL, {
    headers: { "User-Agent": "kirei-toilet/1.0 (+https://github.com/kaenozu/dokotoilet)" },
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  buf = Buffer.from(await res.arrayBuffer());
  await writeFile(inputPath, buf);
  console.log(`fetched: ${inputPath} (${buf.length} bytes)`);
} else {
  buf = await readFile(inputPath);
}

const rows = parseCsv(buf.toString("utf-8"));
const header = rows[0];
const { facilities, skipped } = mapKumagayaRows(header, rows.slice(1));

const out =
  `// 自動生成: bun scripts/opendata-import/run-kumagaya.ts\n` +
  `// 由来: ${"熊谷市「公衆トイレ一覧」（くまっぷオープンデータ、2023年10月2日掲載）"}\n` +
  `// スコアは設備推定（実測口コミなし）。UI上は未評価表示。\n` +
  `import type { ToiletFacility } from "../types";\n\n` +
  `export const KUMAGAYA_SEED: ToiletFacility[] = ` +
  JSON.stringify(facilities, null, 2) +
  "\n";
await writeFile(outPath, out, "utf-8");

console.log(`input: ${rows.length - 1}件 -> wrote: ${outPath}（${facilities.length}件）`);
for (const s of skipped) console.log(`skip: ${s.name} — ${s.reason}`);
