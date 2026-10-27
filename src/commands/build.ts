import { stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Flags } from "@oclif/core";
import { manifestProblems } from "@narai/sdk";
import { NaraiCommand } from "../base-command.js";
import { bundleDigest, digestFiles } from "../lib/digest.js";
import { NaraiError } from "../lib/errors.js";
import { MANIFEST, checkedManifest, toolRoot } from "../lib/project.js";

export default class Build extends NaraiCommand<typeof Build> {
  static override summary = "Seal a release: every built file with its sha256, and the bundle digest, in the release's manifest.";
  static override description = `Run after the tool's own build. Writes <dir>/${MANIFEST}: the manifest with \`files\` (sorted by path) and \`bundle_digest\`, which Narai checks an upload against.`;
  static override flags = {
    dir: Flags.string({ description: "The tool's built files.", default: "dist" }),
  };

  async run(): Promise<void> {
    const root = await toolRoot(process.cwd());
    const manifest = await checkedManifest(root);
    const dir = resolve(root, this.flags.dir);
    if (!(await stat(dir).catch(() => null))?.isDirectory()) {
      throw new NaraiError(`${this.flags.dir}/ isn't there: build the tool first`, "no_build");
    }
    const files = await digestFiles(dir);
    if (files.length === 0) throw new NaraiError(`${this.flags.dir}/ is empty`, "no_build");
    const release = { ...manifest, files, bundle_digest: bundleDigest(files) };
    const problems = manifestProblems(release);
    if (problems.length) throw new NaraiError("the release doesn't match the contract", "release_invalid", 1, { problems });
    await writeFile(join(dir, MANIFEST), `${JSON.stringify(release, null, 2)}\n`);
    const bytes = files.reduce((n, f) => n + f.size, 0);
    this.out.result(
      { id: manifest.id, version: manifest.version, files: files.length, bytes, bundle_digest: release.bundle_digest, manifest: join(this.flags.dir, MANIFEST) },
      () => [`${manifest.id} ${manifest.version}: ${files.length} files, ${bytes} bytes`, release.bundle_digest],
    );
  }
}
