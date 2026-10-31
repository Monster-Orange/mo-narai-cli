import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Flags } from "@oclif/core";
import type { Grant } from "@michinarai/sdk/host";
import { startHarness, type HarnessOptions } from "@michinarai/sdk/harness";
import { NaraiCommand } from "../base-command.js";
import { NaraiError } from "../lib/errors.js";
import { checkedManifest, toolRoot } from "../lib/project.js";

async function json(path: string | undefined, what: string): Promise<unknown> {
  if (!path) return undefined;
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new NaraiError(`${what} ${path}: ${(error as Error).message}`, "bad_input");
  }
}

export default class Dev extends NaraiCommand<typeof Dev> {
  static override summary = "Run the tool in the local harness, mounted as a lesson mounts it.";
  static override description = "Narai's host on http://localhost, the tool on http://127.0.0.1 in a sandboxed iframe: two origins, the real handshake, every message checked against the manifest. Open the host's address in a browser; stop with Ctrl-C.";
  static override flags = {
    dir: Flags.string({ description: "The tool's built files (served at the embed URL's path).", default: "dist" }),
    port: Flags.integer({ description: "The host page's port (default: any free one)." }),
    "tool-port": Flags.integer({ description: "The tool's port (default: any free one)." }),
    locale: Flags.string({ description: "The locale the tool starts in (default: its first)." }),
    task: Flags.string({ description: "A JSON file: the task Narai would start it on ({id, kind, assist, prompt})." }),
    preset: Flags.string({ description: "A JSON file: the step's preset payload ({schema, ...})." }),
    grant: Flags.string({
      description: "What the step grants the tool, as Narai's start does: only what the manifest's capabilities declare.",
      options: ["microphone"], multiple: true,
    }),
  };

  async run(): Promise<void> {
    const root = await toolRoot(process.cwd());
    const manifest = await checkedManifest(root);
    const options: HarnessOptions = { manifest, toolDir: resolve(root, this.flags.dir) };
    if (this.flags.port !== undefined) options.hostPort = this.flags.port;
    if (this.flags["tool-port"] !== undefined) options.toolPort = this.flags["tool-port"];
    if (this.flags.locale) options.locale = this.flags.locale;
    const task = await json(this.flags.task, "task");
    const preset = await json(this.flags.preset, "preset");
    if (task) options.task = task as NonNullable<HarnessOptions["task"]>;
    if (preset) options.preset = preset as NonNullable<HarnessOptions["preset"]>;
    // Narai grants only what the manifest declares and drops the rest: so does this, saying so
    const asked = (this.flags.grant ?? []) as Grant[];
    const granted = asked.filter((g) => manifest.capabilities?.[g] === true);
    for (const g of asked) if (!granted.includes(g)) this.out.progress(`not granted: ${g} (the manifest's capabilities.${g} isn't true)`);
    options.granted = granted;
    const harness = await startHarness(options);
    this.out.result({ host: harness.hostUrl, tool: harness.toolUrl, granted }, () => [`host  ${harness.hostUrl}`, `tool  ${harness.toolUrl}`, ...(granted.length ? [`granted  ${granted.join(", ")}`] : [])]);
    this.out.progress("Ctrl-C to stop");
    await new Promise<void>((done) => {
      const stop = () => { void harness.close().then(done); };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  }
}
