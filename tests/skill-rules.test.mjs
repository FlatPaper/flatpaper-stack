// Port-local rules live in files the port has forked, which scripts/sync.mjs
// three-way merges. The sync blocks on a conflict and never writes markers, but
// a clean merge can still drop a sentence when upstream rewrites the paragraph
// around it, and that reads as a successful sync. Each rule is pinned here by
// the sentence that carries it, with the PR that earned it. Rules a
// substitutions.json rule carries are guarded by `sync.mjs --check-rules`, so
// they are not repeated here. references/spawning.md is port-only, so only an
// edit can drop a rule there, and it is pinned for the same reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");

const rules = [
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
    source: "#21 comment-sicko reads how and why by path",
    file: "agents/comment-sicko.md",
    phrase: "I read all of `${CLAUDE_PLUGIN_ROOT}/skills/how/SKILL.md`, `${CLAUDE_PLUGIN_ROOT}/skills/why/SKILL.md`, or both",
  },
  {
    source: "#21 how and why are user-only, so comment-sicko never invokes them",
    file: "agents/comment-sicko.md",
    phrase: "They are user-only, so I never invoke them.",
  },
  {
    source: "#21 architect opens a task list with TaskCreate",
    file: "skills/architect/SKILL.md",
    phrase: "Then open a task list with `TaskCreate`, one entry per phase, before any other work.",
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
    source: "#23 a verifier from the author's family does not count",
    file: "skills/flatpaper-mode/playbooks/orchestrate.md",
    phrase: "If none from another family is available, say so instead of substituting a Claude model.",
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
    phrase: "the `how`, `architect`, `interrogate` and throughput-checkpoint triggers above yield to its skips",
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
];

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
