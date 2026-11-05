### Feature

**You own the design. Plan, review, verify.**

1. Trace the affected code before designing. Run the `how` skill over the affected subsystem. A claim the brief makes about existing code ("make X public", "nothing else calls this") is a hypothesis. Count its consumers before you design, since the count decides the design.
2. Pin what must not change (existing output, existing commands) and record it before editing.
3. Name the data shape first, and pick its organizing structure (model the domain).
4. If the change crosses module boundaries or has several valid shapes, run the `architect` skill through its sketch phases only (A and B); implementation happens in step 6 against that sketch. Sketch two designs before committing, writing how the caller uses each one first. Judge the sketches against `../references/design-red-flags.md`. If running something would settle the choice, prototype it.
5. Write the throughput checkpoint as four task items. An item that does not apply (one file, no fan-out) stays with `n/a: <reason>`. It is not dropped.
   - **Blocking first steps.** What must finish before any work can run in parallel.
   - **Independent workstreams.** Disjoint files, services, or layers that can run in parallel. Shared writes run one after another.
   - **Shared mutable state.** Split the target first (separate before serializing shared state). Serialize only for a real invariant.
   - **Smallest safe decomposition.** If one worker is best, say why.
   Code-coupled work goes to one owner. The session running the playbook fans out after the blocking steps. Fan out across subagents only for slices that produce independent artifacts. Run that fan-out with the `swarm` skill. Rewrite the checkpoint at each phase boundary, and give a new phase to a fresh subagent instead of redirecting a running one.
6. Implement in small units, each ending in a check (sequence verifiable units). When the implementation has several valid shapes, such as its error handling, abstraction layer, or test structure, implement it through the `arena` skill, so the runners surface the alternatives and the judge guards the pick. Edit a file derived from an upstream source against that source: re-read the source, and change only what the task needs. When you improve a shared primitive, port the change to every consumer and verify each one.
7. Verify on the real surface through the project's `verify-<app>` skill: the new behavior works, and the pinned behavior is unchanged.
8. If the change added, removed, or rewired something the architecture page shows, run the Architecture page playbook in update mode and include it in the same PR.
9. Hand the diff to a fresh subagent for review. It did not write the change. If the design is contested, run the `interrogate` skill before the PR.

**Reply:** what you built, what you chose and why, the throughput checkpoint, the proof for both new and unchanged behavior, and open decisions. Tables for design alternatives.

<!-- ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 pstack/skills/poteto-mode/playbooks/feature.md (MIT) -->
