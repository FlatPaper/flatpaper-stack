---
name: flatpaper-help
description: Guides users through flatpaper-stack setup, /flatpaper-stack:flatpaper-mode, and picking the skill, playbook, or principle for a task. Type /flatpaper-stack:flatpaper-help with a question.
disable-model-invocation: true
---

# Flatpaper help

Answer the user's question about flatpaper-stack, hand them a prompt they can send, and link the file the answer came from. For a help question, don't start the work. The user asked how, and a flatpaper-stack run spends real tokens, so let them send the prompt.

A message that asks for work, such as "use flatpaper-stack to fix this bug", is not a help question. Read [`flatpaper-mode`](../flatpaper-mode/SKILL.md), and do the work under it.

This file maps questions to the skills and files that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. The links here are relative to this file, so give the user the file's full path on disk, which they can open from the terminal.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with these options, then answer only the section they pick:

- Get set up
- Start a task with `/flatpaper-stack:flatpaper-mode`
- Pick a skill for a situation
- Fix a run that went wrong
- Make flatpaper-stack my own

Check the state that changes the answer, and mention it only when it does:

- No `verify-*` skill or other app harness in the project means agents have no scripted way to drive the app. Mention `/flatpaper-stack:create-verification-skill` when the question is about proving a change works.
- No formal verification skill in the project means no property is checked past what tests reach. Mention `/flatpaper-stack:create-formal-verification-skill` when the question is about a race, an invariant, or another case tests rarely hit. When one exists and the code it covers changed after the commit it records as last in sync, mention `/flatpaper-stack:maintain-formal-verification-skill` if the question touches that code.

## Get set up

1. Install per the [README](../../README.md), then start a new session so the skills load.
2. If the project has no verification skill yet, offer `/flatpaper-stack:create-verification-skill`, and `/flatpaper-stack:create-formal-verification-skill` for code with races or invariants.
3. Start a real task with `/flatpaper-stack:flatpaper-mode`, a goal, and a check that can pass or fail.

Installing changes nothing until the user invokes a skill. Only `control-cli`, `control-ui`, `verify-this`, and `deslop` load from the user's words. Offer to word their first prompt with them, per [`references/prompting.md`](references/prompting.md).

If cost is the worry, say where the tokens go and how to spend fewer. flatpaper-stack spends extra tokens on subagents and review panels. Most subagents leave `model` unset and run on the chat's model, so a cheaper chat model (`/model`) makes them cheaper too. A shorter panel list runs fewer subagents, one for each entry. Save `/flatpaper-stack:flatpaper-mode` for work that needs rigor.

flatpaper-stack adapts poteto's pstack, which is built for Cursor, to Claude Code. Each command takes a `flatpaper-stack:` prefix, such as `/flatpaper-stack:flatpaper-mode`. Steps that needed a Cursor-only feature, such as Bugbot, cloud agents, or Automations, were dropped or swapped for a Claude Code equivalent.

Other tools can read the skills, because they use the Agent Skills format. But most workflow skills, including `/flatpaper-stack:flatpaper-mode`, `/flatpaper-stack:how`, `/flatpaper-stack:why`, and `/flatpaper-stack:teach`, spawn Claude Code subagents, and `/loop` is a Claude Code feature, so those parts may not work there.

## Start a task with `/flatpaper-stack:flatpaper-mode`

`/flatpaper-stack:flatpaper-mode` matches the task to a playbook, copies the playbook's steps into the task list, and runs the other skills as the steps need them. A step it skips stays in the list as `skip: <reason>`. A good prompt states the goal and how to tell it's done. It doesn't list skills, because a hand-written sequence tends to drop or reorder steps the playbook would keep. Read [`references/prompting.md`](references/prompting.md) before you help word one.

Typing `/flatpaper-stack:flatpaper-mode` loads the skill into the chat, and it can fade as a long chat moves on. Claude Code has no Custom Modes to pin it, so start each new task with `/flatpaper-stack:flatpaper-mode`. Mid-chat, "new task" makes the mode match a fresh playbook. `/flatpaper-stack:flatpaper-mode` already uses `flatpaper-agent` for the subagents its playbook steps spawn. To get the same style from a subagent of your own, spawn it with `subagent_type: "flatpaper-stack:flatpaper-agent"`.

## Pick a skill

The default answer is `/flatpaper-stack:flatpaper-mode`, which runs most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | [`/flatpaper-stack:flatpaper-mode`](../flatpaper-mode/SKILL.md) |
| Check that the agent understood their goal and the problem before it starts | [`/flatpaper-stack:in-your-own-words`](../in-your-own-words/SKILL.md) |
| Get a prompt rewritten deeper, not bigger, before sending it: what a top professional would add, their raw material and methods, and an outside check. It returns the prompt and doesn't do the task | [`/flatpaper-stack:sharpen`](../sharpen/SKILL.md) |
| Know how code works now, or where new code should live | [`/flatpaper-stack:how`](../how/SKILL.md) |
| Know why code is shaped this way, or where a number came from | [`/flatpaper-stack:why`](../why/SKILL.md) |
| Understand a change or subsystem, explained plainly | [`/flatpaper-stack:teach`](../teach/SKILL.md) |
| Catch up on their own recent work on a topic | [`/flatpaper-stack:recall`](../recall/SKILL.md) |
| Catch up on what changed in this chat since their last message, in plain words and small visuals, with every item waiting on them listed and decidable from the reply alone | [`/flatpaper-stack:ketchup`](../ketchup/SKILL.md) |
| Catch up like `/flatpaper-stack:ketchup`, in a short subtitled video of slides, with the waiting calls as text under it | [`/flatpaper-stack:ketchup-video`](../ketchup-video/SKILL.md) |
| Know what a small diff could break outside itself | [`/flatpaper-stack:blast-radius`](../blast-radius/SKILL.md) |
| Settle types and module shape before code that crosses a function boundary | [`/flatpaper-stack:architect`](../architect/SKILL.md) |
| Get several attempts at one brief, merged into the best one | [`/flatpaper-stack:arena`](../arena/SKILL.md) |
| Run parallel checks over slices, or race workers, as parallel subagents | [`/flatpaper-stack:swarm`](../swarm/SKILL.md) |
| Have different models review a diff and try to break it | [`/flatpaper-stack:interrogate`](../interrogate/SKILL.md) |
| Fix a bug test-first when a cheap local test exists | [`/flatpaper-stack:tdd`](../tdd/SKILL.md) |
| Apply TypeScript rules to `.ts` or `.tsx` work | [`/typescript-best-practices`](../typescript-best-practices/SKILL.md) |
| Strip AI-looking code (extra comments, needless try/catch, `any` casts, deep nesting) from the branch's diff before commit | [`/flatpaper-stack:deslop`](../deslop/SKILL.md) |
| Strip comments before review, using a reviewer that didn't write them | [`/flatpaper-stack:no-comments`](../no-comments/SKILL.md) |
| Clean AI tells out of prose | [`/flatpaper-stack:unslop`](../unslop/SKILL.md) |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | [`/flatpaper-stack:technical-writing`](../technical-writing/SKILL.md) |
| Hear the last reply again in plain words | [`/flatpaper-stack:bro`](../bro/SKILL.md) |
| Give agents a scripted way to drive the app and prove behavior | [`/flatpaper-stack:create-verification-skill`](../create-verification-skill/SKILL.md) |
| Bring a verification skill and its feature map back in line with the app | [`/flatpaper-stack:maintain-verification-skill`](../maintain-verification-skill/SKILL.md) |
| Formally verify a race, invariant, or other property that tests rarely reach | [`/flatpaper-stack:create-formal-verification-skill`](../create-formal-verification-skill/SKILL.md) |
| Bring a formal verification back in line after the code it covers changed, and learn whether a failure is drift or a bug | [`/flatpaper-stack:maintain-formal-verification-skill`](../maintain-formal-verification-skill/SKILL.md) |
| Show a PM or designer what the user sees as a chart checked by a TLA+ model, with the shortest path to each state that breaks a rule | [`/flatpaper-stack:statechart`](../statechart/SKILL.md) |
| Vet a performance number before reporting or acting on it | [`/flatpaper-stack:benchmark-checklist`](../benchmark-checklist/SKILL.md) |
| Run a large or cross-cutting change, or one to review after stepping away | [`/flatpaper-stack:figure-it-out`](../figure-it-out/SKILL.md) |
| Keep a decision log during a run, and review it afterward | [`/flatpaper-stack:show-me-your-work`](../show-me-your-work/SKILL.md) |
| Turn their own working habits into a personal mode skill | [`/automate-me`](../automate-me/SKILL.md) |
| Turn what a finished task taught into skill edits | [`/flatpaper-stack:reflect`](../reflect/SKILL.md) |
| Stop agents from repeating the same mistakes in this repo | [`/flatpaper-stack:correct`](../correct/SKILL.md) |
| Build a page whose buttons wake a Grok Bot over a webhook | [`/make-bot-ui`](../make-bot-ui/SKILL.md) |
| Find their way around flatpaper-stack | `/flatpaper-stack:flatpaper-help` |

If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.

Close calls:

- `/flatpaper-stack:how` explains what the code does. `/flatpaper-stack:why` explains the reasons. `/flatpaper-stack:teach` runs one or both and explains the result plainly.
- `/flatpaper-stack:arena` gives every worker the same brief and merges the best parts. `/flatpaper-stack:swarm` splits work into slices or a race and returns one report.
- `/flatpaper-stack:architect` implements right after it settles the design. Add "with checkpoint" to review the design before it writes code.
- `/flatpaper-stack:deslop` sweeps the diff for five kinds of AI slop in one quick pass. `/flatpaper-stack:no-comments` goes deep on comments only, using a reviewer that didn't write them.
- `/flatpaper-stack:interrogate` reviews the diff. `/flatpaper-stack:blast-radius` looks for breakage outside the diff and proves the one fact that makes the change safe.
- `/flatpaper-stack:recall` rebuilds context across recent chats. `/flatpaper-stack:ketchup` covers only this chat since the user's last message. Resuming one specific chat or branch is the Session pickup playbook.
- `/flatpaper-stack:figure-it-out` designs one rigorous run. The Orchestrate playbook runs a program that spans days and many PRs. The Autonomous run playbook drives one task to a finish condition.

Not in flatpaper-stack:

- `/loop` is a Claude Code built-in. Skill authoring uses the **skill-creator** skill (Anthropic's skill for authoring SKILL.md files).
- flatpaper-stack has no `/orchestrate` skill. Orchestrate is a `/flatpaper-stack:flatpaper-mode` playbook. If the slash menu shows `/orchestrate`, another plugin provides it.

## Playbooks and principles

Playbooks are step lists inside `/flatpaper-stack:flatpaper-mode`, not skills, so they have no slash command. Inside `/flatpaper-stack:flatpaper-mode`, describing the task picks one, and these phrases name one directly:

- "babysit this pr" or "check on pr 123" runs Babysit. It drives the PR to merge-ready and stops there. It doesn't merge unless the user asks to merge, land, or ship.
- "land the stack" runs Shipping.
- "take over this branch" runs Session pickup.
- "pause safely" runs Pause safely.
- "full autopilot on this queue" runs Autopilot-full. "autopilot, don't merge" runs Autopilot-stack.
- "run the eval playbook" runs Eval.

Without `/flatpaper-stack:flatpaper-mode`, a phrase such as "babysit this pr" can start another installed skill for the same job instead. The Playbooks section of [`flatpaper-mode`](../flatpaper-mode/SKILL.md) lists every playbook and when it applies.

flatpaper-stack has no planning skill. Claude Code's plan mode works alongside it. For work that spans phases or stacked PRs, asking `/flatpaper-stack:flatpaper-mode` for a plan runs the [Multi-phase plan playbook](../flatpaper-mode/playbooks/multi-phase-plan.md), which writes the plan and doesn't implement it. For a design question, the Prototype playbook or `/flatpaper-stack:architect` settles it in code first.

Principles are one-rule skills that `/flatpaper-stack:flatpaper-mode` reads and cites in its replies. The user rarely invokes one. They steer with the names instead, as in "apply prove it works. show me the real output." Typing `/flatpaper-stack:principle-<name>` still loads one on demand.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The mode stopped applying after a few turns | Start each task with `/flatpaper-stack:flatpaper-mode`. |
| A question got treated as the next step of the last task | Say "new task", or say the turn doesn't need the mode. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't load on its own | Only `control-cli`, `control-ui`, `verify-this`, and `deslop` load from the user's words. The others load when the user types them or when `/flatpaper-stack:flatpaper-mode` runs them, and it doesn't run every skill. |
| Parallel agents overwrote each other | Give each agent its own worktree (`isolation: "worktree"` on the Agent call). |
| An overnight run moved but finished nothing | `/loop` needs a check that can pass or fail, not a duration. |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That's the prove-it-works principle. |

For a run that drifts, [`references/prompting.md`](references/prompting.md) has one-line steers. [`references/recipes.md`](references/recipes.md) has the recipes worth copying.

## Make flatpaper-stack my own

- [`/automate-me`](../automate-me/SKILL.md) drafts a personal mode skill from the user's own history, to use alongside `/flatpaper-stack:flatpaper-mode`.
- [`/flatpaper-stack:reflect`](../reflect/SKILL.md) after a session turns its lessons into skill edits the user approves.
- `/flatpaper-stack:flatpaper-mode write a skill for <workflow>` runs the authoring playbook. The eval playbook tests a skill change blind.
- Fix a misbehaving skill in its own PR, not inside the feature work where it went wrong.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from [`references/recipes.md`](references/recipes.md) when one fits, then the link to that file. Keep it short unless the user asked for the whole map.
