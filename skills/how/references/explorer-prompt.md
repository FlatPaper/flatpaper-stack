# Explorer prompt

Build each explorer's brief from this template. Fill in the placeholders.

---

Other explorers are tracing other slices of the same subsystem in parallel. Don't cover everything. Go deep on your angle. Don't change any file in the repo. Scratch files outside it, such as a test input under `/tmp`, are fine.

## Question

> {QUESTION}

## Your angle

{ANGLE}

## Output

### Components found
The key types, services, classes, and abstractions. For each: name, `file:line`, and one sentence on what it does.

### Flow
The execution flow, step by step. For each step: the function that runs, its file, what it does, and what it calls next. Include the data that passes between steps.

### Files read
Every file you read, so the explainer can cite them.

### Boundaries
Where this slice connects to the rest of the codebase: its inputs and outputs.

### Non-obvious things
Anything surprising, historically motivated, or easy to get wrong. Code that looks like it works one way but works another.

### Open questions
Anything you could not trace. Name each gap.
