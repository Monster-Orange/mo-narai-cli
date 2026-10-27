import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { manifestProblems, type ToolManifest } from "@michinarai/sdk";
import { NaraiError } from "./errors.js";

/** A tool's manifest, at the root of its repository. */
export const MANIFEST = "narai.tool.json";

/** The tool's root: the nearest directory, from `from` up, that holds a manifest. */
export async function toolRoot(from: string): Promise<string> {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    try {
      await readFile(join(dir, MANIFEST));
      return dir;
    } catch {
      if (dirname(dir) === dir) throw new NaraiError(`no ${MANIFEST} here or above: run narai init, or cd into a tool`, "no_tool");
    }
  }
}

export async function readManifest(root: string): Promise<unknown> {
  const text = await readFile(join(root, MANIFEST), "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new NaraiError(`${MANIFEST} isn't JSON: ${(error as Error).message}`, "manifest_invalid");
  }
}

/** The manifest, or every reason it isn't one (the SDK's checks: the schema and the registry's rules). */
export async function checkedManifest(root: string): Promise<ToolManifest> {
  const value = await readManifest(root);
  const problems = manifestProblems(value);
  if (problems.length) throw new NaraiError(`${MANIFEST} doesn't match the contract`, "manifest_invalid", 1, { problems });
  return value as ToolManifest;
}
