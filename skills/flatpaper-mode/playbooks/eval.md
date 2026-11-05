### Eval

**You own the experiment design. Plan it, blind it, run it, and synthesize the result.**

For a test of whether a variant of a skill, prompt, or playbook changes what agents do ("eval this skill", "A/B these prompts", "is variant B better").

These blinding rules have no exceptions:

- No `eval`, `test`, `judge`, `experiment`, `rubric`, `score`, `compare`, `benchmark`, `candidate`, or `arena` in any directory, file, or prompt a candidate sees.
- The candidate prompt reads like an organic user request. It states the goal, not the meta.
- No cues that draw out the chain. Don't ask a candidate to list the skills, principles, or files it applied. Ask for design notes in general, and grade chain-following from the shape of the code, not from self-report.
- Sanitize directory and slug names. Use project-shaped names a user might pick.
- Don't tell a candidate that other candidates exist.
- The judge may know it is judging, but it sees outputs by sanitized label only, never by model name.
- When you compare two variants, one judge scores both sets in a single pass on one scale, blind to which set each output came from.

1. Frame the test. State the variant under test and the behavior that counts as success. Write the rubric, 3 to 6 concrete criteria, for the judge only. The check is the rubric in a file outside every candidate directory.
2. Set up sanitized environments. Give each candidate its own working directory under the session scratchpad, with a project-shaped name and the variant in place. Plant the context an organic task would have, such as a project skeleton and the skill files a candidate would read on its own. To compare two variants, build one set of directories per variant. The check is a `find` over every candidate directory whose paths contain none of the banned words.
3. Write one organic prompt, the request a user would type. It says nothing about what is measured. Fill the brief fields from `../references/subagent-brief.md` in the user's voice: GOAL is the request, SCOPE is the candidate's directory, and REPORT asks for the result and short design notes. The check is a grep of the prompt, and of each Agent call's `description`, that finds none of the banned words.
4. Spawn the candidates in one message with the Agent tool: `subagent_type: "general-purpose"`, `run_in_background: true`, and one candidate each on `opus`, `sonnet`, and `fable`, the variety panel in the Subagents table. Each works in its own sanitized directory on the same prompt. Set each one's `effort` per the Subagents section, and record each agent id. Claude candidates leave transcripts, which step 6 reads. If a candidate produces no output, continue with the rest and note the dropout. The check is one output per candidate, or a noted dropout.
5. Judge blind, with a model from another vendor. Copy each output into a judged directory under a label, in an order that does not follow the models, and remove model and vendor names from the copies. With two variants, mix both sets into one labeled pool. Keep the map from label to model and variant to yourself. Write the judge's prompt file outside the judged directory, with the rubric, the labeled paths, and the ask: score each output on each criterion, on one scale. Run the Codex judge with Bash and `run_in_background: true`: `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/scripts/codex-seat.sh --model gpt-6.1-sol --effort high --fallback "a Claude judge" --cwd <judged dir> <prompt-file>`. It runs read-only, so it changes nothing. On exit 3, print its one fallback line and spawn the Claude judge per the `arena` skill's Phase C, read-only, with `model` set to the first of `fable`, `opus`, and `sonnet` that differs from the session model. That judge shares a vendor with the candidates, so its verdict is a weaker signal. Say so in the reply. The check is a score for each output on each criterion, with the judge named.
6. Verify the chain from transcripts, not self-report. Each candidate's transcript is `~/.claude/projects/<project-dir>/<session-id>/subagents/agent-<agent-id>.jsonl`, under this session's project directory. Read only this project's directory and the ones for its worktrees under `.claude/worktrees/`. Never glob across other projects, because they hold unrelated private chats. List the files each candidate opened from its `Read` tool calls. Grade chain-following from the files it really read and the shape of its code, never from its own claims. The check is the list of opened files per candidate.
7. Read every output yourself, end to end, and score it on the rubric. Compare your scores with the judge's verdict. A disagreement means a model is biased or the rubric is ambiguous, so read both rationales before you decide. Then synthesize. The check is your score next to the judge's for each output.

**Reply:** the variant under test, the rubric, notes on each candidate with the files it opened, the judge's verdict and which judge gave it, any Codex fallback line, your synthesis, and whether to promote the variant.

<!-- ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 pstack/skills/poteto-mode/playbooks/eval.md (MIT) -->
