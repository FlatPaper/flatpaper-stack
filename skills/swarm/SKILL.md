---
name: swarm
description: Fan out N parallel background workers over separate slices or a race on one brief, drain them, and return one table. Use for /swarm, "swarm this", or parallel coverage, races, gauntlets, and exploration.
---

# Swarm

Fan out N parallel workers. They cover separate slices, race the same brief, or both. You wait, aggregate, and return one report.

## Start

Call `TaskCreate` once per phase before launching anything:

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or a mix, declare the selection rule before spawning: `first pass`, `rank all`, or `best-of`.
3. Set N from the user or derive it from the shape. N is the total worker count.
4. Pick the worker model. Omit `model` for workers that write code, so they run on the session model. Use `haiku` only for cheap bulk reading or classification. For a model race, name each arm's model up front. When the arms only read (search, diagnosis, review), default to two arms, Codex first and `opus`. For N above two, one arm is Codex and the rest are `opus`. A race of writers stays Claude, because Claude writes the code, so pick its arms from `opus`, `sonnet`, and `fable` and say that same-family arms differ less than cross-family ones would. If the Agent tool rejects a model, omit it for that worker and say so.
5. Give each worker that writes its own output. A worker that writes in the repo gets `isolation: "worktree"`. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method: sample count, what one sample is, and order. The worker records both in its result.

## Phase B: Fan out

Run the Codex arm first, when Phase A picked one. Write the arm's brief to a prompt file and run it with Bash and `run_in_background: true`: `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/scripts/codex-seat.sh --model gpt-6.1-sol --effort high --fallback "a sonnet arm" --cwd <repo root> <prompt-file>`. It runs read-only, so its brief asks for the exact commands that show each claim, and you run them in Phase C. On exit 3, print its one fallback line and add a `sonnet` arm.

Then spawn the Claude workers in one message with the Agent tool: `subagent_type: "general-purpose"` (or `Explore` for read-only search), `run_in_background: true`, the Phase A model, and `isolation: "worktree"` for writers. A worker that must start from another branch checks it out inside its own worktree as its first step.

Every brief stands alone, with the fields in `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/references/subagent-brief.md`: the goal, scope, the exact slice or race arm, how to verify, and what to report. Reports follow that file's "Fan-out" section.

If a worker drops out, go on with N-1 and note it.

## Phase C: Aggregate

Read the terminal results and apply the "Fan-out" rules in `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/references/subagent-brief.md`. A result also misses its brief when it does not record the SHAs and method the brief names. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Read each writer's diff yourself before counting its pass.

## Phase D: Report

Return one report: the result table (one row per worker or slice, with status and evidence), one-line evidenced issues, gaps and dropouts, and the race rule when used. No raw worker dumps.

**Reply:** the table, the issue lines, the gaps, and the worktree branches worth keeping.
