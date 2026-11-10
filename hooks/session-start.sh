#!/bin/sh
set -eu

models="${HOME:-}/.claude/flatpaper-stack/models.md"
if [ -r "$models" ] && grep -qiE '^[[:space:]]*session hook:[[:space:]]*off[[:space:]]*$' "$models"; then
  exit 0
fi
cat "${CLAUDE_PLUGIN_ROOT}/hooks/session-start-context.md"
