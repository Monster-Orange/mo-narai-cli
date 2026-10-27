import { NaraiCommand } from "../base-command.js";
import { discover, revoke } from "../auth/oauth.js";
import { deps } from "../lib/deps.js";

export default class Logout extends NaraiCommand<typeof Logout> {
  static override summary = "Sign out: Narai revokes the session, and the keychain forgets it.";

  async run(): Promise<void> {
    const naraiUrl = this.naraiUrl;
    const host = new URL(naraiUrl).host;
    const stored = await deps.credentials.get(naraiUrl);
    if (!stored) {
      this.out.result({ signed_out: host, was_signed_in: false }, () => `not signed in to ${host}`);
      return;
    }
    await revoke(await discover(naraiUrl), { naraiUrl, token: stored });
    await deps.credentials.delete(naraiUrl);
    this.out.result({ signed_out: host, was_signed_in: true }, () => `signed out of ${host}`);
  }
}
