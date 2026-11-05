### Hillclimb

**You own the metric and the integrity of the experiment. Delegate the attempts, then review and measure each one yourself.**

For a sustained climb on one measurable thing toward a target ("hillclimb", "push this metric up", "iterate until X%"). The metric can be an eval score, a bundle size, a pass rate, or a latency. A one-off fix is Bug fix or Perf.

One change, one measurement, keep or revert. Never stack untested changes. Never claim a win from reading the code (prove it works).

1. Ground the workload before you pick the case. Run the `how` skill over the target. Name the realistic workload dimensions that can move the metric, such as data size, history, state, and concurrency. The check is each dimension named with the code path it moves.
2. Build the case, the harness, and the baseline with Perf steps 1 to 3 (`playbooks/perf.md`). They apply to any metric. For an eval score, the harness is one Eval run (`playbooks/eval.md`) with its prompt, rubric, and judge frozen. The check is a baseline median and range from the frozen harness, and a green regression gate.
3. Open the decision log with the `show-me-your-work` skill, and write the stop predicate in its first row. The predicate pairs the target with a floor on attempts, so a lucky early win cannot end the run, for example "at least 30% faster and at least 8 attempts". Use the user's numbers when given. Otherwise propose them. Log one row per attempt. The decision cell holds the hypothesis and the change. The evidence cell holds the before, after, delta, and gate result. The result cell is `kept` or `reverted`. Keep the log out of git, and read it before each attempt. The check is the predicate row and the baseline row in the log.
4. Ground each hypothesis in a mechanism from step 1, such as "defer X off the boot path because it blocks first paint", not "try memoizing something". When the metric is perf, order the hypotheses by the mantras in Perf step 4. Use only their order, not that step's stop rule. The check is a named mechanism in each attempt's log row.
5. Run one hypothesis per iteration. Each iteration ends in its check before the next begins (sequence verifiable units). If the run is unattended, take only the `/loop` wake from Autonomous run (`playbooks/autonomous-run.md`), not its stop rule.
   - Delegate the change with a tight scope. Spawn `subagent_type: "flatpaper-stack:flatpaper-agent"` with `isolation: "worktree"` and no `model`, briefed per `../references/subagent-brief.md`. Review its diff instead of typing it (guard the context window).
   - Cherry-pick the change onto your branch. Measure before and after with the frozen harness, and run the regression gate.
   - Keep the change only when the metric moves past the run-to-run range and the gate stays green. Otherwise revert it in full. A tweak that "might help" is not kept.
   - Make one commit per kept change, and stage only its files (`git add <files>`, never `-A`). Log the row either way.

   The check is one log row per iteration and a clean tree before the next one.
6. Explore in parallel, but measure serially. When several hypotheses are independent, the `swarm` skill may explore them at once, each in its own worktree: profiling, reading, and prototypes (separate before serializing shared state). Every number you keep comes from a serial run on the frozen harness, because parallel runs share the machine. The check is that no kept row cites a number from a parallel run.
7. Push past the first plateau. After several reverts in a row, change category, combine near-misses, reread the source, or try something more radical before you call the hill climbed. Correctness and simplicity outrank the number. Revert any win that breaks behavior, and keep a simplification that holds the number (laziness protocol). The check is a log row that names the pivot after each run of reverts.
8. Stop when the predicate is met, its floor on attempts included. Stop short of it only when the ideas left are marginal and the target looks out of reach. Then say so with the limiter. Never relax the predicate to meet it. Don't quit while cheap untried hypotheses remain. If you are stuck, say so instead of spinning. The check is the last log row, with the predicate state and the limiter.
9. Run Opening a PR (`playbooks/opening-a-pr.md`) with the kept commits in the order they landed. Put the baseline and final numbers under Verification. The check is a PR whose commits match the kept rows of the log.

**Reply:** the metric and target, baseline to final as median and range with the percent delta, the limiter, the iterations run (kept and reverted), each kept change on one line, the decision log path, and the best idea you would try next.

<!-- ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 pstack/skills/poteto-mode/playbooks/hillclimb.md (MIT) -->
