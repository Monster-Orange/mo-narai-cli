import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeRegistry, type FakeRegistry } from "./fake-registry.js";
import { narai, naraiAsync, scratch } from "./run.js";

let reg: FakeRegistry;
let root: string;
beforeEach(async () => {
  reg = await fakeRegistry();
  const dir = scratch();
  narai(["init", "echo", "--publisher", "narai-dev", "--dir", "echo"], dir);
  root = join(dir, "echo");
  const org = reg.orgs[0];
  if (org) org.slug = "narai-dev";
  reg.tools.set("narai-dev/echo", { id: "narai-dev/echo", name: "echo", versions: new Map() });
});
afterEach(async () => { await reg.close(); });

const as = (args: string[], json = true) => naraiAsync([...args, ...(json ? ["--json"] : []), "--narai-url", reg.url], root, { NARAI_TOKEN: reg.token });

/** Every file under `dir`, read whole: the token must be in none of them. */
const everything = (dir: string): string => readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile()).map((e) => readFileSync(join(e.parentPath, e.name), "utf8")).join("\n");

describe("narai tools tokens", () => {
  it("create prints the token once, to stdout, and writes it nowhere", async () => {
    const r = await as(["tools", "tokens", "create", "--label", "ci", "--days", "30"]);
    expect(r.status).toBe(0);
    const made = JSON.parse(r.stdout) as { token: string; scopes: string[] };
    expect(made).toMatchObject({ token: "ntc_secret1", label: "ci", scopes: ["tool:versions.read", "tool:versions.upload"] });
    expect(r.stderr).not.toContain("ntc_secret1");
    expect(everything(root)).not.toContain("ntc_secret1");
  });

  it("off a terminal stdout is one JSON document even without --json (jq -r .token into a secret store)", async () => {
    const r = await as(["tools", "tokens", "create", "--scope", "tool:versions.read"], false);
    expect((JSON.parse(r.stdout) as { token: string }).token).toBe("ntc_secret1");
    expect(reg.ciTokens[0]?.scopes).toEqual(["tool:versions.read"]);
  });

  it("refuses a lifetime the registry doesn't offer (usage)", async () => {
    expect((await as(["tools", "tokens", "create", "--days", "10"])).status).toBe(2);
  });

  it("list never shows a token; revoke asks, then revokes", async () => {
    await as(["tools", "tokens", "create"]);
    const listed = await as(["tools", "tokens", "list"]);
    expect(listed.stdout).not.toContain("ntc_");
    expect(JSON.parse(listed.stdout)).toMatchObject({ tool: "narai-dev/echo", tokens: [{ id: "cit_1", revoked_at: null }] });
    expect((await as(["tools", "tokens", "revoke", "cit_1", "--no-input"])).status).toBe(1);
    expect(reg.ciTokens[0]?.revoked_at).toBeNull();
    const r = await as(["tools", "tokens", "revoke", "cit_1", "--yes"]);
    expect(r.status).toBe(0);
    expect(reg.ciTokens[0]?.revoked_at).not.toBeNull();
  });

  it("acts on --tool from anywhere", async () => {
    const r = await naraiAsync(["tools", "tokens", "list", "--tool", "narai-dev/echo", "--json", "--narai-url", reg.url], scratch(), { NARAI_TOKEN: reg.token });
    expect(r.status).toBe(0);
  });
});
