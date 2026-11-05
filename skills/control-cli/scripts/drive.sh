#!/usr/bin/env bash
# Drive an interactive CLI in a tmux session on a private tmux server.
#
#   drive.sh start <session> [--size <cols>x<rows>] -- <command> [args...]
#   drive.sh wait <session> <regex> [--timeout <seconds>]
#   drive.sh send <session> <key>...    tmux key names: Enter, Escape, C-c, Up
#   drive.sh type <session> <text>      literal text, no Enter
#   drive.sh capture <session>
#   drive.sh status <session>           "running", or the command's exit status
#   drive.sh kill <session>
#
# wait polls the screen with grep -E. It prints the screen and exits 0 on a
# match, exits 1 if the command exited first, and exits 124 on timeout. Both
# failures print the last screen. The timeout is a whole number of seconds,
# default 10. Once the command has exited, wait and capture read the scrollback
# too. A usage error exits 2.
set -uo pipefail

usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0" >&2; exit 2; }
t() { tmux -L control-cli "$@"; }
drop_trailing_blank_lines() { awk 'NF { while (n) { print ""; n-- } print; next } { n++ }'; }
dead() { [ "$(t display-message -p -t "$session" '#{pane_dead}')" = 1 ]; }
# A dead pane scrolls its last output into history.
screen() {
	if dead; then t capture-pane -p -J -S - -t "$session"; else t capture-pane -p -J -t "$session"; fi | drop_trailing_blank_lines
}

[ $# -ge 2 ] || usage
cmd=$1 session=$2
shift 2

case "$cmd" in
start)
	size=120x40
	while [ $# -gt 0 ] && [ "$1" != -- ]; do
		case "$1" in
		--size) size=${2:-}; shift 2 || usage ;;
		*) usage ;;
		esac
	done
	printf '%s\n' "$size" | grep -qxE '[0-9]+x[0-9]+' || usage
	[ "${1:-}" = -- ] && [ $# -ge 2 ] || usage
	shift
	t new-session -d -s "$session" -x "${size%x*}" -y "${size#*x}" || exit 1
	t set-option -t "$session" remain-on-exit on > /dev/null
	t respawn-pane -k -t "$session" -- "$@"
	;;
wait)
	[ $# -ge 1 ] || usage
	regex=$1 timeout=10
	shift
	[ "${1:-}" = --timeout ] && { timeout=${2:-}; shift 2 || usage; }
	[ $# -eq 0 ] || usage
	printf '%s\n' "$timeout" | grep -qxE '[0-9]+' || usage
	start=$SECONDS
	while :; do
		t has-session -t "$session" 2> /dev/null || { printf 'drive: no session %s\n' "$session" >&2; exit 1; }
		out=$(screen)
		if printf '%s\n' "$out" | grep -qE -- "$regex"; then
			code=0 msg=
		elif dead; then
			code=1 msg="$session exited before /$regex/ appeared"
		elif [ $((SECONDS - start)) -ge "$timeout" ]; then
			code=124 msg="timed out after ${timeout}s waiting for /$regex/ in $session"
		else
			sleep 0.1
			continue
		fi
		printf '%s\n' "$out"
		[ -n "$msg" ] && printf 'drive: %s\n' "$msg" >&2
		exit "$code"
	done
	;;
send) t send-keys -t "$session" "$@" ;;
type) t send-keys -t "$session" -l -- "$*" ;;
capture) t has-session -t "$session" && screen ;;
status)
	t has-session -t "$session" || exit 1
	if dead; then t display-message -p -t "$session" '#{pane_dead_status}'; else echo running; fi
	;;
kill) t kill-session -t "$session" ;;
*) usage ;;
esac

# ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 skills/control-cli/SKILL.md (MIT)
