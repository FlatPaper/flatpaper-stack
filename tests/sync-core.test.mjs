import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCatalog } from "../scripts/stamp-models.mjs";
import * as core from "../scripts/sync-core.mjs";
import { merge3 } from "../scripts/sync.mjs";

const PIN = "a".repeat(40);
const NEXT = "b".repeat(40);
const EFFORT_RULE = "A default written without an effort means `medium`.";
const HEAD = ["# flatpaper-stack model configuration. Test head.", "session hook: on"];
const CATALOG = JSON.stringify({ template: { head: HEAD }, roles: [{ role: "feature, refactoring", default: ["claude/sonnet:medium"] }] });
const catalog = parseCatalog(CATALOG);

const text = (t, exec = false) => ({ kind: "text", text: t, exec });
const binary = (bytes) => ({ kind: "binary", bytes: Buffer.from(bytes), exec: false });
const link = (target) => ({ kind: "symlink", target });
const tree = (obj) => new Map(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : 1)));

const SPAWNING = "skills/flatpaper-mode/references/spawning.md";
const SETUP = "skills/setup-flatpaper-stack/SKILL.md";
const STAMPED = {
  [SPAWNING]: text(`${EFFORT_RULE} Code delegates use the \`feature, refactoring\` role (default \`claude/sonnet\`).\n`),
  [SETUP]: text(["Write this:", "", "```", ...HEAD, "feature, refactoring: claude/sonnet:medium", "```", ""].join("\n")),
};
const lines = (...l) => l.join("\n") + "\n";
const BODY = lines("one", "two", "three", "four", "five", "six", "seven", "eight");

function config({ rules = [], denylist = [], excludes = [], renames = [] } = {}) {
  return {
    upstream: core.parseUpstream(JSON.stringify({
      remote: "https://example.invalid/plugins",
      pin: PIN,
      sources: [{ from: "pstack/skills", to: "skills" }, { from: "pstack/agents", to: "agents" }],
      renames,
      excludes,
    })),
    subs: core.parseSubstitutions(JSON.stringify({ rules, denylist }), catalog),
    catalog,
  };
}

const forksOf = (obj) => core.parseForks(JSON.stringify(Object.fromEntries(Object.entries(obj).map(([p, kind]) => [p, { kind, why: "Kept on purpose for this test.", since: "0.9.2", upstream: "not-proposed" }]))));

function run({ old = {}, neu = old, local = {}, forks = {}, target = NEXT, cfg = config(), preProblems = [] }) {
  return core.plan({
    config: cfg,
    forks: forksOf(forks),
    oldTree: tree(old),
    newTree: tree(neu),
    localTree: tree({ ...STAMPED, ...local }),
    stampOnly: new Map(),
    target,
    version: "0.9.2",
    merge3,
    preProblems,
  });
}

const entry = (p, path) => p.entries.find((e) => e.path === path);
const kinds = (findings) => findings.map((f) => f.kind).sort();
const written = (p) => core.writes(p).map((e) => e.path);

const F = "skills/a/SKILL.md";
const CLEAN = "skills/clean/SKILL.md";
const cleanUpdate = { old: { [CLEAN]: text("old clean\n") }, neu: { [CLEAN]: text("new clean\n") }, local: { [CLEAN]: text("old clean\n") } };
const withClean = (c) => ({
  ...c,
  old: { ...cleanUpdate.old, ...c.old },
  neu: { ...cleanUpdate.neu, ...(c.neu ?? c.old) },
  local: { ...cleanUpdate.local, ...c.local },
});

test("outcome table: each row decides the write and the class", async (t) => {
  const rows = [
    ["unchanged when local equals new", { old: { [F]: text("x\n") }, neu: { [F]: text("y\n") }, local: { [F]: text("y\n") } }, "unchanged", null],
    ["updated when local equals old and upstream moved", { old: { [F]: text("x\n") }, neu: { [F]: text("y\n") }, local: { [F]: text("x\n") } }, "updated", text("y\n")],
    ["a clean chmod upstream is an update, not a fork", { old: { [F]: text("x\n") }, neu: { [F]: text("x\n", true) }, local: { [F]: text("x\n") } }, "updated", text("x\n", true)],
    ["added when only new has it", { old: {}, neu: { [F]: text("y\n") } }, "added", text("y\n")],
    ["deleted when upstream dropped an untouched file", { old: { [F]: text("x\n") }, neu: {}, local: { [F]: text("x\n") } }, "deleted", "delete"],
    ["gone when nobody has it any more", { old: { [F]: text("x\n") }, neu: {} }, "gone", null],
    ["port-only when upstream never had it", { local: { [F]: text("ours\n") } }, "port-only", null],
    ["forked when upstream is still and local differs", { old: { [F]: text(BODY) }, local: { [F]: text(BODY.replace("two", "TWO")) }, forks: { [F]: "policy" } }, "forked", null],
    ["mode-only when only the exec bit differs", { old: { [F]: text("x\n") }, local: { [F]: text("x\n", true) }, forks: { [F]: "local-fix" } }, "mode-only", null],
    ["merged when both sides moved apart", { old: { [F]: text(BODY) }, neu: { [F]: text(BODY.replace("eight", "EIGHT")) }, local: { [F]: text(BODY.replace("one", "ONE")) }, forks: { [F]: "policy" } }, "merged", text(BODY.replace("one", "ONE").replace("eight", "EIGHT"))],
  ];
  for (const [name, c, outcome, write] of rows) {
    await t.test(name, () => {
      const p = run(c);
      assert.deepEqual(p.problems, [], "no problems");
      assert.equal(entry(p, F).outcome, outcome);
      assert.deepEqual(entry(p, F).write, write);
      assert.equal(core.exitCode(p), 0);
    });
  }

  await t.test("a fork reports how many lines it differs by", () => {
    const p = run({ old: { [F]: text(BODY) }, local: { [F]: text(BODY.replace("two", "TWO")) }, forks: { [F]: "policy" } });
    assert.equal(entry(p, F).changedLines, 2);
  });

  await t.test("excluded paths are never written and never deleted", () => {
    const cfg = config({ excludes: [{ path: "skills/dropped/", why: "not carried" }] });
    const D = "skills/dropped/SKILL.md";
    const p = run({ cfg, old: { [D]: text("x\n") }, neu: { [D]: text("y\n") }, local: { [D]: text("ours\n") } });
    assert.equal(entry(p, D).outcome, "excluded");
    assert.equal(entry(p, D).write, null);
    assert.deepEqual(kinds(p.followUps), ["excluded-changed", "excluded-local"]);
    assert.equal(core.exitCode(p), 1);
  });

  await t.test("removed-upstream keeps the fork and asks a human", () => {
    const p = run({ old: { [F]: text("x\n") }, neu: {}, local: { [F]: text("ours\n") }, forks: { [F]: "policy" } });
    assert.equal(entry(p, F).outcome, "removed-upstream");
    assert.equal(entry(p, F).write, null);
    assert.deepEqual(kinds(p.followUps), ["removed-upstream"]);
    assert.equal(core.exitCode(p), 1);
  });

  await t.test("a merge that lands on new upstream is an update, and its fork entry goes stale", () => {
    const neu = BODY.replace("one", "ONE").replace("eight", "EIGHT");
    const p = run({ old: { [F]: text(BODY) }, neu: { [F]: text(neu) }, local: { [F]: text(BODY.replace("one", "ONE")) }, forks: { [F]: "policy" } });
    assert.equal(entry(p, F).outcome, "updated");
    assert.deepEqual(entry(p, F).write, text(neu));
    assert.deepEqual(kinds(p.followUps), ["stale-fork"]);
    assert.equal(core.exitCode(p), 1);
  });
});

test("every problem blocks every write, including an unrelated clean update", async (t) => {
  const cases = [
    ["undeclared", { old: { [F]: text(BODY) }, local: { [F]: text("ours\n") } }],
    ["stale-at-pin", { target: PIN, old: { [F]: text("x\n") }, neu: { [F]: text("x\n") }, local: { [F]: text("x\n") }, forks: { [F]: "policy" } }],
    ["conflicted", { old: { [F]: text(BODY) }, neu: { [F]: text(BODY.replace("four", "UPSTREAM")) }, local: { [F]: text(BODY.replace("four", "LOCAL")) }, forks: { [F]: "policy" } }],
    ["binary-conflict", { old: { "skills/a/x.png": binary([1, 0, 1]) }, neu: { "skills/a/x.png": binary([1, 0, 2]) }, local: { "skills/a/x.png": binary([1, 0, 3]) }, forks: { "skills/a/x.png": "policy" } }],
    ["symlink", { old: { [F]: text("x\n") }, neu: { [F]: link("../b") }, local: { [F]: text("x\n") } }],
    ["path-collision", { old: {}, neu: { "skills/A/SKILL.md": text("y\n") }, local: { "skills/a/SKILL.md": text("ours\n") } }],
    ["path-collision", { old: {}, neu: { "skills/a/SKILL.md/x.md": text("y\n") }, local: { [F]: text("ours\n") } }],
    ["denylist", { cfg: config({ denylist: [{ token: "grok-", hint: "map it to a role" }] }), old: { [F]: text("x\n") }, neu: { [F]: text("default `grok-4.7`\n") }, local: { [F]: text("x\n") } }],
    ["stamp", { old: { [F]: text("x\n") }, neu: { [F]: text("Use default `claude/opus` here.\n") }, local: { [F]: text("x\n") } }],
    ["stamp-repo", { old: {}, neu: { "skills/b/SKILL.md": text(["```", ...HEAD, "feature, refactoring: claude/sonnet:medium", "```", ""].join("\n")) } }],
    ["local-unstamped", { local: { "skills/b/SKILL.md": text("the `feature, refactoring` role (default `claude/opus`)\n") } }],
    ["markers", { local: { "skills/b/SKILL.md": text("a\n<<<<<<< local\nb\n=======\nc\n>>>>>>> upstream\n") } }],
    ["at-pin-write", { target: PIN, old: { [F]: text("x\n") }, neu: { [F]: text("x\n") } }],
    ["dirty", { preProblems: [{ kind: "dirty", say: "uncommitted changes under skills/" }] }],
  ];
  for (const [kind, c] of cases) {
    await t.test(kind, () => {
      const p = kind === "stale-at-pin" || kind === "at-pin-write" ? run(c) : run(withClean(c));
      assert.ok(kinds(p.problems).includes(kind), `has a ${kind} problem, got ${kinds(p.problems).join(", ")}`);
      assert.equal(core.blocked(p), true);
      assert.deepEqual(written(p), [], "nothing is written");
      assert.equal(core.exitCode(p), 2);
      if (kind !== "stale-at-pin" && kind !== "at-pin-write") assert.equal(entry(p, CLEAN).outcome, "updated", "the clean update was planned");
    });
  }

  await t.test("a conflict report carries local, base, and upstream for each hunk", () => {
    const p = run({ old: { [F]: text(BODY) }, neu: { [F]: text(BODY.replace("four", "UPSTREAM")) }, local: { [F]: text(BODY.replace("four", "LOCAL")) }, forks: { [F]: "policy" } });
    const report = core.renderReport(p, { dryRun: false });
    assert.match(report, /conflicted\s+skills\/a\/SKILL\.md\s+1 hunk/);
    for (const part of ["<<<<<<< local", "LOCAL", "||||||| base", "four", "=======", "UPSTREAM", ">>>>>>> upstream"]) assert.ok(report.includes(part), `report shows ${part}`);
    assert.match(report, /nothing was written/);
  });

  await t.test("two upstream paths that derive to one local path collide", () => {
    const cfg = config({ renames: [{ from: "skills/old-name/", to: "skills/new-name/" }] });
    const { problems } = core.deriveTree(cfg, tree({ "pstack/skills/old-name/SKILL.md": text("a\n"), "pstack/skills/new-name/SKILL.md": text("b\n") }));
    assert.deepEqual(kinds(problems), ["path-collision"]);
  });
});

test("follow-ups are written and exit 1", async (t) => {
  await t.test("a new upstream skill folder is written and named once", () => {
    const p = run({ old: {}, neu: { "skills/fresh/SKILL.md": text("a\n"), "skills/fresh/references/x.md": text("b\n") } });
    assert.deepEqual(written(p), ["skills/fresh/SKILL.md", "skills/fresh/references/x.md"]);
    assert.deepEqual(p.followUps.map((f) => [f.kind, f.path]), [["new-skill", "skills/fresh/"]]);
    assert.equal(core.exitCode(p), 1);
  });

  await t.test("a removed upstream skill is deleted and named once", () => {
    const old = { "skills/gone/SKILL.md": text("a\n"), "skills/gone/references/x.md": text("b\n") };
    const p = run({ old, neu: {}, local: old });
    assert.deepEqual(core.writes(p).map((e) => [e.path, e.write]), [["skills/gone/SKILL.md", "delete"], ["skills/gone/references/x.md", "delete"]]);
    assert.deepEqual(p.followUps.map((f) => [f.kind, f.path]), [["removed-skill", "skills/gone/"]]);
  });

  await t.test("a fork entry that is no longer forked at a new sha is a follow-up, not a block", () => {
    const p = run({ old: { [F]: text("x\n") }, neu: { [F]: text("y\n") }, local: { [F]: text("x\n") }, forks: { [F]: "policy" } });
    assert.equal(entry(p, F).outcome, "updated");
    assert.deepEqual(kinds(p.followUps), ["stale-fork"]);
    assert.deepEqual(written(p), [F]);
  });
});

test("an undeclared fork prints a stub that parses only once its why is written", () => {
  const p = run({ old: { [F]: text(BODY) }, local: { [F]: text("ours\n") } });
  assert.deepEqual(p.forkStubs, { [F]: { kind: "policy", why: "", since: "0.9.2", upstream: "not-proposed" } });
  assert.throws(() => core.parseForks(JSON.stringify(p.forkStubs)), /why/);
  assert.throws(() => core.parseForks(JSON.stringify({ [F]: { ...p.forkStubs[F], why: "TODO" } })), /why/);
  assert.throws(() => core.parseForks(JSON.stringify({ [F]: { ...p.forkStubs[F], why: "x", kind: "taste" } })), /kind/);
  assert.throws(() => core.parseForks(JSON.stringify({ "README.md": { ...p.forkStubs[F], why: "x" } })), /skills\/ or agents\//);
});

test("the plan and its report are deterministic", () => {
  const c = { old: { [F]: text(BODY), "skills/z/SKILL.md": text("z\n") }, neu: { [F]: text(BODY), "skills/z/SKILL.md": text("zz\n") }, local: { [F]: text("ours\n"), "skills/z/SKILL.md": text("z\n") } };
  const a = core.renderReport(run(c), { dryRun: true });
  assert.equal(core.renderReport(run(c), { dryRun: true }), a);
  assert.ok(!a.includes("/tmp") && !a.includes("/Users"), "no absolute paths");
});

test("rules", async (t) => {
  const rule = (r) => ({ rationale: "test", ...r });
  const derive = (cfg, path, t) => core.deriveFile(cfg, path, text(t)).text;

  await t.test("rules touch only markdown unless they opt in", () => {
    const cfg = config({ rules: [rule({ regex: "\\bpoteto-mode\\b", replacement: "flatpaper-mode" })] });
    assert.equal(derive(cfg, "skills/flatpaper-mode/SKILL.md", "see poteto-mode\n"), "see flatpaper-mode\n");
    assert.equal(derive(cfg, "skills/flatpaper-mode/scripts/bootstrap.ts", "const s = 'poteto-mode';\n"), "const s = 'poteto-mode';\n");
  });

  await t.test("a literal that an earlier rule rewrites first is rejected", () => {
    assert.throws(() => config({ rules: [rule({ pattern: "poteto-mode", replacement: "x" }), rule({ pattern: "use /poteto-mode now", replacement: "y" })] }), /rules\[1\].*rules\[0\]/);
    assert.throws(() => config({ rules: [rule({ regex: "\\bpoteto\\b", replacement: "x" }), rule({ pattern: "the poteto way", replacement: "y" })] }), /rules\[1\].*rules\[0\]/);
  });

  await t.test("a rule that rewrites an earlier rule's output is rejected", () => {
    assert.throws(() => config({ rules: [rule({ pattern: "a-skill", replacement: "poteto-skill" }), rule({ regex: "poteto", replacement: "x" })] }), /rules\[1\].*rules\[0\]/);
  });

  await t.test("an unknown role or a denylisted replacement is rejected", () => {
    assert.throws(() => config({ rules: [rule({ pattern: "x", replacement: "the {{role:nope}}" })] }), /role `nope`/);
    assert.throws(() => config({ rules: [rule({ pattern: "x", replacement: "grok-5" })], denylist: [{ token: "grok-", hint: "h" }] }), /denylist/);
  });

  await t.test("{{skills}} is the path from the file to skills/", () => {
    const cfg = config({ rules: [rule({ pattern: "READ", replacement: "{{skills}}/unslop/SKILL.md" })] });
    assert.equal(derive(cfg, "skills/x/SKILL.md", "READ\n"), "../unslop/SKILL.md\n");
    assert.equal(derive(cfg, "skills/flatpaper-mode/playbooks/y.md", "READ\n"), "../../unslop/SKILL.md\n");
  });

  await t.test("{{role:}} is filled from models.json by stampDoc", () => {
    const cfg = config({ rules: [rule({ pattern: "your feature model (default `grok-4.7`)", replacement: "the {{role:feature, refactoring}}" })] });
    assert.equal(derive(cfg, "skills/x/SKILL.md", "Use your feature model (default `grok-4.7`).\n"), "Use the `feature, refactoring` role (default `claude/sonnet`).\n");
  });

  await t.test("a models.json change moves old and new together, so local reads unstamped, not forked", () => {
    const opus = parseCatalog(CATALOG.replace("claude/sonnet:medium", "claude/opus:medium"));
    const cfg = { ...config({ rules: [rule({ pattern: "MODEL", replacement: "the {{role:feature, refactoring}}" })] }), catalog: opus };
    const raw = tree({ [`pstack/${F}`]: text("Use MODEL.\n") });
    const { tree: derived } = core.deriveTree(cfg, raw);
    assert.equal(derived.get(F).text, "Use the `feature, refactoring` role (default `claude/opus`).\n");
    const p = core.plan({ config: cfg, forks: new Map(), oldTree: derived, newTree: derived, localTree: tree({ ...STAMPED, [F]: text("Use the `feature, refactoring` role (default `claude/sonnet`).\n") }), stampOnly: new Map(), target: NEXT, version: "0.9.2", merge3, preProblems: [] });
    assert.ok(kinds(p.problems).includes("local-unstamped"));
  });

  await t.test("renames and excludes map upstream paths into local names", () => {
    const cfg = config({ renames: [{ from: "skills/poteto-mode/", to: "skills/flatpaper-mode/" }, { from: "agents/poteto-agent.md", to: "agents/flatpaper-agent.md" }], excludes: [{ path: "skills/flatpaper-mode/references/bugbot-triage.md", why: "x" }] });
    assert.deepEqual(core.mapPath(cfg.upstream, "pstack/skills/poteto-mode/SKILL.md"), { path: "skills/flatpaper-mode/SKILL.md", excluded: false });
    assert.deepEqual(core.mapPath(cfg.upstream, "pstack/agents/poteto-agent.md"), { path: "agents/flatpaper-agent.md", excluded: false });
    assert.deepEqual(core.mapPath(cfg.upstream, "pstack/skills/poteto-mode/references/bugbot-triage.md"), { path: "skills/flatpaper-mode/references/bugbot-triage.md", excluded: true });
    assert.equal(core.mapPath(cfg.upstream, "pstack/README.md"), null);
  });

  await t.test("an abbreviated pin or an unknown key is rejected", () => {
    assert.throws(() => core.parseUpstream(JSON.stringify({ remote: "x", pin: "2776ddd", sources: [], renames: [], excludes: [] })), /pin/);
    assert.throws(() => core.parseUpstream(JSON.stringify({ remote: "x", pin: PIN, sources: [], renames: [], excludes: [], extra: 1 })), /extra/);
  });

  await t.test("--check-rules names a rule with no hit, an allow entry with no hit, and a missing rename", () => {
    const cfg = config({
      rules: [rule({ pattern: "never appears", replacement: "x" }), rule({ pattern: "hello", replacement: "hi" })],
      denylist: [{ token: "Bugbot", hint: "h", allow: [{ path: "skills/a/SKILL.md", why: "w" }] }],
      renames: [{ from: "skills/missing/", to: "skills/m/" }],
    });
    const findings = core.checkRules(cfg, tree({ [`pstack/${F}`]: text("hello\n") }));
    assert.deepEqual(findings.map((f) => f.kind).sort(), ["allow-no-hit", "rename-missing", "rule-no-hit"]);
    assert.match(findings.find((f) => f.kind === "rule-no-hit").say, /never appears/);
  });
});
