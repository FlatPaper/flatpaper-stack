import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "skills/flatpaper-mode/scripts/codex-run.sh");
const usage = "Usage: codex-run.sh <cwd> <model|default> <effort> <prompt-file> [read-only]\n";

function fixture(t, { versions = ["1.0.2", "1.0.10", "1.0.9"], exitCode = 0, promptName = "brief draft.md" } = {}) {
  const home = mkdtempSync(join(tmpdir(), "flatpaper-codex-run-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const cwd = join(home, "project.with spaces");
  mkdirSync(cwd);
  const prompt = join(cwd, promptName);
  writeFileSync(prompt, "Inspect the project.\n");
  const log = join(cwd, promptName.replace(/\.[^.]*$/, "") + ".codex.log");
  for (const version of versions) {
    const companion = join(home, ".claude/plugins/cache/openai-codex/codex", version, "scripts/codex-companion.mjs");
    mkdirSync(dirname(companion), { recursive: true });
    writeFileSync(companion, `
import { readFileSync } from "node:fs";
const input = readFileSync(0, "utf8");
console.log(JSON.stringify({ version: ${JSON.stringify(version)}, argv: process.argv.slice(2), stdinEOF: true, input }));
console.error("companion progress");
process.exit(${exitCode});
`);
  }
  const args = [cwd, "gpt-5.4", "high", prompt];
  const options = { env: { ...process.env, HOME: home }, encoding: "utf8", timeout: 5000 };
  const run = (argv = args) => {
    const result = spawnSync(script, argv, options);
    assert.ifError(result.error);
    return result;
  };
  const expected = ["task", "--cwd", cwd, "--effort", "high", "--prompt-file", prompt];
  return { home, cwd, prompt, log, args, options, run, expected };
}

test("picks version 1.0.10 over 1.0.9 and 1.0.2", (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).version, "1.0.10");
});

test("write mode passes the exact argv", (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout).argv, [...f.expected, "--model", "gpt-5.4", "--write"]);
});

test("read-only mode passes the exact argv without --write", (t) => {
  const f = fixture(t);
  const result = f.run([...f.args, "read-only"]);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout).argv, [...f.expected, "--model", "gpt-5.4"]);
});

test("default model passes the exact argv without --model", (t) => {
  const f = fixture(t);
  const result = f.run([f.cwd, "default", "high", f.prompt]);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout).argv, [...f.expected, "--write"]);
});

test("stdout contains only companion output and progress appends to the log", (t) => {
  const f = fixture(t);
  writeFileSync(f.log, "earlier progress\n");
  const result = f.run();
  assert.equal(result.status, 0);
  assert.equal(result.stdout, JSON.stringify({
    version: "1.0.10", argv: [...f.expected, "--model", "gpt-5.4", "--write"], stdinEOF: true, input: "",
  }) + "\n");
  assert.equal(result.stderr, `codex progress log: ${f.log}\n`);
  assert.equal(readFileSync(f.log, "utf8"), "earlier progress\ncompanion progress\n");
});

test("extensionless prompt in a dotted directory gets a .codex.log suffix", (t) => {
  const f = fixture(t, { promptName: "brief" });
  const result = f.run();
  assert.equal(result.status, 0);
  assert.equal(result.stderr, `codex progress log: ${f.log}\n`);
  assert.equal(readFileSync(f.log, "utf8"), "companion progress\n");
});

test("regression: an unclosed stdin pipe still gives the companion immediate EOF", { timeout: 10000 }, async (t) => {
  const f = fixture(t);
  const child = spawn(script, f.args, { ...f.options, timeout: undefined, stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => child.kill("SIGKILL"));
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => (stdout += data));
  child.stderr.on("data", (data) => (stderr += data));
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("timed out waiting for EOF with the parent stdin pipe still open"));
    }, 3000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (status) => { clearTimeout(timer); resolve(status); });
  });
  assert.equal(code, 0, stderr);
  assert.equal(child.stdin.writableEnded, false);
  assert.equal(JSON.parse(stdout).stdinEOF, true);
  assert.equal(JSON.parse(stdout).input, "");
});

test("companion exit code passes through", (t) => {
  const f = fixture(t, { exitCode: 37 });
  assert.equal(f.run().status, 37);
});

test("three arguments produce a one-line usage error and exit 2", (t) => {
  const f = fixture(t);
  const result = f.run(f.args.slice(0, 3));
  assert.deepEqual([result.status, result.stdout, result.stderr], [2, "", usage]);
});

test("a bad fifth argument produces a one-line usage error and exit 2", (t) => {
  const f = fixture(t);
  const result = f.run([...f.args, "--background"]);
  assert.deepEqual([result.status, result.stdout, result.stderr], [2, "", usage]);
});

test("a missing companion names the path pattern and exits 1", (t) => {
  const f = fixture(t, { versions: [] });
  const result = f.run();
  assert.deepEqual([result.status, result.stdout, result.stderr], [1, "",
    `error: no companion found at ${f.home}/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs\n`]);
});
