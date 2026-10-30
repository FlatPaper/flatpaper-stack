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
3. Pick the runners. Default to three, one each with `model` set to `opus`, `sonnet`, and `fable`. All three are Claude models, so their diversity is weaker than a cross-vendor mix. Expect more convergence and treat it as a weaker signal. Add runners when the arena covers several design directions. Run one model N times when the work is generation-bound rather than judgment-sensitive. If the Agent tool rejects a model, run that seat without `model` (the session model) and say so.
4. Give each candidate its own output (separate before serializing shared state). A candidate that writes in the repo gets `isolation: "worktree"`. One that writes elsewhere gets its own scratch directory, `arena-<slug>/candidate-<n>/` under the session scratchpad.

## Phase B: Fan out

Spawn all N candidates in one message with the Agent tool: `subagent_type: "general-purpose"`, `run_in_background: true`, the Phase A model, and `isolation: "worktree"` when it writes in the repo. Write each brief with the fields in `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/references/subagent-brief.md`. Each brief carries the task, the path to the shared grounding, its own output location, and asks for the artifact plus a short rationale naming the alternatives it considered and what it rejected. A worktree candidate reports its worktree path and branch.

If a candidate produces no output, go on with N-1 and note the dropout.

## Phase C: Cross-judge

After every candidate finishes, spawn one judge with the Agent tool: `subagent_type: "general-purpose"`, read-only (its brief says "Do not modify files, run state-changing commands, or commit. Report only."), with `model` set to the first of `fable`, `opus`, and `sonnet` that differs from the session model, so the judge is the strongest model that is not the session model. The judge never runs on the session model, so never omit `model` for it. If the Agent tool rejects it, try the remaining ones in the order `fable`, `opus`, `sonnet`. If none runs, skip the judge, pick the base alone in Phase D, and say so. If you do not know the session model, try them in the same order, and say that the check against the session model did not run. The judge sees the rubric and the candidates by path label, scores each criterion, and recommends a base with rationale. It runs while you read in Phase D. Don't spawn it while candidates are still writing.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on overall feel, and compare with the judge when Phase C ran one. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API (laziness protocol).

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base. Usually one or two things per candidate, not most of it. Fold each graft in by hand so the result stays coherent under one mental model (redesign from first principles). Don't paste mechanically.

If the candidates converge on one shape, note it and ship that shape. No graft is needed. If they diverge wildly, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output (prove it works). If verification finds a problem the arena missed, either Phase A was wrong (reframe and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

Remove candidate worktrees and scratch directories once the synthesis is verified.

**Reply:** one synthesized artifact, with a short synthesis note naming the base and why, the judge's verdict or that Phase C skipped the judge, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.
