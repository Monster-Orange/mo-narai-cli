import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist", "base-command.js");

/** `npm publish --dry-run` on a copy of the package without its scripts: npm 10 runs `prepare` (rm -rf dist && tsc) on a
 *  dry run even with --ignore-scripts, and the other test files run `narai` from dist/ meanwhile (the 0.1.1 release run
 *  failed so, on Linux CI only). */
function dryRun() {
  const dir = mkdtempSync(join(tmpdir(), "narai-cli-pack-"));
  const { scripts: _, ...manifest } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts?: unknown; files: string[] };
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2));
  for (const entry of [...manifest.files, "README.md", "LICENSE"]) {
    if (existsSync(join(ROOT, entry))) cpSync(join(ROOT, entry), join(dir, entry), { recursive: true });
  }
  try {
    return spawnSync("npm", ["publish", "--dry-run", "--access", "public", "--ignore-scripts"], { cwd: dir, encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// What npm would publish. npm drops a bin it calls invalid (`./bin/run.js` was one) with only a warning, and the
// package then installs no `narai` command.
describe("the published package", () => {
  it("keeps the narai command", () => {
    const run = dryRun();
    expect(run.status).toBe(0);
    expect(run.stderr).toContain("bin/run.js");
    expect(run.stderr).not.toMatch(/invalid and removed|errors corrected/);
  });

  it("is checked without rebuilding dist/, which the other tests run", () => {
    const before = statSync(DIST).ino;
    dryRun();
    expect(statSync(DIST).ino).toBe(before);
  });
});
