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

// say what happened: a button that does nothing looks broken
const status = (text) => { $("status").textContent = text; };

$("say").onclick = () => {
  // a launch with no task (practice) has nothing to answer
  if (!tool.task) return status("No task to answer: in a lesson, Narai starts one. Practice still works.");
  // what the learner did, in the payload the manifest declares for this task's kind: never whether it's right
  tool.answer({ schema: manifest.answers[tool.task.kind], text: $("text").value });
  status("Answer sent: Narai judges it.");
};
$("drill").onclick = () => {
  tool.practice("drill", { duration_s: 30, attempts: 1, payload: { schema: manifest.practice.drill, rounds: 1 } });
  status("Practice sent.");
};

// The microphone is the step's to grant, launch by launch (tool.start.granted), and only when the manifest declares it
// (capabilities.microphone: true). Without the grant the frame can't open it: show no control for it.
if (tool.start.granted?.includes("microphone")) {
  $("mic").hidden = false;
  $("mic").onclick = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // listen here, then report what was played (an answer payload such as music.played@1), never whether it's right
    stream.getTracks().forEach((t) => t.stop());
  };
}
