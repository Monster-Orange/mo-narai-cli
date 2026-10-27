import { Command, Errors, Flags, type Interfaces } from "@oclif/core";
import { deps } from "./lib/deps.js";
import { ExitCode, NaraiError, NeedsInputError } from "./lib/errors.js";
import { Output } from "./lib/output.js";

export type FlagsOf<T extends typeof Command> = Interfaces.InferredFlags<(typeof NaraiCommand)["baseFlags"] & T["flags"]>;
export type ArgsOf<T extends typeof Command> = Interfaces.InferredArgs<T["args"]>;

/** Narai's own address. */
export const NARAI_URL = "https://michinar.ai";

/** Every command: the global flags, one output (results to stdout, progress to stderr), and every failure mapped to
 *  the exit codes: 0 ok, 1 error, 2 usage, 3 auth. */
export abstract class NaraiCommand<T extends typeof Command = typeof Command> extends Command {
  static override baseFlags = {
    json: Flags.boolean({ description: "Print the result as JSON (the default when stdout isn't a terminal).", helpGroup: "GLOBAL" }),
    yes: Flags.boolean({ description: "Answer yes to every confirmation.", helpGroup: "GLOBAL" }),
    "no-input": Flags.boolean({ description: "Never prompt: a needed confirmation fails instead.", helpGroup: "GLOBAL" }),
    "narai-url": Flags.string({ description: `Narai's address (default ${NARAI_URL}; also NARAI_URL).`, helpGroup: "GLOBAL" }),
  };

  protected flags!: FlagsOf<T>;
  protected args!: ArgsOf<T>;
  protected out!: Output;

  override async init(): Promise<void> {
    await super.init();
    const ctor = this.ctor as typeof NaraiCommand;
    const { args, flags } = await this.parse({ args: ctor.args, baseFlags: ctor.baseFlags, flags: ctor.flags, strict: ctor.strict });
    this.flags = flags as FlagsOf<T>;
    this.args = args as ArgsOf<T>;
    this.out = new Output({ json: this.flags.json || !deps.stdoutIsTTY() });
  }

  /** The Narai this command talks to: `--narai-url`, else NARAI_URL, else Narai. No trailing slash. */
  protected get naraiUrl(): string {
    const url = new URL(this.flags["narai-url"] ?? process.env["NARAI_URL"] ?? NARAI_URL);
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !local) throw new NaraiError(`${url.origin} isn't https`, "insecure_url");
    return url.origin;
  }

  /** Prompts only with a person at the keyboard. */
  protected get interactive(): boolean {
    return !this.flags["no-input"] && deps.stdinIsTTY();
  }

  /** Confirm a change: `--yes` answers; with no one to ask, fail with what would have been asked. */
  protected async confirm(question: string, details: Record<string, unknown> = {}): Promise<void> {
    if (this.flags.yes) return;
    if (!this.interactive) throw new NeedsInputError(`${question}: needs confirmation; run again with --yes`, details);
    if (!(await deps.confirm(`${question}?`))) throw new NaraiError("cancelled", "cancelled");
  }

  override async catch(error: Error & { exitCode?: number }): Promise<never> {
    if (error instanceof Errors.ExitError) throw error;
    const out = this.out ?? new Output({ json: this.argv.includes("--json") });
    if (error instanceof NaraiError) {
      out.error(error.code, error.message, error.details);
      this.exit(error.exitCode);
    }
    if (error instanceof Errors.CLIError) {
      // flag and argument parsing
      out.error("usage", error.message);
      this.exit(ExitCode.usage);
    }
    out.error("unexpected", error.message);
    this.exit(ExitCode.error);
  }
}
