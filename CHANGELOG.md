# Changelog

0.x: the contract (the manifest, the wire, the registry's API) can still change between minor versions; this file says
how. A version's entry lists what you have to change, first.

## 0.2.0

Nothing to change in a tool made by `narai init`. It runs on `@michinarai/sdk` 0.3.0 now, so its rules apply to
`narai validate`, among them: a slug is lower-case words joined by single hyphens, and a `music.*` payload Narai owns is
declared with `musicPayloads(...)` (the SDK's CHANGELOG has the list).

- `narai dev --grant microphone`: the harness starts the tool as a step that grants the microphone would
  (`tool.start.granted`), and frames it with the microphone allowed. As on Narai, only what the manifest's
  `capabilities` declare is granted; the rest is dropped, with a note. `--json` says what was granted.
- `narai init`'s template has a Listen button for the microphone, shown only when the start grants it.
- `narai validate` describes the rules it runs.

## 0.1.1

Nothing to change. The first release published from `main` by the release workflow, over npm's trusted publishing,
with provenance: from here on, merging a version bump is the release.

## 0.1.0

The first release.

- `narai init`: a new tool from the template (a manifest, a page, its build, an `AGENTS.md` and a skill), on
  `@michinarai/sdk` from npm. The tool connects with `connect(manifest)` and shows the learner's language with
  `pickLocale`.
- `narai validate`: the manifest against the contract, as Narai's registry checks it, with the SDK's warnings.
- `narai build`: a release sealed with every file's sha256 and the bundle digest.
- `narai dev`: the tool in the local harness, mounted as a lesson mounts it.
- `narai login` and `narai logout`: sign-in in the browser, the session in the OS keychain.
- `narai tools register`, `push` and `list`: the registry, planned and then applied (`--plan`, `--detailed-exitcode`,
  `NARAI_TOKEN` and `--yes` in CI). A route the Narai you reach doesn't serve yet stops the command, changing nothing
  (`not_served`).
- `narai tools tokens create`, `list` and `revoke`: a tool's CI tokens, for `NARAI_TOKEN`.
- Narai's address defaults to `https://beta.michinar.ai` (`--narai-url` or `NARAI_URL` for another).
