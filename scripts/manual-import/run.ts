// 手動調査JSON → src/data/googleSeed.ts 生成
// 使い方: bun scripts/manual-import/run.ts --in scripts/manual-import/inputs/shibuya-01.json
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { convertItems, type ManualItem } from "./convert";
import { geocodeBestEffort, sleep } from "./geocode";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const inPath = arg("--in");
if (!inPath) {
  console.error("usage: bun scripts/manual-import/run.ts --in <input.json> [--out <file>]");
  process.exit(1);
}
const outPath = arg("--out") ?? path.join(process.cwd(), "src", "data", "googleSeed.ts");

const raw = await readFile(inPath, "utf-8");
const items = JSON.parse(raw) as ManualItem[];

// Nominatimポリシー遵守: 逐次＋1.2秒間隔
let geocoded = 0;
const matchedBy: Record<string, number> = {};
const { facilities, skipped } = await convertItems(items, {
  geocode: async ({ name, address, geoQuery }) => {
    await sleep(1200);
    const g = await geocodeBestEffort(name, address, geoQuery);
    if (g) {
      geocoded += 1;
      matchedBy[g.matched] = (matchedBy[g.matched] ?? 0) + 1;
      return { lat: g.lat, lng: g.lng };
    }
    return null;
  },
});

const header = `// 自動生成: bun scripts/manual-import/run.ts --in ${path.basename(inPath)}
// 生成日: ${new Date().toISOString().split("T")[0]}
// 由来: ChatGPT手動調査（Google口コミ・自治体調査）。座標欠落分はNominatimで補完。
// 設備の不明値は false（未確認）として格納。信頼度lowは中立値3.0＋要確認メモ。
import type { ToiletFacility } from "../types";

export const GOOGLE_SEED: ToiletFacility[] = `;
await writeFile(outPath, header + JSON.stringify(facilities, null, 2) + "\n", "utf-8");

console.log(`input: ${items.length}件 / geocoded: ${geocoded}件 ${JSON.stringify(matchedBy)}`);
console.log(`wrote: ${outPath}（${facilities.length}件）`);
for (const s of skipped) console.log(`skip: ${s.name} — ${s.reason}`);
