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

Optional: run `/flatpaper-stack:setup-flatpaper-stack` once. It checks which models you have, including Codex, and writes `~/.claude/flatpaper-stack/models.md`. Without the file, every skill uses its built-in defaults: each helper at `medium` effort, Sonnet for search and easy work, the session's model for judgment, and the matching GPT model for second opinions.

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

## License

MIT. See [LICENSE](LICENSE). Portions are adapted from pstack, cursor-team-kit, and pstack-claude, all MIT.
