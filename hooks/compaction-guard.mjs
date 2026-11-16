#!/usr/bin/env node
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FULL_MARGIN = 40000;
const DEFAULT_WINDOW = 967000;
const PAUSE_STALE_MS = 30 * 60 * 1000;
const WAKE_DELAY_MS = 1000;
const MODE_SKILL = "flatpaper-stack:flatpaper-mode";

const checks = [
  {
    id: "full",
    event: "post-tool-use",
    threshold: (settings, env) => {
      if (compactionOff(settings, env)) return null;
      const window = positive(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW) ?? positive(settings.autoCompactWindow) ?? DEFAULT_WINDOW;
      const pct = Number(env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE);
      const effective = pct >= 1 && pct <= 100 ? window * (pct / 100) : window;
      return effective - FULL_MARGIN;
    },
    message:
      "Context is nearly full and auto-compaction will run soon. " +
      "Finish the current atomic step, then run flatpaper-mode's Pause safely playbook (playbooks/pause-safely.md) before starting anything new.",
  },
];

function positive(value) {
  const n = Number(value);
  return n > 0 ? n : null;
}

function compactionOff(settings, env) {
  return settings.autoCompactEnabled === false || Boolean(env.DISABLE_AUTO_COMPACT);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function loadSettings(cwd) {
  const files = [join(homedir(), ".claude/settings.json")];
  if (cwd) files.push(join(cwd, ".claude/settings.json"), join(cwd, ".claude/settings.local.json"));
  const merged = { env: {} };
  for (const file of files) {
    const s = readJson(file);
    Object.assign(merged, s, { env: { ...merged.env, ...s.env } });
  }
  return merged;
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function contextSize(entry) {
  const u = entry.message.usage;
  return (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0);
}

function currentTokens(path) {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    for (let len = 512 * 1024; ; len *= 4) {
      const start = Math.max(0, size - len);
      const buf = Buffer.alloc(size - start);
      readSync(fd, buf, 0, buf.length, start);
      const lines = buf.toString("utf8").split("\n");
      if (start > 0) lines.shift();
      for (let i = lines.length - 1; i >= 0; i--) {
        const entry = parseLine(lines[i]);
        if (entry?.type === "assistant" && entry.isSidechain !== true && entry.message?.usage) return contextSize(entry);
      }
      if (start === 0) return null;
    }
  } finally {
    closeSync(fd);
  }
}

function invokesMode(line) {
  if (!line.includes(MODE_SKILL)) return false;
  if (line.includes(`<command-name>/${MODE_SKILL}</command-name>`)) return true;
  const content = parseLine(line)?.message?.content;
  return Array.isArray(content) && content.some((c) => c.type === "tool_use" && c.name === "Skill" && c.input?.skill === MODE_SKILL);
}

function advanceModeScan(path, state) {
  if (state.usedMode) return true;
  const from = state.scannedTo ?? 0;
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(Math.max(0, fstatSync(fd).size - from));
    readSync(fd, buf, 0, buf.length, from);
    const end = buf.lastIndexOf(0x0a) + 1;
    state.scannedTo = from + end;
    state.usedMode = buf.subarray(0, end).toString("utf8").split("\n").some(invokesMode);
  } finally {
    closeSync(fd);
  }
  return state.usedMode;
}

function sessionHookOff() {
  const models = join(homedir(), ".claude/flatpaper-stack/models.md");
  try {
    return /^[ \t]*session hook:[ \t]*off[ \t]*$/im.test(readFileSync(models, "utf8"));
  } catch {
    return false;
  }
}

function guard(event, input) {
  if (event === "post-tool-use" && input.agent_id) return;
  const tokens = currentTokens(input.transcript_path);
  if (tokens === null) return;

  const settings = loadSettings(input.cwd);
  const env = { ...settings.env, ...process.env };
  const state = loadState(input.session_id);
  const notified = new Set(state.notified ?? []);

  let message = null;
  for (const check of checks.filter((c) => c.event === event)) {
    const threshold = check.threshold(settings, env);
    if (threshold === null || tokens < threshold) {
      notified.delete(check.id);
    } else if (!notified.has(check.id) && advanceModeScan(input.transcript_path, state)) {
      notified.add(check.id);
      message = check.message;
    }
  }

  saveState(input.session_id, { ...state, notified: [...notified] });
  if (message) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: message } }));
}

const stateDir = () => join(tmpdir(), "flatpaper-stack");
const notePath = (id) => join(stateDir(), `${id}-resume.md`);

function loadState(id) {
  const file = join(stateDir(), `${id}.json`);
  const state = existsSync(file) ? readJson(file) : {};
  if (state.phase === "pausing" && Date.now() - state.phaseAt > PAUSE_STALE_MS) return { ...state, phase: "none", woken: false };
  return state;
}

function saveState(id, state) {
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(join(stateDir(), `${id}.json`), JSON.stringify(state));
}

const contextText = () => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "pre-compact-context.md"), "utf8");

const TRANSITIONS = {
  "pre-compact-gate": { none: ["pausing", 2], pausing: ["compacting", 0], compacting: ["pausing", 2] },
  "pre-compact-wake": { pausing: ["pausing", 2] },
  "session-start-resume": { compacting: ["none", 2] },
};

function advance(event, input) {
  const state = loadState(input.session_id);
  const phase = state.phase ?? "none";
  const row = TRANSITIONS[event][phase];
  if (!row) return { code: 0 };
  if (event === "pre-compact-wake" && state.woken) return { code: 0 };
  const [next, code] = row;
  saveState(input.session_id, { ...state, phase: next, phaseAt: Date.now(), woken: event === "pre-compact-wake" });
  return { code, phase: next };
}

const PROMPTS = {
  "pre-compact-gate": "flatpaper-stack: pausing safely before compaction. Run /compact again once Claude says it's ready.",
  "pre-compact-wake": (id) =>
    "The user requested compaction. Run flatpaper-mode's Pause safely playbook (playbooks/pause-safely.md). " +
    `Write the resume note to ${notePath(id)}, then tell the user it is ready for /compact.`,
  "session-start-resume": (id) =>
    "Compaction finished. Invoke flatpaper-stack:flatpaper-mode, then read " +
    `${notePath(id)} (or the resume section of the summary if that file is missing). ` +
    "Rebuild the task list with TaskList and continue from the first next step without waiting for the user, unless the user had asked you to stop there.",
};

function announced(event, input) {
  if (event === "pre-compact-gate" && input.trigger !== "manual") {
    process.stdout.write(contextText());
    return 0;
  }
  if (event === "pre-compact-gate" && !advanceModeScan(input.transcript_path, loadState(input.session_id))) {
    process.stdout.write(contextText());
    return 0;
  }
  const { code, phase } = advance(event, input);
  if (code === 2) {
    const prompt = PROMPTS[event];
    process.stderr.write(typeof prompt === "function" ? prompt(input.session_id) : prompt);
  } else if (event === "pre-compact-gate" && phase === "compacting") {
    process.stdout.write(contextText());
  }
  return code;
}

async function main() {
  const event = process.argv[2];
  if (sessionHookOff()) return 0;
  if (event === "pre-compact") {
    process.stdout.write(contextText());
    return 0;
  }
  const input = event === "post-tool-use" || event in TRANSITIONS ? JSON.parse(readFileSync(0, "utf8")) : null;
  if (event === "post-tool-use") {
    guard(event, input);
    return 0;
  }
  if (event === "pre-compact-wake") await new Promise((resolve) => setTimeout(resolve, WAKE_DELAY_MS));
  return event in TRANSITIONS ? announced(event, input) : 0;
}

main().then(
  (code) => process.exit(code),
  () => process.exit(0),
);
