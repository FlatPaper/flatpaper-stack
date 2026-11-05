#!/usr/bin/env bash
# Run one read-only Codex seat through the codex plugin's companion script.
# It never passes --write, so the companion starts Codex in its read-only sandbox.
#
# Usage: codex-seat.sh --model <id> --effort <low|medium|high|xhigh>
#                      --fallback <what runs instead> [--timeout <seconds>]
#                      [--cwd <dir>] <prompt-file>
#
# Success: prints Codex's final message on stdout and exits 0.
# Failure: prints one line on stdout and exits 3:
#   codex seat fallback: <cause>: <detail>. Running <fallback> instead.
# The cause is one of: missing, timeout, model-rejected, throttled,
# tree-changed, empty, error.
set -uo pipefail

model="" effort="" fallback="" timeout=1200 cwd="$PWD" prompt=""
while [ $# -gt 0 ]; do
	case "$1" in
		--model) model=$2; shift 2 ;;
		--effort) effort=$2; shift 2 ;;
		--fallback) fallback=$2; shift 2 ;;
		--timeout) timeout=$2; shift 2 ;;
		--cwd) cwd=$2; shift 2 ;;
		-*) echo "codex-seat.sh: unknown option $1" >&2; exit 2 ;;
		*) prompt=$1; shift ;;
	esac
done
if [ -z "$model" ] || [ -z "$effort" ] || [ -z "$fallback" ] || [ ! -f "$prompt" ]; then
	echo "usage: codex-seat.sh --model <id> --effort <level> --fallback <text> [--timeout <s>] [--cwd <dir>] <prompt-file>" >&2
	exit 2
fi

fall() { printf 'codex seat fallback: %s: %s. Running %s instead.\n' "$1" "$2" "$fallback"; exit 3; }

companion=${CODEX_COMPANION:-$(ls -d "$HOME"/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs 2>/dev/null | sort -V | tail -1)}
command -v node >/dev/null || fall missing "node is not on PATH"
command -v codex >/dev/null || fall missing "codex is not on PATH"
[ -n "$companion" ] && [ -f "$companion" ] || fall missing "the codex plugin's codex-companion.mjs was not found"

tmp=$(mktemp -d 2>/dev/null || mktemp -d -t codexseat)
trap 'rm -rf "$tmp"' EXIT

tree_state() { git -C "$cwd" --no-optional-locks status --porcelain 2>/dev/null; }
before=$(tree_state)

run_with_timeout() {
	perl -e '
		my $t = shift;
		my $pid = fork // die;
		if (!$pid) { setpgrp(0, 0); exec @ARGV or exit 127 }
		$SIG{ALRM} = sub {
			kill "TERM", -$pid;
			for (1 .. 20) { waitpid($pid, 1); last unless kill 0, -$pid; select undef, undef, undef, 0.1 }
			kill "KILL", -$pid;
			exit 124;
		};
		alarm $t;
		waitpid($pid, 0);
		exit($? & 127 ? 128 + ($? & 127) : $? >> 8);
	' "$@"
}

run_with_timeout "$timeout" node "$companion" task --fresh --model "$model" --effort "$effort" \
	--cwd "$cwd" --prompt-file "$prompt" > "$tmp/out" 2> "$tmp/err"
rc=$?

[ "$(tree_state)" = "$before" ] || fall tree-changed "git status in $cwd changed during a read-only run"
[ "$rc" -eq 124 ] && fall timeout "no answer within ${timeout}s"

if [ "$rc" -eq 0 ] && grep -q '[^[:space:]]' "$tmp/out"; then
	cat "$tmp/out"
	exit 0
fi
[ "$rc" -eq 0 ] && fall empty "Codex returned no text"

detail=$(sed -n 's/^\[codex\] Codex error: //p' "$tmp/err" | head -1)
[ -n "$detail" ] || detail=$(cat "$tmp/out" "$tmp/err" | grep -v '^\[codex\]' | grep -m1 '[^[:space:]]')
detail=$(printf '%s' "$detail" | tr -s '[:space:]' ' ' | cut -c1-200)
detail=${detail%.}
detail=${detail:-"exit $rc, no answer"}
shopt -s nocasematch
case "$detail" in
	*"not installed"*) fall missing "$detail" ;;
	*"model"*"not supported"*|*"unsupported model"*|*"model_not_found"*) fall model-rejected "$detail" ;;
	*"rate limit"*|*"usage limit"*|*429*|*"too many requests"*|*quota*) fall throttled "$detail" ;;
esac
fall error "$detail"
