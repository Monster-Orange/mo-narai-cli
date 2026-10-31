import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// What npm would publish. npm drops a bin it calls invalid (`./bin/run.js` was one) with only a warning, and the
// package then installs no `narai` command.
describe("the published package", () => {
  it("keeps the narai command", () => {
    const run = spawnSync("npm", ["publish", "--dry-run", "--access", "public", "--ignore-scripts"], { encoding: "utf8" });
    expect(run.status).toBe(0);
    expect(run.stderr).not.toMatch(/invalid and removed|errors corrected/);
  });
});
