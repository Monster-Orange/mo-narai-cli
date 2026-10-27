import { execFileSync } from "node:child_process";

/** The tests run the built `narai` (bin/run.js loads dist/): build it once first. */
export default function setup(): void {
  execFileSync("npm", ["run", "-s", "build"], { stdio: "inherit" });
}
