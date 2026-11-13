#!/usr/bin/env node
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FULL_MARGIN = 40000;
const DEFAULT_WINDOW = 967000;
const DEFAULT_IDLE_MIN = 200000;
const MODE_SKILL = "flatpaper-stack:flatpaper-mode";

const checks = [
  {
    id: "idle",
    event: "stop",
    threshold: (settings, env) => {
      if (compactionOff(settings, env) || settings.idleCompaction === false) return null;
      return positive(env.CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS) ?? DEFAULT_IDLE_MIN;
    },
    message:
      "Context is over the idle-compaction minimum, so Claude Code will likely compact this session if it sits idle for an hour. " +
      "Run flatpaper-mode's Pause safely playbook now (playbooks/pause-safely.md), then stop.",
  },
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
  if (event === "stop" && input.stop_hook_active) return;
  if (event === "post-tool-use" && input.agent_id) return;
  const tokens = currentTokens(input.transcript_path);
  if (tokens === null) return;

  const settings = loadSettings(input.cwd);
  const env = { ...settings.env, ...process.env };
  const stateFile = join(tmpdir(), "flatpaper-stack", `${input.session_id}.json`);
  const state = existsSync(stateFile) ? readJson(stateFile) : {};
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

  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ ...state, notified: [...notified] }));
  if (!message) return;
  if (event === "stop") {
    console.log(JSON.stringify({ decision: "block", reason: message }));
  } else {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: message } }));
  }
}

function runSilently(fn) {
  try {
    fn();
  } catch {}
}

runSilently(() => {
  const event = process.argv[2];
  if (sessionHookOff()) return;
  if (event === "pre-compact") {
    process.stdout.write(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "pre-compact-context.md"), "utf8"));
  } else if (event === "stop" || event === "post-tool-use") {
    guard(event, JSON.parse(readFileSync(0, "utf8")));
  }
});
