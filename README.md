# @narai/cli

`narai`: the command line for building tools that run inside Narai lessons, on the public `@narai/sdk`.

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
