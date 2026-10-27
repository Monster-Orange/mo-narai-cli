import confirm from "@inquirer/confirm";
import { keychain, type CredentialStore } from "./credentials.js";

/** What touches the person's machine beyond files: swapped in tests. */
export const deps = {
  credentials: keychain as CredentialStore,
  stdinIsTTY: () => Boolean(process.stdin.isTTY),
  stdoutIsTTY: () => Boolean(process.stdout.isTTY),
  confirm: (message: string) => confirm({ message, default: false }),
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};
