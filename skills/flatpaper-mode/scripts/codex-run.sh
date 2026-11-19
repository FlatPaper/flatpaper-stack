#!/usr/bin/env bash
if [ "$#" -lt 4 ] || [ "$#" -gt 5 ] || { [ "$#" -eq 5 ] && [ "$5" != read-only ]; }; then
  printf '%s\n' 'Usage: codex-run.sh <cwd> <model|default> <effort> <prompt-file> [read-only]' >&2
  exit 2
fi
if [ ! -d "$1" ]; then
  printf 'error: cwd not found: %s\n' "$1" >&2
  exit 2
fi

shopt -s nullglob
companions=("$HOME"/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs)
if [ "${#companions[@]}" -eq 0 ]; then
  printf 'error: no companion found at %s\n' "$HOME/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs" >&2
  exit 1
fi
companion=$(node -e 'console.log(process.argv.slice(1).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).pop())' "${companions[@]}") || exit 1

prompt=$4
case "$prompt" in
  /*) ;;
  *) prompt="$PWD/$prompt" ;;
esac

args=(node "$companion" task --cwd "$1" --effort "$3" --prompt-file "$prompt")
if [ "$2" != default ]; then
  args+=(--model "$2")
fi
if [ "${5:-}" != read-only ]; then
  args+=(--write)
fi

log=$prompt
case "${log##*/}" in
  *.*) log="${log%.*}" ;;
esac
log="$log.codex.log"
printf 'codex progress log: %s\n' "$log" >&2
exec "${args[@]}" </dev/null 2>>"$log"
