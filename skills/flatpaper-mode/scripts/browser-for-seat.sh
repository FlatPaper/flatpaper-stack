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
const { execFileSync, spawn } = require("node:child_process");
const { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { get } = require("node:http");
const { join, resolve } = require("node:path");

const [action, directory, chrome] = process.argv.slice(2);
const dir = resolve(directory);
const state = join(dir, "browser.env");
const profile = join(dir, "profile");
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}

function ownsProcess(pid) {
  let command;
  try { command = execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch (error) { if (error.status === 1) return false; throw error; }
  const argument = `--user-data-dir=${profile}`;
  const index = command.indexOf(argument);
  return index >= 0 && (index === 0 || /\s/.test(command[index - 1]))
    && (index + argument.length === command.length || /\s/.test(command[index + argument.length]));
}

async function terminate(pid) {
  const signal = (name) => {
    if (!ownsProcess(pid)) return false;
    try { process.kill(pid, name); return true; }
    catch (error) { if (error.code !== "ESRCH") throw error; return false; }
  };
  if (!signal("SIGTERM")) return;
  for (let i = 0; i < 50 && alive(pid); i++) await pause(100);
  if (alive(pid) && !signal("SIGKILL")) return;
  for (let i = 0; i < 10 && alive(pid); i++) await pause(100);
  if (alive(pid) && ownsProcess(pid)) throw new Error("Chrome did not stop");
}

function versionAnswers(port, signal) {
  return new Promise((done) => {
    const request = get(`http://127.0.0.1:${port}/json/version`, { signal }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("error", () => done(false));
      response.on("end", () => {
        try {
          const url = JSON.parse(body).webSocketDebuggerUrl;
          done(response.statusCode === 200 && typeof url === "string" && url.startsWith(`ws://127.0.0.1:${port}/`));
        } catch { done(false); }
      });
    });
    const timer = setTimeout(() => request.destroy(), 250);
    request.once("close", () => clearTimeout(timer));
    request.on("error", () => done(false));
  });
}

async function main() {
  if (action === "stop") {
    if (existsSync(state)) {
      const text = readFileSync(state, "utf8");
      const pid = Number(/^PID=(\d+)$/m.exec(text)?.[1]);
      if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("invalid PID in browser.env");
      await terminate(pid);
      rmSync(state);
    }
    rmSync(profile, { recursive: true, force: true });
    return;
  }

  let record;
  let child;
  let interrupted = false;
  const cancellation = new AbortController();
  const onSignal = () => { interrupted = true; cancellation.abort(); };
  const checkInterrupted = () => { if (interrupted) throw new Error("browser start interrupted"); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
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
    child.on("error", (error) => { launchError = error; });
    child.unref();
    if (child.pid) writeFileSync(record, `PID=${child.pid}\n`);
    const timeout = Number(process.env.BROWSER_FOR_SEAT_TIMEOUT_MS ?? 15000);
    if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("invalid BROWSER_FOR_SEAT_TIMEOUT_MS");
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      checkInterrupted();
      if (launchError || child.exitCode !== null || child.signalCode !== null) throw new Error("Chrome exited before DevTools was ready; see browser.log");
      let port;
      if (existsSync(activePort)) {
        const line = readFileSync(activePort, "utf8").split("\n")[0];
        if (/^\d+$/.test(line) && Number(line) > 0 && Number(line) <= 65535) port = Number(line);
      }
      if (port) {
        const ready = await versionAnswers(port, cancellation.signal);
        checkInterrupted();
        if (ready && child.exitCode === null && child.signalCode === null && ownsProcess(child.pid)) {
          writeFileSync(state, `PORT=${port}\nPID=${child.pid}\n`, { mode: 0o600 });
          checkInterrupted();
          console.log(`port=${port}`);
          return;
        }
      }
      await pause(100);
      checkInterrupted();
    }
    throw new Error(`Chrome DevTools did not answer within ${timeout} milliseconds; see browser.log`);
  } catch (error) {
    if (record !== undefined) {
      try { if (child?.pid) await terminate(child.pid); }
      finally {
        rmSync(profile, { recursive: true, force: true });
        rmSync(state, { force: true });
      }
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
