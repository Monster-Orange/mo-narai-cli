import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Args, Flags } from "@oclif/core";
import { manifestProblems } from "@michinarai/sdk";
import { NaraiCommand } from "../base-command.js";
import { NaraiError } from "../lib/errors.js";
import { MANIFEST } from "../lib/project.js";

/** The template, shipped in the package beside dist/. */
const TEMPLATE = fileURLToPath(new URL("../../templates/tool/", import.meta.url));
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

/** The SDK the template depends on: the version this CLI is built with (it pins one), or a later compatible one. */
async function sdkSpec(): Promise<string> {
  const pkg = JSON.parse(await readFile(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")) as { dependencies: Record<string, string> };
  const own = pkg.dependencies["@michinarai/sdk"] ?? "^1";
  return /^\d+\.\d+\.\d+$/.test(own) ? `^${own}` : own;
}

export default class Init extends NaraiCommand<typeof Init> {
  static override summary = "Start a new tool from the template: a manifest, a page, the SDK, an AGENTS.md and its skill.";
  static override args = { name: Args.string({ description: "The tool's name (lowercase, digits, -).", required: true }) };
  static override flags = {
    publisher: Flags.string({ description: "Your publisher's slug: the tool's id is <publisher>/<name>.", required: true }),
    dir: Flags.string({ description: "Where to write it (default: ./<name>)." }),
  };

  async run(): Promise<void> {
    const { name } = this.args;
    const { publisher } = this.flags;
    for (const [what, value] of [["name", name], ["publisher", publisher]] as const) {
      if (!SLUG.test(value)) throw new NaraiError(`${what} ${value}: lowercase letters, digits and -, up to 63`, "bad_slug", 2);
    }
    const target = resolve(this.flags.dir ?? name);
    const existing = await readdir(target).catch(() => [] as string[]);
    if (existing.length > 0) throw new NaraiError(`${relative(process.cwd(), target) || "."} isn't empty`, "not_empty");
    const family = name.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").replace(/^(\d)/, "t$1");
    // the name Narai shows the learner (by language; English to start): the slug's words, capitalized
    const title = name.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const values: Record<string, string> = { id: `${publisher}/${name}`, name, title, publisher, family, sdk: await sdkSpec() };
    const fill = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (m, key: string) => values[key] ?? m);
    const written: string[] = [];
    for (const source of await walk(TEMPLATE)) {
      const path = relative(TEMPLATE, source);
      const out = join(target, path);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, fill(await readFile(source, "utf8")));
      written.push(path.split("\\").join("/"));
    }
    const problems = manifestProblems(JSON.parse(await readFile(join(target, MANIFEST), "utf8")));
    if (problems.length) throw new NaraiError("the template's manifest doesn't match the contract (a bug in narai)", "template_invalid", 1, { problems });
    written.sort();
    this.out.result({ id: values["id"], dir: target, files: written }, () => [
      `${values["id"]} in ${relative(process.cwd(), target) || "."}`,
      ...written.map((f) => `  ${f}`),
      "",
      `next: cd ${relative(process.cwd(), target) || "."} && npm install && npm run dev`,
    ]);
  }
}
