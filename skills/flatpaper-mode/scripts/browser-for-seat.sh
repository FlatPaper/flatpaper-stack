#!/usr/bin/env bash
if [ "$#" -ne 2 ] || { [ "$1" != start ] && [ "$1" != stop ]; }; then
  printf '%s\n' 'Usage: browser-for-seat.sh <start|stop> <dir>' >&2
  exit 2
fi

chrome=
if [ "$1" = start ]; then
  if [ -n "${CODEX_SANDBOX:-}" ]; then
    printf '%s\n' 'error: refusing to launch Chrome inside a Codex sandbox; run start from the session and pass the port to the seat' >&2
    exit 1
  fi
  if [ "${CHROME+x}" = x ]; then
    chrome=$CHROME
  elif [ -x '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' ]; then
    chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  else
    for candidate in google-chrome chromium chromium-browser; do
      chrome=$(command -v "$candidate") && break
    done
  fi
  if [ -z "$chrome" ] || [ ! -x "$chrome" ] || [ -d "$chrome" ]; then
    printf '%s\n' 'error: no Chrome found; set CHROME to an executable path' >&2
    exit 1
  fi
fi

exec node - "$1" "$2" "$chrome" <<'NODE'
const { spawn } = require("node:child_process");
const { createHash, randomBytes } = require("node:crypto");
const { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { get } = require("node:http");
const { join, resolve } = require("node:path");

const [action, directory, chrome] = process.argv.slice(2);
const dir = resolve(directory);
const state = join(dir, "browser.env");
const profile = join(dir, "profile");
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

function locked() {
  try { lstatSync(join(profile, "SingletonLock")); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

function endpoint(port, browser) {
  if (!/^\d+$/.test(port ?? "") || Number(port) < 1 || Number(port) > 65535
      || !/^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(browser ?? "")) return;
  return { port: Number(port), browser, url: `ws://127.0.0.1:${Number(port)}${browser}` };
}

function version(port, signal, deadline) {
  return new Promise((done) => {
    const request = get(`http://127.0.0.1:${port}/json/version`, { signal }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 65536) request.destroy();
      });
      response.on("error", () => done(null));
      response.on("end", () => {
        try { done(response.statusCode === 200 ? JSON.parse(body).webSocketDebuggerUrl ?? null : null); }
        catch { done(null); }
      });
    });
    const timer = setTimeout(() => request.destroy(), Math.max(1, Math.min(250, deadline - Date.now())));
    request.once("close", () => clearTimeout(timer));
    request.on("error", () => done(null));
  });
}

function closeBrowser(target, signal, deadline) {
  if (signal?.aborted || Date.now() >= deadline) return Promise.resolve();
  return new Promise((done) => {
    const key = randomBytes(16).toString("base64");
    let socket;
    let settled = false;
    const request = get(`http://127.0.0.1:${target.port}${target.browser}`, {
      signal,
      headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": key },
    });
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      socket?.destroy();
      request.destroy();
      done();
    };
    const timer = setTimeout(finish, Math.max(1, Math.min(500, deadline - Date.now())));
    signal?.addEventListener("abort", finish, { once: true });
    request.on("error", finish);
    request.on("response", (response) => { response.destroy(); finish(); });
    request.on("upgrade", (response, connection) => {
      socket = connection;
      socket.on("error", finish);
      socket.on("close", finish);
      const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
      if (settled || response.statusCode !== 101 || response.headers["sec-websocket-accept"] !== accept) {
        socket.destroy();
        finish();
        return;
      }
      const body = Buffer.from(JSON.stringify({ id: 1, method: "Browser.close" }));
      const mask = randomBytes(4);
      const frame = Buffer.alloc(6 + body.length);
      frame[0] = 0x81;
      frame[1] = 0x80 | body.length;
      mask.copy(frame, 2);
      for (let i = 0; i < body.length; i++) frame[6 + i] = body[i] ^ mask[i % 4];
      socket.write(frame, finish);
    });
  });
}

function removeState() {
  rmSync(profile, { recursive: true, force: true });
  rmSync(state, { force: true });
}

async function main() {
  let interrupted = false;
  const cancellation = new AbortController();
  const onSignal = () => { interrupted = true; cancellation.abort(); };
  const checkInterrupted = () => { if (interrupted) throw new Error(`browser ${action} interrupted`); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  let record;
  let child;
  let exited = false;
  let target;
  let timeout;
  try {
    timeout = Number(process.env.BROWSER_FOR_SEAT_TIMEOUT_MS ?? 15000);
    if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("invalid BROWSER_FOR_SEAT_TIMEOUT_MS");
    const deadline = Date.now() + timeout;
    if (action === "stop") {
      const uncertain = () => { throw new Error(`a Chrome may still be running on ${profile}; state kept in ${dir}`); };
      if (existsSync(state)) {
        const text = readFileSync(state, "utf8");
        if (text === "") throw new Error(`${dir} has an unfinished start; remove it by hand once its Chrome has exited`);
        target = endpoint(/^PORT=(.*)$/m.exec(text)?.[1], /^BROWSER=(.*)$/m.exec(text)?.[1]);
        if (!target) throw new Error(`invalid browser.env; state kept in ${dir}`);
        const answer = await version(target.port, cancellation.signal, deadline);
        checkInterrupted();
        if (target && answer === target.url) {
          await closeBrowser(target, cancellation.signal, deadline);
          while (Date.now() < deadline) {
            const answer = await version(target.port, cancellation.signal, deadline);
            checkInterrupted();
            if (answer === null && !locked()) { removeState(); return; }
            await pause(Math.min(50, Math.max(1, deadline - Date.now())));
          }
          uncertain();
        }
      }
      checkInterrupted();
      if (locked()) uncertain();
      removeState();
      return;
    }

    if (locked()) throw new Error(`${profile} is locked by a running Chrome; run stop first`);
    mkdirSync(dir, { recursive: true });
    try { record = openSync(state, "wx", 0o600); }
    catch (error) {
      if (error.code === "EEXIST") throw new Error("browser.env already exists; stop this directory before starting again");
      throw error;
    }
    checkInterrupted();
    mkdirSync(profile, { recursive: true });
    const activePort = join(profile, "DevToolsActivePort");
    rmSync(activePort, { force: true });
    const log = openSync(join(dir, "browser.log"), "a", 0o600);
    try {
      child = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`],
        { detached: true, stdio: ["ignore", log, log] });
    } finally { closeSync(log); }
    let launchError;
    child.on("exit", () => { exited = true; });
    child.on("error", (error) => { launchError = error; if (!child.pid) exited = true; });
    while (Date.now() < deadline) {
      checkInterrupted();
      if (launchError || exited) throw new Error("Chrome exited before DevTools was ready; see browser.log");
      let candidate;
      try { candidate = endpoint(...readFileSync(activePort, "utf8").split("\n")); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (candidate) {
        const answer = await version(candidate.port, cancellation.signal, deadline);
        if (answer === candidate.url) target = candidate;
        checkInterrupted();
        if (target && !exited) {
          writeFileSync(record, `PORT=${target.port}\nBROWSER=${target.browser}\n`);
          checkInterrupted();
          console.log(`port=${target.port}`);
          child.unref();
          return;
        }
      }
      await pause(Math.min(50, Math.max(1, deadline - Date.now())));
    }
    throw new Error(`Chrome DevTools did not answer within ${timeout} milliseconds; see browser.log`);
  } catch (error) {
    if (action === "start" && record !== undefined) {
      if (child && !exited && child.exitCode === null) {
        const deadline = Date.now() + timeout;
        if (target) await closeBrowser(target, undefined, deadline);
        else child.kill("SIGTERM");
        const escalation = Date.now() + Math.max(0, deadline - Date.now()) * 0.8;
        while (!exited && child.exitCode === null && Date.now() < escalation) await pause(25);
        if (!exited && child.exitCode === null) child.kill("SIGKILL");
        while (!exited && child.exitCode === null && Date.now() < deadline) await pause(25);
      }
      if (child && !exited && child.exitCode === null) {
        child.unref();
        throw new Error(`${error.message}; could not confirm Chrome exited; state kept in ${dir}`);
      }
      removeState();
    }
    throw error;
  } finally {
    if (record !== undefined) closeSync(record);
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
}

main().catch((error) => {
  console.error(`error: ${error.message.replace(/[\r\n]+/g, " ")}`);
  process.exitCode = 1;
});
NODE
