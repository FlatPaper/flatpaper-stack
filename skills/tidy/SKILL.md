---
name: tidy
description: Clean up the changed code without changing behavior. Fresh reviewers check the diff for reuse, simplification, efficiency, and altitude in parallel, then you apply the fixes and report what you skipped. Quality only, not bugs. Use for /tidy, "tidy this", "clean up the diff", or before opening a PR.
---

# Tidy

Review the diff for cleanup, then fix what holds up. Do not hunt for correctness bugs. That is `interrogate`.

## Scope

Use the caller's files, branch, or PR. Otherwise use `git diff <base>...HEAD`, base default `main`, plus `git diff HEAD` for uncommitted work.

## Steps

1. Gather the diff. If it is empty, report "nothing to tidy" and stop.
2. Launch fresh `general-purpose` reviewers in one message with the Agent tool: one per angle below, or one for all four angles if the diff changes no code or under about 30 lines. Write each brief per `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/references/subagent-brief.md` with the diff and its angles, and forbid edits. Set `effort` per the Subagents section of the flatpaper-mode skill. Each finding is `file`, `line`, a one-line summary, and the concrete cost: what is duplicated, wasted, or harder to maintain. Reports follow that file's Fan-out section.
3. Merge findings that point at the same line or mechanism. Read the code behind each one before you accept it.
4. Fix each accepted finding directly. Skip a finding if the fix would change intended behavior, reach well outside the diff, or the finding is wrong. Note each skip with its reason.
5. If you applied any fix, run the repo's tests. If a fix breaks one, revert that fix and record it as skipped. No fixes or no test command: skip, and say which.

## Angles

- **Reuse.** New code that re-implements something the codebase already has. Grep shared and utility modules and files next to the change. Name the existing helper to call.
- **Simplification.** Complexity the diff adds: redundant or derivable state, copy-paste with small changes, deep nesting, dead code left behind. Name the simpler form.
- **Efficiency.** Wasted work the diff adds: repeated computation or I/O, independent steps run one after another, blocking work on startup or hot paths, long-lived closures that keep a large scope alive. Name the cheaper form.
- **Altitude.** A fix at the wrong depth. Special cases layered on shared code mean the fix is not deep enough. Apply **Fix root causes** in `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/references/principles.md` and name the general change to the underlying mechanism.

**Reply:** fixed findings as `file:line` and one line each, skipped findings with reasons, how many reviewers ran, and the test result. If nothing needed fixing, say the diff was already clean.
