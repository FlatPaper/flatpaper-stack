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
  const exec = (event, extra = {}) =>
    spawnSync("node", [script, event], {
      input: JSON.stringify({ session_id: id, transcript_path: transcript, cwd, ...extra }),
      env: { PATH: process.env.PATH, HOME: home, TMPDIR: home, ...env },
      encoding: "utf8",
    });
  const run = (event, extra = {}) => {
    const r = exec(event, extra);
    assert.equal(r.status, 0);
    return r.stdout;
  };
  return { id, home, run, exec, write, lines };
}

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
  const env = { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "200000" };
  const s = session({ env, lines: [skillCall, assistant(20000), assistant(900000, { isSidechain: true })] });
  assert.equal(s.run("post-tool-use"), "");
});

test("a session that never used flatpaper-mode stays silent and is not marked notified", () => {
  const env = { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "200000" };
  const s = session({ env, lines: [assistant(190000)] });
  assert.equal(s.run("post-tool-use"), "");
  s.write([assistant(190000), skillCall, assistant(190000)]);
  assert.ok(s.run("post-tool-use"));
});

test("the slash command counts as using flatpaper-mode", () => {
  const slash = JSON.stringify({ type: "user", message: { content: `<command-name>/${SKILL}</command-name>` } });
  const s = session({ env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "200000" }, lines: [slash, assistant(190000)] });
  assert.ok(s.run("post-tool-use"));
});

test("session hook: off silences every mode", () => {
  const s = session({ models: "session hook: off\n", lines: [skillCall, assistant(190000)] });
  assert.equal(s.run("post-tool-use"), "");
  assert.equal(s.run("pre-compact"), "");
  for (const event of ["pre-compact-gate", "pre-compact-wake", "session-start-resume"]) {
    const r = s.exec(event, { trigger: "manual" });
    assert.deepEqual([r.status, r.stdout, r.stderr], [0, "", ""]);
  }
});

test("pre-compact prints the context file", () => {
  const s = session();
  assert.equal(s.run("pre-compact"), readFileSync(join(root, "hooks/pre-compact-context.md"), "utf8"));
});

const context = readFileSync(join(root, "hooks/pre-compact-context.md"), "utf8");
const manual = { trigger: "manual" };

test("announced compaction pauses, wakes once, allows the second /compact, then resumes once", () => {
  const s = session();
  const gate = s.exec("pre-compact-gate", manual);
  assert.equal(gate.status, 2);
  assert.match(gate.stderr, /pausing safely/);
  assert.equal(gate.stdout, "");

  const wake = s.exec("pre-compact-wake", manual);
  assert.equal(wake.status, 2);
  assert.match(wake.stderr, /Pause safely/);
  assert.match(wake.stderr, /-resume\.md/);
  assert.equal(s.exec("pre-compact-wake", manual).status, 0);

  const second = s.exec("pre-compact-gate", manual);
  assert.deepEqual([second.status, second.stdout], [0, context]);

  const resume = s.exec("session-start-resume", { source: "compact" });
  assert.equal(resume.status, 2);
  assert.match(resume.stderr, /flatpaper-stack:flatpaper-mode/);
  assert.match(resume.stderr, /-resume\.md/);
  assert.deepEqual([s.exec("session-start-resume").status, s.exec("session-start-resume").stderr], [0, ""]);
});

test("the wake and resume hooks stay silent when no pause was announced", () => {
  const s = session();
  for (const event of ["pre-compact-wake", "session-start-resume"]) {
    const r = s.exec(event, manual);
    assert.deepEqual([r.status, r.stdout, r.stderr], [0, "", ""]);
  }
});

test("an auto compaction is never blocked and prints the context", () => {
  const s = session();
  const r = s.exec("pre-compact-gate", { trigger: "auto" });
  assert.deepEqual([r.status, r.stdout], [0, context]);
  assert.equal(s.exec("pre-compact-wake", { trigger: "auto" }).status, 0);
});

test("a session that never used flatpaper-mode is not blocked", () => {
  const s = session({ lines: [assistant(1000)] });
  const r = s.exec("pre-compact-gate", manual);
  assert.deepEqual([r.status, r.stderr], [0, ""]);
  assert.equal(s.exec("pre-compact-wake", manual).status, 0);
  assert.equal(s.exec("session-start-resume").status, 0);
});

test("a pause older than 30 minutes is forgotten so the next /compact pauses again", () => {
  const s = session();
  assert.equal(s.exec("pre-compact-gate", manual).status, 2);
  const file = join(s.home, "flatpaper-stack", `${s.id}.json`);
  const state = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, JSON.stringify({ ...state, phaseAt: Date.now() - 31 * 60 * 1000 }));
  assert.equal(s.exec("pre-compact-gate", manual).status, 2);
});

test("a compaction that never resumed does not stop the next /compact from pausing", () => {
  const s = session();
  assert.equal(s.exec("pre-compact-gate", manual).status, 2);
  assert.equal(s.exec("pre-compact-gate", manual).status, 0);
  assert.equal(s.exec("pre-compact-gate", manual).status, 2);
});

test("a missing transcript or bad stdin exits 0 silently", () => {
  const home = mkdtempSync(join(tmpdir(), "flatpaper-guard-"));
  const env = { PATH: process.env.PATH, HOME: home };
  for (const input of ['{"session_id":"x","transcript_path":"/nope"}', "not json"]) {
    const r = spawnSync("node", [script, "post-tool-use"], { input, env, encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  }
});
