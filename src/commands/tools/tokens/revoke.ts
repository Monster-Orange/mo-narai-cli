import { Args } from "@oclif/core";
import { NaraiCommand } from "../../../base-command.js";
import { refused, registry } from "../../../api/client.js";
import { toolFlag, whichTool } from "../../../api/tool-flag.js";

export default class TokensRevoke extends NaraiCommand<typeof TokensRevoke> {
  static override summary = "Revoke one of this tool's CI tokens, at once.";
  static override args = { id: Args.string({ description: "The token's id (narai tools tokens list).", required: true }) };
  static override flags = { ...toolFlag };

  async run(): Promise<void> {
    const { publisher, name, id } = await whichTool(this.flags.tool);
    await this.confirm(`Revoke CI token ${this.args.id} of ${id}`, { tool: id, token: this.args.id });
    const { error, response } = await registry(this.naraiUrl).DELETE("/api/tools/{publisher}/{name}/ci-tokens/{token_id}", { params: { path: { publisher, name, token_id: this.args.id } } });
    if (!response.ok) throw refused(response, error, `CI token ${this.args.id}`);
    this.out.result({ tool: id, revoked: this.args.id }, () => `${id}: CI token ${this.args.id} revoked`);
  }
}
