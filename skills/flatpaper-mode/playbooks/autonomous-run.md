### Autonomous run

**You own the exit condition. Define done, then drive to it without stopping.**

1. State the exit condition as a predicate that can pass or fail before the first iteration (tests green, repro fixed, zero old callers). A duration is not an exit condition.
2. Work in an isolated git worktree so the run cannot collide with other work.
3. Pick the wake mechanism. When an iteration waits on an event, such as CI, a merge, or a ref advancing, watch it with `Monitor` or a background command so the session wakes when the event fires. Arm `/loop` as a long fallback heartbeat. With no event to watch, arm `/loop` as a fixed heartbeat sized to when the result is worth rechecking. `/loop` only wakes the run. Each wake rechecks the predicate, and the next iteration runs in this session. Never write a sleep loop. Skip this step when no iteration waits on anything outside the session. Check that a watch or a heartbeat is armed before the first wait.
4. Each iteration makes the smallest change the evidence justifies, verifies it against the predicate, commits if it advanced, and discards it if it didn't.
5. Log one row per iteration with the show-me-your-work skill: what changed and whether the predicate moved.
6. Fix mid-run discoveries that support the goal yourself when they are reversible: a broken skill, a related bug, a flaky verifier, review noise, a tooling failure, an orphaned follow-up, or drift you can fix. Put each fix outside the goal's change in its own PR, then return to the predicate. Don't park reversible work for the user, and don't put it to them with `AskUserQuestion`. Pause only for irreversible actions, product calls no experiment can settle, or a real dead end. Check that each side fix has a log row with its PR, and that every `AskUserQuestion` call in the run is about one of those three.
7. A plateau means pivot, not stop. Never relax the predicate to declare victory. If truly stuck, stop and write up why.

**Reply:** the exit condition, iterations run, what landed, what was discarded, the final predicate state, and the Attention section from show-me-your-work.

<!-- ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 pstack/skills/poteto-mode/playbooks/autonomous-run.md (MIT) -->
