import { Flags } from "@oclif/core";
import { NaraiCommand } from "../../base-command.js";
import { ok, registry } from "../../api/client.js";
import { publishers } from "../../api/tools.js";

export default class ToolsList extends NaraiCommand<typeof ToolsList> {
  static override summary = "Your publishers' tools and their versions.";
  static override flags = { publisher: Flags.string({ description: "Only this publisher (its slug)." }) };

  async run(): Promise<void> {
    const api = registry(this.naraiUrl);
    const host = new URL(this.naraiUrl).host;
    const slugs = (await publishers(api, host)).map((p) => p.slug).filter((s): s is string => Boolean(s))
      .filter((s) => !this.flags.publisher || s === this.flags.publisher);
    const tools: { id: string; versions: { version: string; status: string; bundle_digest: string | null }[] }[] = [];
    for (const publisher of slugs) {
      const listed = await ok(api.GET("/api/tools/{publisher}", { params: { path: { publisher } } }), `${publisher}'s tools`);
      for (const t of listed.tools) tools.push({ id: t.id_string, versions: t.versions.map((v) => ({ version: v.version, status: v.status, bundle_digest: v.bundle_digest })) });
    }
    this.out.result({ tools }, () => tools.length === 0 ? "no tools yet: narai tools register"
      : tools.map((t) => `${t.id}  ${t.versions.map((v) => `${v.version} (${v.status})`).join(", ") || "no versions"}`));
  }
}
