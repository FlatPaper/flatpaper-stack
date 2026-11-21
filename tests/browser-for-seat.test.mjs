import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "skills/flatpaper-mode/scripts/browser-for-seat.sh");

function chromeAvailable() {
  const candidates = process.env.CHROME !== undefined ? [process.env.CHROME] : [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ...(process.env.PATH ?? "").split(":").flatMap((dir) =>
      ["google-chrome", "chromium", "chromium-browser"].map((name) => join(dir, name))),
  ];
  return candidates.some((path) => {
    try { accessSync(path, constants.X_OK); return true; }
    catch { return false; }
  });
}

function hostEnv() {
  const env = { ...process.env };
  delete env.CODEX_SANDBOX;
  return env;
}

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "flatpaper-browser-seat-"));
  t.after(() => {
    spawnSync("/bin/bash", [script, "stop", dir], { encoding: "utf8", timeout: 10000 });
    rmSync(dir, { recursive: true, force: true });
  });
  const run = (action, env = hostEnv()) => {
    const result = spawnSync("/bin/bash", [script, action, dir], { env, encoding: "utf8", timeout: 25000 });
    assert.ifError(result.error);
    return result;
  };
  return { dir, run };
}

test("starts Chrome, serves DevTools on the printed port, refuses a second start, and stops cleanly", {
  skip: process.env.CODEX_SANDBOX ? "CODEX_SANDBOX is set; Chrome cannot launch inside a Codex sandbox"
    : chromeAvailable() ? false : "no Chrome executable found on this machine",
  timeout: 60000,
}, async (t) => {
  const { dir, run } = fixture(t);
  const start = run("start");
  assert.equal(start.status, 0, start.stderr);
  assert.match(start.stdout, /^port=\d+\n$/);
  const port = Number(start.stdout.trim().slice("port=".length));
  const state = readFileSync(join(dir, "browser.env"), "utf8");
  assert.match(state, new RegExp(`^PORT=${port}\\nPID=\\d+\\n$`));
  const pid = Number(/^PID=(\d+)$/m.exec(state)[1]);
  process.kill(pid, 0);
  assert.ok(existsSync(join(dir, "profile")));
  const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
  assert.equal(response.status, 200);
  assert.match((await response.json()).webSocketDebuggerUrl, /^ws:\/\//);
  const duplicate = run("start");
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /stop this directory before starting again/);
  assert.equal(readFileSync(join(dir, "browser.env"), "utf8"), state);
  assert.equal(run("stop").status, 0);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  assert.equal(existsSync(join(dir, "profile")), false);
  assert.equal(existsSync(join(dir, "browser.env")), false);
  assert.equal(run("stop").status, 0);
});

test("missing Chrome exits non-zero with one reason even with PATH cleared", (t) => {
  const { dir, run } = fixture(t);
  const result = run("start", { ...hostEnv(), CHROME: "/nonexistent", PATH: "" });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "error: no Chrome found; set CHROME to an executable path\n");
  assert.equal(existsSync(join(dir, "browser.env")), false);
});

test("start refuses inside a Codex sandbox without launching Chrome or writing state", (t) => {
  const { dir, run } = fixture(t);
  const marker = join(dir, "chrome-ran");
  const chrome = join(dir, "chrome");
  writeFileSync(chrome, `#!/bin/bash\ntouch "${marker}"\n`, { mode: 0o755 });
  const result = run("start", { ...hostEnv(), CODEX_SANDBOX: "seatbelt", CHROME: chrome });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "error: refusing to launch Chrome inside a Codex sandbox; run start from the session and pass the port to the seat\n");
  assert.equal(existsSync(join(dir, "browser.env")), false);
  assert.equal(existsSync(marker), false);
});

test("an early Chrome exit removes the process record and profile", (t) => {
  const { dir, run } = fixture(t);
  const chrome = join(dir, "chrome");
  writeFileSync(chrome, "#!/bin/bash\nexit 7\n", { mode: 0o755 });
  const result = run("start", { ...hostEnv(), CHROME: chrome });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /^error: Chrome exited before DevTools was ready; see browser.log\n$/);
  assert.equal(result.stdout, "");
  assert.equal(existsSync(join(dir, "browser.env")), false);
  assert.equal(existsSync(join(dir, "profile")), false);
});

test("stop removes a stale process record and profile and can run again", (t) => {
  const { dir, run } = fixture(t);
  const dead = spawnSync(process.execPath, ["-e", ""], { encoding: "utf8" });
  assert.ifError(dead.error);
  writeFileSync(join(dir, "browser.env"), `PORT=12345\nPID=${dead.pid}\n`);
  mkdirSync(join(dir, "profile"));
  assert.equal(run("stop").status, 0);
  assert.equal(existsSync(join(dir, "browser.env")), false);
  assert.equal(existsSync(join(dir, "profile")), false);
  assert.equal(run("stop").status, 0);
});
