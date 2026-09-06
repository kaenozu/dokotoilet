import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWriteFile, withFileLock } from "./persistence";

describe("withFileLock", () => {
  it("executes a callback that throws EEXIST exactly once and releases the lock", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "persistence-test-"));
    const file = path.join(dir, "community.json");
    let calls = 0;
    await expect(withFileLock(file, async () => {
      calls += 1;
      const error = new Error("callback conflict");
      (error as NodeJS.ErrnoException).code = "EEXIST";
      throw error;
    })).rejects.toMatchObject({ code: "EEXIST" });
    expect(calls).toBe(1);
    await expect(fs.stat(`${file}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("times out on an active lock without stealing it", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "persistence-test-"));
    const file = path.join(dir, "community.json");
    await fs.mkdir(`${file}.lock`, { recursive: true });
    await expect(withFileLock(file, async () => undefined, { waitMs: 1, timeoutMs: 10 }))
      .rejects.toThrow("lock timeout");
    await expect(fs.stat(`${file}.lock`)).resolves.toBeDefined();
  });
});

describe("atomicWriteFile", () => {
  it("uses unique temporary names and removes its own temporary file on failure", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "persistence-test-"));
    const file = path.join(dir, "missing", "community.json");
    await expect(atomicWriteFile(file, "{}" )).resolves.toBeUndefined();
    expect(await fs.readFile(file, "utf8")).toBe("{}");
  });
});
