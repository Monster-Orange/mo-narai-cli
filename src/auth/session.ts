import { homedir } from "node:os";
import { join } from "node:path";
import { deps } from "../lib/deps.js";
import { AuthError } from "../lib/errors.js";
import { withFileLock } from "../lib/lock.js";
import { discover, OAuthError, refresh } from "./oauth.js";

/** Where the lock that serializes a refresh lives: one per Narai host, shared by every `narai` on this machine. */
export const lockFile = (naraiUrl: string): string => join(process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state"), "narai", `${new URL(naraiUrl).host}.lock`);

const fresh = new Map<string, { token: string; until: number }>();

/** The bearer token for a call: NARAI_TOKEN when set (a CI token, never stored), else an access token from the stored
 *  session's refresh token. The refresh rotates it, so it runs under the lock and stores the new one first. */
export async function bearer(naraiUrl: string): Promise<string> {
  const env = process.env["NARAI_TOKEN"];
  if (env) return env;
  const cached = fresh.get(naraiUrl);
  if (cached && cached.until > deps.now()) return cached.token;
  return withFileLock(lockFile(naraiUrl), async () => {
    const stored = await deps.credentials.get(naraiUrl);
    if (!stored) throw new AuthError(`not signed in to ${new URL(naraiUrl).host}: run narai login`);
    const meta = await discover(naraiUrl);
    try {
      const tokens = await refresh(meta, { naraiUrl, refreshToken: stored });
      await deps.credentials.set(naraiUrl, tokens.refreshToken);
      fresh.set(naraiUrl, { token: tokens.accessToken, until: deps.now() + Math.max(0, tokens.expiresIn - 30) * 1000 });
      return tokens.accessToken;
    } catch (error) {
      if (error instanceof OAuthError && error.error === "invalid_grant") {
        await deps.credentials.delete(naraiUrl);
        throw new AuthError("the session has ended (signed out elsewhere, or expired): run narai login", "session_ended");
      }
      throw error;
    }
  });
}

/** For tests: forget the access tokens held in this process. */
export const forgetAccessTokens = (): void => fresh.clear();
