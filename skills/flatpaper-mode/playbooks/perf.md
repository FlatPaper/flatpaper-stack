### Perf

**You own the measurement story. Every kept change ties to a number. Reading source is not measuring.**

For a one-off speedup or regression fix against a measured number. A sustained climb on one metric toward a target, over many attempts, is Hillclimb (`playbooks/hillclimb.md`). Steps 1 to 3 are the harness steps. Hillclimb runs them too, for any metric.

1. Pick a case that reproduces the user's complaint, with realistic data size, state, and concurrency. If no case reproduces it, fix the repro first. Fix one metric, the direction that counts as better, and the target. Use the user's numbers when given. The check is the case, the metric, and the target, written down.
2. Build the harness, prove it is sensitive, then freeze it. Run contrasting workloads and confirm the target case shows the symptom while easier cases separate. Make it print an error count and a count of the work done. Build its end-to-end case from the `verify-<app>` skill's Launch and Drive recipe. With no such skill, drive a UI with the `control-ui` skill or a CLI with the `control-cli` skill. Once frozen, one command emits the metric. The check is that command's output, with the target case apart from the easier ones.
3. Record the baseline. Check machine load first (`uptime`, plus `nproc` on Linux or `sysctl -n hw.ncpu` on macOS). Take the median of 5 or more runs with the range, never one run. When comparing two sides, alternate them (A, B, A, B). Record a green run of the regression gate (the tests that must keep passing). Vet the baseline and every later number with the `benchmark-checklist` skill, and answer each of its questions from a run, not from the code. Every later change follows the keep rule. Keep a change only when the metric moves past the run-to-run range and the gate stays green. Otherwise revert it in full. Revert any win that breaks behavior. Commit each kept change on its own, and stage only its files (`git add <files>`, never `-A`). The check is the median, the range, the gate result, and the checklist answers.
4. Ground each hypothesis. Run the `how` skill over the hot path, and name the mechanism each hypothesis changes ("defer X off the boot path because it blocks first paint"). Don't claim a ceiling you have not run. Try the mantras in order, cheapest first:
   1. Don't do it. Stop work whose result nothing uses instead of making it cheaper.
   2. Do it, but don't do it again.
   3. Do it less.
   4. Do it later.
   5. Do it when they're not looking.
   6. Do it concurrently.
   7. Do it cheaper.

   Stop at the first mantra that meets the target. The check is each hypothesis with its mechanism and its mantra.
5. Plan the fix from the profile or trace. If it crosses a function boundary, run the `architect` skill first. Make one change, measure it with the frozen harness, and run the gate. Keep or revert it by the keep rule in step 3. Verify each attempt before you try the next (sequence verifiable units). The check is the post-fix median and range next to the baseline.
6. Compare the artifacts, not only the headline number. Parse the baseline and post-fix traces or profiles into sqlite, for example with `sqlite3` and `json_each(readfile('<trace>.json'))`, and diff them in one query. "Inconclusive" or a number from the wrong surface is not a pass. Flag it. The check is the query and its output.
7. Stop at the target. If the fixes so far miss it and more attempts are needed, switch to Hillclimb and keep this harness and baseline. If the target looks out of reach, say so with the limiter. Never relax the target to meet it. The check is the target met, or the switch to Hillclimb said in one line.

**Reply:** the metric and target, baseline to post-fix as median and range with the percent delta, the limiter, each kept change on one line, and the artifact paths with the sqlite diff.

<!-- ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 pstack/skills/poteto-mode/playbooks/perf-issue.md (MIT) -->
