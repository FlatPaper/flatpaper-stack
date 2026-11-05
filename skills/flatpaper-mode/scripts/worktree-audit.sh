#!/usr/bin/env bash
# Read-only audit of a repo's git worktrees. Suggests a bucket for each one.
# It never removes, prunes, fetches, or writes anything. Every git read uses
# --no-optional-locks, so it never takes index.lock or refreshes the index.
# Removal stays a step the user confirms in playbooks/worktree-cleanup.md.
#
# Usage: worktree-audit.sh [-b <ref>] [--self <session-id>] [repo-path]
#   repo-path  defaults to the current repo
#   -b, --base the ref MERGED checks against (defaults to origin/HEAD, then
#              origin/main, origin/master, main, or master)
#   --self     session id to leave out of verify-recent (defaults to
#              $CLAUDE_SESSION_ID when set)
#
# Buckets, first match wins:
#   hold-wip       tracked uncommitted changes (count shown as wip:N)
#   hold-reflog    commits only this worktree's HEAD reflog reaches, such as
#                  work committed on a detached HEAD (reflog:N). Removal
#                  deletes that reflog, and gc then drops the commits.
#   hold-ignored   ignored paths that are not build or cache output, such as
#                  .env (ignored:N). They may exist nowhere else.
#   hold-open-pr   the branch has an open PR (needs gh)
#   verify-recent  a Claude Code transcript from this repo's project dirs,
#                  modified in the last 24h, mentions the path (rg if
#                  installed, else grep). All matching sessions are listed.
#   safe           clean, not recent, and merged (HEAD on the base, or a
#                  merged PR whose head is this HEAD), or no PR on a branch
#                  that keeps its commits
#   review         anything else (untracked files, closed PR, merged PR for a
#                  different commit, detached HEAD, locked, prunable, git
#                  status failed, unknown PR state)
#
# Works with bash 3.2 and BSD tools (macOS) and GNU tools (Linux).
# Without gh, rg, or jq it still runs and says what it skipped or used instead.
set -u

note() { printf 'note: %s\n' "$*" >&2; }
g() { git --no-optional-locks "$@"; }
# Physical path (resolves symlinks such as macOS /var -> /private/var).
phys() { (CDPATH='' cd -- "$1" 2>/dev/null && pwd -P) || printf '%s\n' "$1"; }

self="${CLAUDE_SESSION_ID:-}"
repo=""
base=""
while [ $# -gt 0 ]; do
	case "$1" in
		-b|--base) [ $# -ge 2 ] && [ -n "$2" ] || { echo "$1 needs a ref" >&2; exit 1; }
			base=$2; shift 2 ;;
		--base=*) base=${1#--base=}; [ -n "$base" ] || { echo "--base needs a ref" >&2; exit 1; }
			shift ;;
		--self) [ $# -ge 2 ] || { echo "--self needs a session id" >&2; exit 1; }
			self=$2; shift 2 ;;
		--self=*) self=${1#--self=}; shift ;;
		-h|--help) sed -n '2,12p' "$0"; exit 0 ;;
		*) repo=$1; shift ;;
	esac
done

# The caller's worktree, from the caller's cwd, before any cd.
here=$(g rev-parse --show-toplevel 2>/dev/null)
[ -n "$here" ] && here=$(phys "$here")

[ -z "$repo" ] && repo=$(g rev-parse --show-toplevel 2>/dev/null)
[ -z "$repo" ] && { echo "not in a git repo; pass a repo path" >&2; exit 1; }
cd "$repo" 2>/dev/null || { echo "cannot cd to $repo" >&2; exit 1; }
g rev-parse --git-dir >/dev/null 2>&1 || { echo "$repo is not a git repo" >&2; exit 1; }
[ -z "$base" ] || g rev-parse --verify --quiet "$base^{commit}" >/dev/null || { echo "-b $base is not a commit in $repo" >&2; exit 1; }

tmp=$(mktemp -d 2>/dev/null || mktemp -d -t wtaudit)
trap 'rm -rf "$tmp"' EXIT

g worktree list --porcelain > "$tmp/list"
main_wt=$(sed -n 's/^worktree //p' "$tmp/list" | head -1)

# Every registered path, as given and physical, for matching stray dirs.
sed -n 's/^worktree //p' "$tmp/list" | while IFS= read -r p; do
	printf '%s\n' "$p"
	[ -d "$p" ] && phys "$p"
done | sort -u > "$tmp/wt_paths"

# Base for the merge check: -b, else origin's default branch, else local main
# or master. No fetch, so this is as fresh as the last fetch.
[ -n "$base" ] || base=$(g symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)
if [ -z "$base" ]; then
	for b in origin/main origin/master main master; do
		g rev-parse --verify --quiet "$b" >/dev/null && { base=$b; break; }
	done
fi
if [ -n "$base" ]; then
	note "merged means reachable from $base as of the last fetch"
else
	note "no base branch found; merged column is '?'"
fi

# An ignored dir or file with one of these names is rebuildable build or cache
# output. Any other ignored path, such as .env or build/notes.txt in a dir git
# does not ignore, may exist nowhere else.
disposable='.build .cache .dart_tool .DS_Store .gradle .lake .mypy_cache .next .nuxt .parcel-cache .pytest_cache .ruff_cache .svelte-kit .tox .turbo .venv __pycache__ build coverage DerivedData dist node_modules target venv'

# Commits any branch reflog lists. Branch reflogs live in the shared logs and
# survive worktree removal, so a rebased branch's old tip is not at risk.
g for-each-ref --format='%(refname)' refs/heads | while IFS= read -r ref; do
	g rev-list --walk-reflogs "$ref" 2>/dev/null
done | sort -u > "$tmp/branch_logged"

# Commits only this worktree's HEAD reflog reaches: not on any branch, tag,
# remote, or branch reflog. A worktree without a HEAD reflog counts 0. Prints
# nothing if the count itself fails.
reflog_only() {
	{ g -C "$1" rev-list --walk-reflogs HEAD 2>/dev/null; sed 's/^/^/' "$tmp/branch_logged"; } |
		g -C "$1" rev-list --count --stdin --not --branches --tags --remotes 2>/dev/null
}

# PR state per branch, one gh call. gh has jq built in, so jq is not needed.
# Fields: headRefName number state headRefOid isCrossRepository.
pr_limit=2000
has_gh=no
if command -v gh >/dev/null 2>&1 && gh pr list --state all --limit "$pr_limit" \
	--json number,state,headRefName,headRefOid,isCrossRepository \
	--jq '.[] | "\(.headRefName)\t\(.number)\t\(.state)\t\(.headRefOid)\t\(.isCrossRepository)"' \
	> "$tmp/prs_all" 2>/dev/null; then
	has_gh=yes
	n_prs=$(wc -l < "$tmp/prs_all" | tr -d ' ')
	[ "$n_prs" -ge "$pr_limit" ] && \
		note "repo has $pr_limit or more PRs; only the newest $pr_limit were read, so PR matching may be incomplete"
	# PRs from forks share branch names by accident, so they never count.
	awk -F'\t' '$5 != "true"' "$tmp/prs_all" > "$tmp/prs"
else
	: > "$tmp/prs"
	note "gh unavailable or not a GitHub repo; PR column is '?' and hold-open-pr is skipped"
fi

# Transcripts modified in the last 24h, only in the Claude Code project dirs
# that belong to this repo's worktrees. A project dir name is the absolute
# path with every non-alphanumeric character replaced by '-'. Both the path
# as git gives it and its physical form are tried. Only names and match/no
# match are read, never transcript contents into the output.
# rg is faster. Claude Code's rg is often a shell function scripts can't see,
# so plain grep is the fallback rather than skipping the bucket.
if command -v rg >/dev/null 2>&1; then
	scan="rg"
else
	scan="grep"
	note "rg not found; using grep for the transcript scan"
fi
projects="$HOME/.claude/projects"
has_scan=yes
: > "$tmp/recent"
: > "$tmp/projdirs"
if [ -d "$projects" ]; then
	while IFS= read -r p; do
		name=$(printf '%s' "$p" | LC_ALL=C sed 's/[^A-Za-z0-9]/-/g')
		[ -d "$projects/$name" ] && printf '%s\n' "$projects/$name"
	done < "$tmp/wt_paths" | sort -u > "$tmp/projdirs"
	while IFS= read -r d; do
		find "$d" -name '*.jsonl' -type f -mmin -1440 2>/dev/null | while IFS= read -r f; do
			# Session id: first path component under the project dir
			# (<id>.jsonl, or <id>/subagents/... for subagent transcripts).
			rel=${f#"$d"/}
			printf '%s\t%s\n' "${rel%%/*}" "$f"
		done
	done < "$tmp/projdirs" > "$tmp/recent"
	[ -s "$tmp/projdirs" ] || note "no Claude Code project dirs for this repo's worktrees; verify-recent finds nothing"
else
	note "no $projects directory; verify-recent bucket skipped"
	has_scan=no
fi
[ -n "$self" ] && note "leaving session ${self} out of verify-recent"

if stat -c %Y / >/dev/null 2>&1; then
	mtime() { stat -c %Y "$1"; }
	fmt_ts() { date -d "@$1" '+%Y-%m-%d %H:%M'; }
else
	mtime() { stat -f %m "$1"; }
	fmt_ts() { date -r "$1" '+%Y-%m-%d %H:%M'; }
fi

# Recent sessions that ran in or touched this worktree, newest first, minus
# --self. Match the path followed by "/" or a closing quote (as in
# "cwd":"<path>"), so wt-1 does not match wt-10 and a bare path in pasted
# output does not count. Prints "<newest time> <id8>,<id8>,..." or nothing.
last_seen() {
	local wt="$1" wtp="$2" sid f t newest
	[ -s "$tmp/recent" ] || return 0
	: > "$tmp/seen"
	while IFS="$(printf '\t')" read -r sid f; do
		if [ -n "$self" ]; then
			case "$sid" in "$self"*) continue ;; esac
		fi
		"$scan" -q -F -e "$wt/" -e "$wt\"" -e "$wtp/" -e "$wtp\"" "$f" 2>/dev/null || continue
		t=$(mtime "$f" 2>/dev/null) || continue
		printf '%s\t%s\n' "$t" "$sid" >> "$tmp/seen"
	done < "$tmp/recent"
	[ -s "$tmp/seen" ] || return 0
	# Newest first, one entry per session (its newest file).
	sort -t "$(printf '\t')" -k1,1nr "$tmp/seen" | awk -F'\t' '!s[$2]++' > "$tmp/seen_sorted"
	newest=$(head -1 "$tmp/seen_sorted" | cut -f1)
	printf '%s %s' "$(fmt_ts "$newest")" \
		"$(cut -f2 "$tmp/seen_sorted" | cut -c1-8 | paste -sd, -)"
}

pr_for() {
	# Prefer an open PR, then a merged PR whose head is this HEAD, then any
	# other. A merged PR for a different commit (reused branch name, or new
	# commits after the merge) shows as MERGED-STALE and does not count.
	awk -F'\t' -v b="$1" -v h="$2" '
		$1 == b {
			if ($3 == "OPEN") o = "#" $2 "/OPEN"
			else if ($3 == "MERGED" && $4 == h) m = "#" $2 "/MERGED"
			else if ($3 == "MERGED") { if (!s) s = "#" $2 "/MERGED-STALE" }
			else if (!c) c = "#" $2 "/" $3
		}
		END { if (o) print o; else if (m) print m; else if (s) print s; else if (c) print c }' "$tmp/prs"
}

row() {
	printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$@"
}

audit() {
	local wt="$1" branch="$2" detached="$3" locked="$4" prunable="$5"
	local size dirty merged pr seen bucket why tracked untracked ignored reflog porcelain wtp top head

	if [ "$prunable" = yes ] || [ ! -d "$wt" ]; then
		row review - - - - - "${branch:--}" "$wt" \
			"git reports it prunable (directory missing or unreadable)"
		return
	fi

	size=$(du -sh "$wt" 2>/dev/null | awk '{print $1}')
	wtp=$(phys "$wt")

	# If the worktree's .git is unreadable, git may walk up into some other
	# repo, so the toplevel must be this worktree before status is trusted.
	top=$(g -C "$wt" rev-parse --show-toplevel 2>/dev/null)
	if [ -z "$top" ] || [ "$(phys "$top")" != "$wtp" ] || \
		! porcelain=$(g -C "$wt" status --porcelain --ignored=matching 2>/dev/null); then
		row review "?" "?" "?" "?" "${size:-?}" "${branch:-(detached)}" "$wt" "git status failed"
		return
	fi
	tracked=$(printf '%s\n' "$porcelain" | grep -c '^[^?!]')
	untracked=$(printf '%s\n' "$porcelain" | grep -c '^??')
	ignored=$(printf '%s\n' "$porcelain" | LC_ALL=C awk -v d="$disposable" '
		BEGIN { n = split(d, a, " "); for (i = 1; i <= n; i++) D[a[i]] = 1 }
		/^!! / { p = substr($0, 4); gsub(/^"|"$/, "", p); sub(/\/$/, "", p)
			k = split(p, part, "/"); if (!(part[k] in D)) c++ }
		END { print c + 0 }')
	reflog=$(reflog_only "$wt"); [ -z "$reflog" ] && reflog="?"
	dirty=""
	[ "$tracked" -gt 0 ] && dirty="$dirty,wip:$tracked"
	[ "$untracked" -gt 0 ] && dirty="$dirty,untracked:$untracked"
	[ "$ignored" -gt 0 ] && dirty="$dirty,ignored:$ignored"
	[ "$reflog" != 0 ] && dirty="$dirty,reflog:$reflog"
	dirty=${dirty#,}; [ -z "$dirty" ] && dirty=clean

	head=$(g -C "$wt" rev-parse --verify --quiet HEAD 2>/dev/null)

	merged="?"
	if [ -n "$base" ]; then
		if g -C "$wt" merge-base --is-ancestor HEAD "$base" 2>/dev/null; then merged=yes; else merged=no; fi
	fi

	pr="?"
	if [ "$has_gh" = yes ]; then
		pr="-"
		[ -n "$branch" ] && { pr=$(pr_for "$branch" "$head"); [ -z "$pr" ] && pr="-"; }
	fi

	seen="?"
	if [ "$has_scan" = yes ]; then
		seen=$(last_seen "$wt" "$wtp"); [ -z "$seen" ] && seen="-"
	fi

	# A squash merge leaves HEAD off the base, so a merged PR whose head is
	# exactly this HEAD also counts. MERGED-STALE does not.
	case "$pr" in */MERGED) merged=yes ;; esac

	if [ "$tracked" -gt 0 ]; then bucket=hold-wip; why="uncommitted tracked changes"
	elif [ "$reflog" != 0 ] && [ "$reflog" != "?" ]; then bucket=hold-reflog; why="commits only this worktree's reflog keeps"
	elif [ "$ignored" -gt 0 ]; then bucket=hold-ignored; why="ignored files that are not build or cache output"
	elif case "$pr" in */OPEN) true ;; *) false ;; esac; then bucket=hold-open-pr; why="open PR"
	elif [ "$seen" != "-" ] && [ "$seen" != "?" ]; then bucket=verify-recent; why="recent session touched it"
	elif [ -n "$here" ] && [ "$wtp" = "$here" ]; then bucket=review; why="this is the current worktree"
	elif [ "$locked" = yes ]; then bucket=review; why="locked"
	elif [ "$untracked" -gt 0 ]; then bucket=review; why="untracked files would be lost"
	elif [ "$reflog" = "?" ]; then bucket=review; why="reflog check failed"
	elif [ "$merged" = yes ]; then bucket=safe; why="clean and merged"
	elif [ "$detached" = yes ]; then bucket=review; why="detached HEAD not merged; commits have no branch"
	elif [ "$pr" = "-" ]; then bucket=safe; why="clean, no PR, branch keeps its commits"
	elif [ "$pr" = "?" ]; then bucket=review; why="not merged and PR state unknown"
	else case "$pr" in
		*/MERGED-STALE) bucket=review; why="merged PR was for a different commit (reused branch name or later commits)" ;;
		*) bucket=review; why="PR closed without merge" ;;
	esac; fi
	[ "$has_scan" = no ] && [ "$bucket" = safe ] && why="$why; recent use not checked"

	row "$bucket" "$dirty" "$merged" "$pr" "$seen" "${size:-?}" "${branch:-(detached)}" "$wt" "$why"
}

printf 'BUCKET\tDIRTY\tMERGED\tPR\tLAST_SEEN\tSIZE\tBRANCH\tWORKTREE\tWHY\n'

# Walk porcelain records. Each starts with "worktree <path>" and ends at a
# blank line. Paths can hold spaces, so strip the prefix instead of splitting.
wt=""; branch=""; detached=no; locked=no; prunable=no; count=0
flush() {
	if [ -n "$wt" ] && [ "$wt" != "$main_wt" ]; then
		audit "$wt" "$branch" "$detached" "$locked" "$prunable"
		count=$((count + 1))
	fi
	wt=""; branch=""; detached=no; locked=no; prunable=no
}
while IFS= read -r line; do
	case "$line" in
		"worktree "*) flush; wt=${line#worktree } ;;
		"branch refs/heads/"*) branch=${line#branch refs/heads/} ;;
		detached) detached=yes ;;
		locked*) locked=yes ;;
		prunable*) prunable=yes ;;
		"") flush ;;
	esac
done < "$tmp/list"
flush
[ "$count" -eq 0 ] && note "no linked worktrees besides the main one at $main_wt"

# Claude Code's own worktrees live under .claude/worktrees/. Registered ones
# are in the table above. Directories git no longer knows about are listed
# here. Paths are compared in physical form.
cw="$main_wt/.claude/worktrees"
if [ -d "$cw" ]; then
	for d in "$cw"/*; do
		[ -d "$d" ] || continue
		grep -qxF -- "$d" "$tmp/wt_paths" && continue
		grep -qxF -- "$(phys "$d")" "$tmp/wt_paths" && continue
		row review - - - - "$(du -sh "$d" 2>/dev/null | awk '{print $1}')" - "$d" \
			"under .claude/worktrees but not a registered worktree"
	done
fi

# ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 pstack/skills/poteto-mode/playbooks/worktree-cleanup.md (MIT)
