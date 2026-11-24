#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { advanceModeScan } from "./mode-scan.mjs";

const EDIT_REASON = "Delegate this edit to a subagent on the step's role in the models file (trivial edits for cleanup)";
const LOOKUP_REASON = "Delegate this lookup to a read-only `how explorer` seat per references/spawning.md, or read a bounded range with limit";
const MEDIA = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".tif", ".tiff", ".avif", ".pdf"]);

function modeActive(input) {
  const key = createHash("sha256").update(input.session_id).digest("hex");
  const dir = join(tmpdir(), "flatpaper-stack", "delegation");
  const file = join(dir, `${key}.json`);
  let state = {};
  if (existsSync(file)) {
    if (!statSync(file).isFile()) return false;
    state = JSON.parse(readFileSync(file, "utf8"));
  }
  if (state.transcript !== input.transcript_path) state = { transcript: input.transcript_path };
  const active = advanceModeScan(input.transcript_path, state);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(state));
  return active;
}

function targetPath(cwd, path) {
  let existing = resolve(cwd, path);
  const missing = [];
  while (!existsSync(existing)) {
    missing.unshift(basename(existing));
    const parent = dirname(existing);
    if (parent === existing) throw new Error("No existing ancestor");
    existing = parent;
  }
  return join(realpathSync(existing), ...missing);
}

function productFile(path) {
  let cwd = dirname(path);
  while (!existsSync(cwd)) cwd = dirname(cwd);
  const git = (...args) => {
    const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 2000 });
    if (result.error || result.signal) throw result.error ?? new Error("Git interrupted");
    return result;
  };
  const tree = git("rev-parse", "--show-toplevel");
  if (tree.status !== 0) return false;
  if (path === join(realpathSync(tree.stdout.trim()), "todo.md")) return false;
  const ignored = git("check-ignore", "--quiet", "--", path);
  if (ignored.status > 1) throw new Error("Git ignore check failed");
  return ignored.status === 1;
}

function broadSearch(command) {
  let git = false;
  let grep = false;
  let ls = false;
  let recursiveGrep = false;
  let recursiveLs = false;
  for (const token of command.split(/[\s;|&()<>`$]+/)) {
    const word = token.replace(/['"\\]/g, "");
    const name = basename(word);
    if (name === "find" || name === "rg" || name === "fd") return name;
    if (name === "git") git = true;
    if (name === "grep") grep = true;
    if (name === "ls") ls = true;
    const options = /^-[a-zA-Z0-9]*/.exec(word)?.[0] ?? "";
    if (options.includes("r") || options.includes("R")) recursiveGrep = true;
    if (options.includes("R")) recursiveLs = true;
    if (word.startsWith("--rec")) recursiveGrep = recursiveLs = true;
    if (word.startsWith("--deref")) recursiveGrep = true;
    if (word === "recurse" || word.endsWith("=recurse")) recursiveGrep = true;
  }
  if (git && grep) return "git grep";
  if (grep && recursiveGrep) return "recursive grep";
  if (ls && recursiveLs) return "recursive ls";
}

function largeRead(path, input) {
  if (input.limit != null || MEDIA.has(extname(path).toLowerCase())) return false;
  if (!statSync(path).isFile()) return false;
  const fd = openSync(path, "r");
  try {
    const bytes = Buffer.alloc(16 * 1024);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let lines = 0;
    let atStart = true;
    let count;
    while ((count = readSync(fd, bytes)) > 0) {
      const chunk = bytes.subarray(0, count);
      for (let i = 0; i < count; i++) {
        if (chunk[i] === 0) return false;
        if (atStart && ++lines > 300) {
          decoder.decode(chunk.subarray(0, i));
          return true;
        }
        atStart = chunk[i] === 0x0a;
      }
      decoder.decode(chunk, { stream: true });
    }
    decoder.decode();
    return false;
  } finally {
    closeSync(fd);
  }
}

function main() {
  const input = JSON.parse(readFileSync(0, "utf8"));
  if (input.agent_id != null || process.env.FLATPAPER_DELEGATION_GUARD === "off" || !modeActive(input)) return;
  const tool = input.tool_input;
  let reason;
  if (["Edit", "Write", "NotebookEdit"].includes(input.tool_name)) {
    if (productFile(targetPath(input.cwd, tool.file_path ?? tool.notebook_path))) reason = EDIT_REASON;
  } else if (input.tool_name === "Bash") {
    const match = broadSearch(tool.command);
    if (match) reason = `Matched ${match}. ${LOOKUP_REASON}. The guard matches words anywhere in the command. If the word is in a commit message or PR body, write the text to a file and pass it with \`git commit -F <file>\` or \`--body-file <file>\`. To search one file, use the Grep tool with that file's path. If two commands in one line tripped this, run them as separate Bash calls`;
  } else if (input.tool_name === "Read") {
    if (largeRead(targetPath(input.cwd, tool.file_path), tool)) reason = LOOKUP_REASON;
  } else if (input.tool_name === "Grep") {
    if (tool.path == null || statSync(targetPath(input.cwd, tool.path)).isDirectory()) reason = LOOKUP_REASON;
  }
  if (reason) console.log(JSON.stringify({ hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: `${reason}. Only a human can turn the guard off, by starting Claude Code with FLATPAPER_DELEGATION_GUARD=off or setting it in the settings env.`,
  } }));
}

try {
  main();
} catch {}
