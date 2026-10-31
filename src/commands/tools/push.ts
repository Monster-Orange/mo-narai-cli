import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Flags } from "@oclif/core";
import { NaraiCommand } from "../../base-command.js";
import { found, ok, registry } from "../../api/client.js";
import { idParts, sealedRelease } from "../../api/tools.js";
import { NaraiError } from "../../lib/errors.js";
import { describeChange, planExit, planFlags, type Change } from "../../lib/plan.js";
import { checkedManifest, toolRoot } from "../../lib/project.js";

export default class ToolsPush extends NaraiCommand<typeof ToolsPush> {
  static override summary = "Upload this build as a draft version: the sealed manifest and every file it lists.";
  static override description = "Plans, then uploads after a confirmation. The build is `narai build`'s, checked unchanged. A version is uploaded once: the same build again is nothing to do, a different one under the same version is refused (raise the version).";
  static override flags = {
    ...planFlags,
    dir: Flags.string({ description: "The sealed build.", default: "dist" }),
  };

  async run(): Promise<void> {
    const root = await toolRoot(process.cwd());
    const manifest = await checkedManifest(root);
    const release = await sealedRelease(root, this.flags.dir, manifest);
    const { publisher, name } = idParts(manifest);
    const api = registry(this.naraiUrl);
    const path = { publisher, name };
    const tool = await found(api.GET("/api/tools/{publisher}/{name}", { params: { path } }), manifest.id);
    if (!tool) throw new NaraiError(`${manifest.id} isn't registered: run narai tools register`, "not_registered");
    const existing = await found(api.GET("/api/tools/{publisher}/{name}/versions/{version}", { params: { path: { ...path, version: manifest.version } } }), `${manifest.id} ${manifest.version}`);
    if (existing && existing.bundle_digest !== release.bundle_digest) {
      throw new NaraiError(`${manifest.id} ${manifest.version} is uploaded already, as another build (${existing.bundle_digest ?? "?"}): raise the version`, "version_exists", 1, { uploaded: existing.bundle_digest, built: release.bundle_digest });
    }
    const bytes = release.files.reduce((n, f) => n + f.size, 0);
    const changes: Change[] = existing ? [] : [{ action: "upload", target: `${manifest.id} ${manifest.version}`, detail: `${release.files.length} files, ${bytes} bytes, ${release.bundle_digest}` }];
    const plan = { tool: manifest.id, version: manifest.version, bundle_digest: release.bundle_digest, changes };
    if (this.flags.plan || changes.length === 0) {
      this.out.result({ ...plan, applied: false }, () => changes.length ? ["would change:", ...changes.map(describeChange)] : `${manifest.id} ${manifest.version}: uploaded already; nothing to change`);
      this.exit(this.flags.plan ? planExit(changes, this.flags["detailed-exitcode"]) : 0);
    }
    for (const line of changes.map(describeChange)) this.out.prompt(line);
    await this.confirm(`Upload ${manifest.id} ${manifest.version} to ${new URL(this.naraiUrl).host}`, plan);
    const form = new FormData();
    form.append("manifest", JSON.stringify(release));
    for (const f of release.files) form.append("files", new Blob([await readFile(join(root, this.flags.dir, f.path))]), f.path);
    const uploaded = await ok(api.POST("/api/tools/{publisher}/{name}/versions", {
      params: { path },
      body: { manifest: "" },
      bodySerializer: () => form,
    }), `${manifest.id} ${manifest.version}`);
    this.out.result({ ...plan, applied: true, status: uploaded.status }, () => [...changes.map(describeChange), `${manifest.id} ${manifest.version}: uploaded (${uploaded.status})`]);
  }
}
