/** The exit codes every command answers with: a contract scripts, CI and agents branch on. */
export const ExitCode = {
  ok: 0,
  error: 1,
  /** A flag or argument the command doesn't take. */
  usage: 2,
  /** Not signed in, or the session or token was refused. */
  auth: 3,
  /** Only with `--detailed-exitcode`: the plan has changes (0 then means none). */
  changes: 2,
} as const;

/** Every failure the CLI reports on purpose. `code` is stable and machine-readable (`--json`); `message` is for
 *  people and never carries a secret. */
export class NaraiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly exitCode: number = ExitCode.error,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "NaraiError";
  }
}

export class AuthError extends NaraiError {
  constructor(message: string, code = "not_signed_in") {
    super(message, code, ExitCode.auth);
    this.name = "AuthError";
  }
}

/** A confirmation was needed, and `--no-input` (or no terminal) ruled out asking. */
export class NeedsInputError extends NaraiError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, "needs_input", ExitCode.error, details);
    this.name = "NeedsInputError";
  }
}
