import { Flags } from "@oclif/core";
import { NaraiCommand } from "../../base-command.js";
import { found, ok, registry } from "../../api/client.js";
import { idParts, publishers, type Publisher } from "../../api/tools.js";
import { NaraiError } from "../../lib/errors.js";
import { describeChange, planExit, planFlags, type Change } from "../../lib/plan.js";
import { checkedManifest, toolRoot } from "../../lib/project.js";

export default class ToolsRegister extends NaraiCommand<typeof ToolsRegister> {
  static override summary = "Register this tool at Narai: its publisher (once per organization), then the tool.";
  static override description = "Plans, then applies after a confirmation. The publisher is the manifest's (`publisher/name` and its name and url); --org says which of your organizations it is, when none has it yet.";
  static override flags = {
    ...planFlags,
    org: Flags.string({ description: "The organization (id or name) the publisher belongs to, when it isn't set up yet." }),
  };

  async run(): Promise<void> {
    const manifest = await checkedManifest(await toolRoot(process.cwd()));
    const { publisher, name } = idParts(manifest);
    const api = registry(this.naraiUrl);
    const orgs = await publishers(api, new URL(this.naraiUrl).host);
    const mine = orgs.find((p) => p.slug === publisher);
    const changes: Change[] = [];
    let org: Publisher | undefined = mine;
    const wanted = { slug: publisher, name: manifest.publisher.name, url: manifest.publisher.url };
    if (!mine) {
      org = this.pickOrg(orgs, publisher);
      changes.push({ action: "create", target: `publisher ${publisher}`, detail: `for ${org.org_name}: ${wanted.name}, ${wanted.url}` });
    } else if (mine.name !== wanted.name || mine.url !== wanted.url) {
      changes.push({ action: "update", target: `publisher ${publisher}`, detail: `${mine.name ?? ""}, ${mine.url ?? ""} → ${wanted.name}, ${wanted.url}` });
    }
    const tool = mine ? await found(api.GET("/api/tools/{publisher}/{name}", { params: { path: { publisher, name } } }), manifest.id) : null;
    if (!tool) changes.push({ action: "create", target: `tool ${manifest.id}`, detail: "" });

    const plan = { tool: manifest.id, changes };
    if (this.flags.plan || changes.length === 0) {
      this.out.result({ ...plan, applied: false }, () => changes.length ? ["would change:", ...changes.map(describeChange)] : `${manifest.id}: registered; nothing to change`);
      this.exit(this.flags.plan ? planExit(changes, this.flags["detailed-exitcode"]) : 0);
    }
    for (const line of changes.map(describeChange)) this.out.prompt(line);
    await this.confirm(`Apply ${changes.length} change${changes.length === 1 ? "" : "s"} at ${new URL(this.naraiUrl).host}`, plan);
    if (changes.some((c) => c.target.startsWith("publisher")) && org) {
      await ok(api.PUT("/api/tools/publishers/{org}", { params: { path: { org: org.org_id } }, body: wanted }), `publisher ${publisher}`);
    }
    if (!tool) await ok(api.POST("/api/tools/{publisher}", { params: { path: { publisher } }, body: { name } }), `tool ${manifest.id}`);
    this.out.result({ ...plan, applied: true }, () => [...changes.map(describeChange), `${manifest.id}: registered`]);
  }

  /** The organization a new publisher goes on: --org, else the only one without a publisher. */
  private pickOrg(orgs: Publisher[], publisher: string): Publisher {
    const given = this.flags.org;
    if (given) {
      const org = orgs.find((o) => o.org_id === given || o.org_name === given);
      if (!org) throw new NaraiError(`no organization ${given} among yours: ${orgs.map((o) => o.org_name).join(", ") || "none"}`, "no_such_org");
      if (org.slug && org.slug !== publisher) throw new NaraiError(`${org.org_name} already publishes as ${org.slug}`, "org_has_publisher");
      return org;
    }
    const free = orgs.filter((o) => !o.slug);
    if (free.length === 1 && free[0]) return free[0];
    throw new NaraiError(
      free.length === 0 ? `none of your organizations can take the publisher ${publisher}` : `which organization is ${publisher}? --org ${free.map((o) => JSON.stringify(o.org_name)).join(" | ")}`,
      free.length === 0 ? "no_org" : "org_needed", 2,
    );
  }
}
