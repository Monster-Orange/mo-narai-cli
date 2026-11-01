import { NaraiError } from "./errors.js";

/** The one place a person's Narai session lives: the OS keychain (macOS Keychain, Windows Credential Manager, the
 *  Secret Service on Linux), one entry per Narai host, holding the refresh token. No file fallback: a machine without
 *  a keychain (CI) uses a token in NARAI_TOKEN. */
const ACCOUNT = "refresh_token";

export const keychainService = (naraiUrl: string): string => `ai.michinar.narai-cli.${new URL(naraiUrl).host}`;

export interface CredentialStore {
  get(naraiUrl: string): Promise<string | null>;
  set(naraiUrl: string, token: string): Promise<void>;
  /** Whether there was one to delete. */
  delete(naraiUrl: string): Promise<boolean>;
}

class KeychainUnavailableError extends NaraiError {
  constructor(cause: unknown) {
    super(
      `the OS keychain isn't available (${cause instanceof Error ? cause.message : String(cause)}); on a machine without one, set NARAI_TOKEN`,
      "keychain_unavailable",
    );
  }
}

/** Loaded on first use: CI runs with NARAI_TOKEN and never loads the native module. */
async function entry(naraiUrl: string) {
  let keyring: typeof import("@napi-rs/keyring");
  try {
    keyring = await import("@napi-rs/keyring");
  } catch (error) {
    throw new KeychainUnavailableError(error);
  }
  // a Linux machine with no Secret Service fails here, as the entry is made
  try {
    return new keyring.AsyncEntry(keychainService(naraiUrl), ACCOUNT);
  } catch (error) {
    throw new KeychainUnavailableError(error);
  }
}

async function guarded<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new KeychainUnavailableError(error);
  }
}

export const keychain: CredentialStore = {
  async get(naraiUrl) {
    const e = await entry(naraiUrl);
    return (await guarded(() => e.getPassword())) ?? null;
  },
  async set(naraiUrl, token) {
    const e = await entry(naraiUrl);
    await guarded(() => e.setPassword(token));
  },
  async delete(naraiUrl) {
    const e = await entry(naraiUrl);
    return guarded(() => e.deleteCredential());
  },
};
