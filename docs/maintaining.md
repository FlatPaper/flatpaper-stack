# Maintaining flatpaper-stack

## Model defaults

Bundled role defaults live in `models.json`. `node scripts/resolve-models.mjs` prints the effective table after user and repository overrides.

Codex models require the [codex-seats plugin](https://github.com/FlatPaper/codex-seats), which owns the runtime and its `codex-seat` skill. Keep flatpaper-stack's agent prompts in `skills/flatpaper-mode/codex-agents/` and its seat policy in `skills/flatpaper-mode/references/spawning.md`.

In skill prose, name only the role as "the `<role>` role". To change a bundled default, edit `models.json`, then run `node scripts/stamp-models.mjs` to update the models.md template in `setup-flatpaper-stack`.

`node --test tests/*.test.mjs` runs `stamp-models.mjs --check`. The check rejects unknown role references, leftover printed defaults, and a stale setup template. It also validates the catalog.

## Upstream sync

`scripts/sync.mjs` moves the pin in `sync/upstream.json` to a newer cursor/plugins commit. It maps upstream files through `sync/substitutions.json`, writes clean updates, and keeps the forks in `sync/forks.json`.

```bash
node scripts/sync.mjs <rev> --dry-run
node scripts/sync.mjs <rev>
node --test tests/*.test.mjs
```

| Exit | Meaning |
|---|---|
| 0 | Tree updated |
| 1 | Tree updated; the report lists follow-ups, such as a new upstream skill to review |
| 2 | Nothing written; the pin is unchanged |

To fix what the report names:

- A mechanical difference: add a rule to `substitutions.json`.
- A deliberate difference: add a `forks.json` entry with its `why`.
- A conflict: make the local file take upstream's change, then rerun with `--resolved <path>`.

`--remote <path>` reads a local clone instead of cloning. `FLATPAPER_UPSTREAM=<clone>` turns on the real-tree and replay tests.

### Change the config without moving the pin

After you edit `sync/upstream.json`, `sync/substitutions.json`, or `models.json`, run `node scripts/sync.mjs <pin-sha>` before you commit. The report header says `config changed`. Commit the config and the written files together.

After the config is committed, a file the sync would still write at the pin blocks the run as `at-pin-write`.
