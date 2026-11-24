import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFileSync, closeSync, mkdtempSync, mkdirSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "hooks/delegation-guard.mjs");
const marker = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "flatpaper-stack:flatpaper-mode" } }] } });
const slash = JSON.stringify({ type: "user", message: { content: "<command-name>/flatpaper-stack:flatpaper-mode</command-name>" } });

function session(t, { active = true, env = {}, lines, nodeArgs = [], timeout = 5000 } = {}) {
  const home = mkdtempSync(join(tmpdir(), "flatpaper-delegation-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const cwd = join(home, "project");
  mkdirSync(cwd);
  const git = (...args) => {
    const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  git("init", "--quiet");
  writeFileSync(join(cwd, "tracked.txt"), "tracked\n");
  writeFileSync(join(cwd, ".gitignore"), "ignored/\n");
  git("add", "tracked.txt", ".gitignore");
  const transcript = join(home, "transcript.jsonl");
  writeFileSync(transcript, (lines ?? (active ? [marker] : [JSON.stringify({ type: "user", message: { content: "hello" } })])).join("\n") + "\n");
  const input = { session_id: "test-session", transcript_path: transcript, cwd };
  const run = (tool_name, tool_input, extra = {}) => {
    const r = spawnSync("node", [...nodeArgs, script], {
      input: typeof extra === "string" ? extra : JSON.stringify({ ...input, tool_name, tool_input, ...extra }),
      env: { PATH: process.env.PATH, HOME: home, TMPDIR: home, ...env },
      encoding: "utf8",
      timeout,
      killSignal: "SIGKILL",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
    return r.stdout;
  };
  return { cwd, home, transcript, run };
}

function denied(output, kind = "lookup") {
  const parsed = JSON.parse(output || "null");
  assert.ok(parsed, "expected a denial JSON response");
  const reason = parsed.hookSpecificOutput?.permissionDecisionReason;
  assert.equal(typeof reason, "string");
  assert.deepEqual(parsed, { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });
  assert.ok(reason.includes(kind === "edit"
    ? "Delegate this edit to a subagent on the step's role in the models file (trivial edits for cleanup)"
    : "Delegate this lookup to a read-only `how explorer` seat per references/spawning.md, or read a bounded range with limit"));
  assert.ok(reason.includes("FLATPAPER_DELEGATION_GUARD=off"));
}

test("subagent calls are allowed", (t) => {
  assert.equal(session(t).run("Edit", { file_path: "tracked.txt" }, { agent_id: "a1" }), "");
});
test("sessions without an active run are allowed", (t) => {
  assert.equal(session(t, { active: false }).run("Edit", { file_path: "tracked.txt" }), "");
});
test("the environment switch allows calls", (t) => {
  assert.equal(session(t, { env: { FLATPAPER_DELEGATION_GUARD: "off" } }).run("Edit", { file_path: "tracked.txt" }), "");
});
test("malformed input fails open", (t) => {
  assert.equal(session(t).run("Edit", {}, "{invalid"), "");
});
for (const tool of ["Edit", "Write", "NotebookEdit"]) {
  test(`${tool} of a tracked product file is denied`, (t) => {
    const s = session(t);
    denied(s.run(tool, { [tool === "NotebookEdit" ? "notebook_path" : "file_path"]: join(s.cwd, "tracked.txt") }), "edit");
  });
}
test("Write to an ignored path is allowed", (t) => {
  assert.equal(session(t).run("Write", { file_path: "ignored/new/file.txt" }), "");
});
test("Write outside any working tree is allowed", (t) => {
  const s = session(t);
  assert.equal(s.run("Write", { file_path: join(s.home, "scratch.txt") }), "");
});
test("top-level todo.md is allowed", (t) => {
  assert.equal(session(t).run("Write", { file_path: "todo.md" }), "");
});
for (const [command, match] of [
  ["find .", "find"],
  ["echo hi # don't edit\nfind . -name '*.mjs'", "find"],
  ["cat <<EOF\nHere's the fix\nEOF\nfind .", "find"],
  ['"$(find .)"', "find"],
  ["`find .`", "find"],
  ["sudo find .", "find"],
  ['bash -c "find ."', "find"],
  ["xargs find", "find"],
  ['git commit -m "find the bug"', "find"],
  ["rg x", "rg"],
  ["fd x", "fd"],
  ["git grep x", "git grep"],
  ["git -C sub grep x", "git grep"],
  ["git -c color.ui=never -C sub grep x", "git grep"],
  ["git\tgrep x", "git grep"],
  ['git "grep" x', "git grep"],
  ["'git' grep x", "git grep"],
  ["grep -rn x .", "recursive grep"],
  ["grep -R x .", "recursive grep"],
  ["grep -Rl x .", "recursive grep"],
  ["grep -refoo.bar .", "recursive grep"],
  ["grep -rf.patterns .", "recursive grep"],
  ["grep --recurs x .", "recursive grep"],
  ["grep --recursive x", "recursive grep"],
  ["grep -d recurse needle tree", "recursive grep"],
  ["grep --directories=recurse needle tree", "recursive grep"],
  ["grep --dereference-recursive x", "recursive grep"],
  ["grep x . -r", "recursive grep"],
  ["ls -1R", "recursive ls"],
  ["grep -2r", "recursive grep"],
  ["\\find", "find"],
  ["find>list", "find"],
  ['git -C "$(pwd)" grep x', "git grep"],
  ["grep -E '(a|b)' -r tree", "recursive grep"],
  ['grep x "$(pwd)/tree" -r', "recursive grep"],
  ["git status; grep -n x f", "git grep"],
  ["grep -eerror.code f", "recursive grep"],
  ["grep --recursive-extra x", "recursive grep"],
  ["ls --recursive-extra", "recursive ls"],
  ["ls -lR", "recursive ls"],
  ["ls --recursive", "recursive ls"],
  ["ls -R", "recursive ls"],
  ["npm test && rg x", "rg"],
  ["/usr/bin/find .", "find"],
  ["printf 'rg x'", "rg"],
  ["echo find", "find"],
  ['git commit -m "subject\nfind the bug"', "find"],
  ["git commit -F - <<'EOF'\nRepair the guard\nDelegate find commands\nEOF", "find"],
  ["echo hi # && find .", "find"],
  ["echo a#b && find .", "find"],
  ['echo "# <<EOF" && find .', "find"],
  ["echo hi && \\\nfind .", "find"],
]) {
  test(`Bash denies ${JSON.stringify(command)} with a match and workaround`, (t) => {
    const output = session(t).run("Bash", { command });
    denied(output);
    const reason = JSON.parse(output).hookSpecificOutput.permissionDecisionReason;
    assert.ok(reason.startsWith(`Matched ${match}.`), reason);
    assert.ok(reason.includes("The guard matches words anywhere in the command. If the word is in a commit message or PR body, write the text to a file and pass it with `git commit -F <file>` or `--body-file <file>`. To search one file, use the Grep tool with that file's path. If two commands in one line tripped this, run them as separate Bash calls."), reason);
  });
}
for (const command of [
  "git commit -F msg.txt",
  "gh pr create --body-file b.md",
  "cat <<'EOF'\nRepair; fix the bug\nEOF",
  "grep -n x f",
  "git diff --find-renames",
  "git log --find-copies",
  "curl https://example.com/path?q=value",
  "git diff",
  "npm test",
  "echo findings",
  "node find.js",
  "echo fd-tool",
  "echo rgb",
  "echo --find",
  "echo _find find_ find2 2find find-more more-find .find find.",
  "echo rg-tool tool-rg rg.js _rg rg2 fd.js _fd fd2",
  "ls -la",
  "git log --oneline",
  "gh pr view 1",
  "gh pr list | grep x",
  "grep x file.txt",
  "ls -l",
  "grep -n x file-r",
  "grep -n x --r",
  "ls -r",
  "echo my-git grep x",
  "echo my-grep -r x",
  "echo my-ls -R",
  "fi\\\nnd .",
  "'fi\\\nnd' .",
]) {
  test(`Bash allows ${JSON.stringify(command)}`, (t) => assert.equal(session(t).run("Bash", { command }), ""));
}
for (const word of ["grep ", "git - "]) {
  test(`Bash decides 1 MiB of repeated ${JSON.stringify(word)} within one second`, (t) => {
    const s = session(t, { timeout: 1000 });
    denied(s.run("Bash", { command: "rg x" }));
    const size = 1024 * 1024;
    const command = word.repeat(Math.ceil(size / word.length)).slice(0, size);
    const start = performance.now();
    try {
      assert.equal(s.run("Bash", { command }), "");
      assert.ok(performance.now() - start < 1000, "hook must exit within one second");
    } finally {
      t.diagnostic(`1 MiB ${JSON.stringify(word)} took ${(performance.now() - start).toFixed(1)} ms`);
    }
  });
}
for (const [count, limit, block] of [[301, undefined, true], [301, 20, false], [300, undefined, false]]) {
  test(`Read of ${count} lines ${limit === undefined ? "without limit" : "with limit"} is ${block ? "denied" : "allowed"}`, (t) => {
    const s = session(t);
    writeFileSync(join(s.cwd, "large.txt"), "line\n".repeat(count));
    const output = s.run("Read", { file_path: "large.txt", ...(limit === undefined ? {} : { limit }) });
    if (block) denied(output);
    else assert.equal(output, "");
  });
}
test("images, PDFs, and binary files are allowed", (t) => {
  const s = session(t);
  for (const name of ["image.png", "document.pdf", "data.bin"]) {
    writeFileSync(join(s.cwd, name), Buffer.from("\0\n".repeat(400)));
    assert.equal(s.run("Read", { file_path: name }), "");
  }
});
test("missing transcripts and files fail open", (t) => {
  const s = session(t);
  assert.equal(s.run("Read", { file_path: "missing.txt" }), "");
  assert.equal(s.run("Edit", { file_path: "tracked.txt" }, { transcript_path: join(s.home, "missing.jsonl") }), "");
});
test("slash-command markers activate the guard", (t) => {
  denied(session(t, { lines: [slash] }).run("Edit", { file_path: "tracked.txt" }), "edit");
});
test("an appended marker activates the same session", (t) => {
  const s = session(t, { active: false });
  assert.equal(s.run("Bash", { command: "rg x" }), "");
  appendFileSync(s.transcript, marker + "\n");
  denied(s.run("Bash", { command: "rg x" }));
});
test("partial transcript lines are scanned when completed", (t) => {
  const s = session(t, { active: false });
  appendFileSync(s.transcript, marker.slice(0, 30));
  assert.equal(s.run("Bash", { command: "rg x" }), "");
  appendFileSync(s.transcript, marker.slice(30) + "\n");
  denied(s.run("Bash", { command: "rg x" }));
});
test("nested todo.md and new product files are denied", (t) => {
  const s = session(t);
  for (const file_path of ["nested/todo.md", "new/file.txt"]) denied(s.run("Write", { file_path }), "edit");
});
test("the hook is registered for the guarded tools", () => {
  const config = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8"));
  assert.ok(config.hooks.PreToolUse?.some((entry) => entry.matcher === "Edit|Write|NotebookEdit|Bash|Read|Grep|Glob"
    && entry.hooks.some((hook) => hook.type === "command" && hook.command.includes("/hooks/delegation-guard.mjs") && hook.timeout === 5)));
});
test("non-UTF-8 binary files without NUL bytes are allowed", (t) => {
  const s = session(t);
  writeFileSync(join(s.cwd, "binary.dat"), Buffer.concat([Buffer.from([0xff]), Buffer.from("line\n".repeat(301))]));
  assert.equal(s.run("Read", { file_path: "binary.dat" }), "");
});
test("Read counts the final line without a trailing newline", (t) => {
  const s = session(t);
  writeFileSync(join(s.cwd, "large.txt"), "line\n".repeat(300) + "last");
  denied(s.run("Read", { file_path: "large.txt" }));
});
test("symlinks to product files cannot use the todo.md exception", (t) => {
  const s = session(t);
  symlinkSync(join(s.cwd, "tracked.txt"), join(s.cwd, "todo.md"));
  denied(s.run("Edit", { file_path: "todo.md" }), "edit");
});
test("unwritable cache locations fail open", (t) => {
  const s = session(t);
  writeFileSync(join(s.home, "flatpaper-stack"), "not a directory");
  assert.equal(s.run("Edit", { file_path: "tracked.txt" }), "");
});
test("active mode state does not leak into another session", (t) => {
  const s = session(t);
  denied(s.run("Edit", { file_path: "tracked.txt" }), "edit");
  const transcript_path = join(s.home, "another.jsonl");
  writeFileSync(transcript_path, "{}\n");
  assert.equal(s.run("Edit", { file_path: "tracked.txt" }, { session_id: "another-session", transcript_path }), "");
});

for (const delimiter of ["EOF", "'EOF'", '"EOF"', "-EOF"]) {
  test(`Bash denies a search word in a <<${delimiter} commit heredoc with a file hint`, (t) => {
    const tabs = delimiter.startsWith("-") ? "\t" : "";
    const output = session(t).run("Bash", { command: `git commit -F - <<${delimiter}\n${tabs}find the bug\n${tabs}EOF` });
    denied(output);
    assert.ok(JSON.parse(output).hookSpecificOutput.permissionDecisionReason.includes(
      "If the word is in a commit message or PR body, write the text to a file and pass it with `git commit -F <file>` or `--body-file <file>`."));
  });
}
test("Bash denies a find command with a heredoc", (t) => {
  denied(session(t).run("Bash", { command: "find . <<'EOF'\nmessage\nEOF" }));
});
test("Grep without a path is denied", (t) => {
  denied(session(t).run("Grep", { pattern: "x" }));
});
test("Grep on a directory is denied", (t) => {
  denied(session(t).run("Grep", { pattern: "x", path: "." }));
});
test("Grep on a single file is allowed", (t) => {
  assert.equal(session(t).run("Grep", { pattern: "x", path: "tracked.txt" }), "");
});
test("Glob is allowed", (t) => {
  assert.equal(session(t).run("Glob", { pattern: "**/*.mjs" }), "");
});
for (const cached of [false, true]) {
  test(`a FIFO transcript is inactive ${cached ? "after activation" : "on first use"} and returns within five seconds`, (t) => {
    const s = session(t);
    if (cached) denied(s.run("Bash", { command: "rg x" }));
    rmSync(s.transcript);
    assert.equal(spawnSync("mkfifo", [s.transcript]).status, 0);
    const start = performance.now();
    assert.equal(s.run("Bash", { command: "rg x" }), "");
    assert.ok(performance.now() - start < 5000);
  });
}
for (const kind of ["fifo", "directory"]) {
  test(`a ${kind} state cache is inactive`, (t) => {
    const s = session(t);
    const dir = join(s.home, "flatpaper-stack", "delegation");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, createHash("sha256").update("test-session").digest("hex") + ".json");
    if (kind === "fifo") assert.equal(spawnSync("mkfifo", [path]).status, 0);
    else mkdirSync(path);
    assert.equal(s.run("Bash", { command: "rg x" }), "");
  });
}
test("a million-line Read stops before a late NUL and is denied within five seconds", (t) => {
  const s = session(t, { nodeArgs: ["--max-old-space-size=32"] });
  const fd = openSync(join(s.cwd, "large.txt"), "w");
  try {
    const chunk = ("x".repeat(127) + "\n").repeat(10000);
    for (let i = 0; i < 100; i++) writeSync(fd, chunk);
    writeSync(fd, "\0");
  } finally {
    closeSync(fd);
  }
  const start = performance.now();
  denied(s.run("Read", { file_path: "large.txt" }));
  assert.ok(performance.now() - start < 5000);
});
test("Read stops at the line limit before a NUL in the same chunk", (t) => {
  const s = session(t);
  writeFileSync(join(s.cwd, "large.txt"), "line\n".repeat(301) + "\0");
  denied(s.run("Read", { file_path: "large.txt" }));
});
