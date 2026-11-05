#!/usr/bin/env bash
# Lint the plugin's skills and playbooks. Exits non-zero on any problem.
# Usage: scripts/check-skills.sh [repo-root]
set -uo pipefail

root="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$root" || exit 2
fail=0
problem() { printf 'FAIL %s\n' "$1"; fail=1; }

mode=skills/flatpaper-mode

# Every skill has frontmatter with a matching name and a description.
for f in skills/*/SKILL.md; do
	dir=$(basename "$(dirname "$f")")
	head -1 "$f" | grep -qx -- '---' || problem "$f: no frontmatter"
	name=$(sed -n '2,10{s/^name: *//p;}' "$f" | head -1)
	[ "$name" = "$dir" ] || problem "$f: name '$name' does not match directory '$dir'"
	grep -q '^description: ' "$f" || problem "$f: no description"
done

# Every skill is listed in the README. A skill the model may invoke on its
# own is also called by a flatpaper-mode file or the guidelines, so the mode
# reaches it without the user typing it.
for f in skills/*/SKILL.md; do
	dir=$(basename "$(dirname "$f")")
	[ "$dir" = flatpaper-mode ] && continue
	grep -q "/flatpaper-stack:$dir\`" README.md || problem "README.md: skill $dir not listed as /flatpaper-stack:$dir"
	if ! grep -q '^disable-model-invocation: true' "$f"; then
		grep -rqE -- "\`$dir\`|/flatpaper-stack:$dir|the $dir skill" "$mode" guidelines.md || problem "$dir: model-invoked but no flatpaper-mode file or guideline calls it"
	fi
done

# Every agent has frontmatter with a matching name and a description, and is
# listed in the README.
for f in agents/*.md; do
	[ -e "$f" ] || continue
	base=$(basename "$f" .md)
	head -1 "$f" | grep -qx -- '---' || problem "$f: no frontmatter"
	name=$(sed -n '2,10{s/^name: *//p;}' "$f" | head -1)
	[ "$name" = "$base" ] || problem "$f: name '$name' does not match file '$base'"
	grep -q '^description: ' "$f" || problem "$f: no description"
	grep -q "flatpaper-stack:$base\`" README.md || problem "README.md: agent $base not listed as flatpaper-stack:$base"
done

# Every playbook file is listed in the mode's SKILL.md, and the reverse.
for p in "$mode"/playbooks/*.md; do
	grep -q "playbooks/$(basename "$p")" "$mode/SKILL.md" || problem "$mode/SKILL.md: playbook $(basename "$p") not listed"
done
grep -o 'playbooks/[a-z0-9-]*\.md' "$mode/SKILL.md" | sort -u | while read -r p; do
	[ -f "$mode/$p" ] || { printf 'FAIL %s: lists missing %s\n' "$mode/SKILL.md" "$p"; exit 1; }
done || fail=1

# Relative paths in backticks resolve. Placeholders (<x>, *) are skipped.
while IFS=: read -r file ref; do
	ref=${ref#\`}; ref=${ref%\`}
	case "$ref" in *'<'*|*'*'*) continue ;; esac
	dir=$(dirname "$file")
	skillroot=$(echo "$file" | sed -E 's#^(skills/[^/]+)/.*#\1#')
	case "$ref" in
		'${CLAUDE_PLUGIN_ROOT}/'*) [ -e "${ref#\$\{CLAUDE_PLUGIN_ROOT\}/}" ] || problem "$file: missing $ref" ;;
		../*) [ -e "$dir/$ref" ] || problem "$file: missing $ref" ;;
		playbooks/*|references/*|scripts/*|templates/*)
			[ -e "$dir/$ref" ] || [ -e "$skillroot/$ref" ] || problem "$file: missing $ref" ;;
	esac
done < <(grep -roE '`[^` ]*/[^` ]*\.(md|sh|tsv|json|mjs)`' skills guidelines.md)

# Skill and agent references resolve, so a rename can't leave one dangling.
# A slash command must be a skill. skill-creator is an Anthropic skill outside
# this plugin.
skill_names=" $(ls skills | tr '\n' ' ')skill-creator "
agent_names=" $(ls agents | sed 's/\.md$//' | tr '\n' ' ')"
while IFS=: read -r file line ref; do
	case "$ref" in
		/flatpaper-stack:*) name=${ref#/flatpaper-stack:}; known=$skill_names ;;
		flatpaper-stack:*) name=${ref#flatpaper-stack:}; known="$skill_names$agent_names" ;;
		*) name=$(printf '%s' "$ref" | sed -E 's#^`/?##; s#` skill$##'); known=$skill_names ;;
	esac
	case "$known" in *" $name "*) ;; *) problem "$file:$line: unknown skill or agent '$ref'" ;; esac
done < <(grep -rnoE '/?flatpaper-stack:[a-z0-9-]+|`/?[a-z][a-z0-9-]+` skill' skills agents guidelines.md README.md hooks)

# A plugin agent dispatched by its bare name falls back to another agent.
for f in agents/*.md; do
	base=$(basename "$f" .md)
	if hits=$(grep -rnE "subagent_type\"?:[ \"'\`]*$base\b" skills agents guidelines.md README.md); then
		while IFS= read -r h; do problem "bare agent name, use flatpaper-stack:$base: ${h:0:160}"; done <<<"$hits"
	fi
done

# A provenance line names its upstream source path, so it may carry a banned term.
banned='grok|gemini|llama|mistral|deepseek|composer-[0-9]|AskQuestion|poteto-agent|cursor-team-kit|/deslop|generalPurpose|\.cursor/|is_background'
if hits=$(grep -rsniE "$banned" skills agents guidelines.md hooks README.md | grep -vF 'ported from cursor/plugins@'); then
	while IFS= read -r h; do problem "banned term: ${h:0:160}"; done <<<"$hits"
fi

# A direct call to the companion, the rescue agent, or a slash command could write.
if hits=$(grep -rsnE 'codex-companion|codex-rescue|/codex:' skills agents guidelines.md hooks | grep -v '^skills/flatpaper-mode/scripts/codex-seat\.sh:'); then
	while IFS= read -r h; do problem "Codex outside codex-seat.sh: ${h:0:160}"; done <<<"$hits"
fi

if hits=$(grep -rsnoE '\bgpt-[0-9][a-z0-9.-]*' skills agents guidelines.md hooks README.md | grep -v ':gpt-6\.1-sol$'); then
	while IFS= read -r h; do problem "GPT model other than gpt-6.1-sol: ${h:0:160}"; done <<<"$hits"
fi

# Skills and agents stand on their own: no credit lines or references to the upstream plugin.
if hits=$(grep -rsniE 'pstack|poteto' skills agents); then
	while IFS= read -r h; do problem "upstream reference: ${h:0:160}"; done <<<"$hits"
fi

[ "$fail" -eq 0 ] && echo "check-skills: ok ($(ls -d skills/*/ | wc -l | tr -d ' ') skills, $(ls agents/*.md 2>/dev/null | wc -l | tr -d ' ') agents, $(ls "$mode"/playbooks/*.md | wc -l | tr -d ' ') playbooks)"
exit "$fail"
