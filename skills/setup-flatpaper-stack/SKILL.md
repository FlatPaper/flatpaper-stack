---
name: setup-flatpaper-stack
description: Configure which models flatpaper-stack uses per role and at what reasoning budget. Detects your available models and writes a models file that overrides the skill defaults. Use for /flatpaper-stack:setup-flatpaper-stack, "configure flatpaper-stack models", "flatpaper-stack budget", or changing flatpaper-stack's model choices.
---

# Setup flatpaper-stack

Write `~/.claude/flatpaper-stack/models.md`, the file every flatpaper-stack skill reads to pick its model per role.

## Value format

Each value is `<provider>/<model>:<effort>`, or `parent:<effort>`.

- `claude/<alias>`: an Agent subagent with `model` set to the alias. The aliases are the ones the Agent tool's `model` parameter offers (today `sonnet`, `opus`, `haiku`, `fable`). Each alias runs the newest model in that family. The Agent tool does not take full model IDs, so the file stores the alias.
- `codex/<model>`: the `codex:codex-rescue` agent, with the brief saying `--model <model> --effort <effort>`. `codex/default` means no `--model`, so Codex uses its own default.
- `gemini/<name>`: the agent or MCP tool that the detected Gemini plugin or MCP provides.
- `parent`: leave `model` unset, so the role runs on the parent chat model.
- `<effort>` is the reasoning level: the Agent `effort` for `claude` and `parent`, the `--effort` flag for `codex`. The ladder is `max` > `xhigh` > `high` > `medium` > `low`.

## Steps

### 1. Detect available models

Check each provider. A provider that is missing gets one line in the step 3 summary and is skipped. Never ask for an API key, and never install anything.

- **Claude.** The aliases the Agent tool's `model` parameter offers in this session. That is the dependable source.
- **Codex.** Present when `claude plugin list` shows the `codex` plugin enabled. Its models are the entries in `~/.codex/models_cache.json` with `visibility: "list"`, read by `slug`. Each entry's `supported_reasoning_levels` gives its efforts, but the plugin's script accepts only up to `xhigh`, so cap Codex efforts there. If the plugin is present but the cache is missing, offer only `codex/default`.
- **Gemini.** Present only when an installed plugin provides a Gemini agent (a `subagent_type` containing `gemini`) or an MCP server exposes Gemini tools (`mcp__<server>__<tool>` names containing `gemini`, deferred tools included). A `gemini` CLI with no plugin or MCP around it does not count, because no skill can spawn it as a subagent. Say so in one line if you find one.

Never write a value you have not confirmed is available. `parent` is always valid.

### 2. Load current state

The default role-to-model mapping is the file shape shown in step 5 below. If `~/.claude/flatpaper-stack/models.md` already exists, read it and treat its `# budget` line and its role values as the current choices. Otherwise start from those defaults. A line whose role is not in step 5 is from a retired role. Drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Use AskUserQuestion. Offer these four options with these exact labels, and name the current budget when the file records one. With no file, say that `large` matches the skill defaults.

- `unlimited — max reasoning`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Build the working table from the skill defaults, and on a re-run keep any role whose model the user changed. `unlimited`, `large`, `medium`, and `small` set the effort of every value, panel entries included, to `max`, `xhigh`, `high`, or `medium`. If a model does not support that effort, use its highest supported effort below the target. So `unlimited` turns `parent:xhigh` into `parent:max`, and keeps `codex/gpt-6.1-sol:xhigh` at `xhigh` because the plugin caps Codex there. `small` turns them into `parent:medium` and `codex/gpt-6.1-sol:medium`.

**(c) Show the roles and confirm.** Show every role with its value as a table. Mark any value whose provider or model was not detected as needing a choice. Also list each line step 2 dropped, and one line per skipped provider. Ask whether to accept as-is or change specific roles, offering the detected models plus `parent` as the options. Use AskUserQuestion, which takes at most four options per question, so offer the most likely models and let "Other" take the rest.

For panel roles (arena runners, architect runners, interrogate reviewers) the value is a list, and one subagent runs per entry, `parent` included, so the list length sets the count. A panel is for diverse review, so warn when every entry is from one provider. `arena cross-judge pool` is also a list, but Arena runs one judge. It tries only values from a provider other than the parent's (Claude), in list order, so order it by preference. A `parent` value never judges. `trail reviewer` must also be a provider other than Claude, because `show-me-your-work` needs a different model family to review the work. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Every value written must use a detected provider and model, and an effort that model supports. `parent` always passes. If a chosen value is not available, stop and ask again.

### 5. Write the file

Create `~/.claude/flatpaper-stack/` if needed, then write `models.md` with a `# budget` line holding the chosen label and its target effort, and one line per role, using the same role names the skills use. Overwrite the whole file so re-runs stay idempotent. Shape:

```
# flatpaper-stack model configuration. One line per role. Delete a line to fall back to the skill default.
# Value: <provider>/<model>:<effort>, or parent:<effort> (leave Agent `model` unset). Entries in a panel list each count toward its fan-out.
# budget: large (xhigh)
feature, refactoring: parent:xhigh
bug-fix: parent:xhigh
perf-issue: parent:xhigh
hillclimb: parent:xhigh
trivial edits: claude/sonnet:xhigh
judgment and prose: parent:xhigh
hardest tasks: parent:xhigh
how explorer: claude/sonnet:xhigh
how explainer: parent:xhigh
why investigators: claude/sonnet:xhigh
why synthesizer: parent:xhigh
reflect tooling: parent:xhigh
reflect judgment, divergent, synthesizer: parent:xhigh
history explorers: claude/sonnet:xhigh
trail reviewer: codex/default:xhigh
arena runners: parent:xhigh, codex/default:xhigh
arena cross-judge pool: codex/default:xhigh, claude/opus:xhigh
swarm workers: parent:xhigh
architect runners: parent:xhigh, codex/default:xhigh
interrogate reviewers: parent:xhigh, codex/default:xhigh
```

`history explorers` covers the chat-history fan-out in `recall` and `automate-me`. `trail reviewer` is the cross-model reviewer in `show-me-your-work`.

### 6. Confirm

Tell the user the file was written, give its full path, and say that it applies from the next skill run. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /flatpaper-stack:create-verification-skill." On yes, read and follow `../create-verification-skill/SKILL.md` (it is user-only, so the Skill tool can't run it). On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill (a project skill that runs a model checker, a proof, or another verifier against the code). If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with /flatpaper-stack:create-formal-verification-skill." On yes, read and follow `../create-formal-verification-skill/SKILL.md` (it is user-only, so the Skill tool can't run it). On no, move on without pushing.
