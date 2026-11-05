---
name: interrogate
description: A Codex adversary and a Claude adversary try to break a change or a design, and only findings proven by a run survive. Applies no fixes. Use for /interrogate, "adversarial review", "multi-model review", "challenge this", "stress test this code", "find blind spots", "tear this apart", or a contested design before the PR.
---

# Interrogate

Adversaries try to break a change or a design. A finding survives only when a run proves it. Report the findings. Don't apply fixes.

## Frame

The scope is what the user names. Otherwise it is the branch diff from its merge base with the base branch, through the working tree. State the intent in one paragraph, in your own words, from the user's message, the commits, and the PR description. Ask the user when the intent is unclear.

## Fan out

Run Phase A steps 3 and 4 and Phase B of the `arena` skill, so the Codex adversary runs first and the `opus` adversary after it, with four changes. Give every Claude adversary `isolation: "worktree"`. Make the Codex adversary its own worktree with `git worktree add --detach <scratchpad>/interrogate-codex-<slug> HEAD`, where `<slug>` names this run, and copy the scope's uncommitted changes into it before it runs. Pass that worktree as `--cwd`. Copy the scope's uncommitted changes into each Claude adversary's worktree too. In place of the arena task and rationale, give each Claude adversary the scope, the intent, and this brief:

> Break this change. Prove each finding with a run against the real code, such as a failing test, a repro script, or command output that shows the wrong behavior. For a design or plan, run a prototype or probe the current tree. Keep repros in your own worktree. Report each finding with a title, the exact command, the output it printed, and the output the intent requires. Leave out anything you did not run. That covers style, naming, structure, and risks that need a future change to matter. No findings is a valid result.

The Codex adversary runs read-only and cannot write files or run tests. Its prompt file carries the scope, the intent, and this brief, not the Claude brief above or arena's artifact ask:

> Break this change. You run read-only and cannot write files, so you cannot run tests. Find inputs or states where the code does something the intent forbids. For a design or plan, find the input, state, or sequence of events that breaks it, and the probe against the current tree that shows it. Report each finding with a title, the exact command that shows it, the full contents of any file that command needs, the output you expect it to print, and the output the intent requires. Leave out style, naming, structure, and risks that need a future change to matter. No findings is a valid result.

## Verify

Rerun each finding's command yourself (prove it works). Run a Codex finding's command in the Codex worktree, after writing there any file the finding gives in full. Keep a finding when the output shows the failure and the failure breaks the intent. Drop the rest. Merge findings that share a root cause.

Skip arena Phases C to F. Adversaries find different failures, so the Findings list keeps every verified finding, not one adversary's list. After the report, remove the adversary worktrees and the Codex worktree, except those that hold a verified finding's repro. List those paths with their findings.

## Output

- **Intent**: the restatement.
- **Findings**: for each verified finding, the command, its output, how it breaks the intent, and the adversaries that found it. Say "no verified findings" when none survive.
- **Dropped**: for each adversary, the count of dropped findings and why.

**Reply:** the output above. No fixes applied.
