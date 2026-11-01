# Building {{name}}, a Narai tool

A Narai tool is a small web app that Narai mounts in a lesson, in a sandboxed frame on its own origin. It shows the
learner an instrument and reports what the learner did. Narai keeps the answer keys, runs every judge and owns the
learner: a tool never grades, and a tool never learns who the learner is, unless the learner linked their account with
the tool's publisher and chose to let its tools know them.

## The rules

- `narai.tool.json` is the tool's only source of permissions. A command, an answer, a practice activity or a payload
  the manifest doesn't declare never crosses: the SDK refuses to send it and Narai refuses to take it.
- Every payload is `{ "schema": "<family>.<name>@<N>", ...body }`, and its body matches the JSON Schema declared under
  `payloads`.
- No verdict, ever: no `correct`, `score`, `passed`, `verdict`, `grade` (the list is the SDK's `VERDICT_KEYS`) in an
  answer's schema or body. Report what the learner did; Narai decides what it means.
- With `assist: honors`, a task whose `assist` is `none` gets no hints and no self-checks from the tool.
- `name` is what Narai shows the learner, by language (`{ "en": "Chord Wheel", "ja": "コードホイール" }`): add a
  language when the tool renders it.
- Show the task's `prompt` as Narai sends it; it is already in the learner's language. Say `ready` in the locale the
  tool actually renders.
- The microphone is the step's to grant, launch by launch: declare `capabilities.microphone: true`, and show its
  control only when `tool.start.granted` has `"microphone"`. `narai dev --grant microphone` simulates the grant.
- `tool.start.subject` is there only in that case, and only when the manifest declares `surfaces.account_link`: the
  learner's id with the publisher, never a name or an email. The tool works without it, and never shows it. Account
  linking is the SDK's `docs/account-linking.md`.
- Only the SDK talks to Narai (`connect`, `ready`, `answer`, `practice`, `onCommand`, `close`). No other `postMessage`,
  no network unless `capabilities.network` says so.

## The loop

```sh
npm install
npm run dev        # build, then the local harness: open the host address it prints
npm run validate   # the manifest against the contract
npm run build      # dist/, sealed: every file's sha256 and the bundle digest
```

`narai tools push` uploads a sealed build as a draft version. See the skill in `.claude/skills/narai-tool/`.
