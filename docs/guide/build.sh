#!/usr/bin/env bash
# Build the flatpaper guide from src/ and check it covers every part of the plugin.
#   guide.html      all three parts, published as the guide artifact
#                   (https://claude.ai/artifact/UtoWgg52numPjfmQg2r27P)
#   working-with-agents.html  Part 2 alone, a standalone page for reading in the repo
# Fails if a skill, playbook, agent, hook, or script is missing from Part 3.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
src="$here/src"
fail=0
problem() { printf 'FAIL %s\n' "$1"; fail=1; }

ideas="$src/ideas.html"
cmds="$src/commands.html"

# Every skill has a Part 3 command.
for d in "$root"/skills/*/; do
	s=$(basename "$d")
	grep -q "id=\"c-$s\"" "$cmds" || problem "Part 3: no command for skill $s (id=\"c-$s\")"
done

# Every playbook has a Part 3 trigger row.
for f in "$root"/skills/flatpaper-mode/playbooks/*.md; do
	p=$(basename "$f" .md)
	grep -q "id=\"cp-$p\"" "$cmds" || problem "Part 3: no trigger row for playbook $p (id=\"cp-$p\")"
done

# Every agent is named in Part 3.
for f in "$root"/agents/*.md; do
	[ -e "$f" ] || continue
	a=$(basename "$f" .md)
	grep -q "<code>$a</code>" "$cmds" || problem "Part 3: agent $a not named"
done

# Every hook event and script is covered in Part 3.
for h in SessionStart UserPromptSubmit; do
	grep -q "\"$h\"" "$root/hooks/hooks.json" && ! grep -q "$h" "$cmds" && problem "Part 3: hook $h not covered"
done
for f in "$root"/scripts/*.sh "$root"/skills/*/scripts/*.sh; do
	b=$(basename "$f")
	grep -q "$b" "$cmds" || problem "Part 3: script $b not covered"
done

# The guide is about flatpaper only.
if hits=$(grep -niE 'pstack|poteto|cursor' "$src"/*.html); then
	while IFS= read -r h; do problem "off-topic term: ${h:0:120}"; done <<<"$hits"
fi

[ "$fail" -eq 0 ] || exit 1

version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$root/.claude-plugin/plugin.json")

nav() { cat <<'EOF'
<nav class="toc" aria-label="Sections">
  <div class="grp">1 · Install and use</div>
  <ol>
    <li><a href="#install"><span class="n">1.1</span>Install it</a></li>
    <li><a href="#use"><span class="n">1.2</span>Use it</a></li>
  </ol>
  <div class="grp">2 · Working with agents</div>
  <ol>
    <li><a href="#i-trust"><span class="n">2.1</span>Trust first</a></li>
    <li><a href="#i-prompt"><span class="n">2.2</span>Say the goal</a></li>
    <li><a href="#i-router"><span class="n">2.3</span>One front door</a></li>
    <li><a href="#i-understand"><span class="n">2.4</span>Understand first</a></li>
    <li><a href="#i-design"><span class="n">2.5</span>Design by running</a></li>
    <li><a href="#i-build"><span class="n">2.6</span>Pin, build, clean</a></li>
    <li><a href="#i-verify"><span class="n">2.7</span>Prove it</a></li>
    <li><a href="#i-away"><span class="n">2.8</span>Earn the loop</a></li>
    <li><a href="#i-delegate"><span class="n">2.9</span>Hand off work</a></li>
    <li><a href="#i-principles"><span class="n">2.10</span>Steer with names</a></li>
    <li><a href="#i-encode"><span class="n">2.11</span>Fix the repo</a></li>
    <li><a href="#i-map"><span class="n">2.12</span>Keep a map</a></li>
  </ol>
  <div class="grp">3 · Commands</div>
  <ol>
    <li><a href="#c-first"><span class="n">3.1</span>First session</a></li>
    <li><a href="#c-mode"><span class="n">3.2</span>By situation</a></li>
    <li><a href="#c-auto"><span class="n">3.3</span>On its own</a></li>
    <li><a href="#c-skills"><span class="n">3.4</span>Every command</a></li>
    <li><a href="#c-steer"><span class="n">3.5</span>Steering</a></li>
    <li><a href="#c-pitfalls"><span class="n">3.6</span>Common mistakes</a></li>
    <li><a href="#c-scripts"><span class="n">3.7</span>Scripts</a></li>
  </ol>
</nav>
EOF
}

# The artifact host adds the doctype and head, so guide.html starts at <title>.
{
	echo '<title>flatpaper Guide</title>'
	cat "$src/head.html"
	cat <<EOF
<header class="top">
  <div class="eyebrow">A Claude Code plugin · version $version</div>
  <h1>Using flatpaper</h1>
  <p class="lede">flatpaper makes agent work you can trust and still understand a month later. Part 1 gets you running. Part 2 covers the ideas behind it: how to work with agents so the result holds up. Part 3 shows what to type for the situation you're in.</p>
  <div class="five"><span>goal</span><span>done check</span><span>proof</span><span>what you know</span><span>constraints</span></div>
</header>
<div class="wrap">
EOF
	nav
	echo '<main>'
	cat "$src/start.html" "$ideas" "$cmds"
	echo '</main>'
	echo '</div>'
	echo "<footer>Built from the flatpaper repo at version $version with <code>docs/guide/build.sh</code>.</footer>"
} >"$here/guide.html"

# working-with-agents.html opens straight from disk, so it carries its own document shell.
{
	cat <<EOF
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Working With Agents</title>
EOF
	cat "$src/head.html"
	cat <<EOF
</head>
<body>
<header class="top">
  <div class="eyebrow">flatpaper · version $version</div>
  <h1>Working with agents</h1>
  <p class="lede">The ideas flatpaper is built on, from trusting one agent before running many to keeping a map the agent reads first. Each chapter says where the idea lives in flatpaper.</p>
</header>
<div class="wrap single"><main>
EOF
	sed 's/Part 2 · Working with agents/Working with agents/' "$ideas"
	cat <<EOF
</main></div>
<footer>Part 2 of the flatpaper guide. Built with <code>docs/guide/build.sh</code>.</footer>
</body>
</html>
EOF
} >"$here/working-with-agents.html"

echo "guide: ok ($(ls -d "$root"/skills/*/ | wc -l | tr -d ' ') skills, $(ls "$root"/skills/flatpaper-mode/playbooks/*.md | wc -l | tr -d ' ') playbooks covered, version $version)"
