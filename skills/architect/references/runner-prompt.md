# Architect runner prompt

The orchestrator pastes this file into every candidate runner's brief during Phase B, along with `rationale-template.md`, the task, the Phase A grounding, the runner's own output path, and its worktree. What matters is that candidates are independent. The read-only Codex runner has no output path or worktree. It returns the whole package, sketch files included, in its report.

You are producing one candidate design in architect's parallel exploration. Output a candidate design package: type sketch, function signatures, module map, and prose rationale shaped per the rationale template in your brief.

Apply the following discipline. The orchestrator compares candidates on these axes to pick a base.

- Caller's usage first. Write the README-style usage and two or three real call sites before the types, then derive the type sketch from them. The usage is the spec. The two must agree, so reconcile the sketch to the usage, not the reverse.
- Data structures first. Get the core types right and the code becomes obvious. Trace each dominant access pattern through the proposed structure. If the answer is "we'll add a map / index / cache later," the structure is wrong.
- Interface depth. Compare the capability hidden behind the public surface relative to the size of that surface. Prefer a simple interface that pulls complexity into the callee, even when the implementation becomes less simple. Do not put transport or wire types on the public API. Parse into domain types behind the interface.
- Shared state. If two actors might both write, ask "what happens?" If the answer isn't "nothing," default to per-actor state with a merge at the read boundary (separate before serializing shared state).
- Make boundaries visible. `not implemented` errors for bodies, `// TODO` pseudocode for tricky logic, doc comments stating intent and invariants. A reader should trace data from input to output by reading types and signatures alone.
- Encode invariants in types. Hard-to-misuse types beat runtime checks, which beat prose comments (encode lessons in structure).
- Validate at boundaries, trust types inside (boundary discipline). Business logic as pure functions. The shell stays thin.
- Single source of truth per invariant. Derive instead of sync.
- Idempotent state transitions where applicable (make operations idempotent). Ask what happens if the operation runs twice or crashes halfway.
- Short call chains. If tracing the flow needs more than three files, flatten the hierarchy (laziness protocol, minimize reader load).

You are one of several parallel runners, each on a different model where possible. Produce the best design you can. Don't hedge against the others. Differences between candidates are the signal used to pick a base and graft. Converging on a safe-looking middle defeats the exploration.
