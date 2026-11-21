import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer, get } from "node:http";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "skills/flatpaper-mode/scripts/browser-for-seat.sh");
const fixtures = new Map();
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
  const children = new Set();
  fixtures.set(dir, children);
  t.after(async () => {
    let result;
    let survivors = [];
    const cleanupErrors = [];
    try {
      result = await runAsync("stop", dir, { ...hostEnv(), BROWSER_FOR_SEAT_TIMEOUT_MS: "300" });
    } finally {
      try {
        const marker = join(dir, "child-pid");
        if (existsSync(marker)) pids.add(Number(readFileSync(marker, "utf8")));
        survivors = [...pids].filter((pid) => {
          try { process.kill(pid, 0); return true; }
          catch (error) {
            if (error.code === "ESRCH") return false;
            cleanupErrors.push(error);
            return true;
          }
        });
        for (const child of children) {
          if (child.exitCode === null && child.signalCode === null) {
            const closed = once(child, "close");
            try { child.kill("SIGKILL"); }
            catch (error) { cleanupErrors.push(error); }
            await closed;
          }
        }
        for (const pid of survivors) {
          try { process.kill(pid, "SIGKILL"); }
          catch (error) { if (error.code !== "ESRCH") cleanupErrors.push(error); }
        }
      } finally {
        fixtures.delete(dir);
        rmSync(dir, { recursive: true, force: true });
      }
    }
    assert.deepEqual(cleanupErrors, []);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(survivors, [], "stop left test browsers running");
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
  assert.match(duplicate.stderr, /is locked by a running Chrome; run stop first/);
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

for (const state of [false, true]) test(`start refuses a locked profile without changing state, browser.env=${state}`, (t) => {
  const { dir, run } = fixture(t);
  const profile = join(dir, "profile");
  mkdirSync(profile);
  symlinkSync("host-123", join(profile, "SingletonLock"));
  writeFileSync(join(profile, "DevToolsActivePort"), "existing port");
  writeFileSync(join(profile, "keep"), "existing profile");
  if (state) writeFileSync(join(dir, "browser.env"), "PORT=1\nBROWSER=/devtools/browser/ours\n");
  const chrome = join(dir, "chrome");
  writeFileSync(chrome, `#!/bin/bash\necho launched > "${dir}/launched"\nexit 7\n`, { mode: 0o755 });
  try {
    const result = run("start", { ...hostEnv(), CHROME: chrome });
    assert.equal(result.status, 1);
    assert.equal(result.stderr, `error: ${profile} is locked by a running Chrome; run stop first\n`);
    assert.equal(existsSync(join(dir, "launched")), false);
    assert.equal(readFileSync(join(profile, "keep"), "utf8"), "existing profile");
    assert.equal(readFileSync(join(profile, "DevToolsActivePort"), "utf8"), "existing port");
    assert.equal(existsSync(join(dir, "browser.env")), state);
    if (state) assert.equal(readFileSync(join(dir, "browser.env"), "utf8"), "PORT=1\nBROWSER=/devtools/browser/ours\n");
  } finally { rmSync(join(profile, "SingletonLock"), { force: true }); }
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
writeFileSync(${JSON.stringify(join(dir, "child-pid"))}, String(process.pid));
setTimeout(() => process.exit(0), 5000);
const profile = process.argv.find((arg) => arg.startsWith("--user-data-dir=")).slice(16);
const port = Number(process.argv.find((arg) => arg.startsWith("--remote-debugging-port=")).split("=")[1]);
symlinkSync("fake-" + process.pid, join(profile, "SingletonLock"));
process.on("exit", () => rmSync(join(profile, "SingletonLock"), { force: true }));
${body}
`, { mode: 0o755 });
  return path;
}

function startAsync(dir, chrome, extra = {}) {
  const launched = join(dir, "launch");
  const exited = join(dir, "exited");
  const signals = join(dir, "signals");
  const adapter = join(dir, "launch.cjs");
  writeFileSync(adapter, `
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
require("node:child_process").spawn = () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.kill = (signal) => {
    fs.appendFileSync(${JSON.stringify(signals)}, signal + "\\n");
    return false;
  };
  const timer = setInterval(() => {
    if (fs.existsSync(${JSON.stringify(exited)})) {
      child.exitCode = 0;
      clearInterval(timer);
      child.emit("exit", 0);
    }
  }, 5);
  child.unref = () => clearInterval(timer);
  fs.writeFileSync(${JSON.stringify(launched)}, "yes");
  return child;
};
`);
  const fake = spawn(process.execPath, ["-e", `
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(join(dir, "child-pid"))}, String(process.pid));
setTimeout(() => process.exit(0), 5000);
const timer = setInterval(() => {
  if (!fs.existsSync(${JSON.stringify(launched)})) return;
  clearInterval(timer);
  require(${JSON.stringify(chrome)});
}, 5);
`, "--", `--user-data-dir=${join(dir, "profile")}`, "--remote-debugging-port=0"]);
  fixtures.get(dir).add(fake);
  const polling = setInterval(() => {
    if (!existsSync(signals)) return;
    const pending = readFileSync(signals, "utf8").trim().split("\n");
    rmSync(signals, { force: true });
    for (const signal of pending) {
      if (signal === "SIGKILL" && extra.DENY_SIGKILL) continue;
      fake.kill(signal);
    }
  }, 5);
  fake.once("exit", () => {
    clearInterval(polling);
    if (existsSync(dir)) writeFileSync(exited, "yes");
  });
  const child = spawn("/bin/bash", [script, "start", dir], {
    env: { ...hostEnv(), CHROME: chrome, ...extra, NODE_OPTIONS: `--require=${adapter}` }, stdio: ["ignore", "pipe", "pipe"],
  });
  fixtures.get(dir).add(child);
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
  const unrelated = spawn("/bin/bash", ["-c", 'exec -a "$1" sleep 2', "seat-test", `--user-data-dir=${join(dir, "profile")}`]);
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

test("start failure keeps state when child termination cannot be confirmed", async (t) => {
  const { dir, record } = fixture(t);
  const chrome = fakeChrome(dir, `
process.on("SIGTERM", () => {});
setTimeout(() => process.exit(0), 1500);
`);
  const { result } = startAsync(dir, chrome, { BROWSER_FOR_SEAT_TIMEOUT_MS: "150", DENY_SIGKILL: "1" });
  await waitFor(() => existsSync(join(dir, "child-pid")));
  const pid = Number(readFileSync(join(dir, "child-pid"), "utf8"));
  record(pid);
  const start = await result;
  assert.notEqual(start.status, 0);
  assert.ok(start.stderr.includes(`state kept in ${dir}`), start.stderr);
  assert.doesNotThrow(() => process.kill(pid, 0));
  assert.ok(existsSync(join(dir, "browser.env")) || existsSync(join(dir, "profile")));
  await waitFor(() => existsSync(join(dir, "exited")));
  assert.equal((await runAsync("stop", dir)).status, 0);
  assert.equal(existsSync(join(dir, "profile")), false);
  assert.equal(existsSync(join(dir, "browser.env")), false);
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

function devToolsChrome(dir) {
  return fakeChrome(dir, `
const server = require("node:http").createServer((req, res) => res.end(JSON.stringify({
  webSocketDebuggerUrl: "ws://127.0.0.1:" + server.address().port + "/devtools/browser/test",
})));
server.on("upgrade", (req, socket) => {
  if (req.url !== "/devtools/browser/test") { socket.destroy(); return; }
  const accept = require("node:crypto").createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: " + accept + "\\r\\n\\r\\n");
  let pending = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    if (pending.length < 2) return;
    if (!(pending[0] & 128) || (pending[0] & 15) !== 1 || !(pending[1] & 128)) { socket.destroy(); return; }
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
}

test("starts and stops a fake DevTools browser with Chrome choosing its port", async (t) => {
  const { dir, run, record } = fixture(t);
  const chrome = devToolsChrome(dir);
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
  assert.equal((await runAsync("stop", dir)).status, 0);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  assert.equal(existsSync(join(dir, "browser.env")), false);
  assert.equal(existsSync(join(dir, "profile")), false);
  assert.equal((await runAsync("stop", dir)).status, 0);
});

for (const invalid of ["unmasked", "fragmented", "binary", "wrong-path"]) test(`a ${invalid} request does not close the fake browser`, async (t) => {
  const { dir } = fixture(t);
  const { result } = startAsync(dir, devToolsChrome(dir));
  const start = await result;
  assert.equal(start.status, 0, start.stderr);
  const port = Number(start.stdout.trim().slice(5));
  const pid = Number(readFileSync(join(dir, "child-pid"), "utf8"));
  await new Promise((resolve, reject) => {
    const request = get(`http://127.0.0.1:${port}/devtools/browser/${invalid === "wrong-path" ? "other" : "test"}`, { headers: {
      Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
    } });
    request.setTimeout(1000, () => request.destroy(new Error("fake did not reject request")));
    request.on("socket", (socket) => {
      if (invalid === "wrong-path") socket.on("close", resolve);
    });
    request.on("error", (error) => { if (invalid !== "wrong-path") reject(error); });
    request.on("upgrade", (response, socket) => {
      socket.on("error", reject);
      socket.on("close", resolve);
      const body = Buffer.from(JSON.stringify({ id: 1, method: "Browser.close" }));
      socket.end(Buffer.concat([Buffer.from([invalid === "fragmented" ? 0x01 : invalid === "binary" ? 0x82 : 0x81, body.length | (invalid === "unmasked" ? 0 : 0x80), 0, 0, 0, 0]), body]));
    });
  });
  assert.doesNotThrow(() => process.kill(pid, 0));
  assert.equal((await fetch(`http://127.0.0.1:${port}/json/version`)).status, 200);
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

  mkdirSync(join(dir, "profile"));
  symlinkSync("host-123", join(dir, "profile", "SingletonLock"));
  writeFileSync(join(dir, "browser.env"), `PORT=${server.address().port}\nBROWSER=/devtools/browser/ours\n`);
  try {
    const result = await runAsync("stop", dir, { ...hostEnv(), BROWSER_FOR_SEAT_TIMEOUT_MS: "200" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /a Chrome may still be running/);
    assert.equal(existsSync(join(dir, "browser.env")), true);
    assert.equal(existsSync(join(dir, "profile")), true);
  } finally {
    rmSync(join(dir, "profile", "SingletonLock"), { force: true });
    for (const socket of sockets) socket.destroy();
    await new Promise((done) => server.close(done));
  }
});
