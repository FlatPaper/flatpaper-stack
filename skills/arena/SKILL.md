---
name: arena
description: Run several parallel candidates at the same task, pick a base against a rubric, and graft the strongest parts of the others into it. Use for /arena, "arena this", "throw it in the arena", or a non-trivial artifact where one attempt would lock in the wrong shape.
---

# Arena

Call `TaskCreate` once per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything.

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate produces.
2. Derive the rubric: 3 to 6 concrete, gradeable criteria for success on this task. It is the picker's tool in Phase D. Candidates see only the task.
3. Pick the runners. Default to two, one per model family: a Codex runner on `gpt-6.1-sol` and a Claude runner with `model` set to `opus`. Different families miss different things. The Codex runner runs read-only, so on a code artifact it returns its proposal as a diff in its report and writes nothing. Only Claude writes code into the repo, in Phase E. If the Codex seat falls back, add a Claude runner on `sonnet` so two runners remain, and say that both are Claude models, so their agreement is a weaker signal. Add runners when the arena covers several design directions. Run one model N times when the work is generation-bound rather than judgment-sensitive. If the Agent tool rejects a model, run that seat without `model` (the session model) and say so.
4. Give each candidate its own output (separate before serializing shared state). A candidate that writes in the repo gets `isolation: "worktree"`. One that writes elsewhere gets its own scratch directory, `arena-<slug>/candidate-<n>/` under the session scratchpad.

## Phase B: Fan out

Run the Codex runner first. Write its prompt file with the task, the shared grounding inlined, and the ask for the artifact plus a short rationale. For a code artifact, ask for the change as a unified diff in the report. Run it with Bash and `run_in_background: true`: `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/scripts/codex-seat.sh --model gpt-6.1-sol --effort high --fallback "a sonnet runner" --cwd <repo root> <prompt-file>`. On exit 0, save its stdout as one candidate's output. On exit 3, print its one fallback line and add the `sonnet` runner.

Then spawn the Claude candidates in one message with the Agent tool: `subagent_type: "general-purpose"`, `run_in_background: true`, the Phase A model, and `isolation: "worktree"` when it writes in the repo. Write each brief with the fields in `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/references/subagent-brief.md`. Each brief carries the task, the path to the shared grounding, its own output location, and asks for the artifact plus a short rationale naming the alternatives it considered and what it rejected. A worktree candidate reports its worktree path and branch.

If a candidate produces no output, go on with N-1 and note the dropout.

## Phase C: Cross-judge

After every candidate finishes, label them `candidate-1` to `candidate-N` in an order that does not follow the runners. Copy each candidate's output, or a worktree candidate's diff against its base, under its label, `arena-<slug>/judged/candidate-<n>/`, and remove model and vendor names from the copies. Keep the map from label to runner to yourself until Phase D. The judge sees only the rubric and the labeled copies.

Run the Codex judge first. Write its prompt file with the rubric, the labeled paths, and this ask: score each candidate on each criterion and recommend a base with rationale. Run it with Bash and `run_in_background: true`: `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/scripts/codex-seat.sh --model gpt-6.1-sol --effort high --fallback "a Claude judge" --cwd arena-<slug>/judged <prompt-file>`. It runs read-only, so it changes nothing.

On exit 3, print its one fallback line and spawn one Claude judge with the same ask, using the Agent tool: `subagent_type: "general-purpose"`, read-only (its brief says "Do not modify files, run state-changing commands, or commit. Report only."), with `model` set to the first of `fable`, `opus`, and `sonnet` that differs from the session model, so the judge is the strongest Claude model that is not the session model. The Claude judge never runs on the session model, so never omit `model` for it. If the Agent tool rejects it, try the remaining ones in the order `fable`, `opus`, `sonnet`. If none runs, skip the judge, pick the base alone in Phase D, and say so. If you do not know the session model, try them in the same order, and say that the check against the session model did not run.

Either judge runs while you read in Phase D. Don't start it while candidates are still writing.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on overall feel, and compare with the judge when Phase C ran one. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API (laziness protocol).

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base. Usually one or two things per candidate, not most of it. Fold each graft in by hand so the result stays coherent under one mental model (redesign from first principles). Don't paste mechanically.

If the candidates converge on one shape, note it and ship that shape. No graft is needed. If they diverge wildly, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output (prove it works). If verification finds a problem the arena missed, either Phase A was wrong (reframe and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

Remove candidate worktrees and scratch directories once the synthesis is verified.

**Reply:** one synthesized artifact, with a short synthesis note naming the base and why, the judge's verdict and which judge gave it, or that Phase C skipped the judge, any Codex fallback line, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.
