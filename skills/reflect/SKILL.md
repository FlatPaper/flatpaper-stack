---
name: reflect
description: Spawn three parallel review subagents over this session's transcript, surface durable learnings, and route each to a concrete edit on an existing skill, CLAUDE.md, or memory. Shows proposed edits for approval before applying. Use for /reflect or "reflect on this session".
disable-model-invocation: true
---

# Reflect

Mine the current session for durable learnings, then route each one to a concrete edit. Skip when the session is trivial, off-topic, or already covered by a skill that was followed correctly. One-offs are not learnings.

## 1. Locate the transcript

Read this session's transcript at `~/.claude/projects/<project-dir>/<session-id>.jsonl`. `<project-dir>` is the working directory path with each `/` and other non-alphanumeric character turned into `-`, such as `-Users-me-src-app`. Use only this session's file. Its first line is session metadata, not a message, and a session that opened with `/clear` or a `!` command logs that wrapper as `user` records before the first real prompt. Never glob across other project directories. They hold unrelated private chats.

If the session id is not known, list this project's directory with `ls -t` and take the newest file whose first user message matches this session's opening prompt. If none matches, pass a tight digest of the session instead.

## 2. Spawn three reviewers in parallel

One message, three `Agent` calls, `subagent_type: general-purpose`, `run_in_background: true`. Reviewers read only. They keep tool access so they can look up the tickets, threads, and traces the transcript cites through whatever `mcp__<server>__<tool>` connectors the session has.

| Lens | `model` | Prompt template |
|---|---|---|
| Judgment | `opus` | `references/judgment-reviewer.md` |
| Tooling | `sonnet` | `references/tooling-reviewer.md` |
| Divergent | `fable` | `references/divergent-reviewer.md` |

Different models give some spread of blind spots. Same-family diversity is weaker than cross-vendor diversity, so weight convergence a little less than you would across vendors. If a model is unavailable, omit `model` to inherit the session model and say so.

Pass each template verbatim, with the transcript path or digest substituted where marked. Reviewers return findings in their final report.

## 3. Synthesize

One `Agent` call, `subagent_type: general-purpose`, `model: opus`. Pass `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. It returns an Accepted, Rejected, and Backlog list.

## 4. Structural check

Move any Accepted item that a lint, test, hook, or script would enforce more reliably to Backlog. This is the "encode lessons in structure" principle in `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/references/principles.md`. The `correct` skill does that work.

## 5. Apply

Show the synthesizer's full output. Wait for explicit approval before applying any Accepted row, unless the user already said to apply them. The user picks the subset and may redirect routings. Skill and `CLAUDE.md` changes affect every future session.

Never edit a skill under `plugins/cache/`. Before approval, show its destination, `.claude/skills/<skill>/` or `~/.claude/skills/<skill>/`. After approval, copy the skill folder there and edit the copy. The copy registers under its bare name, so flatpaper's own steps still load the plugin version. Say so, and rewrite any `${CLAUDE_PLUGIN_ROOT}` path in the copy as an absolute path. Never open a PR or push.

Follow each approved row's routing:

- **Skill body edit.** A one-line fix: make it and show the diff. A larger change, such as a new section: draft it, show the diff, and apply after approval. Use the `skill-creator` skill if it is installed.
- **`tune description: <skill path>`.** The skill exists but didn't trigger when it should have. Rewrite its `description` to front-load the trigger words, and show before and after.
- **`CLAUDE.md`.** A repo convention or gotcha. Add it to the project's `CLAUDE.md` in the section that owns it.
- **`memory`.** A preference about how this user works. Write it to Claude Code's memory directory, `~/.claude/projects/<project-dir>/memory/`, as one short file per fact, and add a one-line entry to that directory's `MEMORY.md` index. Update an existing entry instead of adding a duplicate.
- **`new skill: <kebab-name>`.** Rare. Propose the shape and wait. Do not invent it ad hoc.

List each Backlog item for the user with its suggested mechanism. Offer to run `/flatpaper-stack:correct` on it. Do not file it anywhere without asking.

Run the repo's skill linter, if one exists, on every touched skill before declaring done.

## 6. Summarize

Short list, no preamble:

- Applied: `<path>`. What changed, one line each.
- Waiting for approval: one line each.
- Backlog: the pattern and the suggested mechanism, one line each.
- Dropped: one line per rejected finding, with the synthesizer's reason.

**Reply:** the summary above.
