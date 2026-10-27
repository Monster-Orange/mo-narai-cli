// The loopback redirect of RFC 8252 §7.3: a one-shot server on 127.0.0.1 and a free port, the only place the code
// goes. It answers one request to /callback, checks `state` (and `iss`, RFC 9207) before it trusts anything in it,
// and gives up after a timeout.

import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { NaraiError } from "../lib/errors.js";
import { OAuthError } from "./oauth.js";

export const CALLBACK = "/callback";

export interface Loopback { redirectUri: string; code: Promise<string>; close(): void }

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;margin:4rem auto;max-width:32rem"><h1>${title}</h1><p>${body}</p></body>`;

const same = (a: string, b: string) => {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function startLoopback(o: { state: string; issuer: string | null; timeoutMs: number }): Promise<Loopback> {
  let settle!: { resolve(code: string): void; reject(error: Error): void };
  const code = new Promise<string>((resolve, reject) => { settle = { resolve, reject }; });
  code.catch(() => undefined); // the caller awaits it; a rejection before then isn't unhandled
  let done = false;
  const server = createServer((req, res) => {
    const port = (server.address() as AddressInfo).port;
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    // a page elsewhere can make the browser request a loopback URL, but not with this Host (DNS rebinding sends its own)
    if (done || req.method !== "GET" || url.pathname !== CALLBACK || req.headers.host !== `127.0.0.1:${port}`) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }
    done = true;
    const finish = (status: number, title: string, body: string, outcome: () => void) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(page(title, body), () => { close(); outcome(); });
    };
    const q = url.searchParams;
    if (!same(q.get("state") ?? "", o.state)) {
      finish(400, "Sign-in failed", "This answer isn't for the sign-in narai started.", () => settle.reject(new NaraiError("sign-in failed: the answer's state doesn't match", "oauth_state_mismatch", 3)));
    } else if (o.issuer !== null && q.get("iss") !== o.issuer) {
      finish(400, "Sign-in failed", "This answer came from another server.", () => settle.reject(new NaraiError("sign-in failed: the answer names another issuer", "oauth_issuer_mismatch", 3)));
    } else if (q.get("error") !== null) {
      finish(400, "Sign-in cancelled", "You can close this tab.", () => settle.reject(new OAuthError(q.get("error") ?? "", q.get("error_description") ?? "")));
    } else if (!q.get("code")) {
      finish(400, "Sign-in failed", "The answer carried no code.", () => settle.reject(new NaraiError("sign-in failed: no code", "oauth_no_code", 3)));
    } else {
      finish(200, "Signed in", "You can close this tab and go back to the terminal.", () => settle.resolve(q.get("code") ?? ""));
    }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve()); });
  const timer = setTimeout(() => { done = true; close(); settle.reject(new NaraiError("sign-in timed out: no answer from the browser", "oauth_timeout", 3)); }, o.timeoutMs);
  function close() { clearTimeout(timer); server.close(); server.closeAllConnections(); }
  return { redirectUri: `http://127.0.0.1:${(server.address() as AddressInfo).port}${CALLBACK}`, code, close };
}
