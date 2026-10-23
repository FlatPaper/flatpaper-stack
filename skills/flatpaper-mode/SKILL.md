---
name: flatpaper-mode
description: FlatPaper's rigorous engineering mode. Matches the task to a playbook, creates a task per step with TaskCreate, and drives it to verified, evidenced work. Use when the user types /flatpaper-mode or asks for this style.
disable-model-invocation: true
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          if: "Bash(gh pr create*)"
          command: "${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/scripts/pr-gate.sh"
---

# flatpaper mode

The always-on rules in the flatpaper guidelines still apply. This mode adds playbooks, principle names, and a reply format.

## Start every task

1. Restate the goal, the done check, the proof you will show, and the constraints, one line each. Fill gaps with a proposal instead of asking, unless the gap is a product or preference call.
2. Read the repo's own rules before any playbook step: `AGENTS.md`, `CLAUDE.md` (including ones in the directories you touch), `CONTRIBUTING.md`, `docs/README.md`, and the PR template under `.github/`, whichever exist. Note the repo's test command and its commit and PR rules. If a rule conflicts with a playbook step, such as "diagrams are ASCII only", say so and ask before that step. In an autonomous run, follow the repo's rule and log the conflict instead.
3. Match the task to a playbook below. Open its file. Call `TaskCreate` once per playbook step, in order, with the step copied verbatim as the description, then once per Finish step below, before any task-specific tasks. If `TaskCreate` is listed as a deferred tool, load it first with `ToolSearch` (`select:TaskCreate,TaskUpdate`). Use `TaskUpdate` to mark each step `in_progress` when you start it and `completed` when its check passes. A step you skip is not deleted: set its subject to `skip: <reason>` and mark it `completed`. If no task tool exists in this session, put the playbook steps and the Finish steps as a checklist in your first reply and mark each one done or `skip: <reason>` in your final reply.
4. Read `references/principles.md`. Every reply ends with the principles footer described in Writing the reply.

Re-match on every prompt. When the kind of work changes (review, then fix, then PR), match the new prompt to its playbook from scratch, even if it does not say "new task". Restate the goal for the new work, mark the old playbook's open steps and open Finish steps `skip: superseded by <playbook>`, then create the new playbook's steps and the Finish steps. A follow-up that continues the same kind of work stays on the current playbook. A follow-up that only asks to test, commit, or open a PR also stays: reopen the current Finish steps instead of re-matching.

## Finish every task

Run these once, after the playbook's last step and before the reply. Pause safely is the exception: it skips the Finish steps with the reason `pause`, and its open steps stay open for the resume. When one playbook runs inside another, they run after the outer playbook's last step.

1. Run the repo's tests in the checkout you changed, with the command its rules name, or the one its CI or manifest runs. Paste the result. Skip when this task changed no files, or when the repo has no test command, and say which. A prototype skips this step because its scratch code does not ship.
2. If the task commits or opens or updates a PR, open `playbooks/opening-a-pr.md` and call `TaskCreate` once per step. A repo rule is one written in the files Start step 2 reads or in the PR template. Past PRs and commits are precedent, not rules. Repo rules replace only the playbook's format defaults: commit message format, branch name, title format, body headings, draft or ready, and labels. The `tidy` and `no-comments` commits, the risk call (state whether the diff is risky, and run `blast-radius` if it is), and the `technical-writing` and `unslop` pass always run. A hook blocks every `gh pr create` until this session's transcript shows a Skill call or slash command for `tidy`, `no-comments`, `technical-writing`, and `unslop`. It lets every other Bash call through, even one its `if` filter cannot parse. It does not check the risk call, `gh pr edit`, pushes, or skills run inside a subagent. If a skill cannot run, ask the user to set `FLATPAPER_PR_GATE_OFF=1`. Without a PR in scope, skip with that reason.
3. Read the PR back after creating or editing it: `gh pr view --json title,body,baseRefName,isDraft,labels` and `gh pr checks`. Check each against the rules and fix what is off. Pending checks are pending, not passed. Without `gh`, mark the read-back inconclusive and say why. Skip when step 2 was skipped. A PR you did not read back is not done.

## Playbooks

- **Investigation.** Read-only question: how does X work, why was Y built this way, are we sure, should we do X or Y. `playbooks/investigation.md`.
- **Bug fix.** A reported defect to reproduce, root-cause, and fix with runtime evidence. `playbooks/bug-fix.md`.
- **Feature.** New or changed behavior. `playbooks/feature.md`.
- **Refactoring.** A behavior-preserving change to structure. `playbooks/refactoring.md`.
- **Prototype.** A throwaway sketch to settle a design or behavior question by observing it. `playbooks/prototype.md`.
- **Autonomous run.** A long task driven to a predicate without stopping ("run until done", "going to bed", "/loop until X"). `playbooks/autonomous-run.md`.
- **Architecture page.** Create or update the repo's architecture page ("map this repo", "update the diagrams"), or a step in another playbook calls for it. `playbooks/architecture-page.md`.
- **Perf.** Make something faster or cheaper against a measured number ("speed up", "make it faster", "cut the cost"). `playbooks/perf.md`.
- **Babysit.** Drive an open PR to merge-ready: conflicts, review comments, CI ("babysit", "get it green", "address the review comments", "check on the PR"). `playbooks/babysit.md`.
- **Session pickup.** Continue work another session started ("pick up", "take over this branch", "continue from the log"). `playbooks/session-pickup.md`.
- **Pause safely.** Stop mid-task so the work can resume later ("pause", "stop for now", "pick this up tomorrow"). `playbooks/pause-safely.md`.
- **Worktree cleanup.** Find and remove stale git worktrees ("clean up worktrees"). `playbooks/worktree-cleanup.md`.
- **Opening a PR.** Not matched by prompt. Finish step 2 runs its steps, and written repo rules replace its format defaults. `playbooks/opening-a-pr.md`.
- **Multi-phase plan.** Write a plan for a migration or multi-PR change without building it ("plan this migration", "break this into PRs"). `playbooks/multi-phase-plan.md`.
- **Runtime forensics.** Diagnose a live process by instrumenting it ("why is this process hung", "what is it doing right now"). `playbooks/runtime-forensics.md`.
- **Trace forensics.** Diagnose from a captured artifact: a trace, profile, core dump, HAR, or log bundle ("read this trace", "what does this profile show"). `playbooks/trace-forensics.md`.

If `docs/architecture/` exists, read `meta.json`, `diagrams/*.archify.json`, and `diagrams/*.reference.html` there before tracing code in any playbook. They are the repo's map; the built `.html` is the same content wrapped in a viewer. An older page with only `index.html` is read from there. Treat the map as a starting point, and trust the code where they disagree.

No playbook fits? Write a short bespoke one in the same shape (owner line, numbered steps each ending in a check, reply line), create its steps and the Finish steps with `TaskCreate` the same way, and follow it.

## Driving the app

Some playbook steps verify on the real surface or reproduce a symptom. Those steps drive the app through the project's `verify-<app>` skill, usually `.claude/skills/verify-<app>/`. A perf harness on a user path is built from that skill's Launch and Drive recipe. Read the skill at the start of any playbook that has such a step. Follow its Launch, Doctor, Drive, Evidence, and Cleanup sections, and use its feature map for the entry points to cover.

If such a step touches a UI, CLI, or service and no `verify-<app>` skill exists, offer once per session to create one. After a no, don't offer again. On yes, read `${CLAUDE_PLUGIN_ROOT}/skills/create-verification-skill/SKILL.md` and follow it. That skill is by hand only, so reading it here needs the user's yes. Ship the new skill in its own commit or PR. On no, or in an autonomous run, drive the surface by hand, log that choice with the show-me-your-work skill, and say in the reply that no verification skill exists.

## Autonomy

- Reversible work proceeds without asking.
- Always pause for irreversible actions: force-push to shared branches, deploys, data deletion, messages to other people. Replies on a PR the user asked you to babysit are the one exception.
- Session overrides ("don't stop", "going to bed", "run until done") mean keep going and log decisions with the show-me-your-work skill.
- A skill or playbook that breaks mid-task gets fixed in its own PR. Don't block on it, and don't silently work around it.

## Subagents

- Spawn code-writing delegates and ad-hoc helpers inside a playbook step with `subagent_type: "flatpaper-stack:flatpaper-agent"`, and put this file's absolute path in the brief. It reads this skill before any work, which `general-purpose` does not. Read-only search stays on `Explore`. Skills that name their own `subagent_type` keep it. Never spawn a `flatpaper-agent` to run the playbook itself.
- You own every subagent's work. Read its diff or output and write your own summary. Don't pass its claims through.
- Give review and verification to a fresh subagent that did not write the change. If no independent reviewer can run, record `BLOCKED: independent review`, keep merge-ready closed, and say which reviewers ran. Your own review, passing tests, and CI never count as the verdict.
- `completed` means an agent sent its completion notice, not that it exited. One with live background children can resume. Before you reuse its worktree or replace it, stop it and confirm the stop. The tell is a claim about the tree that `git status` contradicts.
- Keep code-writing delegates on the session model: omit `model`. Don't split one sequential change into a planning agent and cheaper writers. To write a brief detailed enough for them, the planner writes the code itself. The split then costs more, and one bug in the plan reaches every unit. Cheaper models are for bulk reading or classification, as in the `swarm` skill.
- Write every brief with the fields in `references/subagent-brief.md`, sized to the unit. A brief that can't fill its fields is not ready to send.
- Route bulk reading to subagents and keep summaries in the main thread.
- Match the effort to the job. Before each spawn, set the Agent tool's `effort`. Start at `high`. Raise it to `xhigh` or `max` for the hardest or subtlest work, lower it to `medium` for judgment calls, and to `low` for routine reading or mechanical edits. Keep the model a skill names, so a mixed panel stays mixed. If the tool rejects `effort`, omit it and say so.

## Writing the reply

Apply the `unslop` skill to every reply, and the `technical-writing` skill to docs, READMEs, and PR text.

- Lead with the outcome for the person who asked, then what the next maintainer inherits.
- Every claim carries its evidence or its label (measured, inferred, guess) in the same sentence.
- Paste real command output for proof. Don't paraphrase it.
- Short declarative sentences. No em dashes. A colon only before a list.
- End the final message of every turn to the user, including follow-ups late in a long session, with `**Principles that changed decisions:**` and one bullet per principle: its name, then the decision it changed. A principle named with no decision behind it is name-dropping. If none changed a decision this turn, end with `**Principles that changed decisions:** none this turn.` instead of leaving the footer out. Interim progress notes, PR comments, commit messages, and PR text get no footer.
