import { Flags } from "@oclif/core";
import { ExitCode } from "./errors.js";

/** One change a command would make at Narai. */
export interface Change { action: "create" | "update" | "upload"; target: string; detail: string }

export const planFlags = {
  plan: Flags.boolean({ description: "Only show what would change; change nothing." }),
  "detailed-exitcode": Flags.boolean({ description: "With --plan: exit 2 when there are changes, 0 when there are none (1 is an error)." }),
};

export const describeChange = (c: Change): string => `  ${c.action === "create" ? "+" : c.action === "upload" ? "↑" : "~"} ${c.target}  ${c.detail}`;

/** The exit a `--plan` ends with: `changes` (2) with --detailed-exitcode when there's something to do. */
export const planExit = (changes: readonly Change[], detailed: boolean): number =>
  detailed && changes.length > 0 ? ExitCode.changes : ExitCode.ok;
