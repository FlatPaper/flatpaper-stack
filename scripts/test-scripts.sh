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
ok() { pass=$((pass + 1)); }
bad() { printf 'FAIL %s\n' "$1"; fail=1; }

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

[ "$fail" -eq 0 ] && echo "test-scripts: ok ($pass cases)"
exit "$fail"
