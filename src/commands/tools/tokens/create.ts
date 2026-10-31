import { Flags } from "@oclif/core";
import { NaraiCommand } from "../../../base-command.js";
import { ok, registry } from "../../../api/client.js";
import { toolFlag, whichTool } from "../../../api/tool-flag.js";

export default class TokensCreate extends NaraiCommand<typeof TokensCreate> {
  static override summary = "Make a CI token for this tool: it reads and uploads this tool's versions, in this environment only.";
  static override description = "The token is printed once, to stdout (--json for a CI secret), and never written anywhere. Store it as the CI secret NARAI_TOKEN.";
  static override flags = {
    ...toolFlag,
    label: Flags.string({ description: "What it's for (e.g. the CI that holds it)." }),
    days: Flags.integer({ description: "How long it lasts.", options: ["7", "30", "90", "365"] as never, default: 90 }),
    scope: Flags.string({ description: "Narrow it to a scope (repeatable; default: both tool scopes).", multiple: true, options: ["tool:versions.read", "tool:versions.upload"] }),
  };

  async run(): Promise<void> {
    const { publisher, name, id } = await whichTool(this.flags.tool);
    const body: { days: number; label?: string; scopes?: string[] } = { days: this.flags.days };
    if (this.flags.label) body.label = this.flags.label;
    if (this.flags.scope?.length) body.scopes = this.flags.scope;
    const made = await ok(registry(this.naraiUrl).POST("/api/tools/{publisher}/{name}/ci-tokens", { params: { path: { publisher, name } }, body }), `a CI token for ${id}`);
    this.out.progress(`${id}: a CI token for ${made.env}, ${made.scopes.join(" ")}, until ${made.expires_at}. It's shown once: store it now (NARAI_TOKEN).`);
    this.out.result(made, () => made.token);
  }
}
