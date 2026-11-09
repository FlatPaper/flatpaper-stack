---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /flatpaper-stack:swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

# Swarm

## Start

Open a task list (`TaskCreate`) with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Give each worker a model by its piece. Easy pieces (searching, checking, running a command and reporting) use the `swarm workers` role (default `claude/sonnet`). Pieces that need judgment (fixing, designing, a race between approaches) use the `swarm hard workers` role (default `claude/opus`). Take each from its line in `~/.claude/flatpaper-stack/models.md` (the default when the file or the line is missing), unless the user names a model (`sonnet`, `opus`, `haiku`, `fable`, or a Codex model). For a model race, name each arm's model up front. An arm on a non-Claude model uses the `codex:codex-rescue` agent. Pick each subagent's reasoning level for the job, per the Subagents section of `../flatpaper-mode/SKILL.md`.
4. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

## Phase B: Fan out

Spawn all N workers in one message as Agent subagents with `subagent_type: general-purpose` (or `codex:codex-rescue` for a Codex worker) and the step 3 model. A worker that edits files also gets `isolation: "worktree"`, so it writes in its own checkout.

When a worker must start from a branch other than the current one, its brief names the branch and tells it to run `git switch --detach <branch>` first.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

## Phase D: Report

Return one consolidated in-chat report with a result table, issue one-liners, gaps or dropouts, and the race rule when used.
