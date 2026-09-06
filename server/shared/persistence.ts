import { promises as fs } from "node:fs";
import path from "node:path";

const LOCK_WAIT_MS = 100;
const LOCK_TIMEOUT_MS = 10_000;
const STALE_LOCK_MS = 60_000;

function lockPath(filePath: string): string { return `${filePath}.lock`; }

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Cross-process lock. A lock is recoverable only when its owner is dead and old enough. */
export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const lock = lockPath(filePath);
  const started = Date.now();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  while (true) {
    try {
      await fs.mkdir(lock);
      await fs.writeFile(path.join(lock, "owner"), JSON.stringify({ pid: process.pid, at: Date.now() }), "utf8");
      try { return await fn(); } finally { await fs.rm(lock, { recursive: true, force: true }); }
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e;
      if (Date.now() - started >= LOCK_TIMEOUT_MS) throw new Error(`community store lock timeout: ${filePath}`);
      try {
        const stat = await fs.stat(path.join(lock, "owner"));
        const owner = JSON.parse(await fs.readFile(path.join(lock, "owner"), "utf8"));
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS && !processAlive(owner.pid)) {
          await fs.rm(lock, { recursive: true, force: true });
          continue;
        }
      } catch { /* owner is being created; retry */ }
      await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_MS));
    }
  }
}

export async function atomicWriteFile(filePath: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, contents, "utf8");
  await fs.rename(tmp, filePath);
}
