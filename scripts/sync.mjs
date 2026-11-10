#!/usr/bin/env node
// Adapted from pstack-claude's tools/sync.mjs (MIT, Michael Denyer).
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CatalogError, parseCatalog } from "./stamp-models.mjs";
import * as core from "./sync-core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_DIRS = ["skills", "agents"];
const USAGE = [
  "usage: node scripts/sync.mjs <rev> [--dry-run] [--remote <url|path>] [--resolved <path>]...   move the pin to <rev>",
  "       node scripts/sync.mjs --dry-run [--remote <url|path>]           check the tree at the pin",
  "       node scripts/sync.mjs --check-rules [--remote <url|path>]       check rules, allow lists, renames, and excludes",
].join("\n");

function git(cwd, args, { input, env } = {}) {
  const r = spawnSync("git", ["-C", cwd, ...args], { input, env: env ? { ...process.env, ...env } : process.env, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr?.toString().trim() || r.error?.message}`);
  return r.stdout;
}

function parseArgs(argv) {
  const args = { dryRun: false, checkRules: false, rev: null, remote: null, resolved: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--check-rules") args.checkRules = true;
    else if (a === "--remote" && argv[i + 1]) args.remote = argv[++i];
    else if (a === "--resolved" && argv[i + 1]) args.resolved.push(argv[++i]);
    else if (!a.startsWith("-") && args.rev === null) args.rev = a;
    else return `unexpected argument \`${a}\`\n${USAGE}`;
  }
  if (args.checkRules && (args.dryRun || args.rev)) return `--check-rules takes no rev and no --dry-run\n${USAGE}`;
  if (!args.checkRules && !args.dryRun && !args.rev) return `a real run needs a <rev>; preview the pin with --dry-run\n${USAGE}`;
  return args;
}

export function loadConfig(root) {
  const read = (path) => readFileSync(join(root, path), "utf8");
  const problems = [];
  const attempt = (fn) => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof CatalogError) problems.push(...e.problems.map((p) => `models.json: ${p}`));
      else if (e instanceof core.ConfigError) problems.push(...e.problems);
      else if (e.code === "ENOENT") problems.push(`missing ${e.path.slice(root.length + 1)}`);
      else throw e;
    }
  };
  const catalog = attempt(() => parseCatalog(read("models.json")));
  const upstream = attempt(() => core.parseUpstream(read("sync/upstream.json")));
  const subs = catalog && attempt(() => core.parseSubstitutions(read("sync/substitutions.json"), catalog));
  const forks = attempt(() => core.parseForks(read("sync/forks.json")));
  const version = attempt(() => JSON.parse(read(".claude-plugin/plugin.json")).version);
  if (problems.length) throw new core.ConfigError(problems);
  return { upstream, subs, catalog, forks, version };
}

export function openUpstream(remote) {
  let dir = remote;
  let scratch = null;
  if (!existsSync(remote)) {
    scratch = mkdtempSync(join(tmpdir(), "flatpaper-upstream-"));
    dir = join(scratch, "upstream.git");
    git(scratch, ["clone", "--bare", "--quiet", "--filter=blob:none", remote, dir]);
  }
  return {
    resolve(rev) {
      const r = spawnSync("git", ["-C", dir, "rev-parse", "--verify", "--quiet", `${rev}^{commit}`], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(`cannot resolve \`${rev}\` to a commit in ${remote}`);
      return r.stdout.trim();
    },
    rawTree(sha, upstream) {
      const listing = git(dir, ["ls-tree", "-r", "-z", "--full-tree", sha, "--", ...upstream.sources.map((s) => s.from)]).toString();
      const items = listing.split("\0").filter(Boolean).map((line) => {
        const [meta, path] = [line.slice(0, line.indexOf("\t")), line.slice(line.indexOf("\t") + 1)];
        const [mode, type, oid] = meta.split(" ");
        return { mode, type, oid, path };
      }).filter((i) => i.type === "blob");
      const bytes = readBlobs(dir, [...new Set(items.map((i) => i.oid))]);
      return new Map(items.map((i) => [i.path, i.mode === "120000" ? { kind: "symlink", target: bytes.get(i.oid).toString("utf8") } : core.toBlob(bytes.get(i.oid), i.mode === "100755")]));
    },
    close() {
      if (scratch) rmSync(scratch, { recursive: true, force: true });
    },
  };
}

function readBlobs(dir, oids) {
  const check = git(dir, ["cat-file", "--batch-check"], { input: oids.join("\n") + "\n", env: { GIT_NO_LAZY_FETCH: "1" } }).toString();
  const missing = check.split("\n").filter((l) => l.endsWith(" missing")).map((l) => l.split(" ")[0]);
  if (missing.length) {
    // One batched fetch instead of git's per-object lazy fetch, which takes minutes on a blob:none clone.
    const promisors = spawnSync("git", ["-C", dir, "config", "--get-regexp", "^remote\\..*\\.promisor$"], { encoding: "utf8" }).stdout;
    const remoteName = promisors.split("\n").find((l) => l.endsWith(" true"))?.split(" ")[0].slice("remote.".length, -".promisor".length) ?? "origin";
    git(dir, ["-c", "fetch.negotiationAlgorithm=noop", "fetch", "--quiet", "--no-tags", "--no-write-fetch-head", "--recurse-submodules=no", "--filter=blob:none", "--stdin", remoteName], { input: missing.join("\n") + "\n" });
  }
  const out = git(dir, ["cat-file", "--batch"], { input: oids.join("\n") + "\n" });
  const blobs = new Map();
  for (let at = 0; at < out.length;) {
    const nl = out.indexOf(10, at);
    const [oid, , size] = out.subarray(at, nl).toString().split(" ");
    blobs.set(oid, out.subarray(nl + 1, nl + 1 + Number(size)));
    at = nl + 1 + Number(size) + 1;
  }
  return blobs;
}

function listed(root, dirs) {
  return [...new Set(git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...dirs]).toString().split("\0").filter(Boolean))].sort();
}

function readLocal(root, dirs = LOCAL_DIRS) {
  const tree = new Map();
  for (const path of listed(root, dirs)) {
    const file = join(root, path);
    const stat = lstatSync(file, { throwIfNoEntry: false });
    if (!stat || stat.isDirectory()) continue;
    tree.set(path, stat.isSymbolicLink() ? { kind: "symlink", target: readlinkSync(file) } : core.toBlob(readFileSync(file), (stat.mode & 0o100) !== 0));
  }
  return tree;
}

function dirtyProblems(root) {
  const dirty = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...LOCAL_DIRS, "sync"]).toString().split("\0").filter(Boolean);
  if (!dirty.length) return [];
  return [{ kind: "dirty", say: `${dirty.length} uncommitted change(s) under skills/, agents/, or sync/ (first: ${dirty[0].slice(3)}); commit them before a real run, so a crash is undone with git checkout.` }];
}

export function merge3(local, base, upstream) {
  const scratch = mkdtempSync(join(tmpdir(), "flatpaper-merge-"));
  try {
    const files = Object.entries({ local, base, upstream }).map(([name, text]) => {
      writeFileSync(join(scratch, name), text);
      return join(scratch, name);
    });
    const r = spawnSync("git", ["merge-file", "-p", "--diff3", "-L", "local", "-L", "base", "-L", "upstream", ...files], { encoding: "utf8", maxBuffer: 1 << 28 });
    if (r.status === null || r.status > 127) throw new Error(`git merge-file failed: ${r.stderr || r.error?.message}`);
    return { text: r.stdout, conflicts: r.status };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function pruneEmpty(root, dir) {
  while (dir.includes("/") && existsSync(join(root, dir)) && readdirSync(join(root, dir)).length === 0) {
    rmdirSync(join(root, dir));
    dir = dirname(dir);
  }
}

function apply(root, plan) {
  for (const e of core.writes(plan)) {
    if (!LOCAL_DIRS.some((d) => e.path.startsWith(`${d}/`))) throw new Error(`refusing to write ${e.path}, outside ${LOCAL_DIRS.join(" and ")}`);
    const file = join(root, e.path);
    if (e.write === "delete") {
      unlinkSync(file);
      pruneEmpty(root, dirname(e.path));
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    const held = lstatSync(file, { throwIfNoEntry: false });
    writeFileSync(file, core.blobBytes(e.write), { mode: e.write.exec ? 0o777 : 0o666 });
    const bits = (held?.mode ?? lstatSync(file).mode) & 0o777;
    if (Boolean(bits & 0o100) !== e.write.exec) chmodSync(file, e.write.exec ? bits | ((bits & 0o444) >> 2) : bits & ~0o111);
  }
  if (plan.atPin) return;
  const path = join(root, "sync/upstream.json");
  const text = readFileSync(path, "utf8");
  if (text.split(plan.pin).length !== 2) throw new Error(`sync/upstream.json must name the pin ${plan.pin} exactly once`);
  writeFileSync(path, text.replace(plan.pin, plan.target));
}

function main(argv) {
  const args = parseArgs(argv);
  if (typeof args === "string") {
    console.error(args);
    return 2;
  }
  let config;
  try {
    config = loadConfig(ROOT);
  } catch (e) {
    if (!(e instanceof core.ConfigError)) throw e;
    console.error(e.problems.join("\n"));
    return 2;
  }
  let up;
  try {
    up = openUpstream(args.remote ?? config.upstream.remote);
    const { pin } = config.upstream;
    if (args.checkRules) {
      const findings = core.checkRules(config, up.rawTree(pin, config.upstream), readLocal(ROOT));
      console.log(findings.length ? findings.map((f) => `${f.kind.padEnd(16)} ${f.say}`).join("\n") : `ok: ${config.subs.rules.length} rules, every allow entry, rename, and exclude match at the pin`);
      return findings.length ? 2 : 0;
    }
    const target = args.rev ? up.resolve(args.rev) : pin;
    const old = core.deriveTree(config, up.rawTree(pin, config.upstream));
    const neu = target === pin ? old : core.deriveTree(config, up.rawTree(target, config.upstream));
    const plan = core.plan({
      config,
      forks: config.forks,
      oldTree: old.tree,
      newTree: neu.tree,
      localTree: readLocal(ROOT),
      stampOnly: readLocal(ROOT, ["hooks"]),
      target,
      version: config.version,
      merge3,
      resolved: args.resolved,
      preProblems: [...neu.problems, ...(args.dryRun ? [] : dirtyProblems(ROOT))],
    });
    process.stdout.write(core.renderReport(plan, { dryRun: args.dryRun }));
    if (args.dryRun) for (const p of dirtyProblems(ROOT)) console.log(`note: a real run would stop here: ${p.say}`);
    if (!args.dryRun && !core.blocked(plan)) apply(ROOT, plan);
    return core.exitCode(plan);
  } catch (e) {
    console.error(e.message);
    return 2;
  } finally {
    up?.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exitCode = main(process.argv.slice(2));
