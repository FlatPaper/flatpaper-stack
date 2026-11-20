#!/usr/bin/env bash
usage() {
  printf '%s\n' 'Usage: codex-run.sh <cwd> <model|default> <effort> <prompt-file> [read-only] [--agent <name>]' >&2
  exit 2
}
if [ "$#" -lt 4 ]; then
  usage
fi
if [ ! -d "$1" ]; then
  printf 'error: cwd not found: %s\n' "$1" >&2
  exit 2
fi

cwd=$1
model=$2
effort=$3
prompt=$4
shift 4
read_only=false
agent=
agent_set=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    read-only)
      [ "$read_only" = false ] || usage
      read_only=true
      shift
      ;;
    --agent)
      [ "$agent_set" = false ] && [ "$#" -ge 2 ] || usage
      agent=$2
      agent_set=true
      shift 2
      ;;
    *) usage ;;
  esac
done

plugin_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P) || exit 1
agents_dir="$plugin_root/skills/flatpaper-mode/codex-agents"
if [ "$agent_set" = true ]; then
  if [[ ! "$agent" =~ ^[a-z0-9][a-z0-9-]*$ ]] || [ ! -f "$agents_dir/$agent.md" ]; then
    printf 'error: unknown codex agent: %s (looked in %s)\n' "$agent" "$agents_dir" >&2
    exit 2
  fi
fi

shopt -s nullglob
companions=("$HOME"/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs)
if [ "${#companions[@]}" -eq 0 ]; then
  printf 'error: no companion found at %s\n' "$HOME/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs" >&2
  exit 1
fi
companion=$(node -e 'console.log(process.argv.slice(1).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).pop())' "${companions[@]}") || exit 1

case "$prompt" in
  /*) ;;
  *) prompt="$PWD/$prompt" ;;
esac

log=$prompt
case "${log##*/}" in
  *.*) log="${log%.*}" ;;
esac
log="$log.codex.log"

combined=$prompt
case "${combined##*/}" in
  *.*) combined="${combined%.*}" ;;
esac
if [ "$agent_set" = true ]; then
  combined="$combined.$agent.prompt.md"
  agent_file="$agents_dir/$agent.md"
else
  combined="$combined.prompt.md"
  agent_file=
fi
node - "$plugin_root" "$prompt" "$combined" "$agent_file" <<'NODE' || exit 1
const { readFileSync, writeFileSync } = require("node:fs");
const [root, brief, output, agentFile] = process.argv.slice(2);
const worker = `Read ${root}/skills/flatpaper-mode/worker.md before anything else.\n\n`;
const body = agentFile
  ? readFileSync(agentFile, "utf8")
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
      .replace(/^\r?\n/, "")
      .replaceAll("${CLAUDE_PLUGIN_ROOT}", root) + "\n---\n"
  : "";
writeFileSync(output, Buffer.concat([Buffer.from(worker + body), readFileSync(brief)]));
NODE
prompt=$combined

args=(node "$companion" task --cwd "$cwd" --effort "$effort" --prompt-file "$prompt")
if [ "$model" != default ]; then
  args+=(--model "$model")
fi
if [ "$read_only" = false ]; then
  args+=(--write)
fi

printf 'codex progress log: %s\n' "$log" >&2
exec "${args[@]}" </dev/null 2>>"$log"
