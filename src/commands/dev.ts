import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Flags } from "@oclif/core";
import type { Grant } from "@michinarai/sdk/host";
import { startHarness, type HarnessOptions } from "@michinarai/sdk/harness";
import { NARAI_URL, NaraiCommand, naraiOrigin } from "../base-command.js";
import { deps } from "../lib/deps.js";
import { NaraiError } from "../lib/errors.js";
import { startLaunch, type Launch } from "../lib/launch.js";
import { checkedManifest, toolRoot } from "../lib/project.js";

/** `--launch beta`: Narai's beta; any other value is a Narai's address. */
const launchAt = (given: string): string => naraiOrigin(given === "beta" ? NARAI_URL : given);

/** Until Ctrl-C (or a SIGTERM), then `stop`. */
const untilStopped = (stop: () => Promise<void>): Promise<void> => new Promise<void>((done) => {
  const end = () => { void stop().then(done); };
  process.once("SIGINT", end);
  process.once("SIGTERM", end);
});

/** A learner's id with a publisher, as narai.tool.start carries it. */
const SUBJECT = /^[A-Za-z0-9_-]{43}$/;

async function json(path: string | undefined, what: string): Promise<unknown> {
  if (!path) return undefined;
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new NaraiError(`${what} ${path}: ${(error as Error).message}`, "bad_input");
  }
}

type Task = NonNullable<HarnessOptions["task"]>;

/** The task a step would start the tool on, for its first answer kind: none when it answers nothing. */
function sampleTask(manifest: HarnessOptions["manifest"]): Task | undefined {
  const kind = Object.keys(manifest.answers ?? {})[0];
  if (!kind) return undefined;
  return { id: "dev_task", kind, assist: "allowed", prompt: `A sample task (${kind}): in a lesson, Narai writes the prompt.` };
}

export default class Dev extends NaraiCommand<typeof Dev> {
  static override summary = "Run the tool in the local harness, mounted as a lesson mounts it.";
  static override description = "Narai's host on http://localhost, the tool on http://127.0.0.1 in a sandboxed iframe: two origins, the real handshake, every message checked against the manifest. It opens the host's address in your browser; stop with Ctrl-C. Without --task the tool starts on a sample task of the manifest's first answer kind. It runs on this machine only: Narai's lessons see a tool once it's registered and pushed (narai login, narai tools register, narai tools push).";
  static override flags = {
    dir: Flags.string({ description: "The tool's built files (served at the embed URL's path).", default: "dist" }),
    port: Flags.integer({ description: "The host page's port (default: any free one)." }),
    "tool-port": Flags.integer({ description: "The tool's port (default: any free one)." }),
    locale: Flags.string({ description: "The locale the tool starts in (default: its first)." }),
    task: Flags.string({ description: "A JSON file: the task Narai would start it on ({id, kind, assist, prompt}). Default: a sample task of the manifest's first answer kind." }),
    preset: Flags.string({ description: "A JSON file: the step's preset payload ({schema, ...})." }),
    grant: Flags.string({
      description: "What the step grants the tool, as Narai's start does: only what the manifest's capabilities declare.",
      options: ["microphone"], multiple: true,
    }),
    subject: Flags.string({
      description: "For testing only: start the tool as for a learner who linked their account with your publisher and chose to let its tools know them (tool.start.subject, 43 URL-safe characters). Only a manifest that declares surfaces.account_link gets it, as in a lesson.",
    }),
    "no-open": Flags.boolean({ description: "Print the host's address; don't open it." }),
    launch: Flags.string({
      description: "Frame this dev server in your own lessons on a Narai (beta, or a Narai's address) instead of the local harness: it serves the built files over https where Narai's frame opens them, names that origin for the tool while it runs, and ends it on Ctrl-C. Needs narai login and a pushed draft of the tool.",
    }),
    origin: Flags.string({
      description: "With --launch: a tunnel's https address to name instead of https://localhost; the files are served over plain http on --tool-port for the tunnel to forward.",
      dependsOn: ["launch"],
    }),
  };

  async run(): Promise<void> {
    const root = await toolRoot(process.cwd());
    const manifest = await checkedManifest(root);
    if (this.flags.launch !== undefined) {
      await this.launch(manifest, resolve(root, this.flags.dir));
      return;
    }
    const options: HarnessOptions = { manifest, toolDir: resolve(root, this.flags.dir) };
    if (this.flags.port !== undefined) options.hostPort = this.flags.port;
    if (this.flags["tool-port"] !== undefined) options.toolPort = this.flags["tool-port"];
    if (this.flags.locale) options.locale = this.flags.locale;
    const task = await json(this.flags.task, "task");
    const preset = await json(this.flags.preset, "preset");
    // no --task: a sample of what a step starts it on, so the tool's answer has something to answer
    const started = (task as Task | undefined) ?? sampleTask(manifest);
    if (started) options.task = started;
    if (preset) options.preset = preset as NonNullable<HarnessOptions["preset"]>;
    // Narai grants only what the manifest declares and drops the rest: so does this, saying so
    const asked = (this.flags.grant ?? []) as Grant[];
    const granted = asked.filter((g) => manifest.capabilities?.[g] === true);
    for (const g of asked) if (!granted.includes(g)) this.out.progress(`not granted: ${g} (the manifest's capabilities.${g} isn't true)`);
    options.granted = granted;
    const askedSubject = this.flags.subject;
    if (askedSubject !== undefined && !SUBJECT.test(askedSubject)) {
      throw new NaraiError("--subject: 43 URL-safe characters (A-Z, a-z, 0-9, _ and -), as Narai's subjects are", "bad_subject", 2);
    }
    // as in a lesson: only a manifest that declares account linking gets it (the harness's host drops it too)
    const linked = Boolean(manifest.surfaces.account_link);
    const subject = askedSubject !== undefined && linked ? askedSubject : null;
    if (askedSubject !== undefined && !linked) this.out.progress("no subject: the manifest declares no surfaces.account_link");
    if (subject) options.subject = subject;
    const harness = await startHarness(options);
    const kind = options.task?.kind ?? null;
    this.out.result({ host: harness.hostUrl, tool: harness.toolUrl, task: kind, granted, subject }, () => [
      `Open ${harness.hostUrl} in a browser: your tool, mounted as a lesson mounts it, and what it sends Narai.`,
      `task  ${kind ?? "none (the manifest answers nothing)"}${task ? "" : kind ? " (a sample; --task <file> starts another)" : ""}`,
      ...(granted.length ? [`granted  ${granted.join(", ")}`] : []),
      ...(subject ? [`subject  ${subject} (a linked learner, for testing)`] : []),
      "This runs on this machine only. To use the tool in a Narai lesson: narai login, narai tools register, narai tools push.",
    ]);
    if (!this.out.json && !this.flags["no-open"]) deps.openBrowser(harness.hostUrl);
    this.out.progress("Ctrl-C to stop");
    await untilStopped(() => harness.close());
  }

  /** `--launch`: the dev server in the developer's own lessons on a Narai, until Ctrl-C. */
  private async launch(manifest: HarnessOptions["manifest"], toolDir: string): Promise<void> {
    const origin = this.flags.origin;
    if (origin !== undefined && !/^https:\/\//i.test(origin)) throw new NaraiError(`--origin ${origin}: a tunnel's https address`, "bad_origin", 2);
    const narai = launchAt(this.flags.launch ?? "beta");
    const started: Launch = await startLaunch({
      narai, manifest, toolDir, progress: (line) => this.out.progress(line),
      ...(origin !== undefined ? { origin } : {}),
      ...(this.flags["tool-port"] !== undefined ? { port: this.flags["tool-port"] } : {}),
    });
    const { end, ...result } = started;
    const host = new URL(narai).host;
    this.out.result(result, () => [
      `Your dev server is framed in your own lessons on ${host} until Ctrl-C (at most until ${started.expires_at}).`,
      `framed  ${started.framed}`,
      ...(origin ? [`local   ${started.local} (point the tunnel here)`] : []),
      ...(started.lessons === null
        ? [`Open any lesson on ${host} whose step uses ${manifest.id}: a draft the step's range takes frames your dev server. ${narai}/learn`]
        : started.lessons.length
          ? started.lessons.map((l) => `open ${l.course} › ${l.step}: ${l.url}${l.listed ? "" : " (not listed)"}`)
          : [`No lesson on ${host} uses ${manifest.id} yet: add the tool to a step of one of your courses.`]),
      "Only your own launches of a draft see it.",
    ]);
    this.out.progress("Ctrl-C to stop");
    await untilStopped(end);
  }
}
