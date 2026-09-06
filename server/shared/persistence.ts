import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_LOCK_WAIT_MS = 100;
const DEFAULT_LOCK_TIMEOUT_MS = 10_000;

function lockPath(filePath: string): string { return `${filePath}.lock`; }

export interface FileLockOptions {
  waitMs?: number;
  timeoutMs?: number;
}

/** Cross-process lock. A leftover lock requires manual recovery with all writers stopped. */
export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>,
  options: FileLockOptions = {}
): Promise<T> {
  const lock = lockPath(filePath);
  const started = Date.now();
  const waitMs = options.waitMs ?? DEFAULT_LOCK_WAIT_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  while (true) {
    try {
      await fs.mkdir(lock);
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e;
      if (Date.now() - started >= timeoutMs) throw new Error(`community store lock timeout: ${filePath}`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    const owner = path.join(lock, "owner");
    try {
      await fs.writeFile(owner, `${process.pid}:${crypto.randomUUID()}`, "utf8");
      return await fn();
    } finally {
      await fs.rm(lock, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export async function atomicWriteFile(filePath: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, contents, "utf8");
    await fs.rename(tmp, filePath);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}
