// What a server or a file says is printed only after control characters are taken out, so nothing a server returns
// can move the cursor, rewrite a line or set a terminal's title.
// eslint-disable-next-line no-control-regex -- the control characters are what's removed
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

export const clean = (text: string): string => text.replace(CONTROL, "");

export interface OutputOptions {
  json: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

/** Where everything a command says goes: stdout carries only the result (text, or one JSON document with `--json`);
 *  progress, prompts and errors go to stderr. */
export class Output {
  readonly json: boolean;
  private readonly stdout: NodeJS.WritableStream;
  private readonly stderr: NodeJS.WritableStream;

  constructor(options: OutputOptions) {
    this.json = options.json;
    this.stdout = options.stdout ?? process.stdout;
    this.stderr = options.stderr ?? process.stderr;
  }

  /** The command's answer: `data` as JSON with `--json`, else the lines `render` gives. */
  result(data: unknown, render: () => string | readonly string[]): void {
    if (this.json) {
      this.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
      return;
    }
    const text = render();
    const lines = typeof text === "string" ? [text] : text;
    if (lines.length > 0) this.stdout.write(`${lines.map(clean).join("\n")}\n`);
  }

  /** For people; silent with `--json`. */
  progress(message: string): void {
    if (!this.json) this.stderr.write(`${clean(message)}\n`);
  }

  /** What a person must see to act (where to sign in, what they confirm): written even with `--json`. */
  prompt(message: string): void {
    this.stderr.write(`${clean(message)}\n`);
  }

  error(code: string, message: string, details: Record<string, unknown> = {}): void {
    if (this.json) this.stderr.write(`${JSON.stringify({ error: { code, message, ...details } })}\n`);
    else this.stderr.write(`error: ${clean(message)}\n`);
  }
}
