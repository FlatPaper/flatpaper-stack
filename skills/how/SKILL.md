---
name: how
description: Explain how code works for a senior engineer new to the area, and where new code should live. Read-only explorers trace slices of a large subsystem in parallel, and one explainer writes the answer. Use for /how, "how does X work", a walkthrough before changing unfamiliar code, or "where should this live", "which module owns this", "is this the right layer".
---

# How

Answer "how does X work?" well enough that a senior engineer new to the area can start working in it. Give a mental model, not annotated source.

For why code is the way it is, use the `why` skill. This skill answers how.

## Step 1. Size the question

If the scope is unclear, state your reading in one line and go on. The user can redirect.

- **Simple.** One module, a small utility, or a narrow question such as "how does function X work". Spawn nothing. Read the code yourself, answer in the sections step 4 names, and stop.
- **Complex.** A subsystem across several files or services, a cross-cutting feature, or a whole architecture. Go to step 2.

When in doubt, take the simple path.

Check: one line naming the scope and the path taken.

## Step 2. Explore (complex only)

Split the question into 2 to 4 angles, each a distinct slice of the subsystem. Spawn one explorer per angle, all in one message: `subagent_type: "Explore"`, `model: "sonnet"`, `run_in_background: true`. Each brief is `references/explorer-prompt.md` with the question and its angle filled in.

Check: every explorer returned, or its gap is named.

## Step 3. Explain

Spawn one explainer: `subagent_type: "general-purpose"`, `model: "opus"`. Its brief is `references/explainer-prompt.md` with the question and every explorer's findings filled in.

Check: the output uses the template's sections, minus any that don't apply.

## Step 4. Present

You own the answer. Open the `file:line` citations that carry the explanation and check that the code says what the explainer claims. Fix or drop a claim that fails. Keep the explainer's structure, and edit only for accuracy, clarity, or context from the conversation. Inside flatpaper-mode, put each claim in a confidence tier from `${CLAUDE_PLUGIN_ROOT}/skills/flatpaper-mode/references/principles.md`.

The sections, dropping any that don't apply: Overview, Key Concepts, How It Works, Where Things Live, Gotchas. For a placement question ("where should this live"), end with the recommended location and the boundary that decides it.
