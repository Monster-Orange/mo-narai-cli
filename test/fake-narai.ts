import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** Narai's authorization server, as far as the CLI sees it: discovery, authorize (it signs the person in at once),
 *  token (PKCE checked; refresh tokens rotate, and a used one is dead), revoke. */
export interface FakeNarai {
  url: string;
  refreshes: number;
  /** Refresh tokens that are still live. */
  live: Set<string>;
  revoked: string[];
  close(): Promise<void>;
}

export async function fakeNarai(o: { issuerOverride?: string; deny?: boolean; denyDescription?: string } = {}): Promise<FakeNarai> {
  const codes = new Map<string, { challenge: string; redirect: string }>();
  const state: FakeNarai = { url: "", refreshes: 0, live: new Set(), revoked: [], close: async () => undefined };
  const tokens = () => {
    const refresh = randomBytes(16).toString("hex");
    state.live.add(refresh);
    return { access_token: `at_${randomBytes(8).toString("hex")}`, refresh_token: refresh, token_type: "Bearer", expires_in: 3600, scope: "dev:tools.read dev:tools.write dev:versions.upload dev:launch" };
  };
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", state.url);
    const json = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      json(200, {
        issuer: o.issuerOverride ?? state.url, authorization_endpoint: `${state.url}/oauth/authorize`, token_endpoint: `${state.url}/oauth/token`,
        revocation_endpoint: `${state.url}/oauth/revoke`, code_challenge_methods_supported: ["S256"], authorization_response_iss_parameter_supported: true,
      });
      return;
    }
    if (url.pathname === "/oauth/authorize") {
      const q = url.searchParams;
      const redirect = q.get("redirect_uri") ?? "";
      const back = new URL(redirect);
      if (q.get("client_id") !== `${state.url}/oauth/clients/narai-cli.json` || q.get("resource") !== `${state.url}/api/tools` || q.get("code_challenge_method") !== "S256" || back.hostname !== "127.0.0.1") {
        res.writeHead(400).end("bad request");
        return;
      }
      back.searchParams.set("state", q.get("state") ?? "");
      back.searchParams.set("iss", state.url);
      if (o.deny) {
        back.searchParams.set("error", "access_denied");
        if (o.denyDescription) back.searchParams.set("error_description", o.denyDescription);
      }
      else {
        const code = randomBytes(8).toString("hex");
        codes.set(code, { challenge: q.get("code_challenge") ?? "", redirect });
        back.searchParams.set("code", code);
      }
      res.writeHead(302, { location: back.toString() }).end();
      return;
    }
    let body = "";
    req.on("data", (d: Buffer) => { body += d.toString(); });
    req.on("end", () => {
      const form = new URLSearchParams(body);
      if (url.pathname === "/oauth/revoke") {
        state.live.delete(form.get("token") ?? "");
        state.revoked.push(form.get("token") ?? "");
        res.writeHead(200).end();
      } else if (url.pathname === "/oauth/token" && form.get("grant_type") === "authorization_code") {
        const grant = codes.get(form.get("code") ?? "");
        codes.delete(form.get("code") ?? "");
        const s256 = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url");
        if (!grant || grant.challenge !== s256 || grant.redirect !== form.get("redirect_uri")) json(400, { error: "invalid_grant" });
        else json(200, tokens());
      } else if (url.pathname === "/oauth/token" && form.get("grant_type") === "refresh_token") {
        const old = form.get("refresh_token") ?? "";
        if (!state.live.delete(old)) { json(400, { error: "invalid_grant", error_description: "used or revoked" }); return; }
        state.refreshes++;
        json(200, tokens());
      } else res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.close = () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); });
  return state;
}

/** The person's browser: follows the sign-in page's redirect to the CLI's loopback. */
export async function browse(url: string): Promise<void> {
  const signIn = await fetch(url, { redirect: "manual" });
  const back = signIn.headers.get("location");
  if (back) await fetch(back);
}
