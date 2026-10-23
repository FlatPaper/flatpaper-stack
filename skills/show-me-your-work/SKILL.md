---
name: show-me-your-work
description: Keep a reviewable decision trail for long-running, unattended, or multi-phase work. A TSV log with one row per decision (what, why, evidence, result), audited against the transcript and reviewed by a fresh subagent before handing back. Use for /show-me-your-work, autonomous runs, or work the user reviews after stepping away.
---

# Show me your work

Keep one decision log per task.

## The format

A TSV file, one row per decision. Cells stay on one line. Evidence is a pointer, not prose.

- **ts.** ISO 8601 timestamp.
- **phase.** The phase or workstream.
- **decision.** What was chosen or done, in one line.
- **why.** The reason in plain words, as you would tell a teammate. If a principle drove it, say it plainly, not as a jargon tag.
- **evidence.** A pointer that proves it: commit SHA, PR number, `file:line`, a log path, a screenshot path. Never a paragraph.
- **result.** The outcome: `tests green`, `reverted`, `INCONCLUSIVE`, `open`.

Example:

```
ts	phase	decision	why	evidence	result
2026-10-02T07:14:22Z	verify	checked the live daemon on the workspace	stop reading source and look at the real box	moab service status	ws 101, /api/runs 200 with []
2026-10-02T07:14:45Z	pivot	looked at why runs are missing, not the dashboard	empty list means runs never registered	runs/*/runner.log	preflight rejects the model name
```

## Logging a row

Use the helper. It stamps the time, writes the header on first use, strips tabs and newlines, and neutralizes cells a spreadsheet would run as formulas.

```
"${CLAUDE_PLUGIN_ROOT}/skills/show-me-your-work/scripts/log.sh" <logfile> <phase> <decision> <why> <evidence> <result>
```

Log decision points, not every action: a fork chosen, a unit finished with its check result, a pivot or revert and what triggered it, a blocker. In a loop, one row per iteration.

## Runs

A run is one Claude Code session, including its later turns and any compacted summary of it. A resumed session with the same session id is the same run. A new session, a replacement agent, or a pickup by someone else starts a new run.

When a run adds to a log that already has rows, its first row has phase `start`. So does its first row after another run's `start` row. A run that comes back to a log in a later turn therefore reads the log's last rows first, to see whether another run wrote since.

A `start` row names the `ts` range of the earlier rows this run did not write, in its decision cell. Its evidence names this run by its Claude Code session id, which is the name of its transcript file without `.jsonl`. Use phase `start` for nothing else.

```
2026-10-03T21:05:10Z	start	picked up the log, rows 2026-10-02T07:14:22Z to 2026-10-02T09:40:01Z are from another run	new session on the same task	session 6f1c2e9a-...	open
```

## Where it lives

`decisions.tsv` in the working directory, or `.audit/<task-slug>.tsv` when several tasks share a directory. Keep it out of git by default. Commit it only when a reviewer needs the trail to trust the result.

## Rules

- Append-only. A wrong call gets a new row that supersedes it. Never edit or delete a row.
- Prefer evidence from committed scripts over one-off commands.

## Audit before handing back

At the end of the run, check that the log told the truth. Audit only this run's rows. They come in stretches. A stretch begins at one of this run's `start` rows, or at the first row if this run created the log. It ends at the next `start` row of another run, or at the end of the log.

1. Read this session's transcript at `~/.claude/projects/<project-dir>/<session-id>.jsonl`. `<project-dir>` is the working directory path with each `/` and other non-alphanumeric character turned into `-`, such as `-Users-me-src-app`. Read only this file. Never glob across other project directories. They hold unrelated private chats.
2. Walk this run's stretches against the transcript. Each row maps to a real decision or action, and its evidence resolves and shows what the row claims.
3. A fork, pivot, or abandoned approach that shaped the work but has no row is a gap. Add a row.
4. Correct the log, not the story. Never edit or remove a row, even an invented one. When a row records no real decision or action, or its claim or evidence is wrong, add a row that supersedes it. The new row says what actually happened and carries a pointer that resolves.
5. Rows outside this run's stretches are not audited. If this run's own work shows one of them is wrong, supersede it like any wrong call.

## Fresh review

Spawn a subagent that did not do the work. It runs on the session model. What matters is that it is separate from the work, not which model it uses. It reads the log and the transcript and flags:

- decisions with weak or missing evidence
- verification claimed without proof in the transcript
- choices that look risky in hindsight
- open items nothing closed

## The reply

End with an **Attention** section. First line `reviewed by <model>`. Then each flag, pointing at specific rows. "No flags" is a valid value.

The user reads Attention first, then only the rows it points to. Render the log in a terminal with `column -s$'\t' -t decisions.tsv`.
