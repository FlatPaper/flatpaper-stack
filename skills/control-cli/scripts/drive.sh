#!/usr/bin/env bash
# Drive an interactive CLI in a tmux session on a private tmux server.
#
#   drive.sh start <session> [--size <cols>x<rows>] -- <command> [args...]
#   drive.sh wait <session> <regex> [--timeout <seconds>]
#   drive.sh send <session> <key>...    tmux key names: Enter, Escape, C-c, Up
#   drive.sh type <session> <text>      literal text, no Enter
#   drive.sh capture <session>
#   drive.sh kill <session>
#
# wait polls the visible screen with grep -E. It prints the screen and exits 0
# on a match, exits 1 if the command exited first, and exits 124 on timeout.
# Both failures print the last screen. The default timeout is 10 seconds.
set -uo pipefail

usage() { sed -n '2,13s/^# \{0,1\}//p' "$0" >&2; exit 2; }
t() { tmux -L control-cli "$@"; }
# Print the pane without its trailing blank lines.
capture() { t capture-pane -p -J -t "$session" "$@" | awk 'NF { while (n) { print ""; n-- } print; next } { n++ }'; }

[ $# -ge 2 ] || usage
cmd=$1 session=$2
shift 2

case "$cmd" in
start)
	size=120x40
	while [ $# -gt 0 ] && [ "$1" != -- ]; do
		case "$1" in
		--size) size=$2; shift 2 ;;
		*) usage ;;
		esac
	done
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
	[ "${1:-}" = --timeout ] && { timeout=$2; shift 2; }
	[ $# -eq 0 ] || usage
	start=$SECONDS
	while :; do
		dead=$(t display-message -p -t "$session" '#{pane_dead}') || exit 1
		# A dead pane scrolls its last output into history.
		if [ "$dead" = 1 ]; then screen=$(capture -S -); else screen=$(capture); fi
		if printf '%s\n' "$screen" | grep -qE -- "$regex"; then
			printf '%s\n' "$screen"
			exit 0
		fi
		if [ "$dead" = 1 ]; then
			printf '%s\n' "$screen"
			printf 'drive: %s exited before /%s/ appeared\n' "$session" "$regex" >&2
			exit 1
		fi
		if [ $((SECONDS - start)) -ge "$timeout" ]; then
			printf '%s\n' "$screen"
			printf 'drive: timed out after %ss waiting for /%s/ in %s\n' "$timeout" "$regex" "$session" >&2
			exit 124
		fi
		sleep 0.1
	done
	;;
send) t send-keys -t "$session" "$@" ;;
type) t send-keys -t "$session" -l -- "$*" ;;
capture) capture ;;
kill) t kill-session -t "$session" ;;
*) usage ;;
esac

# ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 skills/control-cli/SKILL.md (MIT)
