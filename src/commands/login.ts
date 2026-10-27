import { Flags } from "@oclif/core";
import { NaraiCommand } from "../base-command.js";
import { startLoopback } from "../auth/loopback.js";
import { lockFile } from "../auth/session.js";
import { authorizationUrl, discover, exchangeCode, newState, pkce } from "../auth/oauth.js";
import { deps } from "../lib/deps.js";
import { withFileLock } from "../lib/lock.js";

export default class Login extends NaraiCommand<typeof Login> {
  static override summary = "Sign in to Narai in the browser; the session stays in the OS keychain.";
  static override description = "Opens Narai's sign-in page; the answer comes back to this machine only (127.0.0.1). The session's refresh token is kept in the OS keychain and rotates on every use. In CI, set NARAI_TOKEN to a tool's token instead.";
  static override flags = {
    "no-browser": Flags.boolean({ description: "Print the sign-in address; don't open it." }),
    timeout: Flags.integer({ description: "Seconds to wait for the browser.", default: 300 }),
  };

  async run(): Promise<void> {
    const naraiUrl = this.naraiUrl;
    const meta = await discover(naraiUrl);
    const { verifier, challenge } = pkce();
    const state = newState();
    const loopback = await startLoopback({ state, issuer: meta.iss_parameter ? meta.issuer : null, timeoutMs: this.flags.timeout * 1000 });
    try {
      const url = authorizationUrl(meta, { naraiUrl, redirectUri: loopback.redirectUri, challenge, state });
      this.out.prompt(`Sign in to Narai: ${url}`);
      if (!this.flags["no-browser"]) deps.openBrowser(url);
      const code = await loopback.code;
      const tokens = await exchangeCode(meta, { naraiUrl, code, verifier, redirectUri: loopback.redirectUri });
      const host = new URL(naraiUrl).host;
      await withFileLock(lockFile(naraiUrl), () => deps.credentials.set(naraiUrl, tokens.refreshToken));
      this.out.result({ signed_in: host, scopes: tokens.scopes }, () => `signed in to ${host}`);
    } finally {
      loopback.close();
    }
  }
}
