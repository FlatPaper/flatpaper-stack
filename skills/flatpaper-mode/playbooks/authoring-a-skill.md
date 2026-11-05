### Authoring a skill

**You own the skill's voice. Keep only prose that changes a decision.**

For writing or editing a skill, a playbook, or an agent file ("write a skill", "edit this skill", "add a playbook").

In the flatpaper plugin repo, a new skill needs a `/flatpaper-stack:<name>` row in `README.md` and a `c-<name>` command in the guide. Unless its frontmatter sets `disable-model-invocation: true`, a flatpaper-mode file or `guidelines.md` must also call it. A new playbook needs a line in the flatpaper-mode Playbooks list with its trigger phrases, and a `cp-<name>` trigger row in the guide. A new script needs a row in the guide.

1. Draft or revise a skill with the `anthropic-skills:skill-creator` skill. Use its drafting help for the frontmatter, the description, and the layout. Skip its evals and its workspace directories inside `skills/`, because the guide build reads every directory there as a skill. Where its style advice conflicts with step 2, step 2 wins. If the session has no `skill-creator` skill, say so and write the skill by hand. A playbook or an agent file is not a skill, so write it by hand in the voice of the files next to it. A playbook has a bold ownership line, numbered steps that each end in a check, and a **Reply:** line. Check that a skill's frontmatter has a `name` that matches its directory and a `description`.
2. Write it delete-first. When in doubt, delete. Tell the agent to do the thing and skip the reason, unless the rule is confusing without one. Match the tone to the scope. Point at structural sources such as types, READMEs, and config instead of restating them (encode lessons in structure). Hand work to another skill by its name or path. Name principles only as `../references/principles.md` names them. Check that no step restates a skill or a file it could point at instead.
3. Validate the wiring. In the flatpaper plugin repo, run `./scripts/check-skills.sh` and `bash docs/guide/build.sh` from the repo root. The lint checks frontmatter, README listings, callers, playbook wiring, relative paths, and skill and agent references. The guide build fails on a skill, playbook, agent, or script that the guide does not cover. CI does not run the guide build, so run it yourself. In another repo, check the same by hand: every file the skill references exists, and every skill it names resolves. Check that both commands exit 0, or that you listed each reference with its target.
4. Test a structural change. When the change adds a script, a lint, or a routing rule, add a fixture that fails without it. In the flatpaper plugin repo, add the fixture to the repo's `./scripts/test-scripts.sh` and run that script from the repo root. Skip this step for a wording-only change, and say so. To revert the change, copy the repo's tracked files to a scratch directory and undo the change in the copy. Either write the base version over it with `git show <base>:<file> > <scratch-dir>/<file>`, or replace the script with a stub that prints nothing and exits 0. Then run `./scripts/test-scripts.sh <scratch-dir>` from the repo root. Check that the fixture fails on the scratch copy and passes on the repo.

When you keep hitting a workflow that no skill captures, propose a new skill to the user.

**Reply:** what the skill does, the key design choices, and the validation output.

<!-- ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 pstack/skills/poteto-mode/playbooks/authoring-a-skill.md (MIT) -->
