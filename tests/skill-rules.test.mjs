// Port-local rules live in files the port has forked, which scripts/sync.mjs
// three-way merges. The sync blocks on a conflict and never writes markers, but
// a clean merge can still drop a sentence when upstream rewrites the paragraph
// around it, and that reads as a successful sync. Each rule is pinned here by
// the sentence that carries it, with the PR that earned it. Rules a
// substitutions.json rule carries are guarded by `sync.mjs --check-rules`, so
// they are not repeated here. references/spawning.md and
// hooks/session-start-context.md are port-only, so only an edit can drop a rule
// there, and they are pinned for the same reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");

const rules = [
  {
    source: "PR2 resolve model layers before the first spawn",
    file: "skills/flatpaper-mode/references/spawning.md",
    phrase: "run `node <plugin>/scripts/resolve-models.mjs` once and use the role lines in its resolved table.",
  },
  {
    source: "PR2 keep panels intact during fallback",
    file: "skills/flatpaper-mode/references/spawning.md",
    phrase: "If any entry is unusable, the whole line falls through to the next layer, so panel sizes stay intact.",
  },
  {
    source: "review tiers group ready edits in one brief",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "Edits that are ready at the same time and touch the same files go to one delegate in one brief.",
  },
  {
    source: "review tiers review every diff at its highest risk tier",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "Every independent PR review, including a review of commits added after an earlier verdict, goes to the highest tier anything in the diff under review qualifies for.",
  },
  {
    source: "review tiers lower tier verdict does not count",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "A verdict from a lower tier on such a diff does not count.",
  },
  {
    source: "review tiers PR reviewers skip cross-family selection",
    file: "skills/flatpaper-mode/references/spawning.md",
    phrase: "Steps 1 and 2 do not apply to them.",
  },
  {
    source: "PR3b Codex seats load the owning plugin skill",
    file: "skills/flatpaper-mode/references/spawning.md",
    phrase: "Load its `codex-seat` skill and follow it.",
  },
  {
    source: "e58dd04 sync: bullet-only playbooks still copy one task per item",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "In a playbook with no numbered steps, each paragraph and each list item is a step.",
  },
  {
    source: "PR3b every brief carries the worker.md line",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "Every brief, Agent or Codex, starts with this line.",
  },
  {
    source: "PR3b Codex seats use the matching flatpaper agent path",
    file: "skills/flatpaper-mode/references/spawning.md",
    phrase: "When the Claude spawn would use `subagent_type: \"flatpaper-stack:<name>\"`, pass `--agent <plugin>/skills/flatpaper-mode/codex-agents/<name>.md`.",
  },
  {
    source: "#40 Codex flatpaper-agent reads unslop before its hand-back",
    file: "skills/flatpaper-mode/codex-agents/flatpaper-agent.md",
    phrase: "Before you hand back, read `${CLAUDE_PLUGIN_ROOT}/skills/unslop/SKILL.md` in full and write the hand-back through it, per flatpaper-mode's **Writing the reply**.",
  },
  {
    source: "PR2b resolver failure uses parent for every role",
    file: "skills/flatpaper-mode/references/spawning.md",
    phrase: "If the resolver cannot run, use `parent` for every role and say so.",
  },
  {
    source: "follow-up rounds took the playbook's printed default instead of the models file",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "Read the line in the resolved table again before each spawn.",
  },
  {
    source: "#22 load the deferred task tools with ToolSearch",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "Claude Code defers `TaskCreate` and `TaskUpdate`, so load them with `ToolSearch`",
  },
  {
    source: "#22 open the task list before any other tool call",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "Do both before any tool call except reading the playbook or the skill it routes to",
  },
  {
    source: "#22 turn the task tools on when they are missing",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "`CLAUDE_CODE_ENABLE_TODO_TOOLS=1` in the environment",
  },
  {
    source: "#22 fall back to a todo.md checklist with no task tool",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "keep an uncommitted `todo.md` checklist in the work dir",
  },
  {
    source: "#22 invoke unslop, no-comments, and technical-writing with the Skill tool",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "so a project hook that checks for them sees the call",
  },
  {
    source: "#22 a required review with no independent reviewer blocks",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "Record `BLOCKED: independent review` in the task list",
  },
  {
    source: "#22 only an independent reviewer's verdict opens the gate",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "Never count your own review, passing tests, or CI as the independent verdict.",
  },
  {
    source: "#25 a project playbook change is anchored to bundled step text",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "A change is a list item that starts with `**After**`, `**Before**`, `**Replace**` or `**In**`",
  },
  {
    source: "#25 check project playbooks before applying one",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "run `node <plugin>/skills/flatpaper-mode/scripts/check-playbooks.mjs` from the repository root",
  },
  {
    source: "#25 an unanchored project playbook change is reported, not guessed",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "do not guess where an unanchored change belongs",
  },
  {
    source: "#22 the session hook runs when models.md has no line for it",
    file: "skills/setup-flatpaper-stack/SKILL.md",
    phrase: "With no file or no line, the hook runs.",
  },
  {
    source: "#22 the session hook off switch is a models.md line",
    file: "skills/setup-flatpaper-stack/SKILL.md",
    phrase: "The answer is the `session hook` line, `on` or `off`.",
  },
  {
    source: "#23 a role default without an effort means medium",
    file: "skills/flatpaper-mode/references/spawning.md",
    phrase: "A default written without an effort means `medium`.",
  },
  {
    source: "#21 raising a panel's effort never changes its models",
    file: "skills/flatpaper-mode/references/spawning.md",
    phrase: "Change only the effort, and keep the model or agent the role names, so a diverse panel stays diverse.",
  },
  {
    source: "#21 flatpaper-agent finds flatpaper-mode when the parent gave no path",
    file: "agents/flatpaper-agent.md",
    phrase: "Your skill catalog hides this skill, so a missing catalog entry does not mean flatpaper-stack is absent.",
  },
  {
    source: "#21 flatpaper-agent reads flatpaper-mode from the path its parent gave",
    file: "agents/flatpaper-agent.md",
    phrase: "Use the absolute path your parent gave you.",
  },
  {
    source: "#21 flatpaper-agent reads unslop by path before it hands back",
    file: "agents/flatpaper-agent.md",
    phrase: "Before you hand back, read `${CLAUDE_PLUGIN_ROOT}/skills/unslop/SKILL.md` in full",
  },
  {
    source: "#21 comment-sicko reads why by path",
    file: "agents/comment-sicko.md",
    phrase: "read all of `${CLAUDE_PLUGIN_ROOT}/skills/why/SKILL.md` and follow it on that symbol or call",
  },
  {
    source: "#21 why is user-only, so comment-sicko never invokes it",
    file: "agents/comment-sicko.md",
    phrase: "It is user-only, so I never invoke it.",
  },
  {
    source: "#22 figure-it-out loads the task tools first",
    file: "skills/figure-it-out/SKILL.md",
    phrase: "load the task tools and open a task list, per the Task list section of `../flatpaper-mode/SKILL.md`",
  },
  {
    source: "#21 reflect edits a copy, never the plugin cache",
    file: "skills/reflect/SKILL.md",
    phrase: "Never edit a skill under `~/.claude/plugins/cache/`.",
  },
  {
    source: "#21 show-me-your-work reads only this project's transcripts",
    file: "skills/show-me-your-work/SKILL.md",
    phrase: "Don't glob across `~/.claude/projects/*/`. That reads unrelated private chats.",
  },
  {
    source: "#21 session pickup reads only this project's transcripts",
    file: "skills/flatpaper-mode/playbooks/session-pickup.md",
    phrase: "do not glob across `~/.claude/projects/*/`",
  },
  {
    source: "#21 swarm respawns a dropped worker once, then records a gap",
    file: "skills/swarm/SKILL.md",
    phrase: "Respawn a worker that dropped out once too. After a second miss, record a gap.",
  },
  {
    source: "#21 arena runners that write the repo get a worktree",
    file: "skills/arena/SKILL.md",
    phrase: "with `isolation: \"worktree\"` when the output lives in the repo",
  },
  {
    source: "reviewers prefer a family that did not write the work, and label a same-family fallback",
    file: "skills/flatpaper-mode/references/spawning.md",
    phrase: "Report it as a same-family review and name the model.",
  },
  {
    source: "#29 a fix claim needs a reviewer who agrees",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "When the reviewer says a window remains, write \"narrowed\" and name what is left.",
  },
  {
    source: "#29 verify with the production environment's wiring",
    file: "skills/flatpaper-mode/playbooks/feature.md",
    phrase: "Wire the local run the way the production environment (if one exists) wires it",
  },
  {
    source: "#29 the report names what the evidence does not cover",
    file: "skills/flatpaper-mode/playbooks/feature.md",
    phrase: "say what the evidence covers and what it doesn't",
  },
  {
    source: "#29 a user-decided change to a built feature takes the short path",
    file: "skills/flatpaper-mode/playbooks/feature.md",
    phrase: "steps 1, 2, 3 and 7 default to `skip: <reason>`",
  },
  {
    source: "#29 the short path waives the matching triggers",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "When Feature's **Short path** applies, the `architect` and `interrogate` triggers yield to its skips.",
  },
  {
    source: "pstack-claude #438 a focused bug fix skips architect",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "When Bug fix's **Focused-fix exception** applies, the `architect` trigger yields to its skips.",
  },
  {
    source: "pstack-claude #438 patch size alone never qualifies",
    file: "skills/flatpaper-mode/playbooks/bug-fix.md",
    phrase: "A small patch alone never qualifies.",
  },
  {
    source: "PR3b Explore seats stay read-only",
    file: "skills/flatpaper-mode/references/spawning.md",
    phrase: "Pass `read-only` for every seat whose Claude spawn would use `subagent_type: Explore`.",
  },
  {
    source: "PR3b custom agent exceptions stay in flatpaper policy",
    file: "skills/flatpaper-mode/references/spawning.md",
    phrase: "These exceptions include `arena`, `interrogate`, `architect`, `swarm`, `reflect`, and `thermos`.",
  },
  {
    source: "#21 shipping uses gh and never requires Graphite",
    file: "skills/flatpaper-mode/playbooks/shipping.md",
    phrase: "Use the GitHub CLI (`gh`) for every PR operation. Never require Graphite (`gt`).",
  },
  {
    source: "#21 the trail log writes its header once when calls race",
    file: "skills/show-me-your-work/scripts/log.sh",
    phrase: "ln \"$tmp\" \"$logfile\" 2>/dev/null || true",
  },
  {
    source: "#38 the session hook's work-directly advice stops at a flatpaper-mode run",
    file: "hooks/session-start-context.md",
    phrase: "While flatpaper-mode runs, its playbook decides who writes code.",
  },
  {
    source: "#38 read the role line and spawning.md before a delegated step's first edit",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "Before the first edit of a playbook step that delegates implementation, read the step's role line",
  },
  {
    source: "#38 the chat running the playbook writes no product file",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "In those steps, the chat running the playbook changes no product file by any route, Bash heredocs and scripts included.",
  },
  {
    source: "PR3b Codex roles follow spawning.md",
    file: "skills/flatpaper-mode/SKILL.md",
    phrase: "A role that calls for a Codex model runs a Codex seat per `references/spawning.md`.",
  },
  {
    source: "#38 the pause resume note records the work split",
    file: "skills/flatpaper-mode/playbooks/pause-safely.md",
    phrase: "Record the work split too: each open piece of work with its role, model, and effort",
  },
  {
    source: "PR3b missing codex-seats drops Codex lines",
    file: "skills/flatpaper-mode/references/spawning.md",
    phrase: "The resolver drops `codex/*` lines when codex-seats is missing.",
  },
  {
    source: "PR3b Codex briefs carry the worker preamble",
    file: "skills/flatpaper-mode/references/spawning.md",
    phrase: "Start every Codex brief with `Read <path>/worker.md before anything else.`, just like an Agent kickoff.",
  },
  {
    source: "PR3b Comment Sicko uses the general agent rule",
    file: "skills/no-comments/SKILL.md",
    phrase: "Spawn Comment Sicko, the `comment-sicko` agent, on the `comment sicko` role per `../flatpaper-mode/references/spawning.md`.",
  },
  {
    source: "PR3b Comment Sicko edits the session's own checkout",
    file: "skills/no-comments/SKILL.md",
    phrase: "A Codex seat gets the session's own checkout as `<cwd>`",
  },
  {
    source: "PR3b Codex swarm workers follow spawning.md",
    file: "skills/swarm/SKILL.md",
    phrase: "A Codex worker is a Codex seat per spawning.md.",
  },
  {
    source: "#38 a Codex arena judge runs read-only",
    file: "skills/arena/SKILL.md",
    phrase: "A `codex` judge is a Codex seat run with `read-only`",
  },
  {
    source: "#38 a delegated step's arena grafts are folded by a fresh delegate",
    file: "skills/arena/SKILL.md",
    phrase: "a fresh delegate on that step's role folds the grafts into the base's worktree",
  },
];

test("setup offers Codex only with both installed plugins and reads the local model cache", () => {
  const setup = readFileSync(join(repo, "skills/setup-flatpaper-stack/SKILL.md"), "utf8");
  assert.ok(setup.includes("`plugins` object in `~/.claude/plugins/installed_plugins.json`"));
  assert.ok(setup.includes("only when both a `codex-seats@...` key and a `codex@...` key exist"));
  assert.ok(setup.includes("`models[].slug` and `supported_reasoning_levels[].effort`"));
  assert.ok(setup.includes("Without both plugins, offer only `parent` and `claude/*`"));
  assert.ok(!setup.includes("claude plugin list"));
  assert.ok(!setup.includes("VALID_REASONING_EFFORTS"));
});

test("setup offers the installed codex-seats preset over bundled defaults", () => {
  const setup = readFileSync(join(repo, "skills/setup-flatpaper-stack/SKILL.md"), "utf8");
  assert.ok(setup.includes("codex-seats' `installPath`"));
  assert.ok(setup.includes("read `<installPath>/models.md`"));
  assert.ok(setup.includes('"use Codex where codex-seats recommends"'));
  assert.ok(setup.includes("If the preset is missing, report its path"));
  assert.ok(setup.includes("The budget then sets the effort of every line, preset lines included."));
});

test("setup validates the written file with the SessionStart check until output is empty", () => {
  const setup = readFileSync(join(repo, "skills/setup-flatpaper-stack/SKILL.md"), "utf8");
  const writeAt = setup.indexOf("### 4. Write the file");
  const validateAt = setup.indexOf("### 5. Validate the written file");
  assert.ok(writeAt > 0 && validateAt > writeAt);
  const validation = setup.slice(validateAt, setup.indexOf("### 6. Confirm"));
  assert.ok(validation.includes("From the directory containing the file just written"));
  assert.ok(validation.includes("`node <plugin>/scripts/resolve-models.mjs --check`"));
  assert.ok(validation.includes("same check the SessionStart hook runs"));
  assert.ok(validation.includes("Empty output means valid"));
  assert.ok(validation.includes("JSON `systemMessage`"));
  assert.ok(validation.includes("correct the file, and rerun until output is empty"));
});

test("setup --repo writes only differences from the effective user layer", () => {
  const setup = readFileSync(join(repo, "skills/setup-flatpaper-stack/SKILL.md"), "utf8");
  assert.ok(setup.includes("With `--repo`, write `<repo root>/.agents/models.md` instead"));
  assert.ok(setup.includes("from your home directory to read the effective user layer"));
  assert.ok(setup.includes("only role lines that differ from the effective user layer"));
  assert.ok(setup.includes("plus the optional `providers:` line"));
  assert.ok(setup.includes("Offer no restriction or `providers: claude`"));
  assert.ok(setup.includes("repo file is meant to be committed and overrides the user file for that repo only"));
  assert.ok(setup.includes("Omit `session hook` and the budget comment from the repo file"));
});

test("Claude and Codex flatpaper agents keep the same required skill paths", () => {
  for (const file of ["agents/flatpaper-agent.md", "skills/flatpaper-mode/codex-agents/flatpaper-agent.md"]) {
    const agent = readFileSync(join(repo, file), "utf8");
    for (const skill of ["flatpaper-mode", "unslop"]) {
      assert.ok(agent.includes(`\${CLAUDE_PLUGIN_ROOT}/skills/${skill}/SKILL.md`), `${file} names ${skill}`);
    }
  }
});

test("every flatpaper agent outside the custom-skill exceptions has a Codex prompt", () => {
  const exceptions = new Set([
    "thermo-nuclear-review-subagent.md",
    "thermo-nuclear-code-quality-review-subagent.md",
  ]);
  const agents = readdirSync(join(repo, "agents")).filter((file) => file.endsWith(".md") && !exceptions.has(file));
  assert.ok(agents.includes("comment-sicko.md"));
  assert.ok(agents.includes("flatpaper-agent.md"));
  for (const agent of agents) {
    assert.ok(existsSync(join(repo, "skills/flatpaper-mode/codex-agents", agent)), `${agent} has a Codex prompt`);
  }
});

test("skills delegate Codex execution without naming a bundled runner path", () => {
  const runner = "codex" + "-run.sh";
  for (const file of readdirSync(join(repo, "skills"), { recursive: true }).filter((file) => file.endsWith(".md"))) {
    assert.ok(!readFileSync(join(repo, "skills", file), "utf8").includes(runner), `${file} delegates to the codex-seat skill`);
  }
});

test("every pinned phrase is distinctive enough to pin a rule", () => {
  const phrases = rules.map((r) => r.phrase);
  assert.equal(new Set(phrases).size, phrases.length);
  for (const phrase of phrases) assert.ok(phrase.length >= 20, `\`${phrase}\` is under 20 characters`);
});

for (const { source, file, phrase } of rules) {
  test(`${file} keeps the rule from ${source}`, () => {
    assert.ok(readFileSync(join(repo, file), "utf8").includes(phrase));
  });
}
