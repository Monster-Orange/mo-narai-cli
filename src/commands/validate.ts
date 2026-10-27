import { manifestWarnings } from "@narai/sdk";
import { NaraiCommand } from "../base-command.js";
import { NaraiError } from "../lib/errors.js";
import { MANIFEST, checkedManifest, readManifest, toolRoot } from "../lib/project.js";

export default class Validate extends NaraiCommand<typeof Validate> {
  static override summary = `Check ${MANIFEST} against the contract, as Narai's registry does.`;
  static override description = "The schema, then what a schema can't say: every payload a manifest names is declared, no answer payload carries a verdict, commands and answers need an embed that runs the SDK, files sorted by path.";

  async run(): Promise<void> {
    const root = await toolRoot(process.cwd());
    try {
      const manifest = await checkedManifest(root);
      const warnings = manifestWarnings(await readManifest(root));
      for (const w of warnings) this.out.progress(`warning: ${w}`);
      this.out.result({ ok: true, id: manifest.id, version: manifest.version, warnings }, () => `${manifest.id} ${manifest.version}: matches the contract`);
    } catch (error) {
      if (error instanceof NaraiError && Array.isArray(error.details["problems"])) {
        if (!this.out.json) for (const p of error.details["problems"] as string[]) this.out.progress(`  ${p}`);
      }
      throw error;
    }
  }
}
