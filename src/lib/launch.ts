import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer as createHttp, type Server } from "node:http";
import { createServer as createHttps } from "node:https";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ToolManifest } from "@michinarai/sdk";
import { framedPath, toolFiles } from "@michinarai/sdk/harness";
import { found, ok, registry } from "../api/client.js";
import { idParts } from "../api/tools.js";
import { bearer } from "../auth/session.js";
import { NaraiError } from "./errors.js";
import { send } from "./http.js";

/** A lesson whose step uses the tool, as Narai names it, with where to open it. */
export interface Lesson { course: string; step: string; listed: boolean; url: string }

/** A developer's dev server framed in their own lessons on a Narai (`narai dev --launch`): named for the tool until
 *  `end`, which also stops serving. */
export interface Launch {
  narai: string;
  origin: string;
  expires_at: string;
  /** What the frame opens. */
  framed: string;
  /** Where the files are served on this machine. */
  local: string;
  /** null: this Narai doesn't name the lessons yet. */
  lessons: Lesson[] | null;
  end(): Promise<void>;
}

/** Where mkcert's certificate for the dev server is kept: one for every tool on this machine. */
const certDir = () => join(process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state"), "narai", "dev-cert");

/** A certificate for localhost, 127.0.0.1 and ::1 from mkcert, made once. The CLI never runs `mkcert -install`: trusting
 *  its CA is the developer's own step. */
function certificate(): { key: Buffer; cert: Buffer } {
  const dir = certDir();
  const cert = join(dir, "localhost.pem");
  const key = join(dir, "localhost-key.pem");
  if (!existsSync(cert) || !existsSync(key)) {
    mkdirSync(dir, { recursive: true });
    const made = spawnSync("mkcert", ["-cert-file", cert, "-key-file", key, "localhost", "127.0.0.1", "::1"], { encoding: "utf8" });
    if (made.error || made.status !== 0) {
      throw new NaraiError(
        "a dev server in a lesson needs https: install mkcert (https://github.com/FiloSottile/mkcert) and run `mkcert -install` once, or give a tunnel's address with --origin https://<tunnel>",
        "no_mkcert",
      );
    }
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      done(typeof address === "object" && address ? address.port : port);
    });
  });
}

/** The lessons whose step uses the tool, or null when this Narai doesn't answer the route (a 404, or any refusal: the
 *  dev server works without the list). */
async function lessons(narai: string, publisher: string, name: string): Promise<Lesson[] | null> {
  try {
    const answer = await send(`${narai}/api/tools/${encodeURIComponent(publisher)}/${encodeURIComponent(name)}/lessons`, {
      headers: { authorization: `Bearer ${await bearer(narai)}` },
    });
    if (!answer.ok) return null;
    const body = (await answer.json()) as { lessons?: { course: string; step: string; listed: boolean; link: string }[] };
    return (body.lessons ?? []).map((l) => ({ course: l.course, step: l.step, listed: l.listed, url: new URL(l.link, narai).href }));
  } catch {
    return null;
  }
}

/** Serve the built files where Narai frames a dev origin, check the tool and its version, and name the origin. With
 *  `origin` (a tunnel's https address) the files are served over plain http here for the tunnel to forward; without
 *  it, over https on localhost with mkcert's certificate. */
export async function startLaunch(options: { narai: string; manifest: ToolManifest; toolDir: string; origin?: string; port?: number; progress: (line: string) => void }): Promise<Launch> {
  const { narai, manifest } = options;
  const { publisher, name } = idParts(manifest);
  const api = registry(narai);
  const path = { publisher, name };
  const tool = await found(api.GET("/api/tools/{publisher}/{name}", { params: { path } }), manifest.id);
  if (!tool) throw new NaraiError(`${manifest.id} isn't registered on ${new URL(narai).host}: run narai tools register, then narai tools push`, "not_registered");
  const version = await found(api.GET("/api/tools/{publisher}/{name}/versions/{version}", { params: { path: { ...path, version: manifest.version } } }), `${manifest.id} ${manifest.version}`);
  if (version && version.status !== "draft") {
    throw new NaraiError(`${manifest.id} ${manifest.version} is ${version.status}: Narai frames a dev server only for a draft: raise the version, then narai build and narai tools push`, "needs_draft");
  }
  if (!version) options.progress(`${manifest.id} ${manifest.version} isn't pushed: a lesson frames the dev server for a draft the step's range takes (narai build, narai tools push)`);

  const files = toolFiles(manifest, options.toolDir, { launch: true });
  const server = options.origin ? createHttp(files) : createHttps(certificate(), files);
  const port = await listen(server, options.port ?? 0);
  const local = `${options.origin ? "http" : "https"}://${options.origin ? "127.0.0.1" : "localhost"}:${port}`;
  const stopServing = () => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); });
  let named: { origin: string; expires_at: string };
  try {
    named = await ok(api.PUT("/api/tools/{publisher}/{name}/dev-origin", { params: { path }, body: { origin: options.origin ?? local } }), `${manifest.id}'s dev server`);
  } catch (error) {
    await stopServing();
    throw error;
  }
  return {
    narai, local,
    origin: named.origin,
    expires_at: named.expires_at,
    framed: `${named.origin}${framedPath(manifest)}`,
    lessons: await lessons(narai, publisher, name),
    end: async () => {
      const { response } = await api.DELETE("/api/tools/{publisher}/{name}/dev-origin", { params: { path } }).catch(() => ({ response: null }));
      if (!response?.ok) options.progress(`couldn't end the dev server's turn on ${new URL(narai).host}: it ends by itself at ${named.expires_at}`);
      await stopServing();
    },
  };
}
