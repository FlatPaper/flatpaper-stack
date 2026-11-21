import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
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
  const pids = new Set();
  t.after(async () => {
    const result = spawnSync("/bin/bash", [script, "stop", dir], { env: hostEnv(), encoding: "utf8", timeout: 20000 });
    const survivors = [...pids].filter((pid) => {
      try { process.kill(pid, 0); return true; }
      catch (error) { if (error.code === "ESRCH") return false; throw error; }
    });
    for (const pid of survivors) process.kill(pid, "SIGKILL");
    if (survivors.length) await waitFor(() => survivors.every((pid) => {
      try { process.kill(pid, 0); return false; }
      catch (error) { if (error.code === "ESRCH") return true; throw error; }
    }));
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(survivors, [], "stop left test browsers running");
    rmSync(dir, { recursive: true, force: true });
  });
  const run = (action, env = hostEnv()) => {
    const result = spawnSync("/bin/bash", [script, action, dir], { env, encoding: "utf8", timeout: 25000 });
    assert.ifError(result.error);
    return result;
  };
  return { dir, run, record: (pid) => pids.add(pid) };
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
  assert.equal(state, `PORT=${port}\nBROWSER=${readFileSync(join(dir, "profile", "DevToolsActivePort"), "utf8").split("\n")[1]}\n`);
  assert.ok(existsSync(join(dir, "profile")));
  const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).webSocketDebuggerUrl, `ws://127.0.0.1:${port}${/^BROWSER=(.+)$/m.exec(state)[1]}`);
  const duplicate = run("start");
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /stop this directory before starting again/);
  assert.equal(readFileSync(join(dir, "browser.env"), "utf8"), state);
  assert.equal(run("stop").status, 0);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) }));
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
  writeFileSync(join(dir, "browser.env"), `PORT=1\nBROWSER=/devtools/browser/stale\n`);
  mkdirSync(join(dir, "profile"));
  assert.equal(run("stop").status, 0);
  assert.equal(existsSync(join(dir, "browser.env")), false);
  assert.equal(existsSync(join(dir, "profile")), false);
  assert.equal(run("stop").status, 0);
});

async function waitFor(check) {
  for (let i = 0; i < 1000; i++) {
    if (check()) return;
    await pause(10);
  }
  assert.fail("condition did not become true");
}

function fakeChrome(dir, body) {
  const path = join(dir, "chrome");
  writeFileSync(path, `#!${process.execPath}
const { writeFileSync, symlinkSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const profile = process.argv.find((arg) => arg.startsWith("--user-data-dir=")).slice(16);
const port = Number(process.argv.find((arg) => arg.startsWith("--remote-debugging-port=")).split("=")[1]);
writeFileSync(join(profile, "..", "child-pid"), String(process.pid));
symlinkSync("fake-" + process.pid, join(profile, "SingletonLock"));
process.on("exit", () => rmSync(join(profile, "SingletonLock"), { force: true }));
${body}
`, { mode: 0o755 });
  return path;
}

function startAsync(dir, chrome, extra = {}) {
  const child = spawn("/bin/bash", [script, "start", dir], {
    env: { ...hostEnv(), CHROME: chrome, ...extra }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => { stdout += data; });
  child.stderr.on("data", (data) => { stderr += data; });
  const result = once(child, "close").then(([status, signal]) => ({ status, signal, stdout, stderr }));
  return { child, result };
}

test("stop never signals an unrelated process whose argv contains the profile", async (t) => {
  const { dir } = fixture(t);
  const foreign = createServer((req, res) => res.end(JSON.stringify({ webSocketDebuggerUrl: "ws://127.0.0.1/foreign" })));
  await new Promise((done) => foreign.listen(0, "127.0.0.1", done));
  t.after(() => new Promise((done) => foreign.close(done)));
  const unrelated = spawn("/bin/bash", ["-c", 'exec -a "$1" sleep 30', "seat-test", `--user-data-dir=${join(dir, "profile")}`]);
  const closed = once(unrelated, "close");
  try {
    mkdirSync(join(dir, "profile"));
    writeFileSync(join(dir, "browser.env"), `PORT=${foreign.address().port}\nBROWSER=/devtools/browser/ours\n`);
    const result = await runAsync("stop", dir);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotThrow(() => process.kill(unrelated.pid, 0));
    assert.equal(existsSync(join(dir, "browser.env")), false);
    assert.equal(existsSync(join(dir, "profile")), false);
  } finally {
    unrelated.kill("SIGKILL");
    await closed;
  }
});

for (const state of [true, false]) test(`stop keeps uncertain state with SingletonLock, browser.env=${state}`, async (t) => {
  const { dir } = fixture(t);
  mkdirSync(join(dir, "profile"));
  symlinkSync("host-123", join(dir, "profile", "SingletonLock"));
  if (state) writeFileSync(join(dir, "browser.env"), "PORT=1\nBROWSER=/devtools/browser/ours\n");
  try {
    const result = await runAsync("stop", dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /a Chrome may still be running on .*[/]profile/);
    assert.equal(existsSync(join(dir, "browser.env")), state);
    assert.equal(existsSync(join(dir, "profile")), true);
  } finally { rmSync(join(dir, "profile", "SingletonLock"), { force: true }); }
});

function runAsync(action, dir, env = hostEnv()) {
  const child = spawn("/bin/bash", [script, action, dir], { env });
  let stdout = "", stderr = "";
  child.stdout.on("data", (data) => { stdout += data; });
  child.stderr.on("data", (data) => { stderr += data; });
  return once(child, "close").then(([status]) => ({ status, stdout, stderr }));
}

test("start failure retains state until its child exits after SIGTERM", async (t) => {
  const { dir, record } = fixture(t);
  const chrome = fakeChrome(dir, `
process.on("SIGTERM", () => { writeFileSync(join(profile, "..", "terminating"), "yes"); setTimeout(() => process.exit(0), 2000); });
setInterval(() => {}, 1000);
`);
  const { result } = startAsync(dir, chrome, { BROWSER_FOR_SEAT_TIMEOUT_MS: "3000" });
  await waitFor(() => existsSync(join(dir, "child-pid")));
  record(Number(readFileSync(join(dir, "child-pid"), "utf8")));
  await waitFor(() => existsSync(join(dir, "terminating")));
  await pause(1000);
  assert.equal(existsSync(join(dir, "browser.env")), true);
  assert.equal(existsSync(join(dir, "profile")), true);
  assert.notEqual((await result).status, 0);
  assert.equal(existsSync(join(dir, "browser.env")), false);
  assert.equal(existsSync(join(dir, "profile")), false);
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

test("readiness rejects a foreign browser ID", { timeout: 10000 }, async (t) => {
  const { dir, record } = fixture(t);
  const foreign = createServer((req, res) => res.end(JSON.stringify({ webSocketDebuggerUrl: "ws://127.0.0.1:" + foreign.address().port + "/devtools/browser/other" })));
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
server.on("upgrade", (req, socket) => {
  const accept = require("node:crypto").createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: " + accept + "\\r\\n\\r\\n");
  let pending = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    if (pending.length < 6) return;
    const length = pending[1] & 127;
    if (length > 125 || pending.length < length + 6) return;
    const body = Buffer.from(pending.subarray(6, length + 6));
    for (let i = 0; i < body.length; i++) body[i] ^= pending[2 + i % 4];
    if (JSON.parse(body.toString()).method === "Browser.close") process.exit(0);
  });
});
server.listen(port, "127.0.0.1", () => writeFileSync(join(profile, "DevToolsActivePort"), String(server.address().port) + "\\n/devtools/browser/test"));
`);
  const { result } = startAsync(dir, chrome);
  const start = await result;
  const pid = Number(readFileSync(join(dir, "child-pid"), "utf8"));
  record(pid);
  assert.equal(start.status, 0, start.stderr);
  assert.match(start.stdout, /^port=\d+\n$/);
  const port = Number(start.stdout.trim().slice(5));
  assert.equal(readFileSync(join(dir, "browser.env"), "utf8"), `PORT=${port}\nBROWSER=/devtools/browser/test\n`);
  assert.equal(Number(readFileSync(join(dir, "profile", "DevToolsActivePort"), "utf8").split("\n")[0]), port);
  const duplicate = run("start", { ...hostEnv(), CHROME: chrome });
  assert.notEqual(duplicate.status, 0);
  assert.equal(readFileSync(join(dir, "browser.env"), "utf8"), `PORT=${port}\nBROWSER=/devtools/browser/test\n`);
  assert.equal(run("stop").status, 0);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  assert.equal(existsSync(join(dir, "browser.env")), false);
  assert.equal(existsSync(join(dir, "profile")), false);
  assert.equal(run("stop").status, 0);
});

for (const response of ["different", "ours", "ours-open"]) test(`stop keeps state when ${response} browser answers and SingletonLock remains`, { timeout: 3000 }, async (t) => {
  const { dir } = fixture(t);
  const sockets = new Set();
  const server = createServer((req, res) => res.end(JSON.stringify({
    webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/browser/${response === "different" ? "different" : "ours"}`,
  })));
  server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  server.on("upgrade", (req, socket) => {
    if (response !== "ours-open") return;
    const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
    socket.on("data", () => {});
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => { for (const socket of sockets) socket.destroy(); server.close(); });
  mkdirSync(join(dir, "profile"));
  symlinkSync("host-123", join(dir, "profile", "SingletonLock"));
  writeFileSync(join(dir, "browser.env"), `PORT=${server.address().port}\nBROWSER=/devtools/browser/ours\n`);
  try {
    const result = await runAsync("stop", dir, { ...hostEnv(), BROWSER_FOR_SEAT_TIMEOUT_MS: "200" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /a Chrome may still be running/);
    assert.equal(existsSync(join(dir, "browser.env")), true);
    assert.equal(existsSync(join(dir, "profile")), true);
  } finally { rmSync(join(dir, "profile", "SingletonLock"), { force: true }); }
});
