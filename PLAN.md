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
- [x] 8.2 `statechart`
- [x] 8.3 `create-formal-verification-skill`, `maintain-formal-verification-skill`

## Layer 9: Session helpers

- [x] 9.1 `ketchup`, `recall`
- [x] 9.1b `ketchup-video`: `ketchup` as a short subtitled slide video. Renders with `ffmpeg`. A terminal can't play video, so it shares the file path plus an Artifact page that plays it.
- [x] 9.2 `reflect`, `figure-it-out`
- [x] 9.3 `flatpaper-help` (upstream `poteto-help`, renamed like the router)

## Layer 10: Fill the gaps, then check end to end

First, four bricks that earlier bricks already point to. Each goes in the usual way.

- [x] 10.1 `deslop`: removes AI-looking code from a branch's diff. Source is `cursor-team-kit/skills/` at `2776ddd`, like 7.1b.
- [x] 10.2 `automate-me`: drafts a personal mode skill from the user's past chats.
- [x] 10.3 `typescript-best-practices`: rules for any `.ts` or `.tsx` work.
- [x] 10.4 `setup-flatpaper-stack` (upstream `setup-pstack`, renamed like the router). Import byte for byte, then rewrite for Claude Code. It does two things:
  1. Asks how much the user wants to spend.
  2. Picks a model and reasoning level for each role from the models this Claude Code actually has: Claude (`haiku`, `sonnet`, `opus`, `fable`), GPT through the Codex plugin (`codex:codex-rescue`) when installed, and Gemini when a Gemini plugin or MCP is installed. Detect, never require: a missing provider is skipped with one line, and no step asks for an API key.

  Decided: choices go in `~/.claude/flatpaper-stack/models.md`, one `role: provider/model:effort` line per role (`parent:<effort>` leaves `model` unset). Skills read it by path, as upstream skills read `pstack-models.mdc`. No `CLAUDE.md` import.
- [x] 10.4b Wire every model mention to the models file. Each skill that names a model reads its role line, else keeps today's default. How to read a value lives once, in the router's Subagents section; readers name the role and default and point there. Readers: `how`, `why`, `reflect`, `arena`, `architect`, `swarm`, `interrogate`, `recall`, `automate-me`, `show-me-your-work`, `flatpaper-mode` (Subagents section, Orchestrate's `pr verifier`), `flatpaper-help`. Family rules stay: the `show-me-your-work` reviewer, the Orchestrate PR verifier, and the arena judge must be a different family from the parent. Roles that need MCP tools (`why` investigators, `reflect`) treat a non-Claude value as missing.

Then the check. Run it after the last brick, and again after any big change. Start a new session so every skill loads.

- [x] 10.5 Static check. `claude plugin validate .` passes. No "Revisit" lines remain. A scan finds no Cursor-only names, no slash command without the `flatpaper-stack:` prefix, and no mention of a skill that is not imported.
- [x] 10.6 Chains. Run each skill that uses another one. In the transcript, confirm that it read the other skill's file and made no blocked Skill call. Chains: `teach` -> `how`, `why`, `unslop`. `no-comments` -> `comment-sicko` -> `how`, `why`. `technical-writing` -> `unslop`. `typescript-best-practices` -> `principle-type-system-discipline`. `architect` -> `how`, `why`, `arena`. `interrogate` -> `arena`, `in-your-own-words`. `setup-flatpaper-stack` -> `create-verification-skill`, `create-formal-verification-skill`. `figure-it-out` -> `flatpaper-mode`, `show-me-your-work`. `blast-radius` -> `why`, `unslop`. `recall` -> `why`, `unslop`. `ketchup` -> `bro`. `ketchup-video` -> `ketchup`, `bro`. `flatpaper-agent` -> `flatpaper-mode`. `flatpaper-mode` -> each user-only skill its triggers name. `principle-explain-the-number` -> `benchmark-checklist`. Skills that pick a subagent's model read `~/.claude/flatpaper-stack/models.md` directly. Links that are not chains (the `flatpaper-help` catalog, see-also links between principles, and principle citations) are checked by a scan that each relative `SKILL.md` path exists, not by a run.
- [x] 10.7 Smoke test. Run every skill once on a real target. Record each result in a table: the skill, pass or fail, and one line on what it did. Also rerun each 10.6 chain 3 times on the current text, with no prompt wording that asks the run to be cheap, and record how many runs read each file (for example 3/3). A chain that misses a read in any run gets a fix, proposed as before -> after. Cover what 10.6 left untested: `how`, `why`, `arena`, and `interrogate` picking a subagent's model from the models file, `teach` reading all of `why` (it read 60 of 98 lines), and `flatpaper-mode` reading a skill from its own folder rather than a copy in the working directory. Then test model overrides. 10.6 only saw the defaults, because `~/.claude/flatpaper-stack/models.md` was missing. Write a temporary models file that sets every role to a value no default uses (for example `claude/haiku`), run `how`, `recall`, `swarm`, and `show-me-your-work` once each, and confirm from each transcript's Agent calls that every spawn uses the file's model. `show-me-your-work`'s `trail reviewer` should stay on `codex:codex-rescue`, because a Claude value is the parent's family and the family rule overrides it. Also run `arena` or `interrogate` once without naming models, and confirm both halves of `parent, codex/default` spawn. Then delete the temporary file. Note whether a role's reasoning level (`:effort`) shows anywhere in the transcript; if it doesn't, say it can't be checked.
- [x] 10.8 Default models. Every role defaults to `medium` effort, except `hardest tasks` at `high`. `trivial edits` moves to haiku. Swarm splits into `swarm workers` (sonnet, easy pieces) and `swarm hard workers` (opus, pieces that need judgment). Every Codex seat defaults to `codex/matched`, the Codex model at the parent's tier (Fable → `gpt-6-astra`, Opus → `gpt-6.1-sol`, Sonnet → `gpt-6.1-terra`, Haiku → `gpt-6-luna`). The arena judge pool drops `claude/opus`, which could never judge.

## Not planned

Cursor-only, or not needed yet: `make-bot-ui`, `automations/benny`, and `docs/guide/` (the pstack user guide; `flatpaper-help` dropped its links to it). Revisit any of them later.

