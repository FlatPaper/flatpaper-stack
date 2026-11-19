# Spawning subagents

Follow this for every subagent spawn, an `Agent` call or a Codex seat. A skill names a role, such as `how explorer`, and a default for it.

## Model

Use that role's line in `~/.claude/flatpaper-stack/models.md`, which `/flatpaper-stack:setup-flatpaper-stack` writes, or the default when the file or the line is missing. A value is `<provider>/<model>:<effort>`, a list of them, or `parent:<effort>`. A default written without an effort means `medium`.

- `parent`: leave `model` unset, so the subagent runs on the parent model.
- `claude/<alias>`: set the Agent `model` to the alias.
- `codex/<model>`: run a Codex seat, per **Run a Codex seat** below, with `<model>` as the model argument. `codex/default` passes `default`, so Codex uses its own default model.
- `codex/matched`: the Codex model at the parent's tier: Fable → `gpt-6-astra`, Opus → `gpt-6.1-sol`, Sonnet → `gpt-6.1-terra`, Haiku → `gpt-6-luna`. If that model isn't available, use `codex/default`.
- `gemini/<name>`: the Gemini agent or MCP tool that the name refers to.
- A list runs one subagent per entry, so its length sets the fan-out.

If a value's provider is missing or the spawn rejects it, use the role's default and say so. If the default's provider is missing too, use `parent` and say so, unless the skill says to skip the seat. A role that needs MCP tools, which only Claude subagents have, treats a `codex` or `gemini` value as missing.

## Cross-family reviewer

A role that checks other agents' work lists its reviewers in order of preference. The author is every model family that wrote any of the work under review. `parent` and `claude/*` are Claude, `codex/*` is Codex, and `gemini/*` is Gemini.

1. Take the first available entry from a family that is not an author.
2. If there is none, take the first available entry from an author family, preferring a model that did not write the work. With no such entry in the list, use `parent`. Report it as a same-family review and name the model.
3. The reviewer is always a fresh subagent. A review by the agent that wrote the work never counts.

A model the user names (`sonnet`, `opus`, `haiku`, `fable`, or a Codex model) wins over all of this.

## Run a Codex seat

A Codex seat is a background Bash command, not an `Agent` call. The `Agent` defaults (`subagent_type`, the Agent `model` and `effort`, and `isolation`) do not apply to it.

1. Write the brief to a file, such as `<scratchpad>/codex-<task>.md`.
2. Run `<plugin>/skills/flatpaper-mode/scripts/codex-run.sh <cwd> <model> <effort> <prompt-file>` with Bash `run_in_background: true` and the description `Codex: <task>`. `<cwd>` is the directory Codex works in. Add `read-only` as a fifth argument for a seat that must not write. A writing seat that runs beside other writers gets a worktree of its own as `<cwd>`.
3. Pass `--agent flatpaper-agent` whenever the same step on Claude would use `subagent_type: "flatpaper-stack:flatpaper-agent"`. This covers code-writing delegates and helpers inside a playbook step. Panel reviewers, judges, and workers whose skill sets its own agent type pass no `--agent`. Those skills include `arena`, `interrogate`, `architect`, `swarm`, `reflect`, and `thermos`.
4. For a list of N Codex seats, send N background commands in one message.
5. End your turn. When the completion notification arrives, read the command's output file. Stdout holds only Codex's final answer.
6. To watch progress, read `<prompt-file without its extension>.codex.log`. The script prints that path on stderr when it starts.
7. To stop a seat, call `TaskStop` on its command.

## Effort

**Always pass an effort.** For a Claude subagent, set the Agent `effort` (`low`, `medium`, `high`, `xhigh`, or `max`). For a Codex seat, pass the effort as the third argument to `codex-run.sh`. If the seat's log shows `Unsupported reasoning effort` (the stock Codex plugin stops at `xhigh`), rerun at its highest accepted effort and say so.

Use the role line's effort, or the default's effort when the line has none. Never go below that. Raise it one step, up to `max`, when the user asks or the work is very hard (cross-cutting design, subtle concurrency, a bug that resisted earlier attempts), and say so. On a panel, raise every seat together, so no seat wins just by thinking longer. Change only the effort, and keep the model or agent the role names, so a diverse panel stays diverse. Verification is the exception and stays on the `swarm workers` role's model and effort.

## Codex sandbox

`codex-run.sh` runs Codex with `--write` unless you pass `read-only`. The read-only sandbox refuses git on macOS and any temp-file write, so a Codex reviewer keeps `--write`. Pass a throwaway detached worktree at the head under review as the reviewer's `<cwd>`, so its writes stay out of the real worktree. `--write` still refuses localhost servers and the network unless `~/.codex/config.toml` sets `network_access = true` under `[sandbox_workspace_write]`, and even then Claude Code's own sandbox limits outbound hosts to its allowlist. Without that setting, a review that must run those uses a Claude reviewer in place of the role's Codex model. If the user named Codex for that review, report that the sandbox blocks it and keep the review gate closed until they choose. Never run Codex with full access.
