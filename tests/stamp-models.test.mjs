import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(repo, "scripts/stamp-models.mjs");

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "stamp-models-"));
  for (const path of ["skills", "agents", "hooks", "models.json"]) {
    cpSync(join(repo, path), join(root, path), { recursive: true, filter: (src) => basename(src) !== "node_modules" });
  }
  return root;
}

function stamp(root, args = [], env = process.env) {
  const r = spawnSync(process.execPath, [script, ...(root ? ["--root", root] : []), ...args], { encoding: "utf8", env });
  return { status: r.status, out: r.stdout + r.stderr };
}

function snapshot(root) {
  const files = new Map();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else files.set(relative(root, p), readFileSync(p, "utf8"));
    }
  };
  walk(root);
  return files;
}

const read = (root, rel) => readFileSync(join(root, rel), "utf8");
const edit = (root, rel, fn) => writeFileSync(join(root, rel), fn(read(root, rel)));

function setDefault(root, role, value) {
  edit(root, "models.json", (text) => {
    const json = JSON.parse(text);
    json.roles.find((r) => r.role === role).default = value;
    return JSON.stringify(json, null, 2);
  });
}

function replaceOnce(text, from, to) {
  assert.ok(text.includes(from), `fixture text present: ${from}`);
  return text.replace(from, to);
}

function templateFence(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith("# flatpaper-stack model configuration."));
  const end = lines.indexOf("```", start);
  return lines.slice(start, end);
}

const catalog = JSON.parse(readFileSync(join(repo, "models.json"), "utf8"));
const SETUP = "skills/setup-flatpaper-stack/SKILL.md";
const MODE = "skills/flatpaper-mode/SKILL.md";
const SPAWNING = "skills/flatpaper-mode/references/spawning.md";

test("the checked-in tree is in sync with models.json", () => {
  assert.deepEqual(stamp(null, ["--check"]), { status: 0, out: "" });
});

test("one models.json edit updates only the setup template", () => {
  const root = sandbox();
  const before = snapshot(root);
  setDefault(root, "how explorer", ["claude/opus:medium"]);
  const check = stamp(root, ["--check"]);
  assert.equal(check.status, 1);
  assert.match(check.out, new RegExp(`${SETUP}:\\d+ template fence is stale`));
  assert.equal(stamp(root).status, 0);
  assert.ok(templateFence(read(root, SETUP)).includes("how explorer: claude/opus:medium"));
  for (const [file, text] of before) {
    if (file !== SETUP && file !== "models.json") assert.equal(read(root, file), text, `${file} is unchanged`);
  }
  assert.deepEqual(stamp(root, ["--check"]), { status: 0, out: "" });
});

test("a second write run changes no bytes", () => {
  const root = sandbox();
  setDefault(root, "swarm workers", ["claude/haiku:high"]);
  assert.equal(stamp(root).status, 0);
  const once = snapshot(root);
  assert.deepEqual(stamp(root), { status: 0, out: "" }, "second run reports nothing");
  assert.deepEqual(snapshot(root), once);
});

test("a hand edit to the setup template drifts and a write restores it", () => {
  const root = sandbox();
  const original = read(root, SETUP);
  edit(root, SETUP, (t) => replaceOnce(t, "trivial edits: claude/haiku:medium", "trivial edits: claude/opus:medium"));
  const check = stamp(root, ["--check"]);
  assert.equal(check.status, 1);
  assert.match(check.out, new RegExp(`${SETUP}:\\d+ template fence is stale`));
  assert.equal(stamp(root).status, 0);
  assert.equal(read(root, SETUP), original);
});

test("skills name roles and the template carries defaults", () => {
  const mode = read(repo, MODE);
  assert.ok(mode.includes("the `feature, refactoring` role"), "feature, refactoring names its role");
  for (const role of ["bug-fix", "perf-issue", "hillclimb", "judgment and prose"]) {
    assert.ok(mode.includes(`the \`${role}\` role`), `${role} names its role`);
  }
  assert.ok(mode.includes("the `hardest tasks` role"), "hardest tasks names its role");
  assert.ok(!mode.includes("at a raised reasoning level,"), "effort is no longer restated in words");

  const fence = templateFence(read(repo, SETUP));
  for (const line of ["feature, refactoring: claude/sonnet:medium", "bug-fix: parent:medium", "hardest tasks: parent:high", "arena runners: parent:medium, claude/sonnet:medium"]) {
    assert.ok(fence.includes(line), `template has ${line}`);
  }
});

test("architect no longer restates the implicit effort", () => {
  assert.ok(!read(repo, "skills/architect/SKILL.md").includes("`medium` by default"));
  assert.ok(read(repo, SPAWNING).includes("A default written without an effort means `medium`."));
  assert.ok(!read(repo, SPAWNING).includes("which means `high`"), "hardest tasks exception now comes from its default");
});

test("PR review tiers name roles and keep single model defaults in the template", () => {
  const mode = read(repo, MODE);
  const fence = templateFence(read(repo, SETUP));
  for (const [role, value] of [
    ["pr critical reviewer", "parent:high"],
    ["pr deep reviewer", "parent:high"],
    ["pr triage reviewer", "claude/sonnet:medium"],
  ]) {
    const entry = catalog.roles.find((r) => r.role === role);
    assert.equal(entry.kind, "single");
    assert.deepEqual(entry.default, [value]);
    assert.ok(mode.includes(`the \`${role}\` role`));
    assert.ok(fence.includes(`${role}: ${value}`));
  }
});

test("invalid prose exits 2 and a write run touches no file", async (t) => {
  const cases = [
    ["unknown role", "Use the `how explorers` role.", /unknown role `how explorers`/],
    ["printed model default", "Use the `how explainer` role (default `parent`).", /leftover/],
    ["other printed default", "Use the base (default main).", /leftover/],
    ["unparenthesized model default", "Use default `claude/opus`.", /leftover/],
    ["unparenthesized effort default", "Spawn each at `high` by default.", /leftover/],
  ];
  for (const [name, sentence, expected] of cases) {
    await t.test(name, () => {
      const root = sandbox();
      edit(root, "skills/how/SKILL.md", (text) => `${text}\n${sentence}\n`);
      setDefault(root, "trivial edits", ["claude/sonnet:medium"]);
      const before = snapshot(root);

      const check = stamp(root, ["--check"]);
      assert.equal(check.status, 2, "invalid input exits 2 even alongside a stale template");
      assert.match(check.out, new RegExp(`skills/how/SKILL.md:\\d+:\\d+ ${expected.source}`));

      assert.equal(stamp(root).status, 2);
      assert.deepEqual(snapshot(root), before, "the stale template stays unstamped");
    });
  }
});

test("a role stated in no skill prose exits 2", () => {
  const root = sandbox();
  edit(root, "skills/show-me-your-work/SKILL.md", (t) => replaceOnce(t, "the `trail reviewer` role", "the trail reviewer"));
  const check = stamp(root, ["--check"]);
  assert.equal(check.status, 2);
  assert.match(check.out, /models\.json: role `trail reviewer` is stated in no skill prose/);
});

test("a bad catalog lists every problem, one per line, and writes nothing", () => {
  const root = sandbox();
  setDefault(root, "arena cross-judge pool", ["claude/opus:medium"]);
  setDefault(root, "bug-fix", ["parent:medium", "claude/opus:medium"]);
  setDefault(root, "swarm workers", ["claude/haiku"]);
  edit(root, "models.json", (t) => replaceOnce(t, '"role": "how explainer"', '"role": "how: explainer"'));
  const before = snapshot(root);

  const r = stamp(root);
  assert.equal(r.status, 2);
  const lines = r.out.trim().split("\n");
  for (const role of ["arena cross-judge pool", "bug-fix", "swarm workers", "how: explainer"]) {
    assert.equal(lines.filter((l) => l.startsWith("models.json:") && l.includes(role)).length, 1, `one line names ${role}`);
  }
  assert.deepEqual(snapshot(root), before);
});

test("non-Anthropic bundled defaults fail check and write without changing files", async (t) => {
  for (const provider of ["codex", "gemini"]) {
    await t.test(provider, () => {
      const root = sandbox();
      setDefault(root, "trail reviewer", [`${provider}/matched:medium`]);
      const before = snapshot(root);
      for (const args of [["--check"], []]) {
        const r = stamp(root, args);
        assert.equal(r.status, 2);
        assert.match(r.out, /models\.json: role `trail reviewer`.*bundled defaults allow only parent or claude/);
        assert.deepEqual(snapshot(root), before);
      }
    });
  }
});

test("empty defaults pass only for family other, regardless of kind", async (t) => {
  for (const kind of ["single", "panel", "pool"]) {
    for (const family of [undefined, "any", "other"]) {
      await t.test(`${kind}, ${family ?? "implicit any"}`, () => {
        const root = sandbox();
        edit(root, "models.json", (text) => {
          const json = JSON.parse(text);
          const role = json.roles.find((r) => r.role === "arena cross-judge pool");
          role.kind = kind;
          role.family = family;
          return JSON.stringify(json, null, 2);
        });
        const r = stamp(root, ["--check"]);
        if (family === "other") assert.deepEqual(r, { status: 0, out: "" });
        else {
          assert.equal(r.status, 2);
          assert.match(r.out, /models\.json: role `arena cross-judge pool` has an empty default but family is not `other`/);
        }
      });
    }
  }
});

test("an empty pool stamps a blank template value", () => {
  const root = sandbox();
  edit(root, SETUP, (text) => replaceOnce(text, "arena cross-judge pool:\n", "arena cross-judge pool: codex/matched:medium\n"));
  const check = stamp(root, ["--check"]);
  assert.equal(check.status, 1);
  assert.match(check.out, /template fence is stale/);
  assert.equal(stamp(root).status, 0);
  assert.ok(templateFence(read(root, SETUP)).includes("arena cross-judge pool:"));
  assert.deepEqual(stamp(root, ["--check"]), { status: 0, out: "" });
});

test("unknown catalog keys are rejected instead of ignored", () => {
  const root = sandbox();
  edit(root, "models.json", (t) => replaceOnce(t, '"family": "other"', '"famly": "other"'));
  const r = stamp(root, ["--check"]);
  assert.equal(r.status, 2);
  assert.match(r.out, /models\.json:.*famly/);
});

test("a missing or duplicated template fence, or a missing effort rule, exits 2", async (t) => {
  await t.test("missing fence", () => {
    const root = sandbox();
    edit(root, SETUP, (text) => replaceOnce(text, "# flatpaper-stack model configuration.", "# model configuration."));
    const r = stamp(root, ["--check"]);
    assert.equal(r.status, 2);
    assert.match(r.out, /template fence/);
  });
  await t.test("duplicated fence", () => {
    const root = sandbox();
    edit(root, "skills/how/SKILL.md", (text) => `${text}\n\`\`\`\n${templateFence(read(root, SETUP)).join("\n")}\n\`\`\`\n`);
    const r = stamp(root, ["--check"]);
    assert.equal(r.status, 2);
    assert.match(r.out, /template fence/);
  });
  await t.test("effort rule gone from spawning.md", () => {
    const root = sandbox();
    edit(root, SPAWNING, (text) => replaceOnce(text, "A default written without an effort means `medium`.", "Defaults carry no effort."));
    const r = stamp(root, ["--check"]);
    assert.equal(r.status, 2);
    assert.match(r.out, new RegExp(SPAWNING));
  });
});

test("an unknown flag exits 2", () => {
  assert.equal(stamp(sandbox(), ["--bogus"]).status, 2);
});

test("prose survives a template stamping write byte for byte", () => {
  const root = sandbox();
  const keep = [
    [SPAWNING, "A skill names a role, such as the `how explorer` role."],
    [SETUP, "For panel roles (arena runners, interrogate reviewers) the value is a list"],
    ["skills/no-comments/SKILL.md", "default `main`"],
  ];
  for (const [file, text] of keep) assert.ok(read(root, file).includes(text), `fixture text present in ${file}`);
  setDefault(root, "swarm workers", ["claude/haiku:medium"]);

  assert.equal(stamp(root).status, 0);
  for (const [file, text] of keep) assert.ok(read(root, file).includes(text), `${file} keeps: ${text}`);
  assert.ok(read(root, "skills/swarm/SKILL.md").includes("the `swarm workers` role"), "the swarm role is unchanged");
});

test("the template keeps the head lines first and one parseable line per catalog role", () => {
  const fence = templateFence(read(repo, SETUP));
  assert.deepEqual(fence.slice(0, catalog.template.head.length), catalog.template.head);
  assert.ok(catalog.template.head.includes("session hook: on"));
  const roles = fence.slice(catalog.template.head.length).map((line) => {
    const at = line.search(/: |:$/);
    return [line.slice(0, at), line.slice(at + 2)];
  });
  assert.deepEqual(roles, catalog.roles.map((r) => [r.role, r.default.join(", ")]));
});

test("the user's models.md is never read or written, and its roles stay in the template", () => {
  const root = sandbox();
  const home = mkdtempSync(join(tmpdir(), "stamp-models-home-"));
  const userFile = join(home, ".claude/flatpaper-stack/models.md");
  const user = "# budget: large (xhigh)\nsession hook: off\nfeature, refactoring: claude/opus:xhigh\narena runners: parent:xhigh, codex/custom-model:xhigh\nhardest tasks: parent:max\n";
  mkdirSync(dirname(userFile), { recursive: true });
  writeFileSync(userFile, user);
  setDefault(root, "swarm workers", ["claude/haiku:medium"]);
  const env = { PATH: process.env.PATH, HOME: home };

  assert.equal(stamp(root, ["--check"], env).status, 1);
  assert.equal(stamp(root, [], env).status, 0);
  assert.equal(readFileSync(userFile, "utf8"), user, "user file byte-identical");

  const templateRoles = new Set(templateFence(read(root, SETUP)).map((l) => l.slice(0, l.indexOf(": "))));
  for (const line of user.split("\n").filter((l) => l && !l.startsWith("#"))) {
    assert.ok(templateRoles.has(line.slice(0, line.indexOf(": "))), `template still lists the user's role: ${line}`);
  }
});
