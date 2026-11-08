# Prompts worth copying

Swap in the real paths, skills, and done checks. Informal wording works.

## Understand

- `/flatpaper-stack:flatpaper-mode read <thread>. restate the underlying issue in your own words, in plain english.`
- `/flatpaper-stack:in-your-own-words <long or messy ask>`
- `/flatpaper-stack:sharpen <the prompt you're about to send>`
- `/flatpaper-stack:flatpaper-mode investigate why <symptom>. give me what we know, what data you used, and your best hypotheses. don't change any code yet.`
- `use /flatpaper-stack:how to understand <subsystem>. then use /flatpaper-stack:why to find out why it broke recently.`
- `/flatpaper-stack:recall my work on <topic> from last week, then read <issue>.`
- `/flatpaper-stack:teach me why you implemented it this way and not <other way>. what did you trade off?`
- `/flatpaper-stack:flatpaper-mode take over this branch. read the decision log, find what's done, and continue. don't redo finished work.`

## Build

- Bug: `/flatpaper-stack:flatpaper-mode <symptom>. repro first, then fix and verify.`
- Bug in an app: `/flatpaper-stack:flatpaper-mode repro this with /verify-<app>. if it repros on main, fix it and show me a video as proof.`
- Bug with a cheap test: `/flatpaper-stack:flatpaper-mode repro <bug> first. if there's a cheap test path, /flatpaper-stack:tdd it. then fix and rerun.`
- Feature: `/flatpaper-stack:flatpaper-mode add <behavior>. <current output> stays byte-identical. verify both.`
- Refactor: `/flatpaper-stack:flatpaper-mode move <code> into one module, zero behavior change. record the current output first and prove it's unchanged after.`
- Perf: `/flatpaper-stack:flatpaper-mode <operation> takes <time> on <fixture>. trace it, fix the measured cause, show me before and after.`

## Design and plan

- `/flatpaper-stack:flatpaper-mode prototype a few options for <feature>. take screenshots or videos for me to compare.`
- `/flatpaper-stack:flatpaper-mode we need <feature>. /flatpaper-stack:architect it first, and answer open questions with prototypes. let me review before proceeding.`
- `/flatpaper-stack:flatpaper-mode write a tutorial for how i would use <new package> first. then /flatpaper-stack:teach me why it beats the current one.`
- `ask /flatpaper-stack:arena for a second opinion on this thread and our approach.`
- `/flatpaper-stack:flatpaper-mode turn this design into a plan. small verifiable PRs, each with its own verification steps.`
- `/flatpaper-stack:flatpaper-mode plan the migration of <library> to <target>. small verifiable PRs. the result must match the original exactly, bugs included.`

## Review and ship

- `/flatpaper-stack:interrogate the whole branch, but skeptically. don't change anything yet. no nitpicks unless it's a real bug or regression.` Read the Dropped list too.
- `/flatpaper-stack:create-formal-verification-skill prove <property> holds in <module>, even when <steps> interleave or retry.` After merges or refactors in that code: `/flatpaper-stack:maintain-formal-verification-skill`.
- `/flatpaper-stack:swarm check every package under <dir> against its check script. one worker per package. one report.`
- `/flatpaper-stack:flatpaper-mode open the pr. small ordered commits, evidence in the description.`
- `/flatpaper-stack:flatpaper-mode babysit this pr. get it green.` For status only: `/flatpaper-stack:flatpaper-mode check on pr <number>. anything outstanding?`
- `/flatpaper-stack:flatpaper-mode land the stack.`

## Away and back

- `/flatpaper-stack:flatpaper-mode im going to bed. <goal> in a fresh worktree off <base>. done means <checks>. keep a decision log. don't ask me before committing. /loop until done. if you're truly stuck after a few hours, stop and write up why.`
- `/flatpaper-stack:show-me-your-work catch me up on what you did last night.` Read its Attention section first.
- `/flatpaper-stack:ketchup` catches you up on this chat since your last message and lists every call that waits on you.
- `/flatpaper-stack:flatpaper-mode full autopilot on this queue. each item is independent.`
- `/flatpaper-stack:flatpaper-mode autopilot these changes, but don't merge. i'll land them.`
- `/flatpaper-stack:reflect capture what we learned so the next run doesn't repeat it.` Approve only edits that change a future decision.
- `/flatpaper-stack:bro` restates the last reply in plain words.
