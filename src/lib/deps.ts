import { spawn } from "node:child_process";
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
  /** Opens the sign-in page in the person's browser; the address is printed too, so a failure here is no matter. */
  openBrowser: (url: string): void => {
    const [command, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
    try {
      spawn(command, args as string[], { stdio: "ignore", detached: true }).on("error", () => undefined).unref();
    } catch {
      // printed already
    }
  },
};
