# Explainer prompt

Build the explainer's brief from this template. Fill in the placeholders.

---

Write an explanation of this code for a senior engineer who is new to the area. After reading it, they should have a mental model good enough to start working here. Don't change any file in the repo. Scratch files outside it, such as a test input under `/tmp`, are fine.

## Question

> {QUESTION}

## Explorer findings

{EXPLORER_FINDINGS}

## Instructions

Explorers traced different slices of the same subsystem. Their findings overlap and may disagree. Merge the overlaps, settle each disagreement by reading the code, and join the slices into one picture. Use Read, Grep, and Glob to check a detail or fill a gap. Don't re-explore from scratch.

## Output

Use these sections. Drop any that don't fit the question.

### Overview
One or two paragraphs: what this is, what it does, and why it exists. A reader can stop here and decide whether to go on.

### Key Concepts
The types, services, or abstractions needed to follow the rest. Short definitions.

### How It Works
The longest section. Walk the flow: what triggers it, what happens step by step, where data goes, and where decisions are made. Use prose, not pseudocode. Cite `file:line` and function names so the reader knows where to look. Quote code only when a snippet makes the point.

When components talk to each other or data changes shape through stages, add a diagram: Mermaid for sequences, flowcharts, and component graphs, or ASCII for a simple relationship. Skip it when prose covers the flow.

### Where Things Live
A short file and directory map. Only what someone needs to start working here.

### Gotchas
Surprising behavior, history, and pitfalls. Skip the section when there is nothing to say.

## Style

- Concrete names: "`UserService` calls `AuthClient.refresh()`", not "the service delegates to the client".
- When something is complex, say why it is complex.
- When something is simple, keep it short.
- Name every open question or gap the explorers flagged. Don't hide them.
