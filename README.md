# flatpaper-stack

A Claude Code plugin for agent work you can check and review later. Ported from poteto's [pstack](https://github.com/cursor/plugins/tree/main/pstack) for my developer environment, with features from [pstack-claude](https://github.com/michael-denyer/pstack-claude).

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
| [Codex plugin](https://github.com/openai/codex-plugin-cc) | A second opinion from a different model family in `arena`, `interrogate`, `architect`, and `show-me-your-work` | Those seats fall back to Claude or are skipped, and the skill says so |
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

To change the shipped defaults, edit `models.json`, then run `node scripts/stamp-models.mjs` to rewrite every copy in the skills.

## Pull upstream pstack changes

Commit your work first. Preview with `--dry-run`, run the sync, then run the tests. Fix anything the report lists. Details are in [docs/maintaining.md](docs/maintaining.md).

```bash
node scripts/sync.mjs <rev> --dry-run
node scripts/sync.mjs <rev>
node --test tests/*.test.mjs
```

## License

MIT. See [LICENSE](LICENSE). Portions are adapted from pstack, cursor-team-kit, and pstack-claude, all MIT.
