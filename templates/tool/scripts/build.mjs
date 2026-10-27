// The tool's build: its pages, its manifest and the SDK into dist/. No bundler: the page maps "@michinarai/sdk" to the
// copy in dist/sdk/. `narai build` then seals dist/ (every file's sha256, the bundle digest).
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sdk = dirname(dirname(fileURLToPath(import.meta.resolve("@michinarai/sdk"))));
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
cpSync("src", "dist", { recursive: true });
cpSync("narai.tool.json", join("dist", "narai.tool.json"));
cpSync(join(sdk, "dist"), join("dist", "sdk"), { recursive: true, filter: (p) => !p.endsWith(".map") && !p.endsWith(".d.ts") && !p.includes("harness") && !p.endsWith("payloads.js") });
