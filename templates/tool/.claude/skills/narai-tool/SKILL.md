---
name: narai-tool
description: Build, test and ship this Narai tool. Use when changing what the tool shows, what it reports (answers, practice), the commands it takes, or its manifest; and before pushing a version.
---

# Working on a Narai tool

1. Change the manifest first (`narai.tool.json`): declare every payload under `payloads` with a JSON Schema, map each
   task kind under `answers`, each activity under `practice`, each command under `commands`. Run `narai validate`.
2. Change the tool (`src/`). Send only through the SDK session: `tool.answer(payload)` for the task Narai started,
   `tool.practice(activity, { duration_s, attempts, payload })` outside a task, `tool.onCommand(name, fn)` for what the
   Tutor may ask. Never a verdict field.
3. Run it: `npm run dev`, open the host address. The harness shows every message and refuses what the manifest doesn't
   declare, with the reason. Send the manifest's commands from its panel. `--task task.json` starts it on a task.
4. Seal and ship: `npm run build` (writes `dist/narai.tool.json` with every file's sha256), then
   `narai tools push --plan` to see what would change, and `narai tools push` to upload the draft.
