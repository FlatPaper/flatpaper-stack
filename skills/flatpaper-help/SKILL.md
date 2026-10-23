---
name: flatpaper-help
description: Guides users through flatpaper setup, /flatpaper-stack:flatpaper-mode, and picking the skill, playbook, or principle for a task. Type /flatpaper-stack:flatpaper-help with a question.
disable-model-invocation: true
---

# flatpaper help

Answer the user's question about flatpaper, hand them a prompt they can send, and link the file the answer came from. For a help question, don't start the work. The user asked how, and a flatpaper run spends real tokens, so let them send the prompt.

A message that asks for work, such as "use flatpaper to fix this bug", is not a help question. Read `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/SKILL.md`, do the work under it, and mention once that starting the next task with `/flatpaper-stack:flatpaper-mode` does the same.

This file maps questions to the skills and guide sections that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. Paths here point into the installed plugin, which the user may not have open, so give the user the file's public copy: `https://github.com/FlatPaper/flatpaper-stack/blob/main/` followed by its path. The guide is published at https://claude.ai/artifact/UtoWgg52numPjfmQg2r27P. Its sections have anchors, such as `#c-first`, that you can append.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with `AskUserQuestion`, with these options, then answer only the section they pick:

- Get set up
- Start a task with `/flatpaper-stack:flatpaper-mode`
- Pick a skill for a situation
- Fix a run that went wrong

Check the state that changes the answer, and mention it only when it does:

- `CLAUDE_CODE_ENABLE_TODO_TOOLS` not set to `1` in `~/.claude/settings.json` means flatpaper-mode can't put playbook steps in the task list and falls back to a checklist in its replies.
- No `verify-*` skill under the project's `.claude/skills/` means agents have no scripted way to drive the app. Mention `/flatpaper-stack:create-verification-skill` when the question is about proving a change works.
- No `docs/architecture/` in the project means agents have no map to read first. Mention the Architecture page playbook when the question is about onboarding an agent to a repo.

## Get set up

1. Load the plugin from a local clone with the `--plugin-dir` alias, or install it with `claude plugin marketplace add` and `claude plugin install flatpaper-stack@flatpaper-stack`. The Install section of the `README.md` has both.
2. Add the settings in the README's Settings section to `~/.claude/settings.json`, then restart Claude Code. A session that is already open keeps its old tool list.
3. Start a real task with `/flatpaper-stack:flatpaper-mode`, a goal, and a check that can pass or fail.

Installing turns on the guidelines and the prompt hook in every session. The skills run only when the user types them, a playbook step calls them, or, for the ones that allow it, the model picks them from the user's words. [Guide 1.1](https://claude.ai/artifact/UtoWgg52numPjfmQg2r27P#install) has the details. Offer to word their first prompt with them, per `references/prompting.md`.

If cost is the worry, say where the tokens go and how to spend fewer. flatpaper spends extra tokens on subagents and review panels. `/flatpaper-stack:interrogate` and `/flatpaper-stack:arena` each run three agents on different models. Save `/flatpaper-stack:flatpaper-mode` for work that needs rigor. Quick questions need nothing, because the guidelines are always on. Name a cheaper skill directly when the user wants less than a playbook gives.

flatpaper is built for Claude Code. Route only to the skills, playbooks, and settings in this plugin and in Claude Code.

## Start a task with `/flatpaper-stack:flatpaper-mode`

`/flatpaper-stack:flatpaper-mode` matches the task to a playbook, creates one task per playbook step, and runs the other skills as the steps need them. A step it skips stays in the list as `skip: <reason>`. A good prompt has up to five parts, one sentence each: goal, done check, proof, what the user knows, and constraints. It doesn't list skills, because a hand-written sequence tends to drop or reorder steps the playbook would keep. Read `references/prompting.md` before you help word one. [Guide 3.1](https://claude.ai/artifact/UtoWgg52numPjfmQg2r27P#c-first) walks through a first session.

The mode re-matches every prompt to a playbook, so review, then fix, then PR works in one session without retyping the command. Starting a message with "new task:" makes the switch explicit. Don't `/clear` between steps of one piece of work, because the next step needs what the last one found. After a `/clear`, start the next task with the command again.

`/flatpaper-stack:flatpaper-mode` spawns its code-writing delegates as `flatpaper-stack:flatpaper-agent`, which reads the mode before any work. To get the same style from a subagent of your own, spawn it with `subagent_type: "flatpaper-stack:flatpaper-agent"`.

## Pick a skill

The default answer is `/flatpaper-stack:flatpaper-mode`, which runs most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt. Every command starts with `/flatpaper-stack:`.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | `flatpaper-mode` |
| Aim a task higher before starting: more expert, more outcome-focused, not overspecified | `sharpen` |
| Know why code is shaped this way, or where a number came from | `why` |
| Catch up on their own recent work in this project | `recall` |
| Catch up on what changed in this chat since their last message | `ketchup` |
| Know what a diff could break outside itself | `blast-radius` |
| Settle types and module shape before code that crosses a module boundary | `architect` |
| Get several attempts at one brief, merged into the best one | `arena` |
| Run parallel checks over slices, or race workers | `swarm` |
| Have different models review a diff and try to break it | `interrogate` |
| Clean up a diff for reuse, simplicity, and efficiency without changing behavior | `tidy` |
| Strip comments before review, using a reviewer that didn't write them | `no-comments` |
| Clean AI tells out of prose | `unslop` |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | `technical-writing` |
| Give agents a scripted way to drive the app and prove behavior | `create-verification-skill` |
| Bring a verification skill and its feature map back in line with the app | `maintain-verification-skill` |
| Keep a decision log during a run, and review it afterward | `show-me-your-work` |
| Turn what a session taught into skill, `CLAUDE.md`, or memory edits | `reflect` |
| Stop agents from repeating the same mistake in this repo | `correct` |
| Find their way around flatpaper | `flatpaper-help` |

Each skill lives at `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md`. If a skill directory there is missing from the table, read its frontmatter and route by its description.

Close calls:

- How code works now is the Investigation playbook. `/flatpaper-stack:why` finds the reasons.
- `/flatpaper-stack:arena` gives every worker the same brief and merges the best parts. `/flatpaper-stack:swarm` splits work into slices or a race and returns one table.
- `/flatpaper-stack:architect` implements right after it settles the design. Add "with checkpoint" to review the design before it writes code.
- `/flatpaper-stack:interrogate` reviews the diff. `/flatpaper-stack:blast-radius` looks for breakage outside the diff and proves the one fact that makes the change safe.
- Before a PR, the Opening a PR playbook runs `tidy`, then `no-comments`, on every push and `blast-radius` for a risky diff. The Feature and Refactoring playbooks run `interrogate` when the design is contested. Type any of them to run it regardless. Claude Code's built-in `/code-review` reviews the diff for correctness bugs without a multi-model panel.
- `/flatpaper-stack:recall` rebuilds context across this project's recent sessions. `/flatpaper-stack:ketchup` covers only this chat since the user's last message. Resuming one specific branch is the Session pickup playbook.
- `/flatpaper-stack:correct` makes one repeated mistake impossible in the repo. `/flatpaper-stack:reflect` mines a whole session for lessons.

Not in flatpaper:

- flatpaper has no skill for explaining how code works, for restating an ask, or for vetting a benchmark. Use the Investigation playbook, ask flatpaper-mode to restate the issue in plain words first, or use the Perf playbook. For a large or cross-cutting run, use the Autonomous run or Multi-phase plan playbook.
- `/loop`, `/code-review`, and `/simplify` are Claude Code built-ins. The Autonomous run playbook uses `/loop`. `/flatpaper-stack:tidy` is flatpaper's version of `/simplify`, and the one the Opening a PR playbook runs.
- Plan mode is a Claude Code feature and works alongside flatpaper.

## Playbooks and principles

Playbooks are step lists inside `/flatpaper-stack:flatpaper-mode`, not skills, so they have no slash command. Describing the task picks one. These phrases name one directly:

- "how does", "why is", "are we sure" runs Investigation. It is read-only.
- "babysit this pr" or "get it green" runs Babysit in `drive` mode. It drives the PR to merge-ready and stops there. "is pr 123 green?" runs one status pass instead, and asking only to answer the review comments handles just those threads. It never merges.
- "take over this branch" or "continue from the log" runs Session pickup.
- "pause" or "pick this up tomorrow" runs Pause safely.
- "im stepping away" or "run until done" runs Autonomous run.
- "plan this migration" or "break this into PRs" runs Multi-phase plan. It writes the plan and doesn't implement it.
- "map this repo" runs Architecture page.

The Playbooks section of `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/SKILL.md` lists every playbook and when it applies. The README's "Words that steer the playbook" table and [guide 3.2](https://claude.ai/artifact/UtoWgg52numPjfmQg2r27P#c-mode) give the trigger words for each.

Principles are named rules in `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/references/principles.md`. flatpaper-mode reads them and names each one that changed a decision. The user rarely reads the file. They steer with the names instead, as in "apply prove it works. show me the real output." [Guide 2.10](https://claude.ai/artifact/UtoWgg52numPjfmQg2r27P#i-principles) covers steering with them.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The mode stopped applying after a `/clear` | Start the next task with `/flatpaper-stack:flatpaper-mode` again. |
| A question got treated as the next step of the last task | Start with "new task:", or say the turn doesn't need the mode. |
| No task list, only a checklist in the reply | Set `CLAUDE_CODE_ENABLE_TODO_TOOLS` to `1` per the README's Settings section, then restart Claude Code. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't run on its own | A skill with `disable-model-invocation: true` in its frontmatter starts only when the user types it or a playbook step reads it. The others start when a playbook step needs them, not on every task. |
| A skill misbehaved mid-task | Note it and finish the task. Fix the skill in its own change, not inside the feature work. |
| Parallel agents overwrote each other | Give each agent its own worktree. |
| An unattended run moved but finished nothing | `/loop` needs a check that can pass or fail, not a duration. See the Autonomous run playbook. |
| The reply claims success from a green build | Ask for the real command, flow, or stored value. That is the prove-it-works principle. |
| The agent keeps making the same mistake | Run `/flatpaper-stack:correct` to turn it into a check. |

For a run that drifts, `references/prompting.md` has one-line steers. [Guide 3.6](https://claude.ai/artifact/UtoWgg52numPjfmQg2r27P#c-pitfalls) lists common mistakes.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from `references/recipes.md` when one fits, then the link to the file the answer came from. Keep it short unless the user asked for the whole map.
