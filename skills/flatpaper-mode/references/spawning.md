# Spawning subagents

Follow this for every Agent call. A skill names a role, such as `how explorer`, and a default for it.

## Model

Use that role's line in `~/.claude/flatpaper-stack/models.md`, which `/flatpaper-stack:setup-flatpaper-stack` writes, or the default when the file or the line is missing. A value is `<provider>/<model>:<effort>`, a list of them, or `parent:<effort>`. A default written without an effort means `medium`.

- `parent`: leave `model` unset, so the subagent runs on the parent model.
- `claude/<alias>`: set the Agent `model` to the alias.
- `codex/<model>`: spawn the `codex:codex-rescue` agent, and put `--model <model> --effort <effort>` in its brief (`codex/default` leaves out `--model`). The Agent `effort` on that call only sets Codex's thin Claude wrapper, so the brief carries the effort.
- `codex/matched`: the Codex model at the parent's tier: Fable → `gpt-6-astra`, Opus → `gpt-6.1-sol`, Sonnet → `gpt-6.1-terra`, Haiku → `gpt-6-luna`. If that model isn't available, use `codex/default`.
- `gemini/<name>`: the Gemini agent or MCP tool that the name refers to.
- A list runs one subagent per entry, so its length sets the fan-out.

If a value's provider is missing or the spawn rejects it, use the role's default and say so. If the default's provider is missing too, use `parent` and say so, unless the skill says to skip the seat. A role that needs MCP tools, which only Claude subagents have, treats a `codex` or `gemini` value as missing.

A model the user names (`sonnet`, `opus`, `haiku`, `fable`, or a Codex model) wins over all of this.

## Effort

**Always pass an effort.** For a Claude subagent, set the Agent `effort` (`low`, `medium`, `high`, `xhigh`, or `max`). For a Codex subagent, put `--effort` in its brief.

Use the role line's effort, or the default's effort when the line has none. Never go below that. Raise it one step, up to `max`, when the user asks or the work is very hard (cross-cutting design, subtle concurrency, a bug that resisted earlier attempts), and say so. On a panel, raise every seat together, so no seat wins just by thinking longer. Change only the effort, and keep the model or agent the role names, so a diverse panel stays diverse. Verification is the exception and stays on the `swarm workers` role's model and effort.

## Codex sandbox

The Codex plugin runs read-only by default, which refuses git on macOS and any temp-file write. Give a Codex reviewer `--write` in its brief, and set its working directory to a throwaway detached worktree at the head under review, so its writes stay out of the real worktree. `--write` still refuses localhost servers and the network, so a review that must run those uses a Claude reviewer in place of the role's Codex model. If the user named Codex for that review, report that the sandbox blocks it and keep the review gate closed until they choose. Never run Codex with full access.
