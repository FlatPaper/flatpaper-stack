# Plan: build pstack brick by brick

Source: [cursor/plugins/pstack](https://github.com/cursor/plugins/tree/2776ddd/pstack) at commit `2776ddd`. Every brick is copied from there, except 7.1b, which comes from [cursor-team-kit](https://github.com/cursor/plugins/tree/2776ddd/cursor-team-kit) at the same commit.

## How each brick goes in

1. **Read.** Claude explains the brick in a few lines: what it is, and what it changes.
2. **Import.** Copy `pstack/skills/<name>/` byte for byte into `skills/<name>/`, keeping the upstream folder name. No provenance line in the file: this plan names the source commit, and `LICENSE` carries the credit.
3. **Adapt.** Change only what breaks in Claude Code (Cursor-only tools or names). Show every change. If the brick mentions a skill that is not imported yet, leave the mention and add a "Revisit" line under that skill's brick below. If the brick is named in a "Revisit" line, fix those mentions now and delete the line.
4. **Try.** Use it once on something real.
5. **Commit.** One brick per commit. Tick the box.

Do not start the next brick until you can explain the current one in your own words.

## Layer 1: Principles

Single rules, about 1 KB each. They depend on nothing. Everything above reads them.

- [x] 1.1 `principle-prove-it-works`
- [x] 1.2 `principle-subtract-before-you-add`, `principle-laziness-protocol`
- [x] 1.3 `principle-build-the-lever`, `principle-encode-lessons-in-structure`
- [x] 1.4 `principle-fix-root-causes`, `principle-attack-the-premise`
- [x] 1.5 `principle-redesign-from-first-principles`, `principle-foundational-thinking`
- [x] 1.6 `principle-model-the-domain`, `principle-boundary-discipline`
- [x] 1.7 `principle-type-system-discipline`, `principle-test-behavior-not-implementation`
- [x] 1.8 `principle-make-operations-idempotent`, `principle-separate-before-serializing-shared-state`
- [x] 1.9 `principle-guard-the-context-window`, `principle-minimize-reader-load`
- [x] 1.10 `principle-outcome-oriented-execution`, `principle-never-block-on-the-human`
- [x] 1.11 `principle-sequence-verifiable-units`, `principle-migrate-callers-then-delete-legacy-apis`
- [x] 1.12 `principle-experience-first`, `principle-exhaust-the-design-space`, `principle-explain-the-number`

## Layer 2: Small tools

One job each, under 5 KB, no real dependencies.

- [x] 2.1 `unslop`: cuts AI-sounding prose
- [x] 2.2 `sharpen`: rewrites a prompt to go deeper
- [x] 2.3 `correct`, `in-your-own-words`, `bro`

## Layer 3: Understanding code

- [x] 3.1 `how`: explains how code works
- [x] 3.2 `why`: finds why code is the way it is (largest tool, 52 KB, take it slow)
- [x] 3.3 `teach`: combines `how` and `why`

## Layer 4: Writing and cleanup

- [x] 4.1 `technical-writing`
- [x] 4.2 `no-comments` + `comment-sicko` agent

## Layer 5: Ways of working

- [x] 5.1 `show-me-your-work`: decision log
- [x] 5.2 `tdd`
- [x] 5.3 `swarm`: parallel workers
- [x] 5.4 `arena`: parallel attempts, pick the best

## Layer 6: Design and review

- [x] 6.1 `architect`
- [x] 6.2 `interrogate`
- [x] 6.3 `blast-radius`
- [x] 6.4 `benchmark-checklist`

## Layer 7: The router

`flatpaper-mode` (upstream `poteto-mode`) is 107 KB. It goes in small. Upstream `poteto-mode` and `poteto-agent` are renamed `flatpaper-mode` and `flatpaper-agent`.

- [x] 7.1 `flatpaper-agent` and `flatpaper-mode` core with one playbook: Investigation. `scripts/` and `references/` stay out until a playbook needs them.
- [x] 7.1b `control-cli`, `control-ui`, `verify-this`. Source is `cursor-team-kit/skills/` at `2776ddd`, not `pstack/`: Bug fix step 1 and the router's Shipping UI trigger need them. `LICENSE` gains a Cursor credit line.
- [x] 7.2 Bug fix
- [x] 7.3 Feature
- [x] 7.4 Opening a PR
- [x] 7.5 Remaining playbooks, one at a time, chosen when needed
  - [x] Refactoring
  - [x] Authoring a skill
  - [x] Pause safely
  - [x] Session pickup
  - [x] Prototype
  - [x] Runtime forensics
  - [x] Trace forensics
  - [x] Autonomous run
  - [x] Eval
  - [x] Perf issue
  - [x] Hillclimb
  - [x] Babysit (with `scripts/watch-pr/`, `bootstrap.ts`, `package.json`, `bun.lock`; needs Bun)
  - [x] Shipping
  - [x] Autopilot-full
  - [x] Autopilot-stack
  - [x] Orchestrate
  - [x] Multi-phase plan (with `scripts/check-plan.mjs`)
  - [x] Worktree cleanup (with `scripts/worktree-audit.sh`; transcript scan adapted for Claude Code)
  - [x] Visual parity

## Layer 8: Verification

- [x] 8.1 `create-verification-skill`, `maintain-verification-skill`
- [ ] 8.2 `statechart`
- [ ] 8.3 `create-formal-verification-skill`, `maintain-formal-verification-skill`

## Layer 9: Session helpers

- [ ] 9.1 `ketchup`, `recall`
  - Revisit: the Autopilot-full playbook names **ketchup** (step 6 and Reply) for catching the operator up. Check it still fits once it lands.
- [ ] 9.2 `reflect`, `figure-it-out`
  - Revisit: `flatpaper-mode` names **figure-it-out** (Playbooks section) and `reflect` (Subagents section). The Refactoring playbook also routes large or cross-cutting work to **figure-it-out**, and Orchestrate (intro) contrasts itself with it. Check all four still fit once they land.
- [ ] 9.3 `poteto-help`

## Layer 10: End-to-end check

Run after the last brick. Run it again after any big change. Start a new session so every skill loads.

- [ ] 10.1 Static check. `claude plugin validate .` passes. No "Revisit" lines remain. A scan finds no Cursor-only names, no slash command without the `flatpaper-stack:` prefix, and no mention of a skill that is not imported.
- [ ] 10.2 Chains. Run each skill that uses another one. In the transcript, confirm that it read the other skill's file and made no blocked Skill call. Chains so far: `teach` -> `how`, `why`. `no-comments` -> `comment-sicko` -> `how`, `why`. `technical-writing` -> `unslop`.
- [ ] 10.3 Smoke test. Run every skill once on a real target. Record each result in a table: the skill, pass or fail, and one line on what it did.

## Not planned

Cursor-only, or not needed yet: `setup-pstack`, `automate-me`, `make-bot-ui`, `ketchup-video`, `typescript-best-practices`, `automations/benny`. Revisit any of them later.

- Revisit: `flatpaper-mode` (Before commit trigger), Opening a PR, Autopilot-full (step 2), and Multi-phase plan (PR mechanics) name `deslop` from `cursor-team-kit`. It is not imported. Decide: port (from `cursor-team-kit` like 7.1b), swap, or drop.
- Revisit: `principle-type-system-discipline` line 9 points to `typescript-best-practices`. If that skill stays unplanned, decide whether to keep the pointer.
