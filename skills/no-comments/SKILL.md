---
name: no-comments
description: Spawn Comment Sicko on a diff or files, act on the findings it gets right, and offer to encode claimed constraints as code. Use for /no-comments, "strip the comments", or before opening a PR.
---

# No comments

Spawn Comment Sicko. Act on accepted findings. Defer to its fresh view.

## Scope

Use the caller's files or diff. Otherwise use the current diff against the base branch, default `main`, including the working tree.

## Steps

1. Spawn one Agent with `subagent_type: "flatpaper-stack:comment-sicko"`. Its rules live in the agent, so the brief carries the scope, sized per `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/references/subagent-brief.md`. Set `effort` per the Subagents section of the flatpaper-mode skill. Do not restate its rules.
2. Read its report and its diff. Reject application-code edits, scope escapes, deletions of comments a keep exception protects, `MUST KILL` flags with misstated reasons, and flags that treat kept intentional code as guilty. Reshape flags on surprises in our own code stay actionable. Do not restore those comments. A keep survives only with proof it is about something we cannot change. Audit lint and TypeScript suppressions in scope that it missed. Suppressions of correctness or safety rules stay actionable `MUST KILL`s. Restore a deletion only with the exact exception and proof in scope. Before accepting a thin `IMPORTANT` or `do not remove` kill or keep, read the code path behind its symbol, run `/flatpaper-stack:why` on it, or both. If a kill is ambiguous, do not restore. If a keep is refuted or still ambiguous, delete it. Revert only the reviewer's own hunks, never the user's uncommitted edits, and rerun one rejected report with the failure named. If the rerun is also rejected, report it open and fail `/flatpaper-stack:no-comments` for that report's rejected findings, not for the run.

   A `HOLD` that names a rule of a dependency, platform, vendor, or protocol and where to check it is not an ambiguous keep. Leave it in place and report it open. Any other `HOLD` is an ambiguous keep. Reject a kill of a comment that states such a rule unless the report cites a documentation page or source file that refutes the rule or shows it binds something else. Restore that comment as a `HOLD`, even where an ambiguous kill would otherwise stay deleted. After a second rejection, revert its rejected findings and finish steps 3 to 6 with every finding you accepted.
3. Fix trivial accepted flags directly: delete a dead path, drop a parameter, or use the real API. If any fix needs a shape, run `/flatpaper-stack:architect` once for the accepted set and the code around it. Stop at the sketch. Architect shapes. Step 4 implements.
4. Implement the smallest root-cause fix in scope. Remove every named workaround. If the root cause is out of scope, land the smallest in-scope fix and report the rest open. **Fix root causes** and **Redesign from first principles** in `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/references/principles.md` guide intent only. Neither widens the scope or fixes instances outside it. Never bolt on symptom guards.
5. Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. Leave keeps about things we cannot change. For the rest, offer the cheapest in-scope type, runtime check, test, or CI lint. Wait for the user's approval. An unattended run needs approval given before it started. If approved, encode the constraint, then delete the comment. Otherwise delete the comment, report the constraint open, and sketch the out-of-scope work.
6. Report the deletion count, restored comments, `HOLD` comments, reruns, the architect sketch, fixes, encoding offers, encodings, unenforced constraints, and other open work.
