# Maintaining flatpaper-stack

## Model defaults

Role defaults live only in `models.json`. `node scripts/stamp-models.mjs` copies them into the skills and the models.md template in `setup-flatpaper-stack`. Don't edit those copies by hand.

In skill prose, write a default as "the `<role>` role (default `<value>`)". The script stamps only that shape.

`node --test tests/*.test.mjs` runs `stamp-models.mjs --check`. It fails on a stale copy, or on "default `<value>`" outside that shape. It can't see a default in plain words, such as "the parent model", so review has to catch those.

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
