# Prompts worth copying

Swap in the real paths, skills, and done checks. Informal wording works. `/fp` below stands for `/flatpaper-stack:flatpaper-mode`. Write the full command when you hand a prompt to the user.

## Understand

- `/fp read <thread>. restate the underlying issue in your own words, in plain english.`
- `/flatpaper-stack:sharpen <the prompt you're about to send>`
- `/fp investigate why <symptom>. give me what we know, what data you used, and your best hypotheses. don't change any code yet.`
- `/fp how does <subsystem> work? read-only.` then `/flatpaper-stack:why did <behavior> change recently?`
- `/flatpaper-stack:recall my work on <topic> from last week`
- `/fp take over this branch. read the decision log, find what's done, and continue. don't redo finished work.`

## Build

- Bug: `/fp <symptom>. repro first, then fix and verify.`
- Bug in an app: `/fp repro this with the verify-<app> skill. if it repros on main, fix it and show me the real output as proof.`
- Feature: `/fp add <behavior>. <current output> stays byte-identical. verify both.`
- Refactor: `/fp move <code> into one module, zero behavior change. record the current output first and prove it's unchanged after.`
- Perf: `/fp <operation> takes <time> on <fixture>. trace it, fix the measured cause, show me before and after.`
- Race or invariant: `/flatpaper-stack:create-formal-verification-skill prove <property> holds in <module>, even when <steps> interleave or retry.` After merges or refactors in that code: `/flatpaper-stack:maintain-formal-verification-skill`.

## Design and plan

- `/fp prototype a few options for <feature>. take screenshots for me to compare.`
- `/fp we need <feature>. /flatpaper-stack:architect it with checkpoint, and answer open questions with prototypes.`
- `/fp write a tutorial for how i would use <new package> first, then build to it.`
- `/flatpaper-stack:arena <artifact where one attempt might lock in the wrong shape>`
- `/fp turn this design into a plan. small verifiable PRs, each with its own verification steps.`
- `/fp plan the migration of <library> to <target>. small verifiable PRs. the result must match the original exactly, bugs included.`

## Review and ship

- `/flatpaper-stack:interrogate the whole branch, but skeptically. no nitpicks unless it's a real bug or regression.` Read the Dropped list too.
- `/flatpaper-stack:blast-radius PR <number>`
- `/flatpaper-stack:swarm check every package under <dir> against its check script. one worker per package. one table.`
- `/fp open the pr. small ordered commits, evidence in the description.`
- `/fp babysit this pr. get it green.` For status only: `/fp is pr <number> green?`

## Away and back

- `/fp im going to bed. <goal> in a fresh worktree off <base>. done means <checks>. keep a decision log. don't ask me before committing. /loop until done. if you're truly stuck after a few hours, stop and write up why.`
- `/flatpaper-stack:show-me-your-work catch me up on what you did last night.` Read its Attention section first.
- `/flatpaper-stack:ketchup` after a break in the same session.
- `/flatpaper-stack:reflect` at the end of a long session. Approve only edits that change a future decision.
- `/flatpaper-stack:correct <mistake you corrected twice>`
