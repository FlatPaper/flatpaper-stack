#!/usr/bin/env bash
# PreToolUse hook that flatpaper-mode registers for `gh pr create`. Blocks the
# call until the session transcript shows each skill in the loop below ran, as
# Skill calls or typed slash commands. Reads the hook JSON on stdin. Without a readable transcript, or with FLATPAPER_PR_GATE_OFF
# set, it lets the call through. The hook's `if` filter runs the hook on any
# command it cannot parse, so a call that does not run gh pr create passes.
set -uo pipefail

[ -n "${FLATPAPER_PR_GATE_OFF:-}" ] && exit 0
input=$(cat)
grep -qE 'gh[[:space:]]+pr[[:space:]]+create' <<< "$input" || exit 0
transcript=$(sed -n 's/.*"transcript_path" *: *"\([^"]*\)".*/\1/p' <<< "$input" | head -1)
[ -f "$transcript" ] && [ -r "$transcript" ] || exit 0

missing=()
for skill in tidy no-comments technical-writing unslop; do
	grep -qE "\"name\":\"Skill\",\"input\":\{\"skill\":\"([^\"]*:)?$skill\"|<command-name>/([^<]*:)?$skill</command-name>" "$transcript" || missing+=("$skill")
done
[ "${#missing[@]}" -eq 0 ] && exit 0

playbook="$(cd "$(dirname "$0")/.." && pwd)/playbooks/opening-a-pr.md"
cat >&2 <<EOF
flatpaper-mode blocked gh pr create: this session has not run ${missing[*]}. Open $playbook and make a task per step if you have not.
Before opening the PR, these run even where the repo sets its own format:
- tidy, then no-comments, over the diff against the base, each committed as its own commit
- state whether the diff is risky; if it is, run blast-radius and put its result in the body
- technical-writing, then unslop, over the title, body, and commit messages
Only rules written in the repo's rules files or PR template replace the playbook's format defaults (title, body headings, branch, labels, draft). Past PRs and commits are precedent, not rules.
gh pr create stays blocked until each of these skills has run in this session. If a skill cannot run here, ask the user; they can set FLATPAPER_PR_GATE_OFF=1 in the environment to turn the gate off.
EOF
exit 2
