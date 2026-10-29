### Autonomous run

**You own the exit condition. Define done, then drive to it without stopping.**

1. State the exit condition as a predicate that can pass or fail before the first iteration (tests green, repro fixed, zero old callers). A duration is not an exit condition.
2. Work in an isolated git worktree so the run cannot collide with other work.
3. Use `/loop` to keep going. Re-check the predicate on each wake.
4. Each iteration makes the smallest change the evidence justifies, verifies it against the predicate, commits if it advanced, and discards it if it didn't.
5. Log one row per iteration with the show-me-your-work skill: what changed and whether the predicate moved.
6. Fix mid-run discoveries that support the goal yourself when they are reversible. Pause only for irreversible actions, product calls no experiment can settle, or a real dead end.
7. A plateau means pivot, not stop. Never relax the predicate to declare victory. If truly stuck, stop and write up why.

**Reply:** the exit condition, iterations run, what landed, what was discarded, the final predicate state, and the Attention section from show-me-your-work.
