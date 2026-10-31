# @michinarai/cli

`narai`, the command line for building tools that run inside Narai lessons, on the public
[`@michinarai/sdk`](https://github.com/Monster-Orange/mo-narai-sdk).

New to Narai tools? The course [Build a tool for Narai](https://beta.michinar.ai/go/course/narai-tools) teaches the
platform one step at a time, and [mo-narai-labs](https://github.com/Monster-Orange/mo-narai-labs) has Narai's own tools
to read.

## Install

```sh
npm install -g @michinarai/cli
narai --help
```

Node 20 or later. Or run any command without installing: `npx @michinarai/cli <command>`.

## Five minutes: a tool running in the harness

```sh
narai init hello --publisher you   # a new tool in ./hello, its id you/hello
cd hello
npm install                        # the SDK, from npm
npm run dev                        # builds it, then `narai dev`: open the host address it prints
```

The harness page is Narai's host, with your tool in a sandboxed frame on another origin, the way a lesson mounts it.
It shows every message the tool sends, with the verdict Narai's host would give it, and sends the manifest's
commands as the Tutor would. Change `src/tool.js`, run `npm run dev` again.

## Commands

Every command takes `--json`, `--yes` and `--no-input`. Results go to stdout, progress to stderr. Exit codes: 0 ok,
1 error, 2 usage, 3 auth. `--narai-url` (or `NARAI_URL`) picks the Narai to talk to; the default is
`https://beta.michinar.ai`.

**`narai init <name> --publisher <slug>`** writes a new tool from the template: `narai.tool.json` (the manifest), the
page (`src/`), its build, an `AGENTS.md` and a skill for a coding agent.

```sh
narai init fretboard --publisher you --dir tools/fretboard
```

**`narai validate`** checks `narai.tool.json` against the contract, as Narai's registry does: the schema, then what a
schema can't say (every payload named is declared, no answer carries a verdict, commands need an embed that runs the
SDK). It prints every reason, and the SDK's warnings.

```sh
narai validate --json
```

**`narai build`** seals a release after the tool's own build: every file in `dist/` with its sha256, and the bundle
digest, written into `dist/narai.tool.json`.

```sh
node scripts/build.mjs && narai build
```

**`narai dev`** runs the built tool in the local harness.

```sh
narai dev --locale ja --task task.json   # task.json: the task Narai would start it on ({id, kind, assist, prompt})
narai dev --preset preset.json --port 4000
```

**`narai login`** signs in to Narai in the browser. The answer comes back to this machine only (127.0.0.1), and the
session stays in the OS keychain. **`narai logout`** revokes it.

```sh
narai login            # or --no-browser, to print the address instead
narai logout
```

**`narai tools register`**, **`push`** and **`list`** work with Narai's registry; sign in first. `register` sets up your
publisher (once per organization) and the tool. `push` uploads the sealed build (`narai build`'s `dist/`) as a draft
version, once per version: the same build again changes nothing, and a different build under the same version is
refused (raise the version). Both plan, then apply after a confirmation. `--plan` only shows the changes, and with
`--detailed-exitcode` it exits 2 when there are some, 0 when there are none. In CI, set `NARAI_TOKEN` (a tool's token)
and pass `--yes`.

```sh
narai tools register --org "Your Org" --plan   # what would change
narai tools register
narai tools push
narai tools list --publisher you
```

Today a tool is self-hosted: `surfaces.embed.url` is its own `https://` address. Bundles hosted by Narai (a relative
`embed.url`, such as `index.html`) need a newer Narai. A command that reaches a Narai without the route it needs says
so and stops; it changes nothing.

## Develop

```sh
npm ci
npm test
npm run lint
npm run typecheck
```

## Stability

0.x: the contract (the manifest, the wire, the registry's API) can still change between minor versions, and the
changelog says how. 1.0 will hold it.

## Releasing

npm's trusted publishing only: no npm token, in CI or anywhere else. The workflow is `.github/workflows/release.yml`.

**Every release.** Merge a PR that bumps `version` in package.json (and says what changed in `CHANGELOG.md`): that's
the release. On every push to main, the workflow asks npm whether that version is published. When it isn't, the
workflow runs the gates, packs the tarball and its `SHA256SUMS`, tags the commit `v<version>`, **publishes** it on npm
over OIDC (`npm publish`), and makes a GitHub release with both files. A version already on npm: nothing happens.
There's no step for a person, no tag to push and nothing to approve.

**The first publish of the package, once.** Trusted publishing can't create a package, so a maintainer publishes the
first version (0.1.0) by hand, with one line, from a fresh clone of main:

```sh
rm -rf /tmp/narai-cli && git clone -q --depth 1 https://github.com/Monster-Orange/mo-narai-cli.git /tmp/narai-cli && cd /tmp/narai-cli && npm ci && npm test && npm login --auth-type=web && npm publish --access public && npm logout
```

Then, on npmjs.com, the package › Settings › Trusted publisher › GitHub Actions: organization `Monster-Orange`,
repository `mo-narai-cli`, workflow `release.yml`, allowed to publish directly; and Publishing access: **Require
two-factor authentication and disallow tokens**. Until the package exists, the workflow's check finds it missing and
stops with a warning (no failed run).

The CLI depends on `@michinarai/sdk` from npm, at one exact version: the workflow refuses a git, file or URL
dependency.

Mind:

- The trusted-publisher fields are case-sensitive, and npm doesn't check them when they're saved. A mismatch fails
  only at publish time, as an `E404` that looks like a missing package. package.json's `repository.url` must be this
  repository exactly.
- A new trusted-publisher configuration must publish within 2 days, or it expires.
- npm trusts the workflow by its file name, `release.yml`: renaming it breaks publishing (an `E404`) until the
  trusted publisher is changed to match.
- Provenance is on: npm generates it under trusted publishing for a public repository and a public package, with no
  flag. package.json's `repository.url` is what npm checks it against. The one-time first
  publish, from a maintainer's machine, has none.
