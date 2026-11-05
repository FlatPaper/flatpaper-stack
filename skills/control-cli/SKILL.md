---
name: control-cli
description: Drive, inspect, and profile an interactive CLI or TUI with a repeatable local harness. A tmux script and a PTY fallback send keys, wait for a screen pattern with a timeout, and exit 124 on a hang. Use when a step must check a CLI or TUI on the real surface and no verify-<app> skill exists, or for CLI prompt flows, startup regressions, hangs, memory leaks, or terminal demos.
---

# Control CLI

Exercise an interactive CLI with a harness you can rerun, not by hand. If the project has a `verify-<app>` skill, follow it instead. This skill is the fallback driver, and a recipe for that skill's Drive section.

Reuse the repo's own harness first: package scripts, end-to-end tests, demo recorders, expect scripts, or PTY helpers. It already knows the app's startup, environment, and prompts. If none fits, use `${CLAUDE_PLUGIN_ROOT}/skills/control-cli/scripts/drive.sh` (tmux), or `scripts/pty-drive.py` on a host without tmux.

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

## drive.sh

It runs each session on a private tmux server (`tmux -L control-cli`), so it never touches your own tmux sessions.

```bash
drive="${CLAUDE_PLUGIN_ROOT}/skills/control-cli/scripts/drive.sh"
"$drive" start app -- <command-under-test> <args>
"$drive" wait app '<ready pattern>' --timeout 10
"$drive" type app 'help'
"$drive" send app Enter
"$drive" wait app '<expected output>'
"$drive" capture app > "$OUT/after.txt"
"$drive" kill app
```

- `start <session> [--size <cols>x<rows>] -- <command>` runs the command in a new 120x40 session. The pane stays after the command exits, so its last screen can still be read.
- `wait <session> <regex>` polls the visible screen with `grep -E`. On a match it prints the screen and exits 0. If the command exits first, it prints the output and exits 1. After `--timeout` seconds (default 10) it prints the last screen and exits 124.
- `type` sends literal text. `send` sends tmux key names, such as `Enter`, `Escape`, `C-c`, and `Up`.
- `capture` prints the screen. `kill` ends the session and its command.

`wait` matches anything on screen, including a prompt from an earlier step. Wait for output the last action produced, not for a prompt that is already visible.

## pty-drive.py

It runs the whole session in one call: the steps are flags, in order. It needs only Python 3.

```bash
"${CLAUDE_PLUGIN_ROOT}/skills/control-cli/scripts/pty-drive.py" --timeout 10 \
  --wait '<ready pattern>' --send 'help\r' --wait '<expected output>' \
  --transcript "$OUT/session.txt" -- <command-under-test> <args>
```

- `--wait <regex>` matches only the output after the previous match, with terminal escape sequences stripped.
- `--send <text>` takes backslash escapes, so `\r` is Enter and `\x03` is Ctrl-C.
- `--timeout <seconds>` applies to the waits after it.
- It prints the transcript and exits 0 at the end, 1 if the command exits before a match, and 124 on a timeout. It kills the command's process group on every exit.

## Node CLIs

Start the CLI with the inspector on a free port, then read the inspector URL from the screen:

```bash
"$drive" start app -- env NODE_OPTIONS=--inspect=127.0.0.1:0 <node-cli-command>
"$drive" wait app 'Debugger listening on ws://'
```

Attach DevTools-compatible tooling to that URL for profiles and heap snapshots. The `control-ui` skill lists the CDP domains.

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
