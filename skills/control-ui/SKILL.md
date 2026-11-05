---
name: control-ui
description: Drive and inspect a local web, IDE, or Electron UI in headless Chrome over CDP with a zero-dependency script. Takes screenshots, reads the DOM, captures console messages and exceptions, waits for an element with a timeout, and diffs two screenshots pixel by pixel. Use when a step must check a UI on the real surface and no verify-<app> skill exists, or for UI screenshots, visual diffs, or reproducing a UI bug.
---

# Control UI

Drive a local UI and keep evidence of what it did. If the project has a `verify-<app>` skill, follow it instead. This skill is the fallback driver, and a recipe for that skill's Drive section.

Reuse the repo's own harness first: Playwright or Cypress specs, Storybook, browser scripts, or an Electron launch script. It already knows the app's startup and markers. If none fits, use `${CLAUDE_PLUGIN_ROOT}/skills/control-ui/scripts/cdp.mjs`, which drives one page of headless Chrome over raw CDP. Do not add Playwright or any other package to the project for a probe unless the user asks.

## What it is for

- Reproduce UI bugs that depend on real focus, keyboard input, scrolling, resizing, or rendering.
- Check visual and accessibility changes with screenshots and DOM reads.
- Check local web, IDE, or Electron behavior before a PR.
- Capture console messages, exceptions, network logs, CPU profiles, traces, or heap snapshots.
- Keep before and after evidence for a `verify-<app>` run or a PR.

## Setup

1. Start the app with the repo's documented dev command.
2. Look for a harness the repo already has.
3. For a web app, point at its local URL.
4. For Electron or another Chromium app, launch it with `--remote-debugging-port=<port>` and attach with `--port`.
5. Pick the page by a stable app marker, not by tab order.
6. Prefer roles, labels, and stable `data-*` selectors over coordinates.

## cdp.mjs

It needs Node 22 or later and a local Chrome or Chromium. Set `CHROME` to a browser binary to choose one. Without `--port`, it launches headless Chrome with a temp profile under `$TMPDIR`. It kills that Chrome and removes the profile on every exit, including a failed step and a signal. Write the output files to the session scratchpad.

```bash
cdp="${CLAUDE_PLUGIN_ROOT}/skills/control-ui/scripts/cdp.mjs"
node "$cdp" http://127.0.0.1:<port> --wait-for '[data-testid=app]' \
  --screenshot "$OUT/before.png" --console "$OUT/console.txt"
node "$cdp" page.html --dom 'main h1'
node "$cdp" page.html --dom 'form' --html
node "$cdp" page.html --eval 'document.title'
node "$cdp" --port <debug-port> --match '<app-root-selector>' --screenshot "$OUT/app.png"
node "$cdp" diff "$OUT/before.png" "$OUT/after.png" --out "$OUT/diff.png"
```

- The steps run in this order: open, `--wait-for`, `--eval`, `--dom`, `--screenshot`. `--console` is written last, even when a step fails.
- `--wait-for <css>` polls until the element exists. After `--timeout <ms>` (default 10000) it exits 124 and names the selector.
- `--dom <css>` prints the `innerText` of each match, or the `outerHTML` with `--html`. No match exits 1.
- `--console <file>` gets one line per console call (`log: ...`, `error: ...`), browser log entry, and uncaught exception (`exception: ...`).
- `--eval <js>` prints the value. A thrown error exits 1.
- `--viewport <W>x<H>` sets the page size (default 1280x800, scale 1). `--full` captures the whole page.
- `--port <n>` attaches to a running browser and leaves it running. It picks the first page that matches `--match <css>`, or opens the URL in a new tab and closes the tab after. With no matching page, it lists each page's title and URL and exits 1.
- `diff` decodes both PNGs on a canvas in headless Chrome and prints `<n> of <total> pixels differ`. It exits 0 only when no pixel differs. A size mismatch prints both sizes and exits 1. `--out` writes the changed pixels in red over a faded copy of the first image.

## Interaction loop

1. Take a screenshot or a DOM read before you act.
2. Choose the target from that latest read.
3. Do exactly one structural action: a click, typing, a key press, a drag, a scroll, a navigation, or a resize.
4. Take a fresh screenshot or DOM read.
5. Check that the expected state change happened.
6. Keep the before and after files when the user asked for proof.

Run each action with `--eval` (for example `document.querySelector('[data-testid=save]').click()`) and a `--wait-for` on the state it should produce. Every run of `cdp.mjs` starts a fresh browser, so a multi-step flow goes in one `--eval`, or attaches to a long-running browser with `--port`.

## CDP capabilities

Use raw CDP only when the page's own APIs and `cdp.mjs` are not enough. Attach to a browser started with `--remote-debugging-port`, read `webSocketDebuggerUrl` from `http://127.0.0.1:<port>/json/version`, and send the domain methods over a WebSocket, as `cdp.mjs` does.

- Performance: CPU profiles and traces (`Profiler`, `Tracing`), paint flashing, the FPS meter, and layout shifts (`Overlay`, `PerformanceTimeline`).
- Memory: heap snapshots and forced GC for leak checks (`HeapProfiler`).
- Network: request blocking, throttling, cache disabling, and request and response logs (`Network`).
- Rendering: viewport changes, color scheme and reduced motion emulation (`Emulation`), and accessibility trees (`Accessibility`).
- Debugging: console streaming, exception capture, and DOM snapshots (`Runtime`, `Log`, `DOMSnapshot`).

## Page selection

When several windows or tabs share one debug port:

- Select by a positive marker for the surface under test, such as an app root selector.
- Add a negative marker when you must avoid a similar surface.
- If no page matches, list the page titles and URLs instead of guessing. `cdp.mjs --match` does this.

## Guardrails

- Do not reuse an element reference after a navigation or a structural change. Query again.
- Click by coordinates only right after a fresh screenshot.
- Keep test data local and disposable.
- Do not keep screenshots or heap snapshots from a privacy-sensitive workspace unless the user agrees.
- Do not hard-code selectors, ports, or script paths from another repository. Find the current repo's app markers.
- Stop the dev servers, debug sessions, and browsers you started, and remove their temp profiles. A Chrome process left running is a bug.

For a CLI or TUI, use the `control-cli` skill.

<!-- ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 skills/control-ui/SKILL.md (MIT) -->
