import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "skills/flatpaper-mode/scripts/browser-for-seat.sh");
const psAvailable = spawnSync("ps", ["-o", "command=", "-p", String(process.pid)]).status === 0;

function fixtureEnv(dir, env = hostEnv()) {
  return psAvailable ? env : { ...env, PATH: `${dir}:${env.PATH ?? ""}` };
}

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
  if (!psAvailable) {
    t.diagnostic("ps is sandbox-blocked; using command snapshots written by test children");
    writeFileSync(join(dir, "ps"), `#!${process.execPath}
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const assert = require("node:assert/strict");
assert.deepEqual(process.argv.slice(2, 5), ["-o", "command=", "-p"]);
try {
  const pid = Number(process.argv[5]);
  process.kill(pid, 0);
  console.log(readFileSync(join(__dirname, pid + ".command"), "utf8"));
} catch { process.exitCode = 1; }
`, { mode: 0o755 });
  }
  const pids = new Set();
  t.after(() => {
    const result = spawnSync("/bin/bash", [script, "stop", dir], { env: fixtureEnv(dir), encoding: "utf8", timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    rmSync(dir, { recursive: true, force: true });
  });
  const run = (action, env = hostEnv()) => {
    const result = spawnSync("/bin/bash", [script, action, dir], { env: fixtureEnv(dir, env), encoding: "utf8", timeout: 25000 });
    assert.ifError(result.error);
    return result;
  };
  return { dir, run, record: (pid) => pids.add(pid) };
}

test("starts Chrome, serves DevTools on the printed port, refuses a second start, and stops cleanly", {
  skip: process.env.CODEX_SANDBOX ? "CODEX_SANDBOX is set; Chrome cannot launch inside a Codex sandbox"
    : !psAvailable ? "ps command inspection is unavailable" : chromeAvailable() ? false : "no Chrome executable found on this machine",
  timeout: 60000,
}, async (t) => {
  const { dir, run, record } = fixture(t);
  const start = run("start");
  assert.equal(start.status, 0, start.stderr);
  assert.match(start.stdout, /^port=\d+\n$/);
  const port = Number(start.stdout.trim().slice("port=".length));
  const state = readFileSync(join(dir, "browser.env"), "utf8");
  assert.match(state, new RegExp(`^PORT=${port}\\nPID=\\d+\\n$`));
  const pid = Number(/^PID=(\d+)$/m.exec(state)[1]);
  record(pid);
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

async function waitFor(check) {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await pause(10);
  }
  assert.fail("condition did not become true");
}

function fakeChrome(dir, body) {
  const path = join(dir, "chrome");
  writeFileSync(path, `#!${process.execPath}
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const profile = process.argv.find((arg) => arg.startsWith("--user-data-dir=")).slice(16);
const port = Number(process.argv.find((arg) => arg.startsWith("--remote-debugging-port=")).split("=")[1]);
writeFileSync(join(profile, "..", "child-pid"), String(process.pid));
writeFileSync(join(profile, "..", process.pid + ".command"), process.argv.join(" "));
${body}
`, { mode: 0o755 });
  return path;
}

function startAsync(dir, chrome, extra = {}) {
  const child = spawn("/bin/bash", [script, "start", dir], {
    env: fixtureEnv(dir, { ...hostEnv(), CHROME: chrome, ...extra }), stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => { stdout += data; });
  child.stderr.on("data", (data) => { stderr += data; });
  const result = once(child, "close").then(([status, signal]) => ({ status, signal, stdout, stderr }));
  return { child, result };
}

test("stop preserves an unrelated process when the recorded PID was recycled", async (t) => {
  const { dir, run } = fixture(t);
  const unrelated = spawn("sleep", ["30"]);
  const closed = once(unrelated, "close");
  writeFileSync(join(dir, unrelated.pid + ".command"), "sleep 30");
  try {
    writeFileSync(join(dir, "browser.env"), `PORT=12345\nPID=${unrelated.pid}\n`);
    mkdirSync(join(dir, "profile"));
    assert.equal(run("stop").status, 0);
    assert.doesNotThrow(() => process.kill(unrelated.pid, 0));
    assert.equal(existsSync(join(dir, "browser.env")), false);
    assert.equal(existsSync(join(dir, "profile")), false);
  } finally {
    unrelated.kill("SIGKILL");
    await closed;
  }
});

test("SIGTERM during a pending readiness response fails start and cleans up", async (t) => {
  const { dir, record } = fixture(t);
  const marker = join(dir, "request");
  const chrome = fakeChrome(dir, `
const server = require("node:http").createServer((req, res) => {
  writeFileSync(${JSON.stringify(marker)}, "ready");
  setTimeout(() => res.end(JSON.stringify({webSocketDebuggerUrl: "ws://127.0.0.1:" + server.address().port + "/devtools/browser/test"})), 150);
});
server.listen(port, "127.0.0.1", () => writeFileSync(join(profile, "DevToolsActivePort"), String(server.address().port) + "\\n/devtools/browser/test"));
`);
  const { child, result } = startAsync(dir, chrome);
  await waitFor(() => existsSync(marker));
  const pid = Number(readFileSync(join(dir, "child-pid"), "utf8"));
  record(pid);
  child.kill("SIGTERM");
  const start = await result;
  assert.notEqual(start.status, 0, JSON.stringify(start));
  assert.equal(start.stdout, "");
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  assert.equal(existsSync(join(dir, "browser.env")), false);
  assert.equal(existsSync(join(dir, "profile")), false);
});

test("readiness rejects a foreign HTTP server returning an empty object", { timeout: 10000 }, async (t) => {
  const { dir, record } = fixture(t);
  const foreign = createServer((req, res) => res.end("{}"));
  await new Promise((done) => foreign.listen(0, "127.0.0.1", done));
  t.after(() => new Promise((done) => foreign.close(done)));
  const chrome = fakeChrome(dir, `
writeFileSync(join(profile, "DevToolsActivePort"), "${foreign.address().port}\\n/devtools/browser/foreign");
if (port) require("node:http").createServer((req, res) => res.end("{}")).listen(port, "127.0.0.1");
setInterval(() => {}, 1000);
`);
  const { result } = startAsync(dir, chrome, { BROWSER_FOR_SEAT_TIMEOUT_MS: "400" });
  const start = await result;
  const pid = Number(readFileSync(join(dir, "child-pid"), "utf8"));
  record(pid);
  assert.notEqual(start.status, 0, JSON.stringify(start));
  assert.equal(start.stdout, "");
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  assert.equal(existsSync(join(dir, "browser.env")), false);
  assert.equal(existsSync(join(dir, "profile")), false);
});

test("starts and stops a fake DevTools browser with Chrome choosing its port", async (t) => {
  const { dir, run, record } = fixture(t);
  const chrome = fakeChrome(dir, `
const server = require("node:http").createServer((req, res) => res.end(JSON.stringify({
  webSocketDebuggerUrl: "ws://127.0.0.1:" + server.address().port + "/devtools/browser/test",
})));
server.listen(port, "127.0.0.1", () => writeFileSync(join(profile, "DevToolsActivePort"), String(server.address().port) + "\\n/devtools/browser/test"));
`);
  const { result } = startAsync(dir, chrome);
  const start = await result;
  const pid = Number(readFileSync(join(dir, "child-pid"), "utf8"));
  record(pid);
  assert.equal(start.status, 0, start.stderr);
  assert.match(start.stdout, /^port=\d+\n$/);
  const port = Number(start.stdout.trim().slice(5));
  assert.equal(readFileSync(join(dir, "browser.env"), "utf8"), `PORT=${port}\nPID=${pid}\n`);
  assert.equal(Number(readFileSync(join(dir, "profile", "DevToolsActivePort"), "utf8").split("\n")[0]), port);
  const duplicate = run("start", { ...hostEnv(), CHROME: chrome });
  assert.notEqual(duplicate.status, 0);
  assert.equal(readFileSync(join(dir, "browser.env"), "utf8"), `PORT=${port}\nPID=${pid}\n`);
  assert.equal(run("stop").status, 0);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  assert.equal(existsSync(join(dir, "browser.env")), false);
  assert.equal(existsSync(join(dir, "profile")), false);
  assert.equal(run("stop").status, 0);
});
