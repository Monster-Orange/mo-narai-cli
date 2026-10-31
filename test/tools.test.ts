import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeRegistry, type FakeRegistry } from "./fake-registry.js";
import { narai, naraiAsync, scratch } from "./run.js";

let reg: FakeRegistry;
beforeEach(async () => { reg = await fakeRegistry(); });
afterEach(async () => { await reg.close(); });

const as = (root: string, args: string[]) => naraiAsync([...args, "--json", "--narai-url", reg.url], root, { NARAI_TOKEN: reg.token });
const errorOf = (stderr: string) => (JSON.parse(stderr.trim().split("\n").at(-1) ?? "{}") as { error: { code: string; message: string; reasons?: string[] } }).error;

/** A built tool: the template, a dist/ and `narai build`. */
function built(): string {
  const dir = scratch();
  narai(["init", "echo", "--publisher", "narai-dev", "--dir", "echo"], dir);
  const root = join(dir, "echo");
  mkdirSync(join(root, "dist"));
  writeFileSync(join(root, "dist", "index.html"), "<!doctype html><title>echo</title>");
  writeFileSync(join(root, "dist", "tool.js"), "export {};");
  expect(narai(["build"], root).status).toBe(0);
  return root;
}

describe("narai tools register", () => {
  it("plans the publisher and the tool; --detailed-exitcode exits 2; nothing changes", async () => {
    const r = await as(built(), ["tools", "register", "--plan", "--detailed-exitcode"]);
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stdout)).toMatchObject({ applied: false, changes: [
      { action: "create", target: "publisher narai-dev", detail: "for Narai Dev: narai-dev, https://example.com" },
      { action: "create", target: "tool narai-dev/echo" },
    ] });
    expect(reg.calls.filter((c) => !c.startsWith("GET"))).toEqual([]);
  });

  it("won't apply without a confirmation when no one can be asked", async () => {
    const r = await as(built(), ["tools", "register", "--no-input"]);
    expect(r.status).toBe(1);
    expect(errorOf(r.stderr).code).toBe("needs_input");
    expect(reg.tools.size).toBe(0);
  });

  it("applies with --yes, and then there's nothing to change (exit 0 with --detailed-exitcode)", async () => {
    const root = built();
    const r = await as(root, ["tools", "register", "--yes"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ applied: true });
    expect(reg.orgs[0]?.slug).toBe("narai-dev");
    expect([...reg.tools.keys()]).toEqual(["narai-dev/echo"]);
    const again = await as(root, ["tools", "register", "--plan", "--detailed-exitcode"]);
    expect(again.status).toBe(0);
    expect(JSON.parse(again.stdout)).toMatchObject({ changes: [] });
  });

  it("asks which organization when more than one could take the publisher (usage)", async () => {
    reg.orgs.push({ org_id: "org-3", org_name: "Third", slug: null, name: null, url: null });
    const r = await as(built(), ["tools", "register", "--plan"]);
    expect(r.status).toBe(2);
    expect(errorOf(r.stderr)).toMatchObject({ code: "org_needed", message: expect.stringContaining('--org "Narai Dev" | "Third"') });
    expect((await as(built(), ["tools", "register", "--plan", "--org", "Third"])).status).toBe(0);
  });

  it("says when tool development isn't open, and exits 3 when the token is refused", async () => {
    reg.off = true;
    expect(errorOf((await as(built(), ["tools", "register", "--plan"])).stderr).code).toBe("tools_unavailable");
    reg.off = false;
    const r = await naraiAsync(["tools", "register", "--plan", "--json", "--narai-url", reg.url], built(), { NARAI_TOKEN: "wrong" });
    expect(r.status).toBe(3);
  });
});

describe("narai tools push", () => {
  it("uploads the sealed build once: the plan, the upload, then nothing to change", async () => {
    const root = built();
    await as(root, ["tools", "register", "--yes"]);
    const plan = await as(root, ["tools", "push", "--plan", "--detailed-exitcode"]);
    expect(plan.status).toBe(2);
    const release = JSON.parse(readFileSync(join(root, "dist", "narai.tool.json"), "utf8")) as { bundle_digest: string };
    expect(JSON.parse(plan.stdout)).toMatchObject({ version: "0.1.0", bundle_digest: release.bundle_digest, changes: [{ action: "upload", detail: expect.stringContaining("2 files") }] });
    const r = await as(root, ["tools", "push", "--yes"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ applied: true, status: "draft" });
    const stored = reg.tools.get("narai-dev/echo")?.versions.get("0.1.0");
    expect(stored?.bundle_digest).toBe(release.bundle_digest);
    expect([...(stored?.files.keys() ?? [])].sort()).toEqual(["index.html", "tool.js"]);
    expect((await as(root, ["tools", "push", "--plan", "--detailed-exitcode"])).status).toBe(0);
  });

  it("refuses a build that changed since narai build", async () => {
    const root = built();
    await as(root, ["tools", "register", "--yes"]);
    writeFileSync(join(root, "dist", "tool.js"), "export const changed = 1;");
    const r = await as(root, ["tools", "push", "--yes"]);
    expect(r.status).toBe(1);
    expect(errorOf(r.stderr).code).toBe("stale_build");
  });

  it("refuses another build under a version that's uploaded: raise the version", async () => {
    const root = built();
    await as(root, ["tools", "register", "--yes"]);
    await as(root, ["tools", "push", "--yes"]);
    writeFileSync(join(root, "dist", "tool.js"), "export const changed = 1;");
    narai(["build"], root);
    const r = await as(root, ["tools", "push", "--plan"]);
    expect(r.status).toBe(1);
    expect(errorOf(r.stderr)).toMatchObject({ code: "version_exists", message: expect.stringContaining("raise the version") });
  });

  it("stops, changing nothing, on a Narai that doesn't serve a route it needs yet", async () => {
    const root = built();
    await as(root, ["tools", "register", "--yes"]);
    reg.missing = (method, parts) => method === "GET" && parts[2] === "versions" && parts.length === 4;
    const before = reg.calls.length;
    const r = await as(root, ["tools", "push", "--yes"]);
    expect(r.status).toBe(1);
    expect(errorOf(r.stderr)).toMatchObject({ code: "not_served", message: expect.stringContaining("a newer Narai") });
    expect(reg.calls.slice(before).filter((c) => !c.startsWith("GET"))).toEqual([]);
    expect(reg.tools.get("narai-dev/echo")?.versions.size).toBe(0);
  });

  it("needs the tool registered first", async () => {
    const r = await as(built(), ["tools", "push", "--plan"]);
    expect(r.status).toBe(1);
    expect(errorOf(r.stderr).code).toBe("not_registered");
  });
});

describe("narai tools list", () => {
  it("lists your publishers' tools and their versions", async () => {
    const root = built();
    await as(root, ["tools", "register", "--yes"]);
    await as(root, ["tools", "push", "--yes"]);
    const r = await as(root, ["tools", "list"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ tools: [{ id: "narai-dev/echo", versions: [{ version: "0.1.0", status: "draft", bundle_digest: expect.stringMatching(/^sha256:/) }] }] });
  });
});
