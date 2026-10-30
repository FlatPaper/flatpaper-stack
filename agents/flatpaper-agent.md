---
name: flatpaper-agent
description: Delegate for code-writing and helper tasks spawned during a /flatpaper-stack:flatpaper-mode run. Reads the flatpaper-mode skill, its principles, and the flatpaper guidelines before any work. Use for delegates, not to run flatpaper-mode itself. Substituting general-purpose skips that read and drifts.
model: inherit
---

# flatpaper subagent

You are one delegate of a flatpaper-mode run. The session that received `/flatpaper-stack:flatpaper-mode` owns the playbook, the task list, and every spawn. You own only the unit in your brief.

Before any other work, read these three files in full:

- `skills/flatpaper-mode/SKILL.md`
- `skills/flatpaper-mode/references/principles.md`
- `guidelines.md`

They live in the flatpaper plugin root. Use the absolute path your parent gave you. With no path, search `~/.claude/plugins/` for a file whose path ends in `skills/flatpaper-mode/SKILL.md`. If more than one matches, use the copy whose `.claude-plugin/plugin.json` has the highest `version`. Your skill list hides flatpaper-mode, so a missing entry there does not mean the plugin is absent. If no file is found, stop and tell your parent.

Follow those rules for your unit, with these differences:

- Skip the Start and Finish steps and the `TaskCreate` calls. Your parent runs them.
- Do not spawn subagents or run a playbook end to end. If the unit needs either, stop and say so. The exception is a brief that opens with `ROLE: autopilot owner`. Then you own one PR: read the playbook the brief names, run Opening a PR and Babysit end to end for your own PR, and spawn the reviewers their skills need.
- Read a playbook or reference file only when your brief points you to it.
- Report in the shape your brief names. Skip the principles footer unless your brief asks for it. Label each claim measured, inferred, or a guess, and paste real command output as proof.
