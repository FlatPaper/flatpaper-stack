#!/usr/bin/env node
// Drive one page of headless Chrome over raw CDP. Zero dependencies, Node 22+.
//
//   cdp.mjs <url|file> [--wait-for <css>] [--timeout <ms>] [--eval <js>]
//           [--dom <css> [--html]] [--screenshot <png> [--full]]
//           [--console <file>] [--viewport <WxH>]
//   cdp.mjs --port <n> [--match <css>] [<url>] [same flags]
//   cdp.mjs diff <a.png> <b.png> [--out <diff.png>]
//
// Steps run in this order: open, wait-for, eval, dom, screenshot. Without
// --port it launches Chrome ($CHROME overrides the search) with a temp
// profile and always kills it. With --port it attaches to a running browser,
// picks the page that matches --match (or opens <url> in a new tab), and
// leaves the browser running.
//
// Exit codes: 0 ok, 1 failed step or diff found differences, 2 usage or
// launch error, 124 --wait-for timed out.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

class Exit extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function parseArgs(argv) {
  const opts = { timeout: 10000, viewport: [1280, 800], positional: [] };
  const valued = {
    "--wait-for": "waitFor", "--timeout": "timeout", "--eval": "eval", "--dom": "dom",
    "--screenshot": "screenshot", "--console": "console", "--viewport": "viewport",
    "--port": "port", "--match": "match", "--out": "out",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--html") opts.html = true;
    else if (a === "--full") opts.full = true;
    else if (valued[a]) {
      if (i + 1 >= argv.length) throw new Exit(2, `${a} needs a value`);
      opts[valued[a]] = argv[++i];
    } else if (a.startsWith("--")) throw new Exit(2, `unknown option ${a}`);
    else opts.positional.push(a);
  }
  opts.timeout = Number(opts.timeout);
  if (!(opts.timeout > 0)) throw new Exit(2, "--timeout must be a positive number of ms");
  if (typeof opts.viewport === "string") {
    const m = /^(\d+)x(\d+)$/.exec(opts.viewport);
    if (!m) throw new Exit(2, "--viewport must look like 1280x800");
    opts.viewport = [Number(m[1]), Number(m[2])];
  }
  return opts;
}

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const dir of (process.env.PATH || "").split(":")) {
    for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]) {
      candidates.push(join(dir, name));
    }
  }
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Exit(2, "no Chrome or Chromium found; set CHROME to its binary");
  return found;
}

async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), "cdp-profile-"));
  const proc = spawn(findChrome(), [
    "--headless=new", `--user-data-dir=${profile}`, "--remote-debugging-port=0",
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
    "--mute-audio", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => { stderr += d; });
  const exited = new Promise((r) => proc.once("exit", r));
  const chrome = { proc, profile, exited };
  running.add(chrome);
  const portFile = join(profile, "DevToolsActivePort");
  const deadline = Date.now() + 15000;
  while (!existsSync(portFile) || readFileSync(portFile, "utf8").split("\n").length < 2) {
    if (proc.exitCode !== null || Date.now() > deadline) {
      await killChrome(chrome);
      throw new Exit(2, `Chrome did not start: ${stderr.trim().split("\n").slice(-3).join(" | ")}`);
    }
    await sleep(50);
  }
  const [port, path] = readFileSync(portFile, "utf8").split("\n");
  chrome.ws = `ws://127.0.0.1:${port}${path}`;
  return chrome;
}

const running = new Set();
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]]) {
  process.on(signal, () => {
    for (const c of running) {
      c.proc.kill("SIGKILL");
      rmSync(c.profile, { recursive: true, force: true });
    }
    process.exit(code);
  });
}

async function killChrome(chrome) {
  running.delete(chrome);
  if (chrome.proc.exitCode === null && chrome.proc.signalCode === null) {
    chrome.proc.kill("SIGTERM");
    const gone = await Promise.race([chrome.exited.then(() => true), sleep(3000).then(() => false)]);
    if (!gone) {
      chrome.proc.kill("SIGKILL");
      await chrome.exited;
    }
  }
  for (let i = 0; i < 20; i++) {
    try {
      rmSync(chrome.profile, { recursive: true, force: true });
      return;
    } catch {
      await sleep(100);
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = () => rej(new Exit(2, `cannot connect to ${url}`));
    });
    return new Cdp(ws);
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Exit(1, `${msg.error.message}`));
        else res(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    };
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }

  once(method, sessionId, ms) {
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Exit(1, `timed out after ${ms}ms waiting for ${method}`)), ms);
      const fn = (msg) => {
        if (msg.method === method && msg.sessionId === sessionId) {
          clearTimeout(timer);
          this.listeners = this.listeners.filter((f) => f !== fn);
          res(msg.params);
        }
      };
      this.listeners.push(fn);
    });
  }

  close() {
    this.ws.close();
  }
}

async function evaluate(cdp, session, expression) {
  const r = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, session);
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Exit(1, `eval threw: ${d.exception?.description || d.text}`);
  }
  return r.result.value;
}

function toUrl(target) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  if (existsSync(target)) return pathToFileURL(resolve(target)).href;
  throw new Exit(2, `not a URL or an existing file: ${target}`);
}

async function pickPage(cdp, match) {
  const { targetInfos } = await cdp.send("Target.getTargets");
  const pages = targetInfos.filter((t) => t.type === "page");
  for (const page of pages) {
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
    const hit = !match || (await evaluate(cdp, sessionId, `!!document.querySelector(${JSON.stringify(match)})`));
    if (hit) return { sessionId };
    await cdp.send("Target.detachFromTarget", { sessionId });
  }
  const list = pages.map((p) => `  ${p.title} ${p.url}`).join("\n");
  throw new Exit(1, `no page matches ${match || "(any)"}; pages:\n${list}`);
}

async function drive(opts) {
  const target = opts.positional[0];
  if (!opts.port && !target) throw new Exit(2, "usage: cdp.mjs <url|file> [flags], or cdp.mjs --port <n> [--match <css>]");
  let chrome;
  let cdp;
  let created;
  const log = [];
  try {
    let wsUrl;
    if (opts.port) {
      const res = await fetch(`http://127.0.0.1:${opts.port}/json/version`).catch(() => null);
      if (!res?.ok) throw new Exit(2, `no browser listening on port ${opts.port}`);
      wsUrl = (await res.json()).webSocketDebuggerUrl;
    } else {
      chrome = await launchChrome();
      wsUrl = chrome.ws;
    }
    cdp = await Cdp.connect(wsUrl);

    let session;
    if (opts.port && !target) {
      ({ sessionId: session } = await pickPage(cdp, opts.match));
    } else {
      ({ targetId: created } = await cdp.send("Target.createTarget", { url: "about:blank" }));
      ({ sessionId: session } = await cdp.send("Target.attachToTarget", { targetId: created, flatten: true }));
    }

    cdp.listeners.push((msg) => {
      if (msg.sessionId !== session) return;
      if (msg.method === "Runtime.consoleAPICalled") {
        const text = msg.params.args.map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(" ");
        log.push(`${msg.params.type}: ${text}`);
      } else if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        log.push(`exception: ${d.exception?.description || d.text}`);
      } else if (msg.method === "Log.entryAdded") {
        log.push(`${msg.params.entry.level}: ${msg.params.entry.text}`);
      }
    });
    await cdp.send("Page.enable", {}, session);
    await cdp.send("Runtime.enable", {}, session);
    await cdp.send("Log.enable", {}, session);
    const [width, height] = opts.viewport;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, session);

    if (target) {
      const loaded = cdp.once("Page.loadEventFired", session, opts.timeout);
      const nav = await cdp.send("Page.navigate", { url: toUrl(target) }, session);
      if (nav.errorText) throw new Exit(1, `navigation failed: ${nav.errorText}`);
      await loaded;
    }

    if (opts.waitFor) {
      const probe = `!!document.querySelector(${JSON.stringify(opts.waitFor)})`;
      const deadline = Date.now() + opts.timeout;
      while (!(await evaluate(cdp, session, probe))) {
        if (Date.now() > deadline) throw new Exit(124, `timed out after ${opts.timeout}ms waiting for ${opts.waitFor}`);
        await sleep(100);
      }
    }

    if (opts.eval) {
      const value = await evaluate(cdp, session, opts.eval);
      if (value !== undefined) console.log(typeof value === "string" ? value : JSON.stringify(value));
    }

    if (opts.dom) {
      const prop = opts.html ? "outerHTML" : "innerText";
      const found = await evaluate(cdp, session,
        `[...document.querySelectorAll(${JSON.stringify(opts.dom)})].map((e) => e.${prop})`);
      if (!found.length) throw new Exit(1, `no element matches ${opts.dom}`);
      console.log(found.join("\n"));
    }

    if (opts.screenshot) {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!opts.full }, session);
      writeFileSync(opts.screenshot, Buffer.from(data, "base64"));
    }
  } finally {
    if (opts.console) writeFileSync(opts.console, log.map((l) => l + "\n").join(""));
    if (cdp && created && opts.port) await cdp.send("Target.closeTarget", { targetId: created }).catch(() => {});
    cdp?.close();
    if (chrome) await killChrome(chrome);
  }
}

const COMPARE = `async (a, b, wantOut) => {
  const load = (src) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("not a decodable image"));
    img.src = "data:image/png;base64," + src;
  });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  if (ia.naturalWidth !== ib.naturalWidth || ia.naturalHeight !== ib.naturalHeight) {
    return { size: [ia.naturalWidth, ia.naturalHeight, ib.naturalWidth, ib.naturalHeight] };
  }
  const w = ia.naturalWidth, h = ia.naturalHeight;
  const pixels = (img) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { colorSpace: "srgb" });
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, w, h).data;
  };
  const pa = pixels(ia), pb = pixels(ib);
  const out = new ImageData(w, h);
  let differ = 0;
  for (let i = 0; i < pa.length; i += 4) {
    const same = pa[i] === pb[i] && pa[i + 1] === pb[i + 1] && pa[i + 2] === pb[i + 2] && pa[i + 3] === pb[i + 3];
    if (!same) differ++;
    const grey = (pa[i] + pa[i + 1] + pa[i + 2]) / 12 + 191;
    out.data.set(same ? [grey, grey, grey, 255] : [255, 0, 0, 255], i);
  }
  let png;
  if (wantOut) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").putImageData(out, 0, 0);
    png = c.toDataURL("image/png").split(",")[1];
  }
  return { differ, total: w * h, png };
}`;

async function diff(opts) {
  const [a, b] = opts.positional.slice(1);
  if (!a || !b) throw new Exit(2, "usage: cdp.mjs diff <a.png> <b.png> [--out <diff.png>]");
  const [da, db] = [a, b].map((p) => {
    if (!existsSync(p)) throw new Exit(2, `no such file: ${p}`);
    return readFileSync(p).toString("base64");
  });
  const chrome = await launchChrome();
  let cdp;
  try {
    cdp = await Cdp.connect(chrome.ws);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const r = await evaluate(cdp, sessionId,
      `(${COMPARE})(${JSON.stringify(da)}, ${JSON.stringify(db)}, ${!!opts.out})`);
    if (r.size) {
      const [aw, ah, bw, bh] = r.size;
      console.log(`size differs: ${aw}x${ah} vs ${bw}x${bh}`);
      return 1;
    }
    if (opts.out) writeFileSync(opts.out, Buffer.from(r.png, "base64"));
    console.log(`${r.differ} of ${r.total} pixels differ`);
    return r.differ === 0 ? 0 : 1;
  } finally {
    cdp?.close();
    await killChrome(chrome);
  }
}

async function main() {
  if (typeof WebSocket === "undefined") throw new Exit(2, `needs Node 22+ for the global WebSocket, have ${process.version}`);
  const opts = parseArgs(process.argv.slice(2));
  if (opts.positional[0] === "diff") return diff(opts);
  await drive(opts);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`cdp: ${err.message}`);
    process.exit(err instanceof Exit ? err.code : 1);
  },
);

// ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 skills/control-ui/SKILL.md (MIT)
