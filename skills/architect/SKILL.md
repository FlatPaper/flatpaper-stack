---
name: architect
description: Sketch types, signatures, and module structure before code, compare at least two whole designs, then implement against the chosen sketch and scrap it if it keeps fighting back. Use for /architect, "architect this", "design this", or a change that crosses module boundaries or has several valid shapes.
---

# Architect

Sketch types, function signatures, class shapes, and module boundaries with `not implemented` bodies and pseudocode. Compare candidates from several runners, then fill in code against the chosen sketch.

## Start

Call `TaskCreate` once per phase before starting:

1. Ground
2. Sketch
3. Agree
4. Implement
5. Scrap

## Phase A: Ground the problem

Build a real mental model of every system the new code touches. Run the Investigation playbook (`${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/playbooks/investigation.md`) over the relevant subsystems and produce its explanation. Naming a file isn't grounding. If the design redefines ownership or layering, also run the `why` skill on the existing shape, so the rationale becomes a constraint, not a guess.

Skip Phase A only when the work is greenfield with no surrounding system to integrate.

## Phase B: Sketch

Run the `arena` skill with the design-sketch task and the Phase A grounding. Paste `references/runner-prompt.md` and `references/rationale-template.md` into each runner's brief. Use arena's default runners.

Design it twice. Require at least two structurally distinct candidates before synthesis, even when the first looks sufficient (exhaust the design space). If arena returns fewer, run one more `sonnet` runner whose brief names the shape to avoid. Whole-shape alternatives, not point fixes inside one shape.

Screen every candidate against `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/references/design-red-flags.md` before synthesis. Assume the next contributor is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Prefer the design where a change that looks right from one file is right for the whole repo.

Compare viable candidates on interface depth. Prefer the design that hides more complexity behind a smaller, simpler public surface. A rich interface can keep call chains short by concentrating capability instead of scattering it across layers.

Arena returns one synthesized design. Its synthesis note fills the rationale's "Synthesis decision" section.

## Phase C: Agree (opt-in)

Default: go straight to implementation with the synthesized design. No human checkpoint.

Add a checkpoint only when the caller asks for one ("architect with checkpoint", "show me before implementing"). Then show the synthesized design and wait for sign-off.

The sketch can ship as its own commit either way, scaffold first (foundational thinking). Planned, scoped breakage during fill-in is fine (outcome-oriented execution). For adversarial pressure on the design before implementing, run the `interrogate` skill on the sketch.

If the human pushes back on the shape, treat that as Phase A evidence. Re-ground and re-run Phase B before writing more code.

## Phase D: Implement against the sketch

Replace `not implemented` bodies with code and pseudocode with logic. The sketch is the contract. A deviation is a signal to surface, not friction to absorb quietly. If a function needs a parameter the sketch didn't anticipate, ask whether the sketch was wrong, the requirement was missed, or the implementation is overreaching.

Once a deviation is accepted, fold it back before closing the unit or handing its contract to the next worker. Update the affected usage, signatures, and outcome contracts in the sketch and the rationale's Implementation reconciliation section, and record who accepted it. Keep unaccepted deviations visible. A unit is not reconciled while the next worker would get contradictory instructions. Never edit the sketch only to justify what was built.

## Phase E: Scrap when the architecture is wrong

If implementation keeps producing friction the sketch can't absorb, throw the sketch out. Don't bolt fixes onto a wrong design (redesign from first principles, fix root causes).

The signal is a pattern, not one instance. Tells:

- The same shape of workaround appears across unrelated code.
- Several unrelated edge cases each need a special-case branch.
- Types need escape hatches (`any`, casts, optional fields always set in practice) to compile.
- The "we need a lock" reflex when the sketch said the state wasn't shared.
- Callers must know the abstraction's internal rules to use it.
- Two or more independent Phase D deviations of the same shape.

Use judgment. A few edge cases don't condemn an architecture. Complexity in the data is not complexity in the design.

When you scrap:

1. Run the Investigation playbook again over what's been built.
2. Redesign as if the new constraints had been day-one assumptions.
3. Subtract before you add. The new sketch is smaller than the old one before it grows.
4. Return to Phase B and re-run arena.

## Outputs

Write the caller's usage first and derive the type sketch from it. One file with new types and signatures for small changes. A module map plus type definitions for larger work. The rationale ships alongside, shaped per `references/rationale-template.md`, including the usage sketch and the synthesis decision.

**Reply:** the chosen shape, the candidates it beat and why, the grafts, the red flags checked, and the rationale path.
