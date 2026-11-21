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
const { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { get } = require("node:http");
const { createServer } = require("node:net");
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

async function terminate(pid) {
  if (!alive(pid)) return;
  const signal = (name) => {
    try { process.kill(pid, name); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  signal("SIGTERM");
  for (let i = 0; i < 50 && alive(pid); i++) await pause(100);
  if (alive(pid)) signal("SIGKILL");
  for (let i = 0; i < 10 && alive(pid); i++) await pause(100);
  if (alive(pid)) throw new Error("Chrome did not stop");
}

function versionAnswers(port) {
  return new Promise((done) => {
    const request = get(`http://127.0.0.1:${port}/json/version`, (response) => {
      response.resume();
      done(response.statusCode === 200);
    });
    request.setTimeout(250, () => request.destroy());
    request.on("error", () => done(false));
  });
}

async function freePort() {
  const server = createServer();
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  await new Promise((done, fail) => server.close((error) => error ? fail(error) : done()));
  return port;
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

  mkdirSync(dir, { recursive: true });
  let record;
  try { record = openSync(state, "wx", 0o600); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("browser.env already exists; stop this directory before starting again");
    throw error;
  }
  let child;
  let interrupted = false;
  const onSignal = () => { interrupted = true; };
  try {
    mkdirSync(profile, { recursive: true });
    const port = await freePort();
    const log = openSync(join(dir, "browser.log"), "a", 0o600);
    try {
      child = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`],
        { detached: true, stdio: ["ignore", log, log] });
    } finally { closeSync(log); }
    let launchError;
    child.on("error", (error) => { launchError = error; });
    child.unref();
    if (child.pid) writeFileSync(record, `PORT=${port}\nPID=${child.pid}\n`);
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (interrupted) throw new Error("browser start interrupted");
      if (launchError || child.exitCode !== null || child.signalCode !== null) throw new Error("Chrome exited before DevTools was ready; see browser.log");
      if (await versionAnswers(port)) {
        console.log(`port=${port}`);
        return;
      }
      await pause(100);
    }
    throw new Error("Chrome DevTools did not answer within 15 seconds; see browser.log");
  } catch (error) {
    if (child?.pid) await terminate(child.pid);
    rmSync(profile, { recursive: true, force: true });
    rmSync(state, { force: true });
    throw error;
  } finally {
    closeSync(record);
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
}

main().catch((error) => {
  console.error(`error: ${error.message.replace(/[\r\n]+/g, " ")}`);
  process.exitCode = 1;
});
NODE
