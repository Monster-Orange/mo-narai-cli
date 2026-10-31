// {{name}}: a Narai tool. It shows the learner something to do and reports what they did; Narai judges.
import { connect, pickLocale } from "@michinarai/sdk";

const $ = (id) => document.getElementById(id);
const manifest = await (await fetch("./narai.tool.json")).json();
// Only Narai's host may connect (NARAI_HOST_ORIGINS); a tool served from this machine (narai dev) also takes a local one.
const tool = await connect(manifest);

// Narai writes the prompt, in the learner's language; the tool shows it, never writes one.
$("prompt").textContent = tool.task?.prompt ?? "";
// the first of the learner's locales this tool has (manifest.locales), else its first
tool.ready(pickLocale(tool.start, manifest.locales));

$("say").onclick = () => {
  if (!tool.task) return;
  // what the learner did, in the payload the manifest declares for this task's kind: never whether it's right
  tool.answer({ schema: manifest.answers[tool.task.kind], text: $("text").value });
};
$("drill").onclick = () => {
  tool.practice("drill", { duration_s: 30, attempts: 1, payload: { schema: manifest.practice.drill, rounds: 1 } });
};
