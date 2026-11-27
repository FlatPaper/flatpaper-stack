---
name: resume
description: Resume work in a fresh session from a handoff note that /flatpaper-stack:pause wrote. Use for /flatpaper-stack:resume, with an optional note path.
disable-model-invocation: true
---

# Resume

1. Find the note. With a path argument, use it. Without one, run `node <this skill's folder>/latest-handoff.mjs "$PWD"`. It prints the newest note for this working directory. If it exits 1, show its output and ask the user which note to use.
2. Invoke the `flatpaper-stack:flatpaper-mode` skill.
3. Run its **Session pickup** playbook from that note.
