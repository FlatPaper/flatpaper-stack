### Authoring a skill

**You own the skill's voice. Keep only prose that changes a decision.**

For writing or editing a skill, a playbook, or an agent file ("write a skill", "edit this skill", "add a playbook").

1. Draft or revise a skill with the `skill-creator` skill. If the session has no `skill-creator` skill, say so and write the skill by hand. A playbook or an agent file is not a skill, so write it by hand in the voice of the files next to it. A playbook has a bold ownership line, numbered steps that each end in a check, and a **Reply:** line. Check that a skill's frontmatter has a `name` that matches its directory and a `description`.
2. Write it delete-first. When in doubt, delete. Tell the agent to do the thing and skip the reason, unless the rule is confusing without one. Match the tone to the scope. Point at structural sources such as types, READMEs, and config instead of restating them (encode lessons in structure). Hand work to another skill by its name or path. Name principles only as `../references/principles.md` names them. Check that no step restates a skill or a file it could point at instead.
3. Validate the wiring. In the flatpaper plugin repo, run `${CLAUDE_PLUGIN_ROOT}/scripts/check-skills.sh` with the repo root as its argument. It checks frontmatter, README listings, playbook wiring, relative paths, and skill and agent references. A new playbook also needs a line in the flatpaper-mode Playbooks list with its trigger phrases, and a trigger row in the guide, which `docs/guide/build.sh` checks. In another repo, check the same by hand: every file the skill references exists, and every skill it names resolves. Check that the lint exits 0, or that you listed each reference with its target.
4. Test a structural change. When the change adds a script, a lint, or a routing rule, add a fixture that fails without it. In the flatpaper plugin repo, fixtures go in `${CLAUDE_PLUGIN_ROOT}/scripts/test-scripts.sh`. Skip this step for a wording-only change, and say so. Check that the fixture fails with the change reverted.

When you keep hitting a workflow that no skill captures, propose a new skill to the user.

**Reply:** what the skill does, the key design choices, and the validation output.

<!-- ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 pstack/skills/poteto-mode/playbooks/authoring-a-skill.md (MIT) -->
