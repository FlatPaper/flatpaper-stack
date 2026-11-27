### Bug fix

**You own this task. Plan, review, verify.** Delegate investigation and the fix to subagents, stay in the lead. Pick each subagent's reasoning level for the job, per the Subagents section.

Be scientific. Every shipped line traces to runtime evidence. Belt-and-suspenders that "might help" is a hypothesis, not a fix. It does not ship. When evidence refutes a hypothesis, revert what it motivated. The smallest change the evidence justifies ships, nothing more.

Before the fan-out in steps 2 and 3, check the **Focused-fix exception** below. When you print diagnostic configuration or service responses, select the known non-sensitive fields. Never dump a whole configuration or environment.

1. Reproduce it yourself on the matching surface via the control skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires.
2. Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives. Seed them with a trace of the affected subsystem and the **why** skill for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Don't guess. Drive a long or stubborn hunt with Claude Code's `/loop` command. Confirm the surviving *mechanism* with runtime evidence before step 3's `architect` or an `interrogate` fan-out.
3. Plan the fix. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent on the `bug-fix` role, per the Subagents section, with a specific scope.
4. Verify on the same surface. The original repro now passes. "Inconclusive" or wrong-surface is not a pass. Flag it. Unit tests show branch behavior, not bug absence.
5. Stage the commits so the failing repro lands before the fix in git history. See the **tdd** skill for the failing-test-first cadence when the bug has a cheap local test path. Skip it when the test would be expensive, integration-heavy, or unclear.
   This is the canonical **sequence-verifiable-units** principle skill, the failing test first and the fix on top.
6. Run **Opening a PR**.

Run `architect` in step 3 before you change an interface, ownership, a schema, migration behavior, a concurrency or transaction guarantee, or a deployment or routing contract, even inside one function. A fix to code that enforces a security or data-integrity invariant, an atomic eligibility guard included, needs an independent correctness reviewer before it is merge-ready, even when the fix keeps the invariant. If no reviewer can run, follow the closed-review-gate rule in the Subagents section.

**Reply:** what was broken, root cause, fix, how you verified. Paste failing-then-passing repro output verbatim.

When the task includes publishing or deploying, the reply also states what code was fixed and verified, what was published, what version and behavior the affected runtime served (through the authenticated path when that matters), and any blocker with the action that clears it. Missing or contradictory runtime evidence leaves the incident open, even after a successful publish. Remove credentials and customer data from quoted evidence.

#### Focused-fix exception

One bug-fix delegate may investigate the reproduced failure with a focused read of the code and its local history. It skips the **why** skill and step 3's `architect`, even across a function boundary, only when all of these hold:

- Runtime evidence places the cause in one subsystem.
- The fix keeps interfaces and state semantics. It changes no signature, ownership, schema, migration, security, concurrency, transaction, deployment, or routing. Security covers authentication, authorization, cryptography, and secret handling.
- A cheap regression check exercises the failure under the relevant runtime settings, and you can verify on the original surface.
- No competing design or contradictory evidence remains.

Record the evidence for each condition in the task list before the skip. The delegate implements the scoped fix. You still plan, review the diff, and verify. If a condition is false or still unknown after the focused pass, or later evidence breaks it, return to steps 2 and 3 without the exception. Every other step and every required independent review still apply. A small patch alone never qualifies.
