### Refactoring

**You own the contract. The structure changes. The behavior does not.**

If the cleanup reveals a bug or a missing feature, split it out. Ship the structural change first against the pinned contract. A redesign is allowed, but name it and route it to Feature. Large or cross-cutting structural work routes to the `figure-it-out` skill. This playbook is for a focused or medium change.

1. Pin the behavior first. Run the `how` skill over the affected subsystem to learn the contract. Then write a characterization test, snapshot, or script that records current outputs, before any structure moves. Type checks and lint are not a pin.
2. Name the structure the code is missing (model the domain). Boring code stays when its shape is already clear and local. The reshape deletes branches or invalid states. It adds no indirection. Check that the planned reshape removes at least one branch or invalid state and adds no layer.
3. Name the target shape: module layout, types, and call graph as if built today. If the target crosses a function boundary, run the `architect` skill through its sketch phases only (A and B) before the move.
4. Subtract before you add. Delete dead code, one-caller wrappers, redundant validators, and orphan references before introducing the new shape.
5. Move in small steps, each keeping the pin green. When replacing an API, migrate every caller and delete the old one in the same change. Leave no compatibility shim and no parallel old and new path. Check renames against the actual files, including strings and docs. Check that a search for the old name finds no caller, shim, or second path.
6. Prove behavior is unchanged on the real artifact. When the change reaches a user surface, drive it through the project's `verify-<app>` skill. For larger moves, diff old against new outputs with a script.
7. Keep the change only if it lowers reader load somewhere. Otherwise revert it. For a large move whose target shape is contested, run the `interrogate` skill on it first.
8. If the new structure moved a boundary the architecture page shows, run the Architecture page playbook in update mode and include it in the same PR.
9. Order the commits: the subtraction first, then the reshape, then any follow-on cleanup. Drop a kind that has no changes. Each commit keeps the pin green (sequence verifiable units). Check that `git log <base>..HEAD --oneline` reads in that order.

**Reply:** the structure that changed, the pin, the equivalence proof, and what was reverted. No new behavior.

<!-- ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 pstack/skills/poteto-mode/playbooks/refactoring.md (MIT) -->
