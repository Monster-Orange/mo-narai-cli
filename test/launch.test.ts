import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeRegistry, type FakeRegistry } from "./fake-registry.js";
import { narai, naraiAsync, naraiServe, scratch } from "./run.js";

// `narai dev --launch`: the developer's dev server, framed in their own lessons on a real Narai. It serves the built
// files where Narai's frame opens them, names that origin for the tool (PUT dev-origin), says where to open a lesson,
// and ends it (DELETE) on Ctrl-C.
let reg: FakeRegistry;
beforeEach(async () => { reg = await fakeRegistry(); });
afterEach(async () => { await reg.close(); });

const env = () => ({ NARAI_TOKEN: reg.token });
const launch = (root: string, more: string[] = []) => naraiServe(["dev", "--json", "--launch", reg.url, "--origin", "https://echo-dev.tunnel.example", ...more], root, env());
const errorOf = (stderr: string) => (JSON.parse(stderr.trim().split("\n").at(-1) ?? "{}") as { error: { code: string; message: string } }).error;

/** A built tool, registered, its version pushed as a draft. */
async function pushed(): Promise<string> {
  const dir = scratch();
  narai(["init", "echo", "--publisher", "narai-dev", "--dir", "echo"], dir);
  const root = join(dir, "echo");
  mkdirSync(join(root, "dist"));
  writeFileSync(join(root, "dist", "index.html"), "<!doctype html><title>echo</title>");
  writeFileSync(join(root, "dist", "tool.js"), "export {};");
  expect(narai(["build"], root).status).toBe(0);
  const as = (args: string[]) => naraiAsync([...args, "--json", "--yes", "--narai-url", reg.url], root, env());
  expect((await as(["tools", "register"])).status).toBe(0);
  expect((await as(["tools", "push"])).status).toBe(0);
  return root;
}

describe("narai dev --launch", () => {
  it("names the dev server for the tool, serves the files where the frame opens them, and ends it on Ctrl-C", async () => {
    const root = await pushed();
    const { result, stop } = await launch(root);
    try {
      expect(result).toMatchObject({ narai: reg.url, origin: "https://echo-dev.tunnel.example", expires_at: "2026-11-03T09:00:00Z", framed: "https://echo-dev.tunnel.example/echo/" });
      expect(reg.devOrigins.get("narai-dev/echo")?.origin).toBe("https://echo-dev.tunnel.example");
      // a tunnel forwards to plain http on this machine, at the path Narai frames
      expect(await (await fetch(new URL("/echo/", result["local"]))).text()).toContain("<title>echo</title>");
      expect((await fetch(new URL("/tool.js", result["local"]))).status).toBe(404);
    } finally {
      await stop();
    }
    expect(reg.calls).toContain("DELETE /api/tools/narai-dev/echo/dev-origin");
    expect(reg.devOrigins.size).toBe(0);
  });

  it("lists the lessons that use the tool when Narai names them, listed first", async () => {
    const root = await pushed();
    reg.lessons = new Map([["narai-dev/echo", [
      { course: "narai-tools", step: "build-one", version: "^0.1", listed: true, link: "/go/course/narai-tools" },
      { course: "my-draft", step: "try-it", version: "*", listed: false, link: "/go/course/my-draft" },
    ]]]);
    const { result, stop } = await launch(root);
    await stop();
    expect(result["lessons"]).toEqual([
      { course: "narai-tools", step: "build-one", listed: true, url: `${reg.url}/go/course/narai-tools` },
      { course: "my-draft", step: "try-it", listed: false, url: `${reg.url}/go/course/my-draft` },
    ]);
  });

  it("says where to look when this Narai doesn't name the lessons yet", async () => {
    const root = await pushed();
    const { result, stop } = await launch(root);
    await stop();
    expect(result["lessons"]).toBeNull();
  });

  it("refuses a tool that isn't registered, naming nothing", async () => {
    const dir = scratch();
    narai(["init", "echo", "--publisher", "narai-dev", "--dir", "echo"], dir);
    const root = join(dir, "echo");
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "dist", "index.html"), "<!doctype html><title>echo</title>");
    const r = await naraiAsync(["dev", "--json", "--launch", reg.url, "--origin", "https://echo-dev.tunnel.example"], root, env());
    expect(r.status).toBe(1);
    expect(errorOf(r.stderr).code).toBe("not_registered");
    expect(reg.calls.some((c) => c.startsWith("PUT"))).toBe(false);
  });

  it("refuses when this version is reviewed: Narai frames a dev server only for a draft", async () => {
    const root = await pushed();
    const version = reg.tools.get("narai-dev/echo")?.versions.get("0.1.0");
    if (version) version.status = "reviewed";
    const r = await naraiAsync(["dev", "--json", "--launch", reg.url, "--origin", "https://echo-dev.tunnel.example"], root, env());
    expect(r.status).toBe(1);
    expect(errorOf(r.stderr)).toMatchObject({ code: "needs_draft", message: expect.stringContaining("raise the version") });
    expect(reg.devOrigins.size).toBe(0);
  });

  it("passes on Narai's refusal of the origin (422 origin_invalid)", async () => {
    const root = await pushed();
    const r = await naraiAsync(["dev", "--json", "--launch", reg.url, "--origin", "https://echo-dev.tunnel.example/path"], root, env());
    expect(r.status).toBe(1);
    expect(errorOf(r.stderr).code).toBe("origin_invalid");
  });

  it("takes only an https --origin, and --origin only with --launch (usage)", async () => {
    const root = await pushed();
    const http = narai(["dev", "--json", "--launch", reg.url, "--origin", "http://echo-dev.tunnel.example"], root, env());
    expect(http.status).toBe(2);
    expect(errorOf(http.stderr).code).toBe("bad_origin");
    const alone = narai(["dev", "--json", "--origin", "https://echo-dev.tunnel.example"], root, env());
    expect(alone.status).toBe(2);
  });

  // where mkcert is installed (not in CI): its certificate, kept in a scratch state directory, never `mkcert -install`
  it.skipIf(spawnSync("mkcert", ["-CAROOT"]).status !== 0)("serves https on localhost with mkcert's certificate and names that origin", async () => {
    const root = await pushed();
    const caroot = spawnSync("mkcert", ["-CAROOT"], { encoding: "utf8" }).stdout.trim();
    const { result, stop } = await naraiServe(["dev", "--json", "--launch", reg.url], root, { ...env(), XDG_STATE_HOME: scratch() });
    try {
      expect(result["origin"]).toMatch(/^https:\/\/localhost:\d+$/);
      expect(result["framed"]).toBe(`${result["origin"]}/echo/`);
      const page = spawnSync("curl", ["-s", "--cacert", join(caroot, "rootCA.pem"), result["framed"] ?? ""], { encoding: "utf8" });
      expect(page.stdout).toContain("<title>echo</title>");
    } finally {
      await stop();
    }
  });

  it("says how to get a certificate when mkcert isn't installed and no --origin is given", async () => {
    const root = await pushed();
    const r = await naraiAsync(["dev", "--json", "--launch", reg.url], root, { ...env(), PATH: "/nonexistent" });
    expect(r.status).toBe(1);
    expect(errorOf(r.stderr)).toMatchObject({ code: "no_mkcert", message: expect.stringContaining("--origin") });
    expect(reg.devOrigins.size).toBe(0);
  });
});
