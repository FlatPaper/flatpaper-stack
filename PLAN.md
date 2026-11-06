# Plan: build pstack brick by brick

Source: [cursor/plugins/pstack](https://github.com/cursor/plugins/tree/2776ddd/pstack) at commit `2776ddd`. Every brick is copied from there.

## How each brick goes in

1. **Read.** Claude explains the brick in a few lines: what it is, and what it changes.
2. **Import.** Copy `pstack/skills/<name>/` byte for byte into `skills/<name>/`, keeping the upstream folder name. No provenance line in the file: this plan names the source commit, and `LICENSE` carries the credit.
3. **Adapt.** Change only what breaks in Claude Code (Cursor-only tools or names). Show every change.
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
- [ ] 1.7 `type-system-discipline`, `test-behavior-not-implementation`
- [ ] 1.8 `make-operations-idempotent`, `separate-before-serializing-shared-state`
- [ ] 1.9 `guard-the-context-window`, `minimize-reader-load`
- [ ] 1.10 `outcome-oriented-execution`, `never-block-on-the-human`
- [ ] 1.11 `sequence-verifiable-units`, `migrate-callers-then-delete-legacy-apis`
- [ ] 1.12 `experience-first`, `exhaust-the-design-space`, `explain-the-number`

## Layer 2: Small tools

One job each, under 5 KB, no real dependencies.

- [ ] 2.1 `unslop`: cuts AI-sounding prose
- [ ] 2.2 `sharpen`: rewrites a prompt to go deeper
- [ ] 2.3 `correct`, `in-your-own-words`, `bro`

## Layer 3: Understanding code

- [ ] 3.1 `how`: explains how code works
- [ ] 3.2 `why`: finds why code is the way it is (largest tool, 52 KB, take it slow)
- [ ] 3.3 `teach`: combines `how` and `why`

## Layer 4: Writing and cleanup

- [ ] 4.1 `technical-writing`
- [ ] 4.2 `no-comments` + `comment-sicko` agent

## Layer 5: Ways of working

- [ ] 5.1 `show-me-your-work`: decision log
- [ ] 5.2 `tdd`
- [ ] 5.3 `swarm`: parallel workers
- [ ] 5.4 `arena`: parallel attempts, pick the best

## Layer 6: Design and review

- [ ] 6.1 `architect`
- [ ] 6.2 `interrogate`
- [ ] 6.3 `blast-radius`
- [ ] 6.4 `benchmark-checklist`

## Layer 7: The router

`poteto-mode` is 107 KB. It goes in small.

- [ ] 7.1 `poteto-agent` and `poteto-mode` core with one playbook: Investigation
- [ ] 7.2 Bug fix
- [ ] 7.3 Feature
- [ ] 7.4 Opening a PR
- [ ] 7.5 Remaining playbooks, one at a time, chosen when needed

## Layer 8: Verification

- [ ] 8.1 `create-verification-skill`, `maintain-verification-skill`
- [ ] 8.2 `statechart`
- [ ] 8.3 `create-formal-verification-skill`, `maintain-formal-verification-skill`

## Layer 9: Session helpers

- [ ] 9.1 `ketchup`, `recall`
- [ ] 9.2 `reflect`, `figure-it-out`
- [ ] 9.3 `poteto-help`

## Not planned

Cursor-only, or not needed yet: `setup-pstack`, `automate-me`, `make-bot-ui`, `ketchup-video`, `typescript-best-practices`, `automations/benny`. Revisit any of them later.
