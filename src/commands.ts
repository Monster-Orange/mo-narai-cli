// Every command, by its id. oclif reads this map (package.json `oclif.commands`, strategy "explicit") instead of
// scanning a directory, so what ships is exactly what is listed here.
import Build from "./commands/build.js";
import Dev from "./commands/dev.js";
import Init from "./commands/init.js";
import Login from "./commands/login.js";
import Logout from "./commands/logout.js";
import ToolsList from "./commands/tools/list.js";
import ToolsPush from "./commands/tools/push.js";
import ToolsRegister from "./commands/tools/register.js";
import TokensCreate from "./commands/tools/tokens/create.js";
import TokensList from "./commands/tools/tokens/list.js";
import TokensRevoke from "./commands/tools/tokens/revoke.js";
import Validate from "./commands/validate.js";

export const COMMANDS = {
  login: Login,
  logout: Logout,
  init: Init,
  validate: Validate,
  build: Build,
  dev: Dev,
  "tools:register": ToolsRegister,
  "tools:push": ToolsPush,
  "tools:list": ToolsList,
  "tools:tokens:create": TokensCreate,
  "tools:tokens:list": TokensList,
  "tools:tokens:revoke": TokensRevoke,
};
