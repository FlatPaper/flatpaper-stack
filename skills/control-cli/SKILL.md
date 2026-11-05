---
name: control-cli
description: Drive, inspect, and profile an interactive CLI or TUI with a repeatable local harness. A tmux script and a PTY fallback send keys, wait for a screen pattern with a timeout, and exit 124 on a hang. Use when a step must check a CLI or TUI on the real surface and no verify-<app> skill exists, or for CLI prompt flows, startup regressions, hangs, memory leaks, or terminal demos.
---

# Control CLI

Exercise an interactive CLI with a harness you can rerun, not by hand. If the project has a `verify-<app>` skill, follow it instead. This skill is the fallback driver, and a recipe for that skill's Drive section.

Reuse the repo's own harness first: package scripts, end-to-end tests, demo recorders, expect scripts, or PTY helpers. It already knows the app's startup, environment, and prompts. If none fits, use `${CLAUDE_PLUGIN_ROOT}/skills/control-cli/scripts/drive.sh` (tmux), or `${CLAUDE_PLUGIN_ROOT}/skills/control-cli/scripts/pty-drive.py` on a host without tmux. When `CLAUDE_PLUGIN_ROOT` is unset, as in a clone of this plugin, use the paths from the clone's root, such as `skills/control-cli/scripts/drive.sh`.

## What it is for

- Reproduce CLI and TUI bugs with deterministic input.
- Check keyboard flows, prompts, interrupts, resizing, and terminal layout.
- Keep before and after transcripts for a fix.
- Profile startup time, slow operations, hangs, and memory growth.
- Record a short terminal demo when output is easier to show than to explain.

## Harness loop

1. Name the command under test and the smallest workspace that reproduces the behavior.
2. Look for a harness the repo already has.
3. If none exists, start the CLI in an isolated terminal session with a fixed environment.
4. Capture the screen before you interact.
5. Send one action at a time: text, Enter, arrow keys, Escape, Ctrl-C, or a resize.
6. Wait for a concrete screen pattern or prompt before the next action.
7. Save the transcript and any profile files in the session scratchpad.
8. Kill the session.

## Harness options

- A repo-native harness comes first, because checked-in scripts know the app's startup, environment, and prompts.
- tmux, through `drive.sh`: managed sessions, `capture-pane`, `send-keys`, and attach and detach.
- A PTY, through `pty-drive.py`, when tmux is missing. A short Node or Expect script also works.
- A runtime inspector: the Node or Bun inspector, for CPU profiles, heap snapshots, and live evaluation in the running process.
- A terminal recorder: the repo's own demo tools, or an asciinema-compatible recorder, only when the user asks for a demo.

## drive.sh

It runs each session on a private tmux server (`tmux -L control-cli`), so it never touches your own tmux sessions. In these examples, `$OUT` is a directory you make for this run's files in the session scratchpad, for example `OUT=<scratchpad>/cli-<slug>; mkdir -p "$OUT"`.

```bash
drive="${CLAUDE_PLUGIN_ROOT}/skills/control-cli/scripts/drive.sh"
s="app-$$"
"$drive" start "$s" -- env NO_COLOR=1 <command-under-test> <args>
"$drive" wait "$s" '<ready pattern>' --timeout 10
"$drive" type "$s" 'help'
"$drive" send "$s" Enter
"$drive" wait "$s" '<output that only help prints>'
"$drive" capture "$s" > "$OUT/after.txt"
"$drive" kill "$s"
```

- `start <session> [--size <cols>x<rows>] -- <command>` runs the command in a new 120x40 session. The pane stays after the command exits, so its output can still be read.
- `wait <session> <regex>` polls the screen with `grep -E`. On a match it prints the screen and exits 0. If the command exits first, it prints the output and exits 1. `--timeout` is a whole number of seconds (default 10). The wait gives up after at least that long and at most one second more, then prints the last screen and exits 124.
- `type` sends its text byte for byte, a trailing `;` included. `send` sends tmux key names, such as `Enter`, `Escape`, `C-c`, and `Up`.
- `capture` prints the screen. `status` prints `running`, or the command's exit status once it has exited. Both exit 1, silently, when the session does not exist. `kill` ends the session and its command.
- Exit codes: 0 ok, 1 the command exited before the match or the session does not exist, 2 a usage error (such as `--timeout 1.5`), and 124 a timeout. When tmux itself fails, as for `start` with a name that is already taken, its message goes to stderr and the exit is 1.

Rules for reliable waits:

- Give each session a unique name, such as one with `$$` in it. Every agent on the machine shares the private server, so a reused name collides.
- Set the environment in the command with `env VAR=value <command>`. A session gets the environment of the server, and the server keeps the environment of whichever call started it.
- `wait` matches anything on screen, including a prompt from an earlier step and the echo of text you typed. Wait for output that only the last action produces.
- After the command exits, `wait` and `capture` read the scrollback too, not only the last screen.
- To confirm a clean exit, wait for the exit and check the status: `"$drive" wait "$s" 'Pane is dead'` and then `"$drive" status "$s"` prints `0`.
- A command that prints nothing has no ready pattern. Check `status` to see that it is still running, then wait for the output its first input produces. A `wait` that exits 124 is the hang verdict.

## pty-drive.py

It runs the whole session in one call: the steps are flags, in order. It needs only Python 3.9 or later.

```bash
"${CLAUDE_PLUGIN_ROOT}/skills/control-cli/scripts/pty-drive.py" --timeout 10 \
  --wait '<ready pattern>' --send 'help\r' --wait '<expected output>' \
  --send 'quit\r' --wait-exit --transcript "$OUT/session.txt" -- <command-under-test> <args>
```

- `--size <cols>x<rows>` sets the terminal size (default 120x40). `--transcript <file>` also writes the raw output, escape sequences included.
- `--wait <regex>` matches only the output after the previous match. Terminal escape sequences are stripped and line endings become `\n` first, so `^42$` matches a line as it does in `drive.sh`. The echo of sent text is output too.
- `--send <text>` takes backslash escapes, so `\r` is Enter and `\x03` is Ctrl-C. A malformed escape such as `\x` is a usage error.
- `--wait-exit` waits for the command to exit and prints `pty-drive: command exited with status <n>` on stderr, or `with signal <n>` when a signal killed it. Use it to confirm a clean exit. A `--send` after the command exited stops the run with exit 1.
- `--timeout <seconds>` applies to the waits after it, `--wait-exit` included, and decimals work.
- It prints the transcript and exits 0 when every step passed, or 3 when `--wait-exit` saw a non-zero status. It exits 1 if the command exits before a `--wait` match, 2 on a usage error, 124 on a timeout, and 130 or 143 on SIGINT or SIGTERM. Without `--wait-exit`, a command still running at the end is killed, and its status is not checked. It kills the command's process group on every exit.

## Node and Bun CLIs

Start the CLI with the inspector on a free port, then read the inspector URL from the screen:

```bash
"$drive" start "$s" -- env NODE_OPTIONS=--inspect=127.0.0.1:0 <node-cli-command>
"$drive" wait "$s" 'Debugger listening on ws://'
```

For Bun, pass `--inspect` to `bun` and wait for the URL it prints. Attach DevTools-compatible tooling to that URL for profiles, heap snapshots, and live evaluation. The `control-ui` skill lists the CDP domains.

## Profiling recipes

- Startup regression: time the baseline and the change on the same machine, environment, and command.
- Slow operation: start a CPU profile, do the operation, stop the profile, and compare the top self-time functions.
- Memory leak: force GC if you can, take a heap snapshot, repeat the operation many times, force GC again, and take a second snapshot.
- Hang: capture the screen, the active handles and resources, and a stack or CPU sample before you interrupt it. A `wait` that exits 124 is the hang verdict, so take these samples before `kill`.

## Guardrails

- Wait for a pattern, not for a fixed time. If you must sleep, say why.
- Do not send credentials or destructive commands into a driven session.
- Keep the harness and its files in the session scratchpad or `$TMPDIR` unless the repo already has a test or demo harness.
- Do not hard-code paths from another repository. Adapt the commands to the current repo's scripts and runtime.
- Clean up tmux sessions, temp directories, inspector processes, and demo files unless the user asks to keep them.

<!-- ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 skills/control-cli/SKILL.md (MIT) -->
