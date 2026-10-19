#!/usr/bin/env bash
# PreToolUse hook that flatpaper-mode registers for `gh pr create`. Blocks the
# first call in a session with the Opening a PR steps, then lets calls through.
# Reads the hook JSON on stdin. Markers live in $FLATPAPER_PR_GATE_DIR
# (default: $TMPDIR/flatpaper-pr-gate), one file per session id. Without a
# session id or a writable marker it lets the call through, so it never loops.
set -uo pipefail

sid=$(sed -n 's/.*"session_id" *: *"\([^"]*\)".*/\1/p' | head -1)
dir="${FLATPAPER_PR_GATE_DIR:-${TMPDIR:-/tmp}/flatpaper-pr-gate}"
[ -n "$sid" ] || exit 0
marker="$dir/$sid"
[ -e "$marker" ] && exit 0
mkdir -p "$dir" 2>/dev/null && touch "$marker" 2>/dev/null || exit 0

playbook="$(cd "$(dirname "$0")/.." && pwd)/playbooks/opening-a-pr.md"
cat >&2 <<EOF
flatpaper-mode blocked the first gh pr create of this session. Open $playbook and make a task per step if you have not.
Before opening the PR, these run even where the repo sets its own format:
- no-comments over the diff against the base, committed as its own commit
- state whether the diff is risky; if it is, run blast-radius and put its result in the body
- technical-writing, then unslop, over the title, body, and commit messages
Only rules written in the repo's rules files or PR template replace the playbook's format defaults (title, body headings, branch, labels, draft). Past PRs and commits are precedent, not rules.
Run gh pr create again only after these steps are done. The retry is not blocked, so the gate does not check them.
EOF
exit 2
