import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../scripts/sync-core.mjs";
import { loadConfig, openUpstream } from "../scripts/sync.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM = process.env.FLATPAPER_UPSTREAM;
const skip = UPSTREAM ? false : "set FLATPAPER_UPSTREAM to a clone of https://github.com/cursor/plugins to run the real-tree and replay checks";
const PIN = "2776ddd2355d6d6c8747d3964600f28daf62f049";
const REPLAY_FROM = "519d36aa98955bf680db01bcde5fdfba686dc901";
const NEVER_TOUCH = ["models.json", "scripts/", "tests/", "hooks/", ".claude-plugin/", "LICENSE", "README.md", "sync/forks.json", "sync/substitutions.json"];

const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", maxBuffer: 1 << 28 });

function copyRepo() {
  const root = mkdtempSync(join(tmpdir(), "flatpaper-sync-real-"));
  for (const path of git(repo, "ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0").filter(Boolean)) {
    if (!existsSync(join(repo, path))) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(repo, path), join(root, path));
  }
  git(root, "init", "-q");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "copy");
  return root;
}

function snapshot(root) {
  const files = new Map();
  for (const path of git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0").filter(Boolean)) {
    if (existsSync(join(root, path))) files.set(path, readFileSync(join(root, path)).toString("base64"));
  }
  return files;
}

function sync(root, ...args) {
  const r = spawnSync(process.execPath, [join(root, "scripts/sync.mjs"), ...args, "--remote", UPSTREAM], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
  return { status: r.status, out: r.stdout + r.stderr };
}

const fence = (text) => text.slice(text.indexOf("# flatpaper-stack model configuration."), text.indexOf("```", text.indexOf("# flatpaper-stack model configuration.")));

test("at the pin the real tree has zero problems and its port-only files", { skip }, () => {
  const r = sync(repo, "--dry-run");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /0 problems/);
  for (const path of ["skills/flatpaper-mode/references/spawning.md", "skills/statechart/scripts/package-lock.json"]) {
    assert.match(r.out, new RegExp(`port-only\\s+${path.replaceAll(".", "\\.")}`), `${path} is port-only`);
  }
  assert.equal(sync(repo, PIN, "--dry-run").status, 0, "naming the pin is the same run");
});

test("--check-rules passes against the pin", { skip }, () => {
  const r = sync(repo, "--check-rules");
  assert.equal(r.status, 0, r.out);
});

test("a real run at the pin writes nothing", { skip }, () => {
  const root = copyRepo();
  const before = snapshot(root);
  const r = sync(root, PIN);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(snapshot(root), before);
});

test("replay: 519d36a to 2776ddd rebuilds flatpaper's tree", { skip }, () => {
  const root = copyRepo();
  const head = snapshot(root);
  const cfg = loadConfig(root);
  const up = openUpstream(UPSTREAM);
  const range = new Map();
  try {
    const { tree: oldTree } = core.deriveTree(cfg, up.rawTree(REPLAY_FROM, cfg.upstream));
    for (const upath of git(UPSTREAM, "diff", "--name-only", "-z", REPLAY_FROM, PIN).split("\0").filter(Boolean)) {
      const mapped = core.mapPath(cfg.upstream, upath);
      if (mapped && !mapped.excluded) range.set(mapped.path, oldTree.get(mapped.path));
    }
  } finally {
    up.close();
  }
  assert.equal(range.size, 23, "the range touches 23 carried files");
  const forksInRange = [...range.keys()].filter((p) => cfg.forks.has(p));
  for (const [path, blob] of range) {
    if (cfg.forks.has(path)) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), core.blobBytes(blob));
  }
  const upstreamJson = join(root, "sync/upstream.json");
  writeFileSync(upstreamJson, readFileSync(upstreamJson, "utf8").replace(PIN, REPLAY_FROM));
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "rewind to 519d36a");

  const r = sync(root, PIN.slice(0, 7));
  assert.ok(r.status === 0 || r.status === 1, r.out);
  assert.match(r.out, /0 problems/);
  const after = snapshot(root);
  for (const path of range.keys()) {
    if (cfg.forks.has(path)) continue;
    assert.equal(after.get(path), head.get(path), `${path} is byte-identical to flatpaper HEAD`);
  }
  for (const path of forksInRange) {
    assert.match(r.out, new RegExp(`merged\\s+[^\\n]*${path.replaceAll(".", "\\.")}`), `${path} merged`);
    assert.equal(after.get(path), head.get(path), `${path} merges back to flatpaper HEAD`);
  }
  assert.deepEqual([...after.keys()].filter((p) => !head.has(p)), [], "nothing left behind that HEAD lacks");
  assert.equal(JSON.parse(readFileSync(upstreamJson, "utf8")).pin, PIN);
  for (const [path, bytes] of head) {
    if (NEVER_TOUCH.some((n) => path === n || path.startsWith(n))) assert.equal(after.get(path), bytes, `${path} untouched`);
  }
  const setup = "skills/setup-flatpaper-stack/SKILL.md";
  assert.equal(fence(readFileSync(join(root, setup), "utf8")), fence(readFileSync(join(repo, setup), "utf8")), "the stamp fence is untouched");
  const stamp = spawnSync(process.execPath, [join(root, "scripts/stamp-models.mjs"), "--check"], { cwd: root, encoding: "utf8" });
  assert.deepEqual({ status: stamp.status, out: stamp.stdout + stamp.stderr }, { status: 0, out: "" });
  rmSync(root, { recursive: true, force: true });
});
