# @michinarai/cli

`narai`: the command line for building tools that run inside Narai lessons, on the public `@michinarai/sdk`.

- `narai login`: sign in to Narai (in the browser; the session stays in the OS keychain).
- `narai init`: a new tool from the template, with its `AGENTS.md` and skills.
- `narai validate`: the manifest against the contract, as Narai's registry checks it.
- `narai build`: the release, with a sha256 digest of every file.
- `narai dev`: the tool in the local harness, mounted as a lesson mounts it.
- `narai tools register | push | list`: the registry, with plan and apply.

Every command takes `--json`, `--yes` and `--no-input`. Results go to stdout, progress to stderr. Exit codes: 0 ok,
1 error, 2 usage, 3 auth.

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

**Every release.** Set `version` in package.json, merge it, and push the tag `v<version>`. The workflow runs the
gates, packs the tarball and its `SHA256SUMS`, and **stages** it on npm over OIDC (`npm stage publish`). It also makes
a GitHub release with both files. Nothing is public until a maintainer approves it on npm, with 2FA:

```sh
npm stage list @michinarai/cli
npm stage approve <stage-id>
```

**Before the first release**, the CLI must depend on `@michinarai/sdk` from npm: the workflow refuses a git, file
or URL dependency, so publish the SDK first and move the dependency to its version.

**The first publish of the package, once.** Trusted publishing can't create a package, so a maintainer publishes the first
version by hand from his machine:

1. Run the workflow by hand (Actions › release › Run workflow). It's a dry run, and it keeps the tarball and
   `SHA256SUMS` as the `release` artifact. Download it.
2. In that folder: `sha256sum -c SHA256SUMS` (on a Mac, `shasum -a 256 -c SHA256SUMS`), then
   `npm login --auth-type=web && npm publish <tarball> --access public && npm logout`.
3. On npmjs.com, the package › Settings › Trusted publisher › GitHub Actions: organization `Monster-Orange`, repository
   `mo-narai-cli`, workflow `release.yml`, with staged publishing allowed. Or, with npm 11.15 or later:
   `npm trust github @michinarai/cli --file release.yml --repo Monster-Orange/mo-narai-cli --allow-stage-publish`.
4. The same page › Publishing access: **Require two-factor authentication and disallow tokens**. Trusted publishing
   still works.

Mind:

- The trusted-publisher fields are case-sensitive, and npm doesn't check them when they're saved. A mismatch fails
  only at publish time, as an `E404` that looks like a missing package. package.json's `repository.url` must be this
  repository exactly.
- A new trusted-publisher configuration must publish (or stage) within 2 days, or it expires.
- Provenance is on: npm generates it under trusted publishing for a public repository and a public package, with no
  flag, staged releases included. package.json's `repository.url` is what npm checks it against. The one-time first
  publish, from a maintainer's machine, has none.
