import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { MANIFEST } from "./project.js";

export interface FileDigest { path: string; sha256: string; size: number }

/** Paths compared by code point, as Narai's registry sorts them (Python's), not by UTF-16 unit. */
const byCodePoint = (a: string, b: string): number => {
  const points = (s: string) => Array.from(s, (c) => c.codePointAt(0) ?? 0);
  const [x, y] = [points(a), points(b)];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return x.length - y.length;
};

/** Every file of a release, with its sha256 and size, sorted by path. The manifest itself isn't one of them. */
export async function digestFiles(dir: string): Promise<FileDigest[]> {
  const files: FileDigest[] = [];
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    const path = relative(dir, full).split(sep).join("/");
    if (path === MANIFEST) continue;
    const bytes = await readFile(full);
    files.push({ path, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length });
  }
  return files.sort((a, b) => byCodePoint(a.path, b.path));
}

/** sha256 over the file list's canonical JSON (RFC 8785; for these strings and integers: keys sorted, no space), as
 *  Narai's registry computes it. */
export function bundleDigest(files: readonly FileDigest[]): string {
  const canonical = JSON.stringify(files.map(({ path, sha256, size }) => ({ path, sha256, size })));
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}
