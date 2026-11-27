import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalog } from "../scripts/stamp-models.mjs";
import { parseLayer, readInstalled, resolve, check } from "../scripts/resolve-models.mjs";

const script = fileURLToPath(new URL("../scripts/resolve-models.mjs", import.meta.url));
const catalog = parseCatalog(readFileSync(new URL("../models.json", import.meta.url), "utf8"));
const installed = { plugins: new Set(["codex-seats@local", "codex@official"]), codexModels: new Map([["known", new Set(["medium", "high"])]]) };
const absent = { plugins: new Set(), codexModels: null };
const layer = (text, source = "user") => parseLayer(text, source, `${source}/models.md`).layer;
const bundled = {
  source: "bundled", path: "models.json",
  lines: new Map([...catalog.roles].map(([name, role]) => [name, { refs: role.value, source: "bundled", path: "models.json", lineNo: 1 }])),
};

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "flatpaper-resolver-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const repo = join(root, "repo");
  const put = (path, text) => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, text); };
  mkdirSync(home);
  mkdirSync(join(repo, "nested"), { recursive: true });
  put(join(repo, ".git"), "gitdir: elsewhere\n");
  const cli = (args = ["--check"], cwd = join(repo, "nested")) => execFileSync(process.execPath, [script, ...args], {
    cwd, env: { ...process.env, HOME: home }, encoding: "utf8",
  });
  return { home, repo, root, put, cli };
}

test("bundled < user < repo precedence is per role and preserves catalog order", () => {
  const user = layer("how explorer: claude/opus:high\nbug-fix: claude/haiku:low");
  const repo = layer("how explorer: parent:max", "repo");
  const table = resolve(catalog, [bundled, user, repo], absent);
  assert.deepEqual([...table.keys()], [...catalog.roles.keys()]);
  assert.equal(table.get("how explorer").line.source, "repo");
  assert.deepEqual(table.get("how explorer").line.refs, [{ provider: "parent", effort: "max" }]);
  assert.equal(table.get("bug-fix").line.source, "user");
  assert.equal(table.get("hillclimb").line.source, "bundled");
});

test("one unusable entry skips a whole panel and records its source and reason", () => {
  const user = layer("arena runners: parent:high, claude/haiku:low");
  const repo = layer("arena runners: claude/opus:high, codex/matched:high", "repo");
  const result = resolve(catalog, [bundled, user, repo], absent).get("arena runners");
  assert.equal(result.line, user.lines.get("arena runners"));
  assert.equal(result.line.refs.length, 2);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].line, repo.lines.get("arena runners"));
  assert.match(result.skipped[0].reason, /codex-seats/);
});

test("repo providers restrict all layers but always allow parent", () => {
  const user = layer("how explorer: codex/default:medium\nbug-fix: gemini/pro:high");
  const repo = layer("providers: claude\njudgment and prose: parent:max", "repo");
  assert.deepEqual(check(catalog, [bundled, user, repo], installed), []);
  const table = resolve(catalog, [bundled, user, repo], installed);
  assert.equal(table.get("how explorer").line.source, "bundled");
  assert.equal(table.get("bug-fix").line.source, "bundled");
  assert.equal(table.get("judgment and prose").line.source, "repo");
  assert.equal(table.get("how explorer").skipped[0].line, user.lines.get("how explorer"));
  assert.match(table.get("how explorer").skipped[0].reason, /provider codex is blocked/);
  assert.match(table.get("bug-fix").skipped[0].reason, /blocked/);
});

test("empty overrides select zero seats, comments and session hook are ignored", () => {
  const user = layer("# comment\n\n Session Hook: OFF\narena runners:\n");
  assert.deepEqual(check(catalog, [bundled, user], absent), []);
  assert.deepEqual(resolve(catalog, [bundled, user], absent).get("arena runners").line.refs, []);
});

test("Gemini, parent, Claude and installed Codex aliases are usable", () => {
  for (const value of ["gemini/pro:medium", "parent:max", "claude/custom:low", "codex/matched:max", "codex/default:max", "codex/known:high"]) {
    const user = layer(`how explorer: ${value}`);
    assert.deepEqual(check(catalog, [user], installed), []);
    assert.equal(resolve(catalog, [bundled, user], installed).get("how explorer").line.source, "user");
  }
});

for (const [text, expected] of [
  ["unknown: parent:medium", /unknown role unknown/],
  ["not a role line", /key and colon/],
  ["how explorer: nonsense", /not provider/],
  ["how explorer: parent:extreme", /effort/],
  ["how explorer: codex/default:medium", /codex-seats/],
  ["providers: claude", /only in the repo/],
  ["how explorer: parent:medium,", /not provider/],
]) {
  test(`check diagnoses ${text} with file and line`, () => {
    const problems = check(catalog, [layer(`# header\n${text}`)], absent);
    assert.ok(problems.some((p) => expected.test(p.message)));
    assert.ok(problems.every((p) => p.path === "user/models.md" && p.lineNo === 2));
  });
}

test("both Codex plugins are required independently", () => {
  for (const [key, missing] of [["codex@official", "codex-seats"], ["codex-seats@local", "codex plugin"]]) {
    const problems = check(catalog, [layer("how explorer: codex/default:medium")], { plugins: new Set([key]), codexModels: null });
    assert.equal(problems.length, 1);
    assert.ok(problems[0].message.includes(missing));
  }
});

test("named Codex models need cache membership and supported effort", () => {
  for (const [value, pattern] of [["unknown:high", /absent/], ["known:max", /support effort max/]]) {
    const user = layer(`how explorer: codex/${value}`);
    assert.match(check(catalog, [user], installed)[0].message, pattern);
    assert.equal(resolve(catalog, [bundled, user], installed).get("how explorer").line.source, "bundled");
  }
});

test("check reports repo entries blocked by repo providers", () => {
  const repo = layer("providers: claude\nhow explorer: codex/default:medium", "repo");
  assert.deepEqual(check(catalog, [bundled, repo], installed), [{
    path: "repo/models.md", lineNo: 2, message: "provider codex is blocked by repo providers:",
  }]);
});

test("malformed overrides fall through without running partial panels", () => {
  const user = layer("arena runners: parent:high, codex/known:extreme");
  assert.equal(resolve(catalog, [bundled, user], installed).get("arena runners").line.source, "bundled");
  assert.equal(check(catalog, [user], installed).length, 1);
});

test("no usable layer returns null and records each skipped line", () => {
  const result = resolve(catalog, [layer("how explorer: codex/default:medium")], absent).get("how explorer");
  assert.equal(result.line, null);
  assert.equal(result.skipped.length, 1);
});

test("readInstalled reads plugin keys and supported efforts", (t) => {
  const f = fixture(t);
  f.put(join(f.home, ".claude/plugins/installed_plugins.json"), JSON.stringify({ plugins: { "codex-seats@local": [], "codex@official": [] } }));
  f.put(join(f.home, ".codex/models_cache.json"), JSON.stringify({ models: [{ slug: "known", supported_reasoning_levels: [{ effort: "medium" }, { effort: "high" }] }] }));
  assert.deepEqual(readInstalled(f.home), installed);
});

test("missing, unreadable, invalid and malformed caches silently skip model checks", (t) => {
  const f = fixture(t);
  f.put(join(f.home, ".claude/plugins/installed_plugins.json"), JSON.stringify({ plugins: { "codex-seats@local": [], "codex@official": [] } }));
  const path = join(f.home, ".codex/models_cache.json");
  for (const contents of [null, "bad json", "{}", '{"models":null}']) {
    if (contents !== null) f.put(path, contents);
    const detected = readInstalled(f.home);
    assert.equal(detected.codexModels, null);
    assert.deepEqual(check(catalog, [layer("how explorer: codex/anything:max")], detected), []);
  }
  rmSync(path);
  mkdirSync(path);
  assert.equal(readInstalled(f.home).codexModels, null);
});

test("CLI check is silent with missing files or valid overrides", (t) => {
  const f = fixture(t);
  assert.equal(f.cli(), "");
  f.put(join(f.home, ".claude/flatpaper-stack/models.md"), "session hook: off\nhow explorer: claude/opus:high\n");
  f.put(join(f.repo, ".agents/models.md"), "providers: claude\nhow explorer: parent:max\n");
  assert.equal(f.cli(), "");
  const out = f.cli([]);
  assert.match(out, /^how explorer: parent:max  \[repo\]$/m);
  assert.match(out, /^arena cross-judge pool: none  \[bundled\]$/m);
});

test("CLI invalid config prints only one JSON warning and still exits zero", (t) => {
  const f = fixture(t);
  f.put(join(f.repo, ".agents/models.md"), "typo: parent:medium\nhow explorer: parent:wrong\n");
  const out = f.cli();
  assert.equal(out.trim().split("\n").length, 1);
  const json = JSON.parse(out);
  assert.deepEqual(Object.keys(json), ["systemMessage"]);
  assert.match(json.systemMessage, /flatpaper-stack models: 2 problem\(s\)/);
  assert.ok(json.systemMessage.includes(`${f.repo}/.agents/models.md:1 unknown role typo`));
  assert.match(json.systemMessage, /:2 .*effort/);
});

test("CLI uses nearest git ancestor and shows whole-line skips", (t) => {
  const f = fixture(t);
  f.put(join(f.repo, ".agents/models.md"), "how explorer: claude/opus:high");
  mkdirSync(join(f.repo, "nested/.git"));
  f.put(join(f.repo, "nested/.agents/models.md"), "how explorer: codex/default:high");
  const out = f.cli([]);
  assert.match(out, /^how explorer: claude\/sonnet:medium  \[bundled\]$/m);
  assert.match(out, /skipped how explorer: codex\/default:high \[repo\].*codex-seats/);
  assert.doesNotMatch(out, /^how explorer: claude\/opus/m);
});

test("startup wiring checks models even when session routing is off", (t) => {
  const f = fixture(t);
  f.put(join(f.home, ".claude/flatpaper-stack/models.md"), "session hook: off\ntypo: parent:medium\n");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const entries = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8")).hooks.SessionStart;
  for (const source of ["startup", "resume", "clear"]) {
    const hooks = entries.filter((e) => new RegExp(`^(?:${e.matcher})$`).test(source)).flatMap((e) => e.hooks);
    const outputs = hooks.map((hook) => execFileSync("/bin/sh", ["-c", hook.command], {
      cwd: f.repo, env: { ...process.env, HOME: f.home, CLAUDE_PLUGIN_ROOT: root }, encoding: "utf8",
    }));
    assert.equal(outputs.filter(Boolean).length, 1);
    assert.match(JSON.parse(outputs.find(Boolean)).systemMessage, /unknown role typo/);
  }
});
