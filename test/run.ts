import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const BIN = fileURLToPath(new URL("../bin/run.js", import.meta.url));

export interface Ran { status: number | null; stdout: string; stderr: string }

/** `narai <args>` as a person or a script runs it: a child process, no terminal (so JSON by default unless --json is
 *  off), no keychain, in `cwd`. */
export function narai(args: string[], cwd: string, env: Record<string, string> = {}): Ran {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1", ...env } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** A long-running `narai` (dev): resolves with its first stdout document and the process to stop. */
export function naraiServe(args: string[], cwd: string): Promise<{ result: Record<string, string>; stop: () => Promise<void> }> {
  const child = spawn(process.execPath, [BIN, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  return new Promise((resolve, reject) => {
    child.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
      try {
        const result = JSON.parse(out) as Record<string, string>;
        resolve({ result, stop: () => new Promise((done) => { child.once("exit", () => done()); child.kill("SIGINT"); }) });
      } catch {
        // not whole yet
      }
    });
    child.once("exit", (code) => reject(new Error(`narai ${args.join(" ")} exited ${code}: ${err}`)));
  });
}

export const scratch = (): string => mkdtempSync(join(tmpdir(), "narai-cli-"));
