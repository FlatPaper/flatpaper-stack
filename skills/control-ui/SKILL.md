---
name: control-ui
description: Drive and inspect a local web, IDE, or Electron UI in headless Chrome over CDP with a zero-dependency script. Takes screenshots, reads the DOM, captures console messages and exceptions, waits for an element with a timeout, and diffs two screenshots pixel by pixel. Use when a step must check a UI on the real surface and no verify-<app> skill exists, or for UI screenshots, visual diffs, or reproducing a UI bug.
---

# Control UI

Drive a local UI and keep evidence of what it did. If the project has a `verify-<app>` skill, follow it instead. This skill is the fallback driver, and a recipe for that skill's Drive section.

Reuse the repo's own harness first: Playwright or Cypress specs, Storybook, browser scripts, or an Electron launch script. It already knows the app's startup and markers. If none fits, use `${CLAUDE_PLUGIN_ROOT}/skills/control-ui/scripts/cdp.mjs`, which drives one page of headless Chrome over raw CDP. When `CLAUDE_PLUGIN_ROOT` is unset, as in a clone of this plugin, use the path from the clone's root, `skills/control-ui/scripts/cdp.mjs`. Do not add Playwright or any other package to the project for a probe unless the user asks.

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

It needs Node 22 or later and a local Chrome or Chromium. It looks for `/Applications/Google Chrome.app`, then `/Applications/Chromium.app`, then `google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser`, and `chrome` on `PATH`. Set `CHROME` to a browser binary to choose one, as a path or as a name on `PATH`. With no browser found, it prints `no Chrome or Chromium found; set CHROME to its binary` and exits 2. A `CHROME` path that does not exist, a `CHROME` name that is not on `PATH`, or a binary that cannot start also exits 2 and names the binary.

Without `--port`, it launches headless Chrome in a temp directory under `$TMPDIR`, in its own process group. It kills the group and removes the directory on every exit, including a failed step and a signal. Chrome on macOS ignores `TMPDIR`, so `cdp.mjs` also sets `MAC_CHROMIUM_TMPDIR` to keep Chrome's own temp files in that directory. The first start on a freshly booted machine reads Chrome from a cold disk and can take many seconds, so `cdp.mjs` waits up to 30 s for the debugging port and retries once, printing `cdp: ... retrying once` on stderr.

In these examples, `$OUT` is a directory you make for this run's files in the session scratchpad, for example `OUT=<scratchpad>/ui-<slug>; mkdir -p "$OUT"`. Run `node "$cdp" --help` for the full usage.

```bash
cdp="${CLAUDE_PLUGIN_ROOT}/skills/control-ui/scripts/cdp.mjs"
node "$cdp" http://127.0.0.1:<port> --wait-for '[data-testid=app]' \
  --screenshot "$OUT/before.png" --console "$OUT/console.txt"
node "$cdp" page.html --dom 'main h1'
node "$cdp" page.html --dom 'form' --html
node "$cdp" page.html --eval 'document.title'
node "$cdp" diff "$OUT/before.png" "$OUT/after.png" --out "$OUT/diff.png"
```

- The steps run in this order: open, `--eval`, `--wait-for`, `--dom`, `--screenshot`. `--console` is written last, even when a step fails.
- `--eval <js>` prints the value as text or JSON. It awaits a returned Promise, and it allows top-level `await`. A thrown error or a rejected Promise exits 1.
- `--wait-for <css>` polls until the element exists. After `--timeout` it exits 124 and names the selector.
- `--timeout <ms>` (default 10000) bounds each step and each CDP call, not the whole run. The page load, the browser connection, and the `--port` lookup each get it too. Every timeout exits 124 and names what it waited for. The Chrome start has its own 30 s deadline, retried once (up to 60 s), that `--timeout` does not shorten. It exits 2.
- `--dom <css>` prints the `innerText` of each match, or the `outerHTML` with `--html`. No match exits 1.
- `--console <file>` gets one line per console call, labeled with the method's type (`log:`, `info:`, `warning:`, `error:`, `debug:`). Browser log entries get their level (`verbose:`, `info:`, `warning:`, `error:`), so `error:` covers both `console.error` and entries such as a favicon 404. Uncaught exceptions get `exception:`.
- `--viewport <W>x<H>` sets the page size at scale 1. A launched browser defaults to 1280x800. `--full` captures the whole page.
- `diff` decodes both PNGs on a canvas in headless Chrome and prints `<n> of <total> pixels differ`. It has no tolerance: one changed channel value counts. It exits 0 only when no pixel differs. A size mismatch prints both sizes, writes no `--out`, and exits 1. Otherwise `--out` is always written, with changed pixels in red over a faded copy of the first image.
- Exit codes: 0 ok, 1 a failed step or a diff with differences, 2 a usage error, a launch error, or no browser on `--port`, 124 a timeout, and 129, 130, or 143 on SIGHUP, SIGINT, or SIGTERM.

## Attach to a running browser

`--port <n>` attaches to a browser started with `--remote-debugging-port=<n>` and leaves it running. It tries the pages in the order CDP's `Target.getTargets` returns them, which can differ from the order in `/json/list`, and picks the first one where `--match <css>` finds an element. Without `--match` it takes the first page in that order, so pass a marker whenever more than one page is open. With a URL, it opens the URL in a new tab instead and closes that tab after. With no matching page, it lists each page's title and URL and exits 1. It sets no viewport unless you pass `--viewport`, and an override applies to that page, the user's window included, for the rest of the run.

To start a browser by hand, give it its own directory, as `cdp.mjs` does, so its temp files stay out of the system temp directory. `$CHROME` is the browser binary: on macOS, `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, and on Linux, `google-chrome` or `chromium`. Headless Chrome opens only one URL from its command line ("Multiple targets are not supported in headless mode"), so open more tabs with `PUT /json/new` once the port answers:

```bash
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
mkdir -p "$OUT/chrome"
TMPDIR="$OUT/chrome" MAC_CHROMIUM_TMPDIR="$OUT/chrome" "$CHROME" --headless=new --remote-debugging-port=9222 \
  --user-data-dir="$OUT/chrome/profile" about:blank 2> "$OUT/chrome.log" &
chrome_pid=$!
for _ in $(seq 50); do curl -sf http://127.0.0.1:9222/json/version > /dev/null && break; sleep 0.2; done
curl -s -X PUT "http://127.0.0.1:9222/json/new?http://127.0.0.1:<port>/settings"
node "$cdp" --port 9222 --match '<app-root-selector>' --screenshot "$OUT/app.png"
kill "$chrome_pid"; wait "$chrome_pid"; rm -rf "$OUT/chrome"
```

## Interaction loop

1. Take a screenshot or a DOM read before you act.
2. Choose the target from that latest read.
3. Do exactly one structural action: a click, typing, a key press, a drag, a scroll, a navigation, or a resize.
4. Take a fresh screenshot or DOM read.
5. Check that the expected state change happened.
6. Keep the before and after files when the user asked for proof.

Do the action with `--eval` and wait for the state it should produce with `--wait-for`. `--eval` runs first, so this works in one call:

```bash
node "$cdp" "$URL" --screenshot "$OUT/before.png"
node "$cdp" "$URL" --eval 'document.querySelector("[data-testid=save]").click()' \
  --wait-for '[data-testid=saved]' --dom '[data-testid=saved]' \
  --screenshot "$OUT/after.png" --console "$OUT/console.txt"
```

The `--dom` read checks the new state, and `--console` keeps any errors the click caused.

To wait for the page before the action, await inside `--eval`:

```bash
--eval 'while (!document.querySelector("#app")) await new Promise((r) => setTimeout(r, 100));
  document.querySelector("#go").click()'
```

Every run of `cdp.mjs` without `--port` starts a fresh browser, so a multi-step flow goes in one `--eval`, or attaches to a long-running browser with `--port`.

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
- Add a negative marker when you must avoid a similar surface, for example `--match 'body:has(<app-root>):not(:has(<other-surface>))'`.
- If no page matches, list the page titles and URLs instead of guessing. `cdp.mjs --match` does this.

## Guardrails

- Do not reuse an element reference after a navigation or a structural change. Query again.
- Click by coordinates only right after a fresh screenshot.
- Keep test data local and disposable.
- Do not keep screenshots or heap snapshots from a privacy-sensitive workspace unless the user explicitly agrees.
- Do not hard-code selectors, ports, or script paths from another repository. Find the current repo's app markers.
- Stop the dev servers, debug sessions, and browsers you started, and remove their temp profiles. A Chrome process left running is a bug.

For a CLI or TUI, use the `control-cli` skill.

<!-- ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 skills/control-ui/SKILL.md (MIT) -->
