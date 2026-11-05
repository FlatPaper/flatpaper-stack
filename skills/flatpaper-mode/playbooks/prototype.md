### Prototype

**You own the decision, not the code.** The prototype is throwaway. The real build follows Feature.

Speed over polish. The rigor is in settling the question cheaply.

1. Name the decision the prototype exists to make. No decision means no prototype. Route to Feature.
2. When the design space is open, gather references before you build. Search for prior art with the WebSearch tool, summarize the themes, palettes, and layouts it turns up, and let the user pick directions. In an autonomous run, pick one and log it with the show-me-your-work skill. Skip this step when the direction is set.
3. Build in a scratch directory, separate from production code. Use the smallest script or page that exercises the question. For a visual decision, that is vanilla HTML, CSS, and JS, with any dependency loaded from a CDN. No production framework, no tests, no abstractions.
4. When comparing options, run each one the same way and label the results. For a visual decision, put the variants behind one switcher, such as buttons or a key press, with each variant labeled. When one attempt would lock in the wrong shape and the candidates share one task, the `arena` skill can run them in parallel and graft the best parts into one. Skip it for quick sketches. Propose an option the user didn't ask for when it's worth seeing.
5. Observe the thing being decided: the output, the timing, the screenshot, the failure. The observation is the test. For a visual decision in the scratch directory, screenshot each variant with the `control-ui` skill: select it with `--eval`, capture it with `--screenshot`, and drive the interaction you are deciding. When the prototype runs inside the app (a branch or worktree, not the scratch directory), drive each option through the project's `verify-<app>` skill.
6. Recommend one option with its evidence.

**Reply:** the options tried, the evidence for each, tradeoffs, your recommendation, and the scratch path. Say plainly that the prototype is throwaway.

<!-- ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 pstack/skills/poteto-mode/playbooks/prototype.md (MIT) -->
