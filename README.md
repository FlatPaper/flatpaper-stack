# flatpaper-stack

A Claude Code plugin for agent work you can check and review later. It is FlatPaper's taste on poteto's [pstack](https://github.com/cursor/plugins/tree/main/pstack). I ported it to my developer environment, added features from [pstack-claude](https://github.com/michael-denyer/pstack-claude), and changed the parts I'd do differently.

Three ideas carry it:

1. Every task has a done check that can fail.
2. Proof comes from the real result, not the agent's word.
3. Long work leaves a decision trail you can audit in minutes.

## Prerequisites

**Required**

- [Claude Code](https://code.claude.com), a recent version.
- `git`.

**Recommended**

| Tool | Used for | Without it |
|---|---|---|
| [`gh`](https://cli.github.com), logged in | Reading PRs, issues, and history in `why`, `recall`, and PR work | Those steps say they couldn't check GitHub |
| [codex-seats](https://github.com/FlatPaper/codex-seats) and the [Codex plugin](https://github.com/openai/codex-plugin-cc) | Codex models for roles, including cross-family reviews in `arena`, `interrogate`, `architect`, and `show-me-your-work` | Those seats fall back to Claude or are skipped, and the skill says so |
| Node 22.18+ (or 23.6+), Bun 1.1.5+, or Deno 2.0+ | `statechart` and the formal-verification skills | Those skills can't run |
| [`mise`](https://mise.jdx.dev) | `statechart` installs TLC and Java through it on first run, which needs the network | `statechart` can't run |
| `ffmpeg` and a headless Chromium | `ketchup-video` | It gives the text catch-up only |
| Playwright, or the app's own browser test setup | `control-ui` | It builds a smaller harness, or stops and says why |
| `tmux` | `control-cli` | It falls back to a small PTY script |

## Install

Load it from a local clone with a shell alias. Edits take effect on the next session.

```bash
git clone https://github.com/FlatPaper/flatpaper-stack ~/flatpaper-stack
alias claude='claude --plugin-dir ~/flatpaper-stack'
```

To use it in the IDE extension or the desktop app too, install it from the clone:

```bash
claude plugin marketplace add ~/flatpaper-stack
claude plugin install flatpaper-stack@flatpaper-stack --scope user
```

Optional: run `/flatpaper-stack:setup-flatpaper-stack` once to pick a model for each role. Without it, skills use the defaults in [`models.json`](models.json).

To add Codex models, install the [codex-seats plugin](https://github.com/FlatPaper/codex-seats) and its Codex companion. Flatpaper-stack ships no Codex runtime. The codex-seats `codex-seat` skill documents how to run seats and configure their sandbox and browser access.

## How to use it

```
/flatpaper-stack:flatpaper-mode fix the csv export dropping its last row. done means the 60k-row fixture exports every row. show me row counts before and after. no PR.
```

- [ ] Goal
- [ ] Done check
- [ ] Proof to show
- [ ] Constraints

More: [commands](docs/commands.md), [principles](docs/principles.md).

## Change a model default

To pick your own models, run `/flatpaper-stack:setup-flatpaper-stack`.
Run `/flatpaper-stack:setup-flatpaper-stack --repo` to write only repo overrides to `.agents/models.md`, which is meant to be committed.

Role choices use three layers, in order of increasing precedence: bundled `models.json`, user `~/.claude/flatpaper-stack/models.md`, and repository `.agents/models.md`. The repository root is the nearest ancestor of the current directory containing a `.git` file or directory. Missing files leave the lower layers in effect.

For a repo override, add role lines to `.agents/models.md` with the same format as the user file, for example `how explorer: claude/sonnet:medium`. An empty value selects no entries. A repo can restrict providers with `providers: claude`. `parent` is always allowed. If any entry is unusable, the resolver skips the whole line and tries the next layer. Codex entries require both the `codex-seats` and `codex` plugins. Named Codex models and efforts are checked against the local Codex cache when it is readable.

Run `node scripts/resolve-models.mjs` to see the effective table and skipped lines. Run `node scripts/resolve-models.mjs --check` to validate configuration. The check reports provider restrictions only for repository lines. User lines blocked by repository providers still appear as skipped in the effective table. The check exits 0 in both cases. Valid configuration prints nothing. Problems print one JSON object with a `systemMessage` warning. The SessionStart hook runs this check on startup, resume, and clear, even with `session hook: off`. Its JSON warning does not enter the model context.

To change the shipped defaults, edit `models.json`, then run `node scripts/stamp-models.mjs` to update the setup template. Skills name roles without copying their defaults.

## Pull upstream pstack changes

Commit your work first. Preview with `--dry-run`, run the sync, then run the tests. Fix anything the report lists. Details are in [docs/maintaining.md](docs/maintaining.md).

```bash
node scripts/sync.mjs <rev> --dry-run
node scripts/sync.mjs <rev>
node --test tests/*.test.mjs
```

## License

MIT. See [LICENSE](LICENSE). Portions are adapted from pstack, cursor-team-kit, and pstack-claude, all MIT.
