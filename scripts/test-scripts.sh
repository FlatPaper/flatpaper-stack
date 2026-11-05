#!/usr/bin/env bash
# Fixture tests for the plugin's shell scripts. Exits non-zero on any failure.
# Usage: scripts/test-scripts.sh [repo-root]
set -uo pipefail

root="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
scripts="$root/skills/flatpaper-mode/scripts"
tmp=$(mktemp -d 2>/dev/null || mktemp -d -t fptest)
trap 'rm -rf "$tmp"' EXIT
fail=0
pass=0
skipped=0
ok() { pass=$((pass + 1)); }
bad() { printf 'FAIL %s\n' "$1"; fail=1; }
inconclusive() { printf 'INCONCLUSIVE %s: %s\n' "$1" "$2"; skipped=$((skipped + 1)); }

mkdir -p "$tmp/lint"
cp -R "$root"/* "$tmp/lint/"
echo 'Spawn a generalPurpose agent.' >> "$tmp/lint/skills/tidy/SKILL.md"
"$root/scripts/check-skills.sh" "$tmp/lint" > "$tmp/out" 2>&1
if [ $? = 1 ] && [ "$(grep -c '^FAIL' "$tmp/out")" = 1 ] && grep -q '^FAIL banned term: skills/tidy/SKILL.md:[0-9]*:Spawn a generalPurpose' "$tmp/out"; then ok; else
	bad "check-skills: want exit 1 and one FAIL, the banned term on the planted line, with provenance lines exempt"; sed 's/^/  /' "$tmp/out"
fi

# check-plan.sh. The base plan is the playbook skeleton with every placeholder
# filled, so it must pass. Each case appends to it and expects a verdict.
awk '/^````markdown$/{f=1;next} /^````$/{f=0} f' "$root/skills/flatpaper-mode/playbooks/multi-phase-plan.md" |
	grep -v 'One box per further lane' | sed -E 's/<[^>]*>/filler/g' > "$tmp/base.md"

plan_case() { # name, want (pass|fail), file
	if "$scripts/check-plan.sh" "$3" > "$tmp/out" 2>&1; then got=pass; else got=fail; fi
	if [ "$got" = "$2" ]; then ok; else bad "check-plan $1: want $2, got $got"; sed 's/^/  /' "$tmp/out"; fi
}

plan_case "skeleton" pass "$tmp/base.md"

{ printf '\357\273\277'; cat "$tmp/base.md"; } > "$tmp/bom.md"
plan_case "UTF-8 BOM before the title" pass "$tmp/bom.md"

{ cat "$tmp/base.md"; printf '\n~~~\n## Example heading\n~~~\n'; } > "$tmp/tilde.md"
plan_case "heading inside a ~~~ fence" pass "$tmp/tilde.md"

{ cat "$tmp/base.md"; printf '\n````\n```\nKey: value\n```\n````\n'; } > "$tmp/nested.md"
plan_case "shorter fence inside a longer one" pass "$tmp/nested.md"

{ cat "$tmp/base.md"; printf '\n## Example heading\n'; } > "$tmp/heading.md"
plan_case "unfenced heading after Close the program" fail "$tmp/heading.md"

{ cat "$tmp/base.md"; printf '\nKey: value\n'; } > "$tmp/colon.md"
plan_case "unfenced mid-sentence colon" fail "$tmp/colon.md"

{ cat "$tmp/base.md"; printf '\n```\nKey: value\n'; } > "$tmp/unclosed.md"
plan_case "unclosed fence" fail "$tmp/unclosed.md"

{ cat "$tmp/base.md"; printf '\n- item\n\n        ```\n## Example heading\n'; } > "$tmp/indented.md"
plan_case "indented code is not a fence" fail "$tmp/indented.md"

{ cat "$tmp/base.md"; printf '\n```x``` is inline\n## Example heading\n'; } > "$tmp/inline.md"
plan_case "inline code at line start is not a fence" fail "$tmp/inline.md"

{ cat "$tmp/base.md"; printf '\nUse ``a \342\200\224 `b`` here.\n'; } > "$tmp/dashcode.md"
plan_case "long dash inside a double-backtick span" pass "$tmp/dashcode.md"

{ cat "$tmp/base.md"; printf '\nUse ``a `b`` \342\200\224 here.\n'; } > "$tmp/dashprose.md"
plan_case "long dash after a double-backtick span" fail "$tmp/dashprose.md"

{ cat "$tmp/base.md"; printf '\nUse ``a \342\200\224 here.\n'; } > "$tmp/dashopen.md"
plan_case "long dash after an unclosed double-backtick run" fail "$tmp/dashopen.md"

# worktree-audit.sh. One repo with a worktree per case. The bucket comes from
# the BUCKET column of the row whose WORKTREE column ends in the case name.
r="$tmp/repo"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
G() { git -C "$r" -c user.name=t -c user.email=t@t -c commit.gpgsign=false "$@"; }
mkdir -p "$r"
git init -q -b main "$r"
printf '.env\nnode_modules/\nsecret.txt\n' > "$r/.gitignore"
G add .gitignore && G commit -qm init

for c in clean env cache nested reflog rebased tagged; do G worktree add -q -b "$c" "$tmp/wt-$c" main; done
echo secret > "$tmp/wt-env/.env"
mkdir -p "$tmp/wt-cache/node_modules/x" && echo x > "$tmp/wt-cache/node_modules/x/i.js"
# An ignored file inside a dir named like a cache dir is not cache output.
mkdir -p "$tmp/wt-nested/build" && echo s > "$tmp/wt-nested/build/secret.txt"
G -C "$tmp/wt-reflog" switch -q --detach
G -C "$tmp/wt-reflog" commit -q --allow-empty -m lost
G -C "$tmp/wt-reflog" switch -q reflog
# A branch reset past a commit keeps it in the branch reflog, which outlives the worktree.
G -C "$tmp/wt-rebased" commit -q --allow-empty -m old-tip
G -C "$tmp/wt-rebased" reset -q --hard main
# A tag keeps a detached commit after removal.
G -C "$tmp/wt-tagged" switch -q --detach
G -C "$tmp/wt-tagged" commit -q --allow-empty -m tagged
G -C "$tmp/wt-tagged" tag kept
G -C "$tmp/wt-tagged" switch -q tagged

HOME="$tmp/home" CLAUDE_SESSION_ID='' "$scripts/worktree-audit.sh" "$r" > "$tmp/audit" 2>/dev/null
audit_case() { # worktree suffix, want bucket
	got=$(awk -F'\t' -v w="/wt-$1" 'substr($8, length($8) - length(w) + 1) == w { print $1 }' "$tmp/audit")
	if [ "$got" = "$2" ]; then ok; else bad "worktree-audit wt-$1: want $2, got ${got:-no row}"; sed 's/^/  /' "$tmp/audit"; fi
}
audit_case clean safe
audit_case env hold-ignored
audit_case cache safe
audit_case nested hold-ignored
audit_case reflog hold-reflog
audit_case rebased safe
audit_case tagged safe

# pr-gate.sh. gh pr create is blocked until the transcript shows a Skill call
# for each gated skill, with or without a plugin prefix. Without a readable
# transcript it lets the call through.
gated="tidy no-comments technical-writing unslop"
skill_line() { printf '{"type":"tool_use","name":"Skill","input":{"skill":"%s"}}\n' "$1"; }
skills_except() { local s; for s in $gated; do [ "$s" = "$1" ] || skill_line "flatpaper-stack:$s"; done; }
gate_case() { # name, want exit, transcript path
	printf '{"session_id":"s1","transcript_path":"%s","tool_name":"Bash","tool_input":{"command":"gh pr create"}}' "$3" |
		"$scripts/pr-gate.sh" > /dev/null 2> "$tmp/gate.err"
	got=$?
	if [ "$got" = "$2" ]; then ok; else bad "pr-gate $1: want exit $2, got $got"; sed 's/^/  /' "$tmp/gate.err"; fi
}
: > "$tmp/t-none.jsonl"
gate_case "no skills ran" 2 "$tmp/t-none.jsonl"
grep -q "$gated" "$tmp/gate.err" && grep -q 'opening-a-pr.md' "$tmp/gate.err" && ok || bad "pr-gate: block message lacks the missing skills or the playbook"
gate_case "retry still blocks" 2 "$tmp/t-none.jsonl"
skill_line flatpaper-stack:unslop > "$tmp/t-unslop.jsonl"
gate_case "only unslop ran" 2 "$tmp/t-unslop.jsonl"
grep -q 'not run tidy no-comments technical-writing\.' "$tmp/gate.err" && ok || bad "pr-gate: message should name only the missing skills"
for s in $gated; do
	skills_except "$s" > "$tmp/t-but.jsonl"
	gate_case "all but $s ran" 2 "$tmp/t-but.jsonl"
	grep -q "not run $s\." "$tmp/gate.err" && ok || bad "pr-gate: message should name only $s"
done
skills_except none > "$tmp/t-all.jsonl"
gate_case "all gated skills ran" 0 "$tmp/t-all.jsonl"
{ skills_except no-comments; skill_line flatpaper-stack:no-comments-extra; } > "$tmp/t-near.jsonl"
gate_case "near-miss skill name" 2 "$tmp/t-near.jsonl"
{ skills_except unslop
	printf '%s\n' '{"type":"user","message":{"content":"\\"name\\":\\"Skill\\",\\"input\\":{\\"skill\\":\\"unslop\\""}}'; } > "$tmp/t-quoted.jsonl"
gate_case "skill name only in quoted text" 2 "$tmp/t-quoted.jsonl"
{ printf '{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"flatpaper-stack:no-comments","args":"diff"}}\n'
	printf '{"type":"user","message":{"content":"<command-name>/flatpaper-stack:technical-writing</command-name>"}}\n'
	printf '{"type":"user","message":{"content":"<command-name>/unslop</command-name>"}}\n'
	printf '{"type":"user","message":{"content":"<command-name>/flatpaper-stack:tidy</command-name>"}}\n'; } > "$tmp/t-mixed.jsonl"
gate_case "real-shaped call and slash commands" 0 "$tmp/t-mixed.jsonl"
printf '{"transcript_path":"%s"}' "$tmp/t-none.jsonl" | FLATPAPER_PR_GATE_OFF=1 "$scripts/pr-gate.sh" 2> /dev/null && ok || bad "pr-gate FLATPAPER_PR_GATE_OFF: want exit 0"
gate_case "missing transcript passes" 0 "$tmp/absent.jsonl"
gate_case "directory transcript passes" 0 "$tmp"
printf '{"session_id":"s1","tool_input":{"command":"gh pr create"}}' | "$scripts/pr-gate.sh" 2> /dev/null && ok || bad "pr-gate no transcript_path: want exit 0"
printf '{"transcript_path":"%s","tool_name":"Bash","tool_input":{"command":"momentum-api --no-browser https://x/api -H \\"Accept: application/json\\""}}' "$tmp/t-none.jsonl" |
	"$scripts/pr-gate.sh" 2> /dev/null && ok || bad "pr-gate non-PR command: want exit 0"
printf '{"transcript_path":"%s","tool_name":"Bash","tool_input":{"command":"git push && gh  pr create --fill"}}' "$tmp/t-none.jsonl" |
	"$scripts/pr-gate.sh" 2> /dev/null; [ $? -eq 2 ] && ok || bad "pr-gate chained gh pr create: want exit 2"

mkdir -p "$tmp/seat/bin" "$tmp/seat/repo"
git -C "$tmp/seat/repo" init -q
printf '#!/bin/sh\nexit 0\n' > "$tmp/seat/bin/codex"
chmod +x "$tmp/seat/bin/codex"
cat > "$tmp/seat/companion.cjs" <<'EOF'
const a = process.argv, model = a[a.indexOf("--model") + 1], cwd = a[a.indexOf("--cwd") + 1];
const fail = (msg) => { console.error("[codex] Codex error: " + msg); console.log(msg); process.exit(1); };
if (model === "ok") console.log("finding one");
else if (model === "reject") fail("The 'reject' model is not supported when using Codex with a ChatGPT account.");
else if (model === "throttle") fail("You've hit your usage limit. Try again later.");
else if (model === "slow") setTimeout(() => console.log("late"), 10000);
else if (model === "write") { require("fs").writeFileSync(cwd + "/stray.txt", "x"); console.log("wrote"); }
else if (model === "blank") console.log("");
else fail("socket closed");
EOF
echo "prompt" > "$tmp/seat/prompt.txt"
seat_case() {
	local model=$1 want_exit=$2 want_line=$3 path=${4:-$tmp/seat/bin:$PATH} timeout=10
	# Only the slow case tests the timeout. The others get room for a loaded CI runner.
	[ "$model" = slow ] && timeout=1
	out=$(PATH="$path" CODEX_COMPANION="$tmp/seat/companion.cjs" "$scripts/codex-seat.sh" \
		--model "$model" --effort high --fallback "the opus seat" --timeout "$timeout" --cwd "$tmp/seat/repo" "$tmp/seat/prompt.txt" 2>&1)
	got=$?
	if [ "$got" = "$want_exit" ] && printf '%s' "$out" | grep -qE "$want_line"; then ok; else bad "codex-seat $model: want exit $want_exit and /$want_line/, got $got: $out"; fi
}
seat_case ok 0 '^finding one$'
seat_case reject 3 '^codex seat fallback: model-rejected: .*Running the opus seat instead\.$'
seat_case throttle 3 '^codex seat fallback: throttled: '
seat_case slow 3 '^codex seat fallback: timeout: no answer within 1s\.'
seat_case write 3 '^codex seat fallback: tree-changed: '
rm -f "$tmp/seat/repo/stray.txt"
seat_case blank 3 '^codex seat fallback: empty: '
seat_case other 3 '^codex seat fallback: error: socket closed\.'
out=$(CODEX_COMPANION="$tmp/seat/companion.cjs" "$scripts/codex-seat.sh" --model ok --effort high --fallback x --write "$tmp/seat/prompt.txt" 2>&1)
[ $? -eq 2 ] && printf '%s' "$out" | grep -q 'unknown option --write' && ok || bad "codex-seat --write: want exit 2 and 'unknown option --write', got: $out"
mkdir -p "$tmp/seat/nocodex"
ln -s "$(command -v node)" "$(command -v bash)" "$tmp/seat/nocodex/"
seat_case ok 3 '^codex seat fallback: missing: codex is not on PATH\.' "$tmp/seat/nocodex"

capped() {
	local limit=$1 pid start
	shift
	start=$SECONDS
	"$@" > "$tmp/out" 2>&1 &
	pid=$!
	while kill -0 "$pid" 2> /dev/null; do
		[ $((SECONDS - start)) -ge "$limit" ] && kill "$pid"
		sleep 0.1
	done
	wait "$pid"
	rc=$?
	took=$((SECONDS - start))
}
dump() { bad "$1"; sed 's/^/  /' "$tmp/out"; }
expect() {
	local name=$1 want_rc=$2 regex=$3
	if [ "$rc" = "$want_rc" ] && grep -qE -- "$regex" "$tmp/out"; then ok; else dump "$name: want exit $want_rc and /$regex/, got $rc:"; fi
}
png_head() { od -An -tx1 -N"$2" "$1" 2> /dev/null | tr -d ' \n'; }

cdp="$root/skills/control-ui/scripts/cdp.mjs"
ui="$tmp/ui"
mkdir -p "$ui/profiles"
cat > "$ui/f.html" <<'EOF'
<!doctype html><body style="margin:0;background:#fff">
<h1 id="title">Fixture heading</h1>
<div id="dot" style="position:absolute;left:10px;top:200px;width:1px;height:1px;background:#000"></div>
<script>
console.log("fixture-ready", 42);
if (location.hash === "#nodot") document.getElementById("dot").remove();
setTimeout(() => { const p = document.createElement("p"); p.id = "late"; p.textContent = "late text"; document.body.append(p); }, 300);
</script>
<script>throw new Error("boom-uncaught")</script>
EOF
cat > "$ui/click.html" <<'EOF'
<!doctype html><body>
<button id="save" onclick="setTimeout(() => { const p = document.createElement('p'); p.id = 'saved'; p.textContent = 'saved'; document.body.append(p); }, 200)">Save</button>
EOF
real_tmp=$(getconf DARWIN_USER_TEMP_DIR 2> /dev/null) || real_tmp=${TMPDIR:-/tmp}
chrome_leftovers() { ls -A "$real_tmp" 2> /dev/null | grep -E '^\.?(com\.google\.Chrome|org\.chromium\.Chromium)\.' | sort; }
chrome_leftovers > "$tmp/chrome-before"
rc=
foreign_chrome=
note_foreign_chrome() { pgrep -fl -- '--headless' 2> /dev/null | grep -v -- "$ui/profiles" | grep -qi chrom && foreign_chrome=1; }
cdp_run() {
	note_foreign_chrome
	# Above the 60 s worst Chrome start (30 s and one retry) plus the steps.
	TMPDIR="$ui/profiles" capped 90 node "$cdp" "$@"
	note_foreign_chrome
}
if ! node -e 'process.exit(typeof WebSocket === "function" ? 0 : 1)' 2> /dev/null; then
	inconclusive "control-ui" "needs Node 22+ for the global WebSocket"
else
	cdp_run "$ui/f.html" --wait-for '#late' --eval 'document.getElementById("title").textContent.length' \
		--dom '#late' --screenshot "$ui/a.png" --console "$ui/console.txt"
fi
if [ "${rc:-}" = 2 ] && grep -q 'no Chrome or Chromium found' "$tmp/out"; then
	inconclusive "control-ui" "no Chrome or Chromium found"
elif [ -n "${rc:-}" ]; then
	[ "$rc" = 0 ] && [ "$(grep -v '^cdp: ' "$tmp/out")" = "$(printf '15\nlate text')" ] && ok ||
		dump "cdp --wait-for, --eval, --dom: want exit 0 and '15', 'late text', got $rc:"
	# PNG signature, then IHDR width 1280 and height 800, the default viewport.
	[ "$(png_head "$ui/a.png" 24)" = 89504e470d0a1a0a0000000d494844520000050000000320 ] && ok || bad "cdp --screenshot: want a 1280x800 PNG"
	grep -qx 'log: fixture-ready 42' "$ui/console.txt" 2> /dev/null && ok || bad "cdp --console: want the logged line"
	grep -q '^exception: Error: boom-uncaught' "$ui/console.txt" 2> /dev/null && ok || bad "cdp --console: want the uncaught exception"
	cdp_run --help
	expect "cdp --help" 0 '^Exit codes: '
	CHROME=/nonexistent cdp_run about:blank
	expect "cdp CHROME that does not exist" 2 '^cdp: CHROME=/nonexistent does not exist$'
	CHROME="$ui/f.html" cdp_run about:blank
	expect "cdp CHROME that cannot run" 2 '^cdp: Chrome did not start: .*EACCES'
	CHROME=fp-no-such-chrome cdp_run about:blank
	expect "cdp CHROME name not on PATH" 2 '^cdp: CHROME=fp-no-such-chrome is not on PATH$'
	real_chrome=
	for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "/Applications/Chromium.app/Contents/MacOS/Chromium" \
		$(command -v google-chrome google-chrome-stable chromium chromium-browser chrome 2> /dev/null); do
		[ -x "$c" ] && { real_chrome=$c; break; }
	done
	if [ -n "$real_chrome" ]; then
		mkdir -p "$ui/bin"
		printf '#!/bin/sh\nexec "%s" "$@"\n' "$real_chrome" > "$ui/bin/fp-chrome"
		chmod +x "$ui/bin/fp-chrome"
		PATH="$ui/bin:$PATH" CHROME=fp-chrome cdp_run about:blank --eval '6 * 7'
		expect "cdp CHROME as a bare name on PATH" 0 '^42$'
		slow_sleep="sleep 9$$"
		printf '#!/bin/sh\n[ -e "%s" ] && exec "%s" "$@"\ntouch "%s"\nexec %s\n' \
			"$ui/started-once" "$real_chrome" "$ui/started-once" "$slow_sleep" > "$ui/bin/fp-slow-chrome"
		chmod +x "$ui/bin/fp-slow-chrome"
		CHROME="$ui/bin/fp-slow-chrome" cdp_run about:blank --eval '6 * 7'
		expect "cdp retries a start that gives no port" 0 '^42$'
		grep -q 'no debugging port within 30 s; retrying once$' "$tmp/out" && ok || dump "cdp retry: want the retry notice:"
		pgrep -fx "$slow_sleep" > /dev/null && bad "cdp retry: the hung first start is still running" || ok
	fi
	cdp_run "$ui/click.html" --eval 'document.getElementById("save").click()' --wait-for '#saved' --dom '#saved'
	expect "cdp --eval clicks, then --wait-for sees the result" 0 '^saved$'
	cdp_run "$ui/click.html" --eval 'await null; new Promise((r) => setTimeout(() => r("promised"), 50))'
	expect "cdp --eval with top-level await, returning a Promise" 0 '^promised$'
	if command -v python3 > /dev/null; then
		python3 -c 'import socket, time; s = socket.socket(); s.bind(("127.0.0.1", 0)); s.listen(5); print(s.getsockname()[1], flush=True); time.sleep(30)' > "$ui/port" &
		listener=$!
		for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do [ -s "$ui/port" ] && break; sleep 0.1; done
		cdp_run --port "$(cat "$ui/port")" --timeout 1000
		expect "cdp --port to a server that never answers" 124 'waiting for http://127\.0\.0\.1:'
		{ kill "$listener" && wait "$listener"; } 2> /dev/null
	fi
	cdp_run "$ui/f.html" --wait-for '#missing' --timeout 3000
	expect "cdp --wait-for a missing element" 124 'waiting for #missing'
	cdp_run "$ui/f.html" --eval 'while (true) {}' --timeout 3000
	expect "cdp call into a hung page" 124 'waiting for Runtime.evaluate'
	cdp_run "file://$ui/f.html#nodot" --wait-for '#late' --screenshot "$ui/b.png"
	cdp_run "$ui/f.html" --viewport 640x480 --screenshot "$ui/small.png"
	cdp_run diff "$ui/a.png" "$ui/a.png"
	expect "cdp diff of one image" 0 '^0 of 1024000 pixels differ$'
	cdp_run diff "$ui/a.png" "$ui/b.png" --out "$ui/d.png"
	expect "cdp diff with one changed pixel" 1 '^1 of 1024000 pixels differ$'
	[ "$(png_head "$ui/d.png" 8)" = 89504e470d0a1a0a ] && ok || bad "cdp diff --out: want a PNG"
	cdp_run diff "$ui/a.png" "$ui/small.png"
	expect "cdp diff of different sizes" 1 '^size differs: 1280x800 vs 640x480$'
	TMPDIR="$ui/profiles" capped 2 node "$cdp" "$ui/f.html" --wait-for '#missing' --timeout 20000
	[ "$rc" = 143 ] && ok || dump "cdp killed mid-wait: want exit 143, got $rc:"
	pgrep -f "$ui/profiles" > /dev/null && bad "cdp: Chrome still running after exit" || ok
	[ -z "$(ls -A "$ui/profiles")" ] && ok || bad "cdp: temp profile left behind: $(ls "$ui/profiles")"
	new=$(chrome_leftovers | comm -13 "$tmp/chrome-before" -)
	if [ -z "$new" ]; then
		ok
	elif [ -n "$foreign_chrome" ]; then
		inconclusive "cdp temp files" "a headless Chrome the suite did not start ran meanwhile, and $real_tmp gained: $new"
	else
		bad "cdp: Chrome left files in $real_tmp: $new"
	fi
fi

drive="$root/skills/control-cli/scripts/drive.sh"
pty="$root/skills/control-cli/scripts/pty-drive.py"
hang="sleep 60$$"
hang_case() {
	if [ "$rc" = 124 ] && [ "$took" -ge 2 ] && [ "$took" -le 6 ]; then ok; else dump "$1: want exit 124 after about 3s, got $rc after ${took}s:"; fi
	pgrep -fx "$hang" > /dev/null && bad "$1: '$hang' still running" || ok
}
if ! command -v python3 > /dev/null; then
	inconclusive "control-cli" "python3 not found"
else
	if ! command -v tmux > /dev/null; then
		inconclusive "control-cli drive.sh" "tmux not found"
	else
		s="fptest-$$"
		"$drive" start "$s" -- python3 -i -q
		capped 15 "$drive" wait "$s" '>>> '
		expect "drive.sh wait for the prompt" 0 '>>> '
		"$drive" type "$s" 'print(6*7)'
		"$drive" send "$s" Enter
		capped 15 "$drive" wait "$s" '^42$'
		expect "drive.sh send and wait for output" 0 '^42$'
		"$drive" kill "$s"
		"$drive" capture "$s" > /dev/null 2>&1 && bad "drive.sh kill: session still exists" || ok

		"$drive" start "$s-echo" -- sh -c 'while IFS= read -r l; do printf "got[%s]\n" "$l"; done'
		for text in 'A;' 'B;C' 'E\;'; do
			"$drive" type "$s-echo" "$text"
			"$drive" send "$s-echo" Enter
		done
		capped 15 "$drive" wait "$s-echo" '^got\[E\\;\]$'
		for want in 'got[A;]' 'got[B;C]' 'got[E\;]'; do
			grep -qxF "$want" "$tmp/out" && ok || dump "drive.sh type: want the line $want:"
		done
		"$drive" kill "$s-echo"

		"$drive" start "$s-dies" -- sh -c 'echo bye; exit 3'
		capped 15 "$drive" wait "$s-dies" READY
		expect "drive.sh command that exits first" 1 '^bye$'
		[ "$("$drive" status "$s-dies")" = 3 ] && ok || bad "drive.sh status: want 3, got $("$drive" status "$s-dies")"
		"$drive" capture "$s-dies" | grep -qx bye && ok || bad "drive.sh capture after exit: want the scrollback line 'bye'"
		"$drive" kill "$s-dies"

		"$drive" start "$s-hang" -- $hang
		[ "$("$drive" status "$s-hang")" = running ] && ok || bad "drive.sh status: want running"
		for bad_timeout in 1.5 abc; do
			capped 5 "$drive" wait "$s-hang" READY --timeout "$bad_timeout"
			expect "drive.sh --timeout $bad_timeout" 2 '^  drive\.sh wait '
		done
		for probe in 1 2; do
			t0=$(python3 -c 'import time; print(time.time())')
			capped 10 "$drive" wait "$s-hang" READY --timeout 2
			elapsed=$(python3 -c "import time; print('%.2f' % (time.time() - $t0))")
			[ "$rc" = 124 ] && awk -v e="$elapsed" 'BEGIN { exit !(e >= 2.0) }' && ok ||
				dump "drive.sh --timeout 2, probe $probe: want exit 124 after at least 2.0s, got $rc after ${elapsed}s:"
		done
		capped 10 "$drive" wait "$s-hang" READY --timeout 3
		"$drive" kill "$s-hang"
		hang_case "drive.sh hang"
	fi
	capped 15 "$pty" --timeout 5 --wait '>>> ' --send 'print(6*7)\r' --wait '^42$' --send 'exit()\r' -- python3 -i -q
	expect "pty-drive.py send and wait for output" 0 '42'
	capped 10 "$pty" --timeout 3 --wait READY -- $hang
	hang_case "pty-drive.py hang"
	capped 5 "$pty" --size abc -- true
	expect "pty-drive.py --size abc" 2 'size must look like'
	capped 5 "$pty" --timeout x --wait READY -- true
	expect "pty-drive.py --timeout x" 2 'timeout must be a positive number'
	capped 10 "$pty" --timeout 5 --wait bye -- sh -c 'echo bye; exit 3'
	expect "pty-drive.py reports the exit status" 0 '^pty-drive: command exited with status 3$'
	capped 5 "$pty" --send '\x' -- true
	expect "pty-drive.py --send with a bad escape" 2 'bad escape in --send'
	capped 10 "$pty" --timeout 5 --wait bye --wait-exit -- sh -c 'echo bye; sleep 0.3; echo after; exit 3'
	expect "pty-drive.py --wait-exit on status 3" 3 '^pty-drive: command exited with status 3$'
	tr -d '\r' < "$tmp/out" | grep -qx after && ok || dump "pty-drive.py --wait-exit: want the output printed before the exit:"
	capped 10 "$pty" --timeout 5 --wait-exit -- sh -c 'echo fine'
	expect "pty-drive.py --wait-exit on status 0" 0 '^pty-drive: command exited with status 0$'
	capped 10 "$pty" --timeout 5 --wait-exit -- sh -c 'kill -TERM $$'
	expect "pty-drive.py --wait-exit on a signal" 3 '^pty-drive: command exited with signal 15$'
	capped 10 "$pty" --timeout 5 --wait-exit --send 'x\r' -- sh -c 'echo done'
	expect "pty-drive.py --send after the command exited" 1 'command exited before --send'
	tr -d '\r' < "$tmp/out" | grep -qx done && ok || dump "pty-drive.py --send after exit: want the transcript printed:"
fi

[ "$skipped" -eq 0 ] || echo "test-scripts: $skipped inconclusive, not counted as passes"
[ "$fail" -eq 0 ] && echo "test-scripts: ok ($pass cases)"
exit "$fail"
