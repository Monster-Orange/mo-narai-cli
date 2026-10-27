import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundleDigest, digestFiles } from "../src/lib/digest.js";
import { scratch } from "./run.js";

describe("the bundle digest", () => {
  it("is the registry's: sha256 over the file list's canonical JSON", () => {
    // computed by Narai's rule (narai/tools/manifest.py bundle_digest) on the same rows
    const rows = [
      { path: "a/b.js", sha256: "0".repeat(64), size: 3 },
      { path: "é/ü.txt", sha256: "f".repeat(64), size: 0 },
      { path: 'z"q.txt', sha256: "1".repeat(64), size: 12 },
    ];
    expect(bundleDigest(rows)).toBe("sha256:9604fc152bdb4bfccf141aae1196d1e48a532660287c06b222324b1b8d53aee7");
  });

  it("lists every file but the manifest, sorted by code point as the registry sorts", async () => {
    const dir = scratch();
    for (const path of ["b", "a/z", "a2", "😀", "～", "narai.tool.json"]) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), path);
    }
    const files = await digestFiles(dir);
    // a UTF-16 sort would put 😀 (a surrogate pair) before ～ (U+FF5E)
    expect(files.map((f) => f.path)).toEqual(["a/z", "a2", "b", "～", "😀"]);
    expect(files[0]).toEqual({ path: "a/z", sha256: createHash("sha256").update("a/z").digest("hex"), size: 3 });
  });
});
