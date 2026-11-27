# Spawning subagents

Follow this for every subagent spawn, an `Agent` call or a Codex seat. A skill names a role, such as the `how explorer` role.

## Model

Before your first spawn, run `node <plugin>/scripts/resolve-models.mjs` once and use the role lines in its resolved table. The layers are bundled `models.json`, user `~/.claude/flatpaper-stack/models.md`, and repo `.agents/models.md`, with the most specific usable line winning. If any entry is unusable, the whole line falls through to the next layer, so panel sizes stay intact.

If the resolver cannot run, use `parent` for every role and say so.

A value is `<provider>/<model>:<effort>`, a list of them, or `parent:<effort>`. `none` means no entries. A default written without an effort means `medium`.

- `parent`: leave `model` unset, so the subagent runs on the parent model.
- `claude/<alias>`: set the Agent `model` to the alias.
- `gemini/<name>`: the Gemini agent or MCP tool that the name refers to.
- A list runs one subagent per entry, so its length sets the fan-out.

If a value's provider is missing or the spawn rejects it, use the role's default and say so. If the default's provider is missing too, use `parent` and say so, unless the skill says to skip the seat. A role that needs something only a Claude subagent has, such as MCP tools, messages through `SendMessage` while it runs, or its own wake-ups through `/loop` or `Monitor`, treats a `codex` or `gemini` value as missing.

## Cross-family reviewer

A role that checks other agents' work lists its reviewers in order of preference. The author is every model family that wrote any of the work under review. `parent` and `claude/*` are Claude, `codex/*` is Codex, and `gemini/*` is Gemini.

1. Take the first available entry from a family that is not an author.
2. If there is none, take the first available entry from an author family, preferring a model that did not write the work. With no such entry in the list, use `parent`. Report it as a same-family review and name the model.
3. The reviewer is always a fresh subagent. A review by the agent that wrote the work never counts.

The `pr critical reviewer`, `pr deep reviewer`, and `pr triage reviewer` roles take the model their line names. Steps 1 and 2 do not apply to them. Step 3 still applies, so each review uses a fresh subagent and never the author. Other reviewer roles keep the cross-family rule.

A model the user names (`sonnet`, `opus`, `haiku`, `fable`, or a Codex model) wins over all of this.

## Codex seats

A `codex/*` value runs as a Codex seat through the codex-seats plugin. Load its `codex-seat` skill and follow it. The resolver drops `codex/*` lines when codex-seats is missing.

- Pass `read-only` for every seat whose Claude spawn would use `subagent_type: Explore`.
- When the Claude spawn would use `subagent_type: "flatpaper-stack:<name>"`, pass `--agent <plugin>/skills/flatpaper-mode/codex-agents/<name>.md`. Here `<plugin>` is flatpaper-stack's absolute plugin path.
- Panel reviewers, judges, and workers whose skill sets its own agent type pass no `--agent`. These exceptions include `arena`, `interrogate`, `architect`, `swarm`, `reflect`, and `thermos`.
- Start every Codex brief with `Read <path>/worker.md before anything else.`, just like an Agent kickoff. Here `<path>` is the absolute path to flatpaper-stack's `skills/flatpaper-mode` folder. The codex-seats runner adds no preamble.

## Effort

**Always pass an effort.** For a Claude subagent, set the Agent `effort` (`low`, `medium`, `high`, `xhigh`, or `max`). For a Codex seat, pass the effort per the codex-seats plugin's `codex-seat` skill.

Use the role line's effort, or the default's effort when the line has none. Never go below that. Raise it one step, up to `max`, when the user asks or the work is very hard (cross-cutting design, subtle concurrency, a bug that resisted earlier attempts), and say so. On a panel, raise every seat together, so no seat wins just by thinking longer. Change only the effort, and keep the model or agent the role names, so a diverse panel stays diverse. Verification is the exception and stays on the `swarm workers` role's model and effort.
