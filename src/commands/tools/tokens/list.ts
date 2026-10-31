import { NaraiCommand } from "../../../base-command.js";
import { ok, registry } from "../../../api/client.js";
import { toolFlag, whichTool } from "../../../api/tool-flag.js";

export default class TokensList extends NaraiCommand<typeof TokensList> {
  static override summary = "This tool's CI tokens (never the tokens themselves).";
  static override flags = { ...toolFlag };

  async run(): Promise<void> {
    const { publisher, name, id } = await whichTool(this.flags.tool);
    const { tokens } = await ok(registry(this.naraiUrl).GET("/api/tools/{publisher}/{name}/ci-tokens", { params: { path: { publisher, name } } }), `${id}'s CI tokens`);
    this.out.result({ tool: id, tokens }, () => tokens.length === 0 ? `${id}: no CI tokens` : tokens.map((t) =>
      `${t.id}  ${t.label ?? "-"}  ${t.env}  ${t.scopes.join(" ")}  ${t.revoked_at ? `revoked ${t.revoked_at}` : `until ${t.expires_at}`}${t.last_used_at ? `  last used ${t.last_used_at}` : ""}`));
  }
}
