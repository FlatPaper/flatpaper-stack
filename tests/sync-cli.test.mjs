import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEAD = ["# flatpaper-stack model configuration. Test head.", "session hook: on"];
const MODELS = JSON.stringify({ template: { head: HEAD }, roles: [{ role: "feature, refactoring", default: ["claude/sonnet:medium"] }] }, null, 2) + "\n";
const BASE_LOCAL = {
  "skills/flatpaper-mode/references/spawning.md": "A default written without an effort means `medium`. Code delegates use the `feature, refactoring` role (default `claude/sonnet`).\n",
  "skills/setup-flatpaper-stack/SKILL.md": ["Write this:", "", "```", ...HEAD, "feature, refactoring: claude/sonnet:medium", "```", ""].join("\n"),
};
const BODY = ["one", "two", "three", "four", "five", "six", "seven", "eight", ""].join("\n");
const SUBS = {
  rules: [{ regex: "\\bpoteto-mode\\b", replacement: "flatpaper-mode", rationale: "skill rename" }],
  denylist: [{ token: "grok-", hint: "map the upstream model default to a role" }],
};

const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], { cwd, encoding: "utf8" }).trim();

function writeTree(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path);
    if (content === null) { rmSync(file, { force: true }); continue; }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

function commit(dir, files, message) {
  writeTree(dir, files);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}

function snapshot(root) {
  const files = new Map();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === ".git") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else files.set(relative(root, p), readFileSync(p).toString("base64"));
    }
  };
  walk(root);
  return files;
}

function fixture({ a, b, local = {}, forks = {}, subs = SUBS }) {
  const base = mkdtempSync(join(tmpdir(), "flatpaper-sync-"));
  const remote = join(base, "remote");
  mkdirSync(remote);
  git(remote, "init", "-q");
  const shaA = commit(remote, { "pstack/README.md": "upstream\n", ...a }, "A");
  const shaB = commit(remote, Object.fromEntries([...Object.keys(a), ...Object.keys(b)].map((k) => [k, k in b ? b[k] : null])), "B");

  const root = join(base, "flatpaper");
  mkdirSync(join(root, "scripts"), { recursive: true });
  for (const f of ["sync.mjs", "sync-core.mjs", "stamp-models.mjs"]) cpSync(join(repo, "scripts", f), join(root, "scripts", f));
  const derivedA = Object.fromEntries(Object.entries(a).filter(([k]) => k.startsWith("pstack/skills/")).map(([k, v]) => [k.replace("pstack/", ""), typeof v === "string" ? v.replaceAll("poteto-mode", "flatpaper-mode") : v]));
  writeTree(root, {
    "models.json": MODELS,
    "README.md": "readme\n",
    "LICENSE": "MIT\n",
    "hooks/hooks.json": "{}\n",
    ".claude-plugin/plugin.json": JSON.stringify({ name: "flatpaper-stack", version: "0.9.2" }) + "\n",
    "sync/upstream.json": JSON.stringify({ remote: `file://${remote}`, pin: shaA, sources: [{ from: "pstack/skills", to: "skills" }, { from: "pstack/agents", to: "agents" }], renames: [], excludes: [] }, null, 2) + "\n",
    "sync/substitutions.json": JSON.stringify(subs, null, 2) + "\n",
    "sync/forks.json": JSON.stringify(Object.fromEntries(Object.entries(forks).map(([p, kind]) => [p, { kind, why: "Kept on purpose for this test.", since: "0.9.2", upstream: "not-proposed" }])), null, 2) + "\n",
    ...BASE_LOCAL,
    ...derivedA,
    ...local,
  });
  git(root, "init", "-q");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fixture");
  return { root, remote, shaA, shaB };
}

function sync(root, ...args) {
  const r = spawnSync(process.execPath, [join(root, "scripts/sync.mjs"), ...args], { cwd: root, encoding: "utf8" });
  return { status: r.status, out: r.stdout + r.stderr };
}

const read = (root, path) => readFileSync(join(root, path), "utf8");
const pin = (root) => JSON.parse(read(root, "sync/upstream.json")).pin;

test("a clean update writes the file, moves the pin, and leaves the stamp silent", () => {
  const { root, shaA, shaB } = fixture({
    a: { "pstack/skills/arena/SKILL.md": "Arena v1, see poteto-mode.\n" },
    b: { "pstack/skills/arena/SKILL.md": "Arena v2, see poteto-mode.\n" },
  });
  const before = snapshot(root);

  const dry = sync(root, shaB.slice(0, 7), "--dry-run");
  assert.equal(dry.status, 0, dry.out);
  assert.match(dry.out, /updated\s+1/);
  assert.deepEqual(snapshot(root), before, "a dry run writes nothing");

  const real = sync(root, shaB.slice(0, 7));
  assert.equal(real.status, 0, real.out);
  assert.equal(read(root, "skills/arena/SKILL.md"), "Arena v2, see flatpaper-mode.\n");
  assert.equal(pin(root), shaB, "the pin is the full sha");
  assert.notEqual(shaA, shaB);
  for (const path of ["models.json", "README.md", "LICENSE", "hooks/hooks.json", ".claude-plugin/plugin.json", "scripts/sync.mjs", "scripts/stamp-models.mjs", "sync/forks.json", "sync/substitutions.json", "skills/setup-flatpaper-stack/SKILL.md"]) {
    assert.equal(snapshot(root).get(path), before.get(path), `${path} untouched`);
  }

  const stamp = spawnSync(process.execPath, [join(root, "scripts/stamp-models.mjs"), "--check"], { cwd: root, encoding: "utf8" });
  assert.deepEqual({ status: stamp.status, out: stamp.stdout + stamp.stderr }, { status: 0, out: "" }, "stamp-models --check is silent after a sync");

  git(root, "commit", "-qam", "sync");
  const settled = snapshot(root);
  const again = sync(root, shaB);
  assert.equal(again.status, 0, again.out);
  assert.deepEqual(snapshot(root), settled, "a second run at the new pin writes nothing");
  assert.equal(sync(root, "--dry-run").status, 0, "dry run at the pin is clean");
});

test("a conflict writes nothing, keeps the pin, and shows the three inputs", () => {
  const F = "skills/arena/SKILL.md";
  const { root, shaA, shaB } = fixture({
    a: { [`pstack/${F}`]: BODY, "pstack/skills/clean/SKILL.md": "v1\n" },
    b: { [`pstack/${F}`]: BODY.replace("four", "UPSTREAM"), "pstack/skills/clean/SKILL.md": "v2\n" },
    local: { [F]: BODY.replace("four", "LOCAL") },
    forks: { [F]: "policy" },
  });
  const before = snapshot(root);
  const r = sync(root, shaB);
  assert.equal(r.status, 2, r.out);
  assert.deepEqual(snapshot(root), before, "no file changed, the clean update included");
  assert.equal(pin(root), shaA);
  assert.match(r.out, /conflicted\s+skills\/arena\/SKILL\.md\s+1 hunk/);
  for (const part of ["<<<<<<< local", "LOCAL", "||||||| base", "=======", "UPSTREAM", ">>>>>>> upstream"]) assert.ok(r.out.includes(part), `shows ${part}`);
  assert.equal(sync(root, shaB, "--dry-run").status, 2, "the dry run returns the real run's code");

  writeFileSync(join(root, F), BODY.replace("four", "LOCAL, now saying UPSTREAM in our words"));
  git(root, "commit", "-qam", "take upstream's point by hand");
  const again = sync(root, shaB);
  assert.equal(again.status, 2, "a hand edit that still differs still conflicts");
  const done = sync(root, shaB, "--resolved", F);
  assert.equal(done.status, 0, done.out);
  assert.equal(read(root, F), BODY.replace("four", "LOCAL, now saying UPSTREAM in our words"), "the resolved file is kept");
  assert.equal(read(root, "skills/clean/SKILL.md"), "v2\n", "the clean update lands");
  assert.equal(pin(root), shaB);
  git(root, "commit", "-qam", "sync");
  assert.equal(sync(root, "--dry-run").status, 0, "at the new pin the fork is settled");
});

test("a binary changed on both sides blocks the run", () => {
  const P = "skills/arena/logo.png";
  const { root, shaB } = fixture({
    a: { [`pstack/${P}`]: Buffer.from([137, 80, 0, 1]) },
    b: { [`pstack/${P}`]: Buffer.from([137, 80, 0, 2]) },
    local: { [P]: Buffer.from([137, 80, 0, 3]) },
    forks: { [P]: "policy" },
  });
  const before = snapshot(root);
  const r = sync(root, shaB);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /binary-conflict\s+skills\/arena\/logo\.png/);
  assert.deepEqual(snapshot(root), before);
});

test("an upstream model default that no rule maps hits the denylist", () => {
  const { root, shaB } = fixture({
    a: { "pstack/skills/arena/SKILL.md": "v1\n" },
    b: { "pstack/skills/arena/SKILL.md": "Spawn on your model (default `grok-4.7-xhigh-fast`).\n" },
  });
  const before = snapshot(root);
  const r = sync(root, shaB);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /denylist\s+skills\/arena\/SKILL\.md:1\s+"grok-"/);
  assert.deepEqual(snapshot(root), before);
});

test("an undeclared fork blocks an unrelated clean update and prints a stub", () => {
  const { root, shaB } = fixture({
    a: { "pstack/skills/forked/SKILL.md": "upstream text\n", "pstack/skills/clean/SKILL.md": "v1\n" },
    b: { "pstack/skills/forked/SKILL.md": "upstream text\n", "pstack/skills/clean/SKILL.md": "v2\n" },
    local: { "skills/forked/SKILL.md": "our text\n" },
  });
  const r = sync(root, shaB);
  assert.equal(r.status, 2, r.out);
  assert.equal(read(root, "skills/clean/SKILL.md"), "v1\n", "the clean update was not written");
  assert.match(r.out, /undeclared\s+skills\/forked\/SKILL\.md/);
  assert.match(r.out, /"skills\/forked\/SKILL\.md": \{ "kind": "policy", "why": "", "since": "0\.9\.2", "upstream": "not-proposed" \}/);
});

test("a new upstream skill is written and a removed one deleted, each as a follow-up", () => {
  const { root, shaB } = fixture({
    a: { "pstack/skills/old/SKILL.md": "old\n", "pstack/skills/old/references/a.md": "a\n" },
    b: { "pstack/skills/fresh/SKILL.md": "fresh\n" },
  });
  const r = sync(root, shaB);
  assert.equal(r.status, 1, r.out);
  assert.equal(read(root, "skills/fresh/SKILL.md"), "fresh\n");
  assert.ok(!existsSync(join(root, "skills/old")), "the removed skill's folder is gone");
  assert.match(r.out, /new skill\s+skills\/fresh\//);
  assert.match(r.out, /removed skill\s+skills\/old\//);
  assert.equal(pin(root), shaB);
});

test("a real run refuses a dirty tree; a dry run still previews", () => {
  const { root, shaA, shaB } = fixture({
    a: { "pstack/skills/arena/SKILL.md": "v1\n" },
    b: { "pstack/skills/arena/SKILL.md": "v2\n" },
  });
  writeFileSync(join(root, "skills/arena/notes.md"), "scratch\n");
  const r = sync(root, shaB);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /dirty/);
  assert.equal(read(root, "skills/arena/SKILL.md"), "v1\n");
  assert.equal(pin(root), shaA);
  assert.equal(sync(root, shaB, "--dry-run").status, 0);
});

test("--remote reads a local clone in place; --check-rules fails a rule with no hit", () => {
  const { root, remote, shaB } = fixture({
    a: { "pstack/skills/arena/SKILL.md": "v1, poteto-mode\n" },
    b: { "pstack/skills/arena/SKILL.md": "v2, poteto-mode\n" },
  });
  const r = sync(root, shaB, "--dry-run", "--remote", remote);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /updated\s+1/);

  assert.equal(sync(root, "--check-rules").status, 0);
  writeFileSync(join(root, "sync/substitutions.json"), JSON.stringify({ ...SUBS, rules: [...SUBS.rules, { pattern: "never upstream", replacement: "x", rationale: "dead" }] }));
  const dead = sync(root, "--check-rules");
  assert.equal(dead.status, 2, dead.out);
  assert.match(dead.out, /never upstream/);
});

test("bad arguments and bad config exit 2 with a reason", () => {
  const { root } = fixture({ a: { "pstack/skills/arena/SKILL.md": "v1\n" }, b: { "pstack/skills/arena/SKILL.md": "v1\n" } });
  assert.equal(sync(root, "--bogus").status, 2);
  writeFileSync(join(root, "sync/forks.json"), JSON.stringify({ "skills/arena/SKILL.md": { kind: "policy", why: "", since: "0.9.2", upstream: "not-proposed" } }));
  const r = sync(root, "--dry-run");
  assert.equal(r.status, 2);
  assert.match(r.out, /forks\.json.*why/);
});
