import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { deps } from "./deps.js";

const POLL_MS = 100;

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Runs `action` holding the lock file at `path`, shared by every `narai` on this machine (two refreshing one
 *  rotating token at once would leave one of them holding a dead one). The file names its owner's pid; a lock whose
 *  owner is gone is taken over. */
export async function withFileLock<T>(path: string, action: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  // written whole, then linked into place: link fails when the lock exists, and no one sees a lock without its owner
  const mine = `${path}.${process.pid}.${randomUUID()}`;
  await writeFile(mine, String(process.pid));
  try {
    for (;;) {
      try {
        await link(mine, path);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      let owner: number;
      try {
        owner = Number(await readFile(path, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (Number.isInteger(owner) && owner > 0 && running(owner)) await deps.sleep(POLL_MS);
      else await rm(path, { force: true });
    }
  } finally {
    await rm(mine, { force: true });
  }
  try {
    return await action();
  } finally {
    await rm(path, { force: true });
  }
}
