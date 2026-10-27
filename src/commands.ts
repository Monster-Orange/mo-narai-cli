// Every command, by its id. oclif reads this map (package.json `oclif.commands`, strategy "explicit") instead of
// scanning a directory, so what ships is exactly what is listed here.
import Build from "./commands/build.js";
import Dev from "./commands/dev.js";
import Init from "./commands/init.js";
import Validate from "./commands/validate.js";

export const COMMANDS = {
  init: Init,
  validate: Validate,
  build: Build,
  dev: Dev,
};
