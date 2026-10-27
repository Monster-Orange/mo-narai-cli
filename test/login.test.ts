import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startLoopback } from "../src/auth/loopback.js";
import { bearer, forgetAccessTokens } from "../src/auth/session.js";
import Login from "../src/commands/login.js";
import Logout from "../src/commands/logout.js";
import type { CredentialStore } from "../src/lib/credentials.js";
import { deps } from "../src/lib/deps.js";
import { browse, fakeNarai, type FakeNarai } from "./fake-narai.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The keychain, in memory: tests never touch the real one. */
function memoryStore(): CredentialStore & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    get: async (u) => entries.get(u) ?? null,
    set: async (u, t) => { entries.set(u, t); },
    delete: async (u) => entries.delete(u),
  };
}

async function run(command: typeof Login | typeof Logout, argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation((c) => { stdout += String(c); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation((c) => { stderr += String(c); return true; });
  let code = 0;
  try {
    await command.run(argv, ROOT);
  } catch (error) {
    code = (error as { oclif?: { exit?: number } }).oclif?.exit ?? 1;
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
  return { code, stdout, stderr };
}

let narai: FakeNarai;
let store: ReturnType<typeof memoryStore>;
const saved = { ...deps };

beforeEach(async () => {
  narai = await fakeNarai();
  store = memoryStore();
  deps.credentials = store;
  deps.openBrowser = (url) => { void browse(url); };
  process.env["XDG_STATE_HOME"] = mkdtempSync(join(tmpdir(), "narai-state-"));
  delete process.env["NARAI_TOKEN"];
  forgetAccessTokens();
});
afterEach(async () => {
  Object.assign(deps, saved);
  await narai.close();
});

describe("narai login", () => {
  it("signs in through the browser and keeps only the refresh token, in the keychain", async () => {
    const r = await run(Login, ["--json", "--narai-url", narai.url]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ signed_in: new URL(narai.url).host, scopes: expect.arrayContaining(["dev:tools.write"]) });
    expect(r.stderr).toContain("Sign in to Narai: ");
    expect([...store.entries.values()]).toEqual([...narai.live]);
  });

  it("exits 3 when the person says no", async () => {
    await narai.close();
    narai = await fakeNarai({ deny: true });
    const r = await run(Login, ["--json", "--narai-url", narai.url]);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain("oauth_access_denied");
    expect(store.entries.size).toBe(0);
  });

  it("won't sign in where the server names another issuer", async () => {
    await narai.close();
    narai = await fakeNarai({ issuerOverride: "https://evil.example" });
    const r = await run(Login, ["--json", "--narai-url", narai.url]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("oauth_issuer_mismatch");
  });

  it("refuses a Narai that isn't https, but for this machine", async () => {
    const r = await run(Login, ["--json", "--narai-url", "http://michinar.ai"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("insecure_url");
  });
});

describe("the session", () => {
  beforeEach(async () => { await run(Login, ["--json", "--narai-url", narai.url]); });

  it("rotates the refresh token on every refresh, storing the new one", async () => {
    const first = [...store.entries.values()][0];
    expect(await bearer(narai.url)).toMatch(/^at_/);
    const second = [...store.entries.values()][0];
    expect(second).not.toBe(first);
    expect(narai.live).toEqual(new Set([second]));
  });

  it("two narai at once refresh one after the other under the lock: neither is left with a dead token", async () => {
    // each process has its own memory; the lock and the keychain are what they share
    const results = await Promise.all([bearer(narai.url), (forgetAccessTokens(), bearer(narai.url))]);
    expect(results.every((t) => t.startsWith("at_"))).toBe(true);
    expect(narai.live.size).toBe(1);
    expect(narai.live.has([...store.entries.values()][0] ?? "")).toBe(true);
  });

  it("ends with exit 3 and forgets the session when Narai has revoked it", async () => {
    narai.live.clear();
    await expect(bearer(narai.url)).rejects.toMatchObject({ code: "session_ended", exitCode: 3 });
    expect(store.entries.size).toBe(0);
  });

  it("uses NARAI_TOKEN when it's set, and stores nothing", async () => {
    process.env["NARAI_TOKEN"] = "tool_ci_token";
    expect(await bearer(narai.url)).toBe("tool_ci_token");
    expect(narai.refreshes).toBe(0);
  });

  it("narai logout revokes it at Narai and the keychain forgets it", async () => {
    const stored = [...store.entries.values()][0];
    const r = await run(Logout, ["--json", "--narai-url", narai.url]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ was_signed_in: true });
    expect(narai.revoked).toEqual([stored]);
    expect(store.entries.size).toBe(0);
  });
});

describe("the loopback", () => {
  it.each([
    ["another state", (u: URL) => u.searchParams.set("state", "forged"), "oauth_state_mismatch"],
    ["another issuer", (u: URL) => u.searchParams.set("iss", "https://evil.example"), "oauth_issuer_mismatch"],
  ])("refuses an answer with %s", async (_, change, code) => {
    const lb = await startLoopback({ state: "s", issuer: "https://michinar.ai", timeoutMs: 5000 });
    const url = new URL(lb.redirectUri);
    url.search = new URLSearchParams({ state: "s", iss: "https://michinar.ai", code: "c" }).toString();
    change(url);
    await fetch(url);
    await expect(lb.code).rejects.toMatchObject({ code });
  });

  it("answers only its own Host (no DNS rebinding) and only once", async () => {
    const lb = await startLoopback({ state: "s", issuer: null, timeoutMs: 5000 });
    const port = new URL(lb.redirectUri).port;
    const { request } = await import("node:http");
    const status = await new Promise<number>((r) => request({ host: "127.0.0.1", port, path: "/callback?state=s&code=c", headers: { host: `evil.example:${port}` } }, (res) => r(res.statusCode ?? 0)).end());
    expect(status).toBe(404);
    await fetch(`${lb.redirectUri}?state=s&code=c`);
    await expect(lb.code).resolves.toBe("c");
  });
});
