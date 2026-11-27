---
name: setup-flatpaper-stack
description: Configure which models flatpaper-stack uses per role and at what reasoning budget. Detects your available models and writes a models file that overrides the skill defaults. Use for /flatpaper-stack:setup-flatpaper-stack, "configure flatpaper-stack models", "flatpaper-stack budget", or changing flatpaper-stack's model choices.
---

# Setup flatpaper-stack

Write `~/.claude/flatpaper-stack/models.md`, the user layer read by the resolver per `../flatpaper-mode/references/spawning.md`. With `--repo`, write `<repo root>/.agents/models.md` instead. For `--repo`, find the nearest ancestor with a `.git` file or directory. Stop if there is none. Explain that the repo file is meant to be committed and overrides the user file for that repo only.

## Value format

Each value is `<provider>/<model>:<effort>`, or `parent:<effort>`.

- `claude/<alias>`: an Agent subagent with `model` set to the alias. The aliases are the ones the Agent tool's `model` parameter offers (today `sonnet`, `opus`, `haiku`, `fable`). Each alias runs the newest model in that family. The Agent tool does not take full model IDs, so the file stores the alias.
- `codex/<model>`: a Codex seat through the codex-seats plugin, per `../flatpaper-mode/references/spawning.md`.
- `codex/matched`: the Codex model at the parent's tier, as defined by the codex-seats plugin's `codex-seat` skill.
- `parent`: leave `model` unset, so the role runs on the parent chat model.
- `<effort>` is the reasoning level: the Agent `effort` for `claude` and `parent`, the effort passed per the codex-seats plugin's `codex-seat` skill for `codex`. The ladder is `max` > `xhigh` > `high` > `medium` > `low`.

## Steps

### 1. Detect available models

Check each provider. A provider that is missing gets one line in the step 3 summary and is skipped. Never ask for an API key, and never install anything.

- **Claude.** The aliases the Agent tool's `model` parameter offers in this session. That is the dependable source.
- **Codex.** Read the `plugins` object in `~/.claude/plugins/installed_plugins.json`. Codex is available only when both a `codex-seats@...` key and a `codex@...` key exist. Read codex-seats' `installPath` from its entry in the key's array. Read models from `~/.codex/models_cache.json`, using `models[].slug` and `supported_reasoning_levels[].effort`. Offer only efforts on the routing ladder above. If the cache is missing, offer only `codex/default` and `codex/matched` through the `codex-seat` skill. Without both plugins, offer only `parent` and `claude/*`. Say that codex-seats adds Codex models.
- **Preset.** When Codex is available, read `<installPath>/models.md`. Offer its role lines over the bundled defaults as "use Codex where codex-seats recommends". Never embed preset values in this skill. If the preset is missing, report its path and keep the bundled defaults available.

Never write a value you have not confirmed is available. `parent` is always valid.

### 2. Load current state

The default role-to-model mapping is the file shape shown in step 4 below. If `~/.claude/flatpaper-stack/models.md` already exists, read it and treat its `# budget` line, its `session hook` line, and its role values as the current choices. Otherwise start from those defaults. A line whose role is not in step 4, such as `architect runners`, `reflect tooling`, or `pr verifier`, is from a retired role. Drop it.

For `--repo`, run `node <plugin>/scripts/resolve-models.mjs` from your home directory to read the effective user layer over bundled defaults, without repo overrides. Use those role values as the baseline. Read any existing repo file as the current choices. Preserve its `providers:` restriction unless the user changes it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Use AskUserQuestion. Offer these four options with these exact labels, and name the current budget when the file records one. With no file, say that `small` matches the skill defaults.

- `unlimited — max reasoning`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Build the working table from the bundled defaults, or the effective user layer for `--repo`. Apply the preset only if accepted. The preset chooses models. The budget then sets the effort of every line, preset lines included. On a re-run, keep role models the user changed unless they accept the preset for those roles. `unlimited`, `large`, `medium`, and `small` set the effort of every value, panel entries included, to `max`, `xhigh`, `high`, or `medium`. The `hardest tasks` role goes one step higher, up to `max`. If a model does not support that effort, use its highest supported effort below the target. For example, `unlimited` turns `parent:xhigh` into `parent:max`. Cap a named Codex model at its supported effort from step 1. For `codex/default` and `codex/matched`, follow the `codex-seat` skill for supported efforts.

**(c) Show the roles and confirm.** Show every role with its value as a table. Mark any value whose provider or model was not detected as needing a choice. Also list each line step 2 dropped, and one line per skipped provider. Ask whether to accept as-is or change specific roles, offering the detected models plus `parent` as the options. Use AskUserQuestion, which takes at most four options per question, so offer the most likely models and let "Other" take the rest.

For panel roles (arena runners, interrogate reviewers) the value is a list, and one subagent runs per entry, `parent` included, so the list length sets the count. A panel is for diverse review, so warn when every entry is from one provider. `arena cross-judge pool` is also a list, but Arena runs one judge. It tries only values from a provider other than the parent's (Claude), in list order, so order it by preference. A `parent` value never judges. `trail reviewer` is an ordered list too. Each review takes the first entry from a family that did not write the work, and falls back to a labelled same-family review when none is available, per **Cross-family reviewer** in `../flatpaper-mode/references/spawning.md`. Order each by preference, and include a family your code-writing roles don't use when one is detected. `swarm workers` runs a swarm's easy pieces and `swarm hard workers` runs the pieces that need judgment, unless a race or comparison assigns another model per arm.

The `pr critical reviewer`, `pr deep reviewer`, and `pr triage reviewer` roles cover critical, logic, and routine PR changes and name models directly, without the cross-family rule.

**(d) Ask about the session hook.** Skip this question for `--repo`. The hook reads only the user file. The plugin's `SessionStart` hook tells the agent to invoke flatpaper-mode for multi-file, design, and unknown-cause bug or perf work. It runs on startup, resume, clear, and compact. Use AskUserQuestion to ask whether to keep it. The default is on. The answer is the `session hook` line, `on` or `off`. With no file or no line, the hook runs.

For `--repo`, also ask whether to restrict providers. Offer no restriction or `providers: claude`. Keep `parent` available under any restriction. Offer only permitted providers for repo role overrides.

### 4. Write the file

For the user layer, create `~/.claude/flatpaper-stack/` if needed, then write `models.md` with a `# budget` line holding the chosen label and its target effort, a `session hook` line, and one line per role, using the same role names the skills use. Overwrite the whole file so re-runs stay idempotent. For `--repo`, create `.agents/` if needed and overwrite `.agents/models.md` with only role lines that differ from the effective user layer, plus the optional `providers:` line. Compare whole ordered lists, including efforts and empty values. Omit `session hook` and the budget comment from the repo file. Use the template below for the user file only.

Shape:

```
# flatpaper-stack model configuration. One line per role, plus the `session hook` line. Delete a line to fall back to the skill default.
# Value: <provider>/<model>:<effort>, or parent:<effort> (leave Agent `model` unset). Entries in a panel list each count toward its fan-out.
# budget: small (medium)
session hook: on
feature, refactoring: claude/sonnet:medium
bug-fix: parent:medium
perf-issue: parent:medium
hillclimb: parent:medium
trivial edits: claude/haiku:medium
judgment and prose: parent:medium
hardest tasks: parent:high
pr critical reviewer: parent:high
pr deep reviewer: parent:high
pr triage reviewer: claude/sonnet:medium
thermos reviewers: parent:medium
comment sicko: claude/sonnet:medium
how explorer: claude/sonnet:medium
how explainer: parent:medium
history explorers: claude/sonnet:medium
trail reviewer: parent:medium
arena runners: parent:medium, claude/sonnet:medium
arena cross-judge pool:
swarm workers: claude/sonnet:medium
swarm hard workers: claude/opus:medium
interrogate reviewers: parent:medium, claude/sonnet:medium
```

`history explorers` covers the chat-history fan-out in `recall` and `automate-me`. `trail reviewer` is the cross-model reviewer in `show-me-your-work`.

### 5. Validate the written file

From the directory containing the file just written, run `node <plugin>/scripts/resolve-models.mjs --check`. Use flatpaper-stack's absolute plugin path for `<plugin>`. This is the same check the SessionStart hook runs. Empty output means valid. A JSON `systemMessage` lists problems. Show them, correct the file, and rerun until output is empty. Exit 0 alone does not mean valid.

### 6. Confirm

Tell the user the file was written, give its full path, and say that it applies from the next skill run. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /flatpaper-stack:create-verification-skill." On yes, read and follow `../create-verification-skill/SKILL.md` (it is user-only, so the Skill tool can't run it). On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill (a project skill that runs a model checker, a proof, or another verifier against the code). If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with /flatpaper-stack:create-formal-verification-skill." On yes, read and follow `../create-formal-verification-skill/SKILL.md` (it is user-only, so the Skill tool can't run it). On no, move on without pushing.
