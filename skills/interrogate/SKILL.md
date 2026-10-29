---
name: interrogate
description: Adversaries on different Claude models try to break a change or a design, and only findings proven by a run survive. Applies no fixes. Use for /interrogate, "adversarial review", "multi-model review", "challenge this", "stress test this code", "find blind spots", "tear this apart", or a contested design before the PR.
---

# Interrogate

Adversaries try to break a change or a design. A finding survives only when a run proves it. Report the findings. Don't apply fixes.

## Frame

The scope is what the user names. Otherwise it is the branch diff from its merge base with the base branch, through the working tree. State the intent in one paragraph, in your own words, from the user's message, the commits, and the PR description. Ask the user when the intent is unclear.

## Fan out

Run Phase A steps 3 and 4 and Phase B of the `arena` skill, with three changes. Give every adversary `isolation: "worktree"`. Copy the scope's uncommitted changes into each worktree. In place of the arena task and rationale, give each adversary the scope, the intent, and this brief:

> Break this change. Prove each finding with a run against the real code, such as a failing test, a repro script, or command output that shows the wrong behavior. For a design or plan, run a prototype or probe the current tree. Keep repros in your own worktree. Report each finding with a title, the exact command, the output it printed, and the output the intent requires. Leave out anything you did not run. That covers style, naming, structure, and risks that need a future change to matter. No findings is a valid result.

## Verify

Rerun each finding's command yourself (prove it works). Keep a finding when the output shows the failure and the failure breaks the intent. Drop the rest. Merge findings that share a root cause.

Skip arena Phases C to F. Adversaries find different failures, so the Findings list keeps every verified finding, not one adversary's list. After the report, remove the adversary worktrees, except those that hold a verified finding's repro. List those paths with their findings.

## Output

- **Intent**: the restatement.
- **Findings**: for each verified finding, the command, its output, how it breaks the intent, and the adversaries that found it. Say "no verified findings" when none survive.
- **Dropped**: for each adversary, the count of dropped findings and why.

**Reply:** the output above. No fixes applied.
