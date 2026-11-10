# flatpaper-stack

A Claude Code plugin for agent work you can check and review later. Adapted from poteto's [pstack](https://github.com/cursor/plugins/tree/main/pstack).

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
git clone https://github.com/FlatPaper/flatpaper-stack ~/Documents/GitHub/flatpaper-stack
alias claude='claude --plugin-dir ~/Documents/GitHub/flatpaper-stack'
```

To use it in the IDE extension or the desktop app too, install it from the clone:

```bash
claude plugin marketplace add ~/Documents/GitHub/flatpaper-stack
claude plugin install flatpaper-stack@flatpaper-stack --scope user
```

Optional: run `/flatpaper-stack:setup-flatpaper-stack` once. It checks which models you have, including Codex, and writes `~/.claude/flatpaper-stack/models.md`. Without the file, every skill uses the defaults in [`models.json`](models.json). Helpers run at `medium` effort. Sonnet handles search, easy work, and feature and refactoring code. The session's model handles judgment and bug fixes, and the matching GPT model gives second opinions.

## How to use it

**Most of the time, use one command.** Start real work with flatpaper-mode and say what done looks like:

```
/flatpaper-stack:flatpaper-mode fix the csv export dropping its last row. done means the 60k-row fixture exports every row. show me row counts before and after. no PR.
```

The goal is the only part you need. Adding a done check, the proof you want to see, and any limits ("no PR", "don't touch the schema") keeps the agent from quietly weakening them. flatpaper-mode picks the right playbook (investigation, bug fix, feature, refactor, and others) and calls the other skills for you.

A session hook also starts flatpaper-mode on its own for work that touches more than one file, makes a design choice, or chases a bug or slowdown whose cause is unknown. To turn that off, put `session hook: off` in `~/.claude/flatpaper-stack/models.md`.

**A few you'll call yourself:**

| Command | When |
|---|---|
| `/flatpaper-stack:flatpaper-help` | You're not sure how to word a request or which skill fits |
| `/flatpaper-stack:ketchup` | You stepped away and want a short catch-up |
| `/flatpaper-stack:bro` | The last reply was too dense |
| `/flatpaper-stack:recall` | You're starting a session and want your recent context back |
| `/flatpaper-stack:teach` | You want a change or subsystem explained so you understand it |

Run the session on Opus at `high` effort (`claude --model opus --effort high`) for the best code. Helpers pick their own models from the settings above.

## Changing a model default

Role defaults live only in `models.json`. Edit it, then run `node scripts/stamp-models.mjs` to rewrite every copy in the skills and the models.md template in `setup-flatpaper-stack`. Never edit those copies by hand. In skill prose, write a default as "the `<role>` role (default `<value>`)", the only shape the script stamps. `node --test tests/*.test.mjs` runs the script's `--check`, which fails on a stale copy or on a default written as "default `<value>`" outside that shape. It can't see a default written in plain words, such as "the parent model", so review still has to catch those.

## Pull upstream pstack changes

`scripts/sync.mjs` moves flatpaper-stack from the upstream pin in `sync/upstream.json` to a newer commit of cursor/plugins. It derives the old and new upstream files through the rules in `sync/substitutions.json`, compares each with the local copy, writes the clean updates, and keeps every fork listed in `sync/forks.json`. Commit your work first, then preview and run it:

```bash
node scripts/sync.mjs <rev> --dry-run
node scripts/sync.mjs <rev>
node scripts/stamp-models.mjs --check && node --test tests/*.test.mjs
```

Exit 0 means the tree is updated. Exit 1 means the tree is updated and the report lists follow-ups, such as a new upstream skill to review. Exit 2 means the run wrote nothing and left the pin alone. Fix each problem the report names. A mechanical difference needs a rule in `substitutions.json`, and a deliberate one needs a `forks.json` entry with its `why`. For a conflict, make the local file take upstream's change, then rerun with `--resolved <path>`. `--remote <path>` reads a local clone in place of a fresh one, and `FLATPAPER_UPSTREAM=<clone>` turns on the real-tree and replay tests.

## License

MIT. See [LICENSE](LICENSE). Portions are adapted from pstack, cursor-team-kit, and pstack-claude, all MIT.
