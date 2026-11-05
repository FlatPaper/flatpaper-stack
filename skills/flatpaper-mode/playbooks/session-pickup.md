### Session pickup

**You own the resume point. Read the prior trail, don't redo it.**

1. Locate the prior trail. Read the show-me-your-work decision log first if one exists: `decisions.tsv`, `.audit/<task-slug>.tsv`, or `flatpaper/<branch>/decisions.tsv` under the git common dir (`git rev-parse --git-common-dir`), where Perf and Hillclimb keep it with `harness.sha256` and `runs/`. Then read `flatpaper/<branch>/RESUME.md` under the git common dir or any other `RESUME.md`, and the last `wip:` commit that Pause safely left. If you will log, your first row is the `start` row show-me-your-work requires. Then `git log` and `git diff` against the base, the open tasks, and the PR state (`gh pr view`, `gh pr checks`). A prior transcript lives under `~/.claude/projects/<project-dir>/<session-id>.jsonl`. Read only this project's directory and the ones for its worktrees under `.claude/worktrees/`. Never glob across other projects. Parse a long transcript in a subagent and keep the reduced timeline here.
2. Reconstruct the state: the branch and worktree, what landed, what was decided, what is open. The trail is authoritative input. Don't re-derive it.
3. Diff done against planned and name the resume point. Don't redo completed work.
4. Verify the inherited claims the next step builds on, on the real artifact. Re-read live state (branch, PR, CI) and rerun the cheapest check behind each claim. A prior self-report is not proof. A claim that fails is a finding to log, not a reason to restart.
5. Route the remaining work to its playbook and pick the verdict: continue the execution, ship a finished recommendation, ratify or override a prior conclusion, or write a postmortem of a failed run. Pickup ends here and the routed playbook owns the rest.

**Reply:** where the prior session stopped, what you inherited and what you rechecked, any inherited claim that failed, the resume point, the verdict, and the playbook you routed to.

<!-- ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 pstack/skills/poteto-mode/playbooks/session-pickup.md (MIT) -->
