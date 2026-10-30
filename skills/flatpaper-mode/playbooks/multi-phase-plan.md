### Multi-phase plan

**You own the plan, not the code. The plan is a checklist an owner runs box by box and the user audits from the evidence.** The plan is the deliverable. Do not implement.

For work that spans several PRs or phases ("plan this migration", "break this into PRs", "write a plan for X").

1. When the change is one or two files with an obvious approach, skip the plan. Say so and stop.
2. Settle open questions by prototype before you write. Run the Prototype playbook (`playbooks/prototype.md`) for each. Keep the scratch path, the commit SHA, and the screenshots for Appendix A. Ask the user only about a product or preference call that no run can settle, and give options (never block on the human). The check is each open question either answered by a prototype or listed as unproven.
3. Explore with read-only `Explore` subagents via the Agent tool, briefed per `../references/subagent-brief.md` (guard the context window). Each returns file pointers, conventions, test commands, and entry points. No inlined dumps. The check is a test command and an entry point for every PR you expect to write.
4. Copy the skeleton below into the plan file and fill every placeholder. Unless the user names a path, write it to `docs/plans/<slug>.md` in the repo. Keep every heading and every sub-block in the order shown. One section per PR. One PR is one change with its own evidence (sequence verifiable units). Name the execution path in **How to read this**: the Autopilot stack playbook (`playbooks/autopilot-stack.md`) when the user hands the program off to run unattended, otherwise the user starts each PR as its own flatpaper-mode task. The check is no `<placeholder>` left in the file.
5. Write the prose with the `technical-writing` skill, then run the `unslop` skill over it. The body is a how-to. The appendices hold explanation and reference. Each heading states the task or the finding. No em dashes. A colon only before a list.
6. Run `scripts/check-plan.sh <plan.md>` from this skill's base directory (shown when the skill loads) and fix every line it prints until it exits 0 (encode lessons in structure).
7. Hand back. Post the plan path and the script's output, then stop. Execution starts only on the user's explicit go, under the execution path the plan names.

**Verification.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked (prove it works). That sentence is the verification rule. Every verification block opens with it. The live block is mandatory. Lanes at the PR head drive the real surface through the project's `verify-<app>` skill. Use ten lanes by default and fan them out with the `swarm` skill. Each lane is one box with a concrete scenario, the screenshot or output file it saves, and its pass predicate. Lane 1 is the **Regression lane against trunk.** It runs the same load-bearing scenario on trunk and head. If trunk does not have the feature, the lane records that fact and gates the behavior the diff adds plus the end state the user waits for, instead of inventing a trunk result. The perf gate is dual-sided. Trunk and head must both produce the named metric, measured per the Perf playbook (`playbooks/perf.md`). If trunk lacks the feature, isolate the work the diff adds and set an absolute budget for it plus the end-to-end state the user waits for. Do not claim a ratio between unlike scenarios. A PR that changes an interaction is review-gated. The user reviews it with screenshots and a video before merge. A PR that changes no interaction writes `**Review gate.** None. <PR id> is not review-gated.` and no boxes under it.

**Verification skill.** Pick it by surface. Use the project's `verify-<app>` skill for each surface the PR touches. A PR that touches two surfaces gets lanes on both. When a surface has no verification skill, add a PR that creates one with `/flatpaper-stack:create-verification-skill` (an agent reads `${CLAUDE_PLUGIN_ROOT}/skills/create-verification-skill/SKILL.md` and follows it, replacing the variable with the plugin's real path in a subagent brief), or list it as a risk in Appendix C and name in the live block how each lane drives the surface by hand.

````markdown
# <Program> plan

<Under ten lines. What changes, for whom, the rule the program enforces, and the PR ids in order.>

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, such as a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs <the Autopilot stack playbook, `playbooks/autopilot-stack.md` in flatpaper-mode, or one flatpaper-mode task per PR started by the user>. <Who merges, and which PR ids stop at merge-ready for the user.>

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State this plan to the user, then stop. Start execution only on the user's explicit go.
- [ ] Read the execution playbook, the `swarm` skill, and each `verify-<app>` skill the lanes use, at program start.
- [ ] Under Autopilot stack, the queue and gates come from this plan, and a PR is done only when its boxes here are checked. Log one row per decision with the `show-me-your-work` skill.
- [ ] On the user's hold, stop every writer at once and leave each branch pushed.

### Order and boundaries

- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when PRs stack.
  - [ ] <PR id> and <PR id> are independent and first. Both branch from `main`.
  - [ ] <PR id> after <PR id>.
- [ ] Hold the file boundaries. <PR id> touches only `<glob>`.
- [ ] Hold the review gate. <PR ids> change an interaction. They wait for the user's review with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Work in its own git worktree.
- [ ] Commit, branch, and open the PR per the repo's rules, as in the flatpaper-mode Finish steps.
- [ ] Run the repo's lint and typecheck before the PR-facing push. Push with hooks on.
- [ ] Get a clean review from a fresh subagent that did not write the change, at the head SHA.
- [ ] Triage every review comment per flatpaper-mode's review triage reference (`references/review-triage.md` in that skill).
- [ ] Rebase onto the PR's base (trunk, or the parent PR's branch in a stack) before merge-ready. Drive CI and comments with the Babysit playbook.

### Boot recipe, for every live lane

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] <Start the backend and the surface. Wait for ready.>
- [ ] <Deliver input only through the verification skill's commands. Name the read-only diagnostics.>
- [ ] Save every screenshot or output to `<scratch dir>/<pr-id>/lane-<n>/<slug>.png` and return the paths with the report.

## <Task as a verb phrase> (<PR id>)

**Depends on.** <PR id, or None.>

**Files.**

- [ ] Edit `<path>`.
- [ ] Create `<path>`.
- [ ] Delete `<path>`.

**Build.**

- [ ] <One change. Name the symbol and the file.>

**You see.**

- [ ] <One observable result, with the exact log line or screen state.>

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] <Test file and the case it gains.> Run `<command>`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. <N> lanes at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run <the same load-bearing scenario> at trunk and head. If trunk lacks the feature, record that and gate <the behavior the diff adds plus the end state the user waits for>. Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 2. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] <One box per further lane, numbered in order, each with Save and Pass when.>

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. <The number, its unit, and the direction that is better. If trunk lacks the feature, also name the diff-added work and the end-to-end state the user waits for.>
- [ ] Probe. <The command or procedure, run at trunk and at the head, interleaved. Both sides must produce the metric.>
- [ ] Baseline. Record the trunk <value> first, as a median of 5 or more runs with the range.
- [ ] Rule. <Head against trunk, with the number that fails. If the scenarios differ, add absolute budgets instead of an invalid ratio.>

**Review gate.** The user reviews before merge.

- [ ] Copy lane <n> screenshots into `<media path>/<pr-id>-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of the change. Save it as `<media path>/<pr-id>-review.mp4`.
- [ ] Post the screenshots and the video to the user. Stop at merge-ready. Wait for the user to merge.

**Merge.**

- [ ] Clean review verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto the PR's base after the verdict, patch unchanged.
- [ ] <Who merges. Under Autopilot stack the user lands the stack bottom-up, because it never merges. Otherwise the user or the PR's own task squash-merges it.>

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the user with the report the execution path names.

## Appendix A. Prototype evidence

<Each open question a prototype answered, with the scratch path, the SHA, and the artifact links. Each question that stays unproven.>

## Appendix B. Alternatives rejected

<Each approach weighed and why it lost.>

## Appendix C. Risks

<Each risk with the PR it lands in and what the owner watches.>

## Appendix D. Links and reading list

<Docs to read before editing. Which PRs need the Investigation playbook or the `interrogate` skill first. Where the show-me-your-work decision log lives.>
````

**Reply:** the plan path, the PR ids with their dependencies and the review-gated set, what the prototypes proved and what stays unproven, and the check script's output.
