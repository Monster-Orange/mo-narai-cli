import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { narai, naraiServe, scratch } from "./run.js";

const errorOf = (stderr: string) => (JSON.parse(stderr.trim().split("\n").at(-1) ?? "{}") as { error: { code: string; message: string; problems?: string[] } }).error;

/** A tool from the template, with its built files where the template's build puts them. */
function tool(): string {
  const dir = scratch();
  expect(narai(["init", "echo", "--publisher", "narai-dev", "--dir", "echo"], dir).status).toBe(0);
  const root = join(dir, "echo");
  mkdirSync(join(root, "dist"));
  writeFileSync(join(root, "dist", "index.html"), "<!doctype html><title>echo</title>");
  writeFileSync(join(root, "dist", "tool.js"), "export {};");
  return root;
}

describe("the exit codes and streams", () => {
  it("2 for a flag a command doesn't take, as JSON on stderr, nothing on stdout", () => {
    const r = narai(["validate", "--no-such-flag", "--json"], scratch());
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
    expect(errorOf(r.stderr).code).toBe("usage");
  });

  it("1 outside a tool, saying what to do", () => {
    const r = narai(["validate", "--json"], scratch());
    expect(r.status).toBe(1);
    expect(errorOf(r.stderr)).toMatchObject({ code: "no_tool", message: expect.stringContaining("narai init") });
  });
});

describe("narai init", () => {
  it("writes the template: a valid manifest, the page, AGENTS.md and the skill", () => {
    const dir = scratch();
    const r = narai(["init", "fretboard", "--publisher", "narai-dev", "--json"], dir);
    expect(r.status).toBe(0);
    const result = JSON.parse(r.stdout) as { id: string; files: string[] };
    expect(result.id).toBe("narai-dev/fretboard");
    expect(result.files).toEqual(expect.arrayContaining(["AGENTS.md", ".claude/skills/narai-tool/SKILL.md", "narai.tool.json", "src/tool.js"]));
    const manifest = JSON.parse(readFileSync(join(dir, "fretboard", "narai.tool.json"), "utf8")) as { id: string; answers: Record<string, string> };
    expect(manifest.id).toBe("narai-dev/fretboard");
    expect(manifest.answers).toEqual({ "fretboard.say": "fretboard.answer@1" });
    // the CLI pins the SDK it's built with; a new tool takes that version or a later compatible one
    const own = (JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> }).dependencies["@michinarai/sdk"];
    expect(own).toMatch(/^\d+\.\d+\.\d+$/);
    expect(JSON.parse(readFileSync(join(dir, "fretboard", "package.json"), "utf8")).dependencies["@michinarai/sdk"]).toBe(`^${own}`);
    expect(readFileSync(join(dir, "fretboard", "src", "tool.js"), "utf8")).toContain("pickLocale(tool.start, manifest.locales)");
    expect(readFileSync(join(dir, "fretboard", "src", "tool.js"), "utf8")).not.toContain("{{");
  });

  it("won't write into a directory that isn't empty", () => {
    const dir = scratch();
    mkdirSync(join(dir, "fretboard"));
    writeFileSync(join(dir, "fretboard", "mine.txt"), "keep");
    const r = narai(["init", "fretboard", "--publisher", "narai-dev", "--json"], dir);
    expect(r.status).toBe(1);
    expect(errorOf(r.stderr).code).toBe("not_empty");
    expect(readFileSync(join(dir, "fretboard", "mine.txt"), "utf8")).toBe("keep");
  });

  it("refuses a name an id can't carry (usage)", () => {
    const r = narai(["init", "Fret Board", "--publisher", "narai-dev", "--json"], scratch());
    expect(r.status).toBe(2);
    expect(errorOf(r.stderr).code).toBe("bad_slug");
  });
});

describe("narai validate", () => {
  it("passes the template's manifest", () => {
    const r = narai(["validate", "--json"], tool());
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ ok: true, id: "narai-dev/echo", version: "0.1.0", warnings: [] });
  });

  it("warns when a payload schema names `schema`", () => {
    const root = tool();
    const path = join(root, "narai.tool.json");
    const m = JSON.parse(readFileSync(path, "utf8")) as { payloads: Record<string, { required: string[] }> };
    m.payloads["echo.answer@1"]?.required.push("schema");
    writeFileSync(path, JSON.stringify(m));
    const r = narai(["validate", "--json"], root);
    expect(r.status).toBe(0);
    expect((JSON.parse(r.stdout) as { warnings: string[] }).warnings).toEqual([expect.stringContaining("/payloads/echo.answer@1 names `schema`")]);
  });

  it("fails with every reason, the registry's rules included", () => {
    const root = tool();
    const path = join(root, "narai.tool.json");
    const m = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    (m["payloads"] as Record<string, unknown>)["echo.answer@1"] = { type: "object", properties: { score: { type: "number" } } };
    m["commands"] = { jump: "echo.jump@1" };
    writeFileSync(path, JSON.stringify(m));
    const r = narai(["validate", "--json"], join(root, "src")); // from inside the tool, too
    expect(r.status).toBe(1);
    const error = errorOf(r.stderr);
    expect(error.code).toBe("manifest_invalid");
    expect(error.problems).toEqual([
      "/commands/jump names echo.jump@1, which isn't declared under /payloads",
      "/payloads/echo.answer@1/properties/score: an answer carries what the learner did, never a verdict (Narai judges)",
    ]);
  });
});

describe("narai build", () => {
  it("seals dist/: every file's sha256, sorted, and the bundle digest, in dist/narai.tool.json", () => {
    const root = tool();
    const r = narai(["build", "--json"], root);
    expect(r.status).toBe(0);
    const result = JSON.parse(r.stdout) as { files: number; bundle_digest: string };
    expect(result.files).toBe(2);
    const release = JSON.parse(readFileSync(join(root, "dist", "narai.tool.json"), "utf8")) as { files: { path: string }[]; bundle_digest: string };
    expect(release.files.map((f) => f.path)).toEqual(["index.html", "tool.js"]);
    expect(release.bundle_digest).toBe(result.bundle_digest);
    // sealing again changes nothing: the manifest it writes isn't one of the files
    expect(JSON.parse(narai(["build", "--json"], root).stdout)).toEqual(result);
  });

  it("fails when there's nothing built", () => {
    const dir = scratch();
    narai(["init", "echo", "--publisher", "narai-dev"], dir);
    const r = narai(["build", "--json"], join(dir, "echo"));
    expect(r.status).toBe(1);
    expect(errorOf(r.stderr).code).toBe("no_build");
  });
});

describe("narai dev", () => {
  it("serves the host on localhost and the tool on 127.0.0.1, and stops on Ctrl-C", async () => {
    const root = tool();
    const { result, stop } = await naraiServe(["dev", "--json", "--locale", "ja"], root);
    try {
      expect(new URL(result["host"] ?? "").hostname).toBe("localhost");
      expect(new URL(result["tool"] ?? "").hostname).toBe("127.0.0.1");
      const host = await fetch(result["host"] ?? "");
      expect(host.headers.get("content-security-policy")).toContain(`frame-src ${new URL(result["tool"] ?? "").origin}`);
      const config = (await (await fetch(new URL("/harness.json", result["host"]))).json()) as { locale: string; manifest: { id: string } };
      expect(config).toMatchObject({ locale: "ja", manifest: { id: "narai-dev/echo" } });
      expect(await (await fetch(result["tool"] ?? "")).text()).toContain("<title>echo</title>");
    } finally {
      await stop();
    }
  });

  it("grants the microphone with --grant microphone, as a step would, only when the manifest declares it", async () => {
    const root = tool();
    const grantedOf = async (host: string) =>
      ((await (await fetch(new URL("/harness.json", host))).json()) as { granted: string[] }).granted;
    // the template declares no microphone: Narai drops the grant, and so does the harness
    const plain = await naraiServe(["dev", "--json", "--grant", "microphone"], root);
    try {
      expect(plain.result["granted"]).toEqual([]);
      expect(await grantedOf(plain.result["host"] ?? "")).toEqual([]);
    } finally {
      await plain.stop();
    }
    const path = join(root, "narai.tool.json");
    const manifest = JSON.parse(readFileSync(path, "utf8")) as { capabilities: Record<string, unknown> };
    manifest.capabilities["microphone"] = true;
    writeFileSync(path, JSON.stringify(manifest));
    const declared = await naraiServe(["dev", "--json", "--grant", "microphone"], root);
    try {
      expect(declared.result["granted"]).toEqual(["microphone"]);
      expect(await grantedOf(declared.result["host"] ?? "")).toEqual(["microphone"]);
    } finally {
      await declared.stop();
    }
    // and without the flag, nothing is granted
    const none = await naraiServe(["dev", "--json"], root);
    try {
      expect(none.result["granted"]).toEqual([]);
    } finally {
      await none.stop();
    }
  });

  it("refuses a grant it doesn't know", () => {
    const r = narai(["dev", "--json", "--grant", "camera"], tool());
    expect(r.status).toBe(2);
    expect(errorOf(r.stderr)).toMatchObject({ code: "usage", message: expect.stringContaining("microphone") });
  });
});

describe("the template's microphone", () => {
  it("shows its microphone control only when the start grants the microphone", () => {
    const dir = scratch();
    expect(narai(["init", "echo", "--publisher", "narai-dev", "--dir", "echo"], dir).status).toBe(0);
    const html = readFileSync(join(dir, "echo", "src", "index.html"), "utf8");
    expect(html).toMatch(/<button id="mic"[^>]*\shidden[\s>]/);
    const js = readFileSync(join(dir, "echo", "src", "tool.js"), "utf8");
    expect(js).toContain(`tool.start.granted?.includes("microphone")`);
  });
});
