import { Flags } from "@oclif/core";
import { NaraiError } from "../lib/errors.js";
import { readManifest, toolRoot } from "../lib/project.js";

export const toolFlag = {
  tool: Flags.string({ description: "The tool, publisher/name (default: this repository's manifest)." }),
};

/** The tool a command acts on: --tool, else the manifest here. */
export async function whichTool(given: string | undefined): Promise<{ publisher: string; name: string; id: string }> {
  const id = given ?? String((await readManifest(await toolRoot(process.cwd())) as { id?: unknown }).id ?? "");
  const [publisher, name, ...rest] = id.split("/");
  if (!publisher || !name || rest.length) throw new NaraiError(`${id || "(none)"} isn't publisher/name`, "bad_tool", 2);
  return { publisher, name, id };
}
