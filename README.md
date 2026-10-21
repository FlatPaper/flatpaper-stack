# flatpaper

A Claude Code plugin for agent work you can trust and review later. Adapted from poteto's [pstack](https://github.com/cursor/plugins/tree/main/pstack).

It is built for Claude Code. The hooks, the `/flatpaper-stack:` skill names, the task tools, and the plugin layout are Claude Code's. pstack is the Cursor version of the same ideas.

Three ideas carry it:

1. Every task has a done check that can fail.
2. Proof comes from the real artifact, not the agent's word.
3. Long work leaves a decision trail you can audit in minutes.

## What's inside

| Piece | What it does |
|---|---|
| `guidelines.md` | Always-on rules, loaded at session start by a hook |
| `UserPromptSubmit` hook | One-line reminder on every prompt: concise replies, a done check, proof, and constraints, and the principles footer in flatpaper-mode sessions |
| `gh pr create` gate | In a flatpaper-mode session, blocks `gh pr create` until the session has run `tidy`, `no-comments`, `technical-writing`, and `unslop`, and lists the Opening a PR steps that always run. A `PreToolUse` hook in the flatpaper-mode skill's frontmatter |
| `/flatpaper-stack:flatpaper-mode` | Rigorous mode. Matches the task to a playbook (investigation, bug fix, feature, refactoring, prototype, autonomous run, architecture page, perf, babysit, session pickup, pause safely, worktree cleanup, multi-phase plan, runtime forensics, trace forensics, opening a PR) |
| Architecture drift line | At session start, says when `docs/architecture/` is behind this repo's commits, or behind the latest release of the repo it describes. Silent otherwise. |
| `/flatpaper-stack:show-me-your-work` | Decision log (TSV), audited against the transcript, with an Attention section from a fresh reviewer |
| `/flatpaper-stack:create-verification-skill` | Generates a project-local `verify-<app>` skill (launch, doctor, drive, evidence, cleanup, feature map) and proves it once, including that Doctor can fail. flatpaper-mode playbooks drive the app through it and offer to create one when a task needs it |
| `/flatpaper-stack:maintain-verification-skill` | Rechecks the `verify-<app>` feature map against the code and the live app, and opens at most one PR of proven corrections |
| `/flatpaper-stack:blast-radius` | Finds what a change breaks outside its diff, and proves the facts it is safe because of with a rerunnable script |

### Skills flatpaper-mode calls for you

You don't type these. A playbook step runs them. You can still call one directly.

| Skill | Called from | What it does |
|---|---|---|
| `/flatpaper-stack:why` | Investigation | Finds why code is the way it is, from git, PRs, and whichever trackers, docs, chat, and observability connectors the session can reach. Every claim gets a confidence tier |
| `/flatpaper-stack:architect` | Feature | Sketches types, signatures, and module structure in competing designs before code |
| `/flatpaper-stack:interrogate` | Feature, Refactoring | Adversarial review by three fresh reviewers on `opus`, `sonnet`, and `fable`, then one verdict |
| `/flatpaper-stack:swarm` | Feature, Perf, Multi-phase plan | Fans out parallel workers and returns one table |
| `/flatpaper-stack:arena` | Prototype | Runs candidates on `opus`, `sonnet`, and `fable`, picks a base, and grafts the best parts of the others |
| `/flatpaper-stack:tidy` | Opening a PR | Fresh reviewers check the diff for reuse, simplification, efficiency, and altitude. Applies the fixes that hold up and reports what it skipped. Quality only, not bugs |
| `/flatpaper-stack:no-comments` | Opening a PR | A fresh reviewer deletes comments that don't earn their place and flags code that needs prose to make sense. Fixes the accepted flags and offers to turn claimed constraints into a type, test, or lint |
| `/flatpaper-stack:unslop` | Every reply | Cuts AI tells from prose |
| `/flatpaper-stack:technical-writing` | Docs and PR text | Layered writing standard for docs, READMEs, PR descriptions, and commit messages |

Subagents use only Anthropic models: `opus`, `sonnet`, `fable`, and `haiku`. Same-family review catches less than a cross-vendor mix, so the skills treat agreement between reviewers as a weaker signal than pstack does.

### Subagents

flatpaper-mode is a by-hand skill, so a subagent cannot load it from its skill list. The plugin ships two agents for that.

| Agent | Spawned by | What it does |
|---|---|---|
| `flatpaper-stack:flatpaper-agent` | flatpaper-mode, for code-writing delegates and helpers | Reads the mode, its principles, and the guidelines before any work. Does not run the playbook itself |
| `flatpaper-stack:comment-sicko` | `/flatpaper-stack:no-comments` | Deletes comments that don't earn their place and flags code that needs prose. Touches comments only |

### Skills you call by hand

These act on your session or your repo at a time you choose.

| Skill | What it does |
|---|---|
| `/flatpaper-stack:correct` | Makes a repeated agent mistake impossible: architecture, types, a lint, a hook, a test, docs last. Each check is shown failing on the mistake and passing on the fix |
| `/flatpaper-stack:reflect` | Three reviewers mine this session's transcript. Each learning becomes a proposed edit to a skill, `CLAUDE.md`, or memory, shown for your approval |
| `/flatpaper-stack:recall` | Rebuilds recent context from this project's sessions, decision logs, git, and open PRs into a short current-state brief |
| `/flatpaper-stack:ketchup` | Catches you up on what changed since your last message in under 150 words, with each action item laid out so you can decide |
| `/flatpaper-stack:flatpaper-help` | Answers how-to questions about flatpaper: setup, wording a flatpaper-mode prompt, which skill or playbook fits, and fixes for a run that went wrong. Hands back a prompt to send instead of starting the work |
| `/flatpaper-stack:sharpen` | Before starting, asks how a top expert would do the task, what you are really after, and whether the ask is over- or underspecified, then does the work |

## Install

Load it from a local clone with a shell alias. Edits take effect on the next session.

```bash
alias claude='claude --plugin-dir ~/Documents/GitHub/flatpaper-stack'
```

To use it in the IDE extension or desktop app too, install it from the local clone instead. Nothing is published.

```bash
claude plugin marketplace add ~/Documents/GitHub/flatpaper-stack
claude plugin install flatpaper-stack@flatpaper-stack --scope user
```

## Settings

Add these to `~/.claude/settings.json`, then restart Claude Code. A session that is already open keeps its old tool list.

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TODO_TOOLS": "1"
  },
  "attribution": { "commit": "", "pr": "", "sessionUrl": false }
}
```

| Setting | Required | Why |
|---|---|---|
| `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` | Yes | Claude Code hides `TaskCreate` and `TaskUpdate` by default on newer models. flatpaper-mode puts each playbook step in the task list with them. Without it, the mode falls back to a checklist in its replies. |
| `attribution` | No | Removes the Claude co-author line from commits and PRs, enforced by Claude Code instead of a rule. |

Check the plugin after editing a skill or playbook with `scripts/check-skills.sh`. It lints frontmatter, README listings, playbook wiring, relative paths, skill and agent references, agents dispatched by bare name, non-Anthropic model names, and references to the upstream plugin in skills and agents. After editing a script, run `scripts/test-scripts.sh`. It runs fixtures for `check-plan.sh` and `worktree-audit.sh`. CI runs both on Linux and macOS.

Optional tools: `jq` and `gh` (logged in). The finish steps read a PR back with `gh`. Without it, that check is reported inconclusive. The architecture drift line uses both to check the latest release of the repo a page describes. Without them, it still checks this repo's commits.

## Use

Quick questions need nothing. The guidelines are always on.

### The prompt format

For real work, start with the mode and give up to five parts, one sentence each:

```
/flatpaper-stack:flatpaper-mode <goal>. done means <check>. show me <proof>. <what you know>. <constraints>.
```

| Part | What it is | Example |
|---|---|---|
| `<goal>` | The outcome, not the steps. Its wording steers the playbook (see below). | fix the csv export dropping its last row |
| `<check>` | Something that can pass or fail. Not "see if", not a duration. | done means the 60k-row fixture exports every row |
| `<proof>` | The real output you want to see. | show me row counts before and after |
| `<what you know>` | Facts only, not your theory of the cause. | started after yesterday's deploy. failing job is 4812 |
| `<constraints>` | What it must not do, or must do first. | repro first. no PR. don't touch the schema |

Only the goal is required. A missing check, proof or constraints gets proposed back to you in one line, but yours is the one the agent can't quietly weaken.

### Words that steer the playbook

| Say | Playbook |
|---|---|
| how does, why is, is anything wrong, are we sure | Investigation (read-only) |
| fix, broken, repro | Bug fix |
| add, build, support | Feature |
| clean up, restructure, without changing behavior | Refactoring |
| try, sketch, which works better | Prototype |
| im stepping away, run until, /loop until | Autonomous run |
| map this repo, update the architecture page | Architecture page |
| speed up, make it faster, cut the cost | Perf |
| babysit, get it green, address the review comments | Babysit |
| pick up, take over this branch, continue from the log | Session pickup |
| pause, stop for now, pick this up tomorrow | Pause safely |
| clean up worktrees | Worktree cleanup |
| plan this migration, break this into PRs | Multi-phase plan |
| why is this process hung, what is it doing right now | Runtime forensics |
| read this trace, what does this profile show | Trace forensics |

### Several tasks in one session

Each prompt is matched to a playbook again. When the kind of work changes (review, then fix, then PR), the mode switches playbooks and marks the old one's open steps as superseded. Starting with `new task:` makes the switch explicit. Don't `/clear` in between. The next step usually needs what the last one found.

```
/flatpaper-stack:flatpaper-mode is anything on the architecture page wrong or hard to follow? done means each finding cites the line and the code that contradicts it. read-only.
fix the wrong items. show me a before/after table with evidence. no PR yet.
raise a draft PR.
```

Every playbook ends with the same finish steps: run the repo's tests, follow its PR rules, and read the PR back with `gh pr view`. Where a repo sets no PR rules, the Opening a PR playbook supplies defaults: Conventional Commits titles, a short PR body with fixed headings, and draft unless you say ready. Written repo rules replace only those format defaults. `tidy`, `no-comments`, the risk call (`blast-radius` if the diff is risky), `technical-writing`, and `unslop` always run. In a flatpaper-mode session, a hook blocks `gh pr create` until the session transcript shows a Skill call or slash command for `tidy`, `no-comments`, `technical-writing`, and `unslop`. `FLATPAPER_PR_GATE_OFF=1` turns it off. The repo's rules files (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/README.md`, the PR template) are read at the start of every task.

### Steering a run

Steering prompts are one line. Name the principle or the rule that was broken.

```
i said the goal is to repro. i did not ask for a fix yet. stay on the bug fix playbook.
apply prove it works. show me the real output, not the build log.
apply attack the premise. both fixes assumed the cache is stale.
```

### Pitfalls

- **Naming skills in the prompt.** "investigate, then prototype, then build" reorders steps the playbook already sequences. State the goal and the constraints.
- **Leading with your theory of the cause.** The agent searches where you pointed. Give facts, let it restate the problem, then share your hunch.
- **Taking the first design.** Ask for two prototypes and pick from what runs.
- **Reviewing a plan with no code behind it.** Review of an abstract plan invents risks. Settle open questions with a prototype, then review what got built.
- **Parallel agents in one worktree.** They overwrite each other. Say "own worktree per attempt".
- **Looping before you trust the loop.** A loop that can't verify its own work only makes unchecked work faster. Get `/flatpaper-stack:create-verification-skill` working first.
- **Trusting an unvetted number.** A warm cache or a skipped code path can fake a speedup. Use the Perf playbook.
- **Accepting every review comment.** Reviews mix real catches and noise. Babysit triages each one against the code.
- **Correcting the same mistake by hand.** A correction in chat helps one run. Turn it into a check, a lint, or a hook.
- **Editing a skill mid-task.** Note the problem and fix the skill in its own change.

### Examples

```
/flatpaper-stack:flatpaper-mode the dashboard shows no runs through the Coder URL. done means a smoke run appears through the Coder URL. show me the /api/runs response. /ws returns 403 through the proxy; a local tunnel works. repro first.

/flatpaper-stack:flatpaper-mode scan every test in this repo for tests that would pass if the code did nothing, and for behavior with no test. done means every test file is judged. show me the results as an artifact. no PR.
```

When you step away:

```
/flatpaper-stack:flatpaper-mode im stepping away. <goal>. done means <check>. keep a decision log. if stuck, stop and write up why.
```

When you're back:

```
/flatpaper-stack:show-me-your-work catch me up on what you did
```

Read the Attention section first.

Once per repo, give the agent a scripted way to prove the app works:

```
/flatpaper-stack:create-verification-skill
```
