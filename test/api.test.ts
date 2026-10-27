import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("the registry client's types", () => {
  it("are what the SDK's schema/openapi.tools.json generates (run `npm run generate` and commit)", () => {
    const out = join(mkdtempSync(join(tmpdir(), "narai-api-")), "api.ts");
    execFileSync("npx", ["openapi-typescript", "node_modules/@michinarai/sdk/schema/openapi.tools.json", "--output", out], { stdio: "pipe" });
    expect(readFileSync("src/generated/api.ts", "utf8")).toBe(readFileSync(out, "utf8"));
  });
});
