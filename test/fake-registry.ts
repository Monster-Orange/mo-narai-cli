import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** Narai's tool registry as its OpenAPI describes it (schema/openapi.tools.json), in memory: what the CLI's commands
 *  are tested against. Every call needs `Bearer <token>`. */
export interface FakeRegistry {
  url: string;
  token: string;
  orgs: { org_id: string; org_name: string; slug: string | null; name: string | null; url: string | null }[];
  tools: Map<string, { id: string; name: string; versions: Map<string, { bundle_digest: string; files: Map<string, Buffer> }> }>;
  calls: string[];
  off: boolean;
  /** A route this Narai doesn't serve yet: its web framework answers 404 `{"detail": "Not Found"}`, no refusal. */
  missing: ((method: string, parts: string[]) => boolean) | null;
  close(): Promise<void>;
}

export async function fakeRegistry(): Promise<FakeRegistry> {
  const state: FakeRegistry = {
    url: "", token: "test-token", calls: [], off: false, missing: null, tools: new Map(),
    orgs: [{ org_id: "org-1", org_name: "Narai Dev", slug: null, name: null, url: null }, { org_id: "org-2", org_name: "Other", slug: "other", name: "Other", url: "https://other.example" }],
    close: async () => undefined,
  };
  const refuse = (status: number, error: string, message: string, reasons?: string[]) => ({ status, body: { error, message, ...(reasons ? { reasons } : {}) } });
  async function route(method: string, path: string, body: Buffer, headers: Record<string, string>): Promise<{ status: number; body: unknown }> {
    if (headers["authorization"] !== `Bearer ${state.token}`) return refuse(401, "not_signed_in", "sign in");
    if (state.off) return refuse(404, "not_found", "not found");
    const parts = path.replace(/^\/api\/tools\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    if (state.missing?.(method, parts)) return { status: 404, body: { detail: "Not Found" } };
    if (method === "GET" && parts[0] === "publishers" && parts.length === 1) return { status: 200, body: { publishers: state.orgs } };
    if (method === "PUT" && parts[0] === "publishers" && parts.length === 2) {
      const org = state.orgs.find((o) => o.org_id === parts[1]);
      if (!org) return refuse(404, "not_found", "no such org");
      const set = JSON.parse(body.toString()) as { slug: string; name: string; url: string };
      Object.assign(org, set);
      return { status: 200, body: { id: `pub-${set.slug}`, org_id: org.org_id, ...set } };
    }
    const [publisher, name, versions, version] = parts;
    if (!state.orgs.some((o) => o.slug === publisher)) return refuse(404, "not_found", "no such publisher");
    const out = (t: NonNullable<ReturnType<typeof state.tools.get>>) => ({ id: t.id, id_string: t.id, name: t.name, versions: [...t.versions].map(([v, x]) => ({ id: v, version: v, status: "draft", bundle_digest: x.bundle_digest })) });
    if (parts.length === 1 && method === "GET") return { status: 200, body: { publisher, tools: [...state.tools.values()].filter((t) => t.id.startsWith(`${publisher}/`)).map(out) } };
    if (parts.length === 1 && method === "POST") {
      const id = `${publisher}/${(JSON.parse(body.toString()) as { name: string }).name}`;
      if (state.tools.has(id)) return refuse(409, "tool_exists", "registered already");
      const created = { id, name: id.split("/")[1] ?? "", versions: new Map() };
      state.tools.set(id, created);
      return { status: 201, body: out(created) };
    }
    const tool = state.tools.get(`${publisher}/${name}`);
    if (!tool) return refuse(404, "not_found", "no such tool");
    if (parts.length === 2 && method === "GET") return { status: 200, body: out(tool) };
    if (versions === "versions" && version && method === "GET") {
      const v = tool.versions.get(version);
      return v ? { status: 200, body: { id: version, version, status: "draft", bundle_digest: v.bundle_digest, manifest: {} } } : refuse(404, "not_found", "no such version");
    }
    if (versions === "versions" && !version && method === "POST") {
      const form = await new Request("http://x", { method: "POST", headers: { "content-type": headers["content-type"] ?? "" }, body }).formData();
      const manifest = JSON.parse(String(form.get("manifest"))) as { id: string; version: string; bundle_digest: string; files: { path: string; sha256: string; size: number }[] };
      if (manifest.id !== tool.id) return refuse(422, "manifest_names_another_tool", "another tool", [`id is ${manifest.id}`]);
      if (tool.versions.has(manifest.version)) return refuse(409, "version_exists", "uploaded already");
      const files = new Map<string, Buffer>();
      for (const f of form.getAll("files") as File[]) files.set(f.name, Buffer.from(await f.arrayBuffer()));
      const problems = manifest.files.flatMap((f) => {
        const got = files.get(f.path);
        if (!got) return [`${f.path}: missing`];
        return createHash("sha256").update(got).digest("hex") === f.sha256 ? [] : [`${f.path}: sha256 differs`];
      }).concat([...files.keys()].filter((p) => !manifest.files.some((f) => f.path === p)).map((p) => `${p}: not in the manifest`));
      if (problems.length) return refuse(422, "files_do_not_match", "the files don't match", problems);
      tool.versions.set(manifest.version, { bundle_digest: manifest.bundle_digest, files });
      return { status: 201, body: { id: manifest.version, version: manifest.version, status: "draft", bundle_digest: manifest.bundle_digest } };
    }
    return refuse(404, "not_found", "no such route");
  }
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const path = new URL(req.url ?? "/", "http://x").pathname;
      state.calls.push(`${req.method} ${path}`);
      void route(req.method ?? "GET", path, Buffer.concat(chunks), req.headers as Record<string, string>).then(({ status, body }) => {
        res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.close = () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); });
  return state;
}
