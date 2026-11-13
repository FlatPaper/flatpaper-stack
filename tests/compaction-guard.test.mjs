import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "hooks/compaction-guard.mjs");
const SKILL = "flatpaper-stack:flatpaper-mode";

const assistant = (tokens, extra = {}) =>
  JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 1, cache_read_input_tokens: tokens - 3, cache_creation_input_tokens: 1, output_tokens: 1 } }, ...extra });
const skillCall = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: SKILL } }] } });

function session({ lines = [skillCall], models, settings, projectSettings, env = {} } = {}) {
  const home = mkdtempSync(join(tmpdir(), "flatpaper-guard-"));
  const cwd = join(home, "project");
  mkdirSync(join(home, ".claude/flatpaper-stack"), { recursive: true });
  mkdirSync(join(cwd, ".claude"), { recursive: true });
  if (models) writeFileSync(join(home, ".claude/flatpaper-stack/models.md"), models);
  if (settings) writeFileSync(join(home, ".claude/settings.json"), JSON.stringify(settings));
  if (projectSettings) writeFileSync(join(cwd, ".claude/settings.json"), JSON.stringify(projectSettings));
  const transcript = join(home, "t.jsonl");
  const id = `s-${Math.random().toString(36).slice(2)}`;
  const write = (l) => writeFileSync(transcript, l.join("\n") + "\n");
  write(lines);
  const run = (event, extra = {}) => {
    const r = spawnSync("node", [script, event], {
      input: JSON.stringify({ session_id: id, transcript_path: transcript, cwd, ...extra }),
      env: { PATH: process.env.PATH, HOME: home, ...env },
      encoding: "utf8",
    });
    assert.equal(r.status, 0);
    return r.stdout;
  };
  return { run, write, lines };
}

const idleEnv = { CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS: "100000" };

test("idle check blocks the stop once per crossing and re-arms after a drop", () => {
  const s = session({ env: idleEnv });
  s.write([skillCall, assistant(150000)]);
  const out = JSON.parse(s.run("stop"));
  assert.equal(out.decision, "block");
  assert.match(out.reason, /Pause safely/);
  assert.equal(s.run("stop"), "");
  s.write([skillCall, assistant(150000), assistant(20000)]);
  assert.equal(s.run("stop"), "");
  s.write([skillCall, assistant(20000), assistant(150000)]);
  assert.equal(JSON.parse(s.run("stop")).decision, "block");
});

test("idle check stays below its minimum", () => {
  const s = session({ env: idleEnv, lines: [skillCall, assistant(90000)] });
  assert.equal(s.run("stop"), "");
});

test("idle check never blocks when a stop hook already continued the turn", () => {
  const s = session({ env: idleEnv, lines: [skillCall, assistant(150000)] });
  assert.equal(s.run("stop", { stop_hook_active: true }), "");
  assert.equal(JSON.parse(s.run("stop")).decision, "block");
});

test("idle check is off through the setting, autoCompactEnabled, and DISABLE_AUTO_COMPACT", () => {
  const lines = [skillCall, assistant(150000)];
  assert.equal(session({ env: idleEnv, lines, settings: { idleCompaction: false } }).run("stop"), "");
  assert.equal(session({ env: idleEnv, lines, settings: { autoCompactEnabled: false } }).run("stop"), "");
  assert.equal(session({ env: { ...idleEnv, DISABLE_AUTO_COMPACT: "1" }, lines }).run("stop"), "");
});

test("the idle minimum comes from a settings env block and defaults to 200000", () => {
  const lines = [skillCall, assistant(150000)];
  assert.equal(JSON.parse(session({ lines, projectSettings: { env: idleEnv } }).run("stop")).decision, "block");
  assert.equal(session({ lines }).run("stop"), "");
  assert.equal(JSON.parse(session({ lines: [skillCall, assistant(210000)] }).run("stop")).decision, "block");
});

test("full check adds context 40000 tokens below the window, once per crossing", () => {
  const s = session({ env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "200000" }, lines: [skillCall, assistant(150000)] });
  assert.equal(s.run("post-tool-use"), "");
  s.write([skillCall, assistant(165000)]);
  const out = JSON.parse(s.run("post-tool-use"));
  assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(out.hookSpecificOutput.additionalContext, /Pause safely/);
  assert.equal(s.run("post-tool-use"), "");
  s.write([skillCall, assistant(10000)]);
  assert.equal(s.run("post-tool-use"), "");
  s.write([skillCall, assistant(170000)]);
  assert.ok(s.run("post-tool-use"));
});

test("the window from the environment beats the setting", () => {
  const lines = [skillCall, assistant(165000)];
  const settings = { autoCompactWindow: 100000 };
  assert.ok(session({ settings, lines }).run("post-tool-use"));
  assert.equal(session({ settings, lines, env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "500000" } }).run("post-tool-use"), "");
});

test("the percent override lowers the window and a disabled auto-compact silences the check", () => {
  const lines = [skillCall, assistant(100000)];
  const env = { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "200000", CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "50" };
  assert.ok(session({ lines, env }).run("post-tool-use"));
  assert.equal(session({ lines, env, settings: { autoCompactEnabled: false } }).run("post-tool-use"), "");
});

test("tool calls inside a subagent are skipped", () => {
  const s = session({ env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "200000" }, lines: [skillCall, assistant(190000)] });
  assert.equal(s.run("post-tool-use", { agent_id: "a1" }), "");
  assert.ok(s.run("post-tool-use"));
});

test("sidechain assistant lines do not count toward the context size", () => {
  const s = session({ env: idleEnv, lines: [skillCall, assistant(20000), assistant(900000, { isSidechain: true })] });
  assert.equal(s.run("stop"), "");
});

test("a session that never used flatpaper-mode stays silent and is not marked notified", () => {
  const s = session({ env: idleEnv, lines: [assistant(150000)] });
  assert.equal(s.run("stop"), "");
  s.write([assistant(150000), skillCall, assistant(150000)]);
  assert.equal(JSON.parse(s.run("stop")).decision, "block");
});

test("the slash command counts as using flatpaper-mode", () => {
  const slash = JSON.stringify({ type: "user", message: { content: `<command-name>/${SKILL}</command-name>` } });
  const s = session({ env: idleEnv, lines: [slash, assistant(150000)] });
  assert.equal(JSON.parse(s.run("stop")).decision, "block");
});

test("session hook: off silences every mode", () => {
  const s = session({ env: idleEnv, models: "session hook: off\n", lines: [skillCall, assistant(150000)] });
  assert.equal(s.run("stop"), "");
  assert.equal(s.run("post-tool-use"), "");
  assert.equal(s.run("pre-compact"), "");
});

test("pre-compact prints the context file", () => {
  const s = session();
  assert.equal(s.run("pre-compact"), readFileSync(join(root, "hooks/pre-compact-context.md"), "utf8"));
});

test("a missing transcript or bad stdin exits 0 silently", () => {
  const home = mkdtempSync(join(tmpdir(), "flatpaper-guard-"));
  const env = { PATH: process.env.PATH, HOME: home };
  for (const input of ['{"session_id":"x","transcript_path":"/nope"}', "not json"]) {
    const r = spawnSync("node", [script, "stop"], { input, env, encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  }
});
