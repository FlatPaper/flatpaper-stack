### Investigation

**You own the answer.** Read-only. The output is a cited explanation or a recommendation, not a code change.

1. For "how does X work" and "where should this live", run the `how` skill. It reads a narrow area directly, and splits a large one across read-only explorers and one explainer. Either way the answer comes in its sections with `file:line` citations.
2. For "why was it built this way" questions, run the `why` skill. It anchors in git history first and then checks the other sources this session can reach. "Nobody wrote down why" is a valid finding.
3. Put each claim in a confidence tier from `../references/principles.md`. Cite `file:line`, commits, PRs, and command output for each claim. A hypothesis the user embeds in the question ("I assume it's for performance?") is a claim to test.
4. For a choice between options, answer with a recommendation and a tradeoffs table. If running something would settle the choice, say so and route to Prototype.

No code changes. If the findings point at a fix, say so and stop. The fix is matched to its own playbook on the next prompt.

**Reply:** the answer first, then the evidence used, then open questions. For "are we sure?", give your real judgment and push back if the premise is wrong.
