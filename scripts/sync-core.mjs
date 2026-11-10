import { posix } from "node:path";
import { SCAN_DIRS, SPAWNING, checkRepo, stampDoc } from "./stamp-models.mjs";

export class ConfigError extends Error {
  constructor(problems) {
    super(problems.join("\n"));
    this.problems = problems;
  }
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const nonEmpty = (v) => typeof v === "string" && v !== "";
const LOCAL_ROOT = /^(skills|agents)(\/|$)/;
const isPlain = (p, { dir = false } = {}) => (dir && p.endsWith("/") ? p.slice(0, -1) : p).split("/").every((s) => s !== "" && s !== "." && s !== "..");
const isLocal = (p, opts) => isPlain(p, opts) && LOCAL_ROOT.test(p);
const notLocal = (where, p) => `${where}: \`${p}\` is not a plain path under skills/ or agents/`;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byKey = ([a], [b]) => cmp(a, b);
const reject = (problems, message) => {
  problems.push(message);
  return [];
};

function parseJson(jsonText, file) {
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    throw new ConfigError([`${file}: not valid JSON (${e.message})`]);
  }
}

function unknownKeys(obj, allowed, where, problems) {
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) problems.push(`${where} has unknown key \`${key}\``);
}

function records(json, key, fields, file, problems) {
  if (!Array.isArray(json[key])) {
    problems.push(`${file}: ${key} must be an array`);
    return [];
  }
  return json[key].flatMap((item, i) => {
    const where = `${file}: ${key}[${i}]`;
    if (!isObject(item)) return reject(problems, `${where} must be an object`);
    unknownKeys(item, fields, where, problems);
    const missing = fields.filter((f) => !nonEmpty(item[f]));
    if (missing.length) return reject(problems, `${where} needs ${missing.map((f) => `\`${f}\``).join(", ")}`);
    return [item];
  });
}

export function parseUpstream(jsonText) {
  const file = "sync/upstream.json";
  const json = parseJson(jsonText, file);
  const problems = [];
  if (!isObject(json)) throw new ConfigError([`${file}: top level must be an object`]);
  unknownKeys(json, ["remote", "pin", "sources", "renames", "excludes"], file, problems);
  if (!nonEmpty(json.remote)) problems.push(`${file}: remote must be a URL or a path`);
  if (typeof json.pin !== "string" || !/^[0-9a-f]{40}$/.test(json.pin)) problems.push(`${file}: pin must be a full 40-character sha, not ${JSON.stringify(json.pin)}`);
  const sources = records(json, "sources", ["from", "to"], file, problems);
  const renames = records(json, "renames", ["from", "to"], file, problems);
  const excludes = records(json, "excludes", ["path", "why"], file, problems);
  for (const s of sources) {
    if (!isPlain(s.from)) problems.push(`${file}: \`${s.from}\` is not a plain path`);
    if (!isLocal(s.to)) problems.push(notLocal(file, s.to));
  }
  for (const p of [...renames.flatMap((r) => [r.from, r.to]), ...excludes.map((e) => e.path)]) {
    if (!isLocal(p, { dir: true })) problems.push(notLocal(file, p));
  }
  if (problems.length) throw new ConfigError(problems);
  return { remote: json.remote, pin: json.pin, sources, renames, excludes };
}

const ROLE_TOKEN = /\{\{role:([^}]+)\}\}/g;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rolePlaceholder = (name) => `\`${name}\` role (default \`?\`)`;
const skillsFrom = (path) => posix.relative(posix.dirname(path), "skills") || ".";
const expand = (replacement, path) => replacement.replaceAll("{{skills}}", skillsFrom(path)).replace(ROLE_TOKEN, (_, name) => rolePlaceholder(name));

const LITERAL_PATH = /^\^((?:[^\\^$.*+?()[\]{}|]|\\.)+)\$$/;
const scopesOverlap = (a, b) => {
  const one = LITERAL_PATH.exec(a.files.source);
  const other = LITERAL_PATH.exec(b.files.source);
  if (one) return b.files.test(one[1].replace(/\\(.)/g, "$1"));
  if (other) return a.files.test(other[1].replace(/\\(.)/g, "$1"));
  return true;
};
const matchesIn = (rule, text) => (rule.pattern !== undefined ? text.includes(rule.pattern) : new RegExp(rule.regex.source, "m").test(text));

function denyHit(deny, line) {
  return deny.token !== undefined ? line.includes(deny.token) : deny.regex.test(line);
}

export function parseSubstitutions(jsonText, catalog) {
  const file = "sync/substitutions.json";
  const json = parseJson(jsonText, file);
  const problems = [];
  if (!isObject(json)) throw new ConfigError([`${file}: top level must be an object`]);
  unknownKeys(json, ["rules", "denylist"], file, problems);

  const denylist = (Array.isArray(json.denylist) ? json.denylist : []).flatMap((d, i) => {
    const where = `${file}: denylist[${i}]`;
    if (!isObject(d)) return reject(problems, `${where} must be an object`);
    unknownKeys(d, ["token", "regex", "files", "hint", "allow"], where, problems);
    if (nonEmpty(d.token) === nonEmpty(d.regex)) return reject(problems, `${where} needs exactly one of \`token\` or \`regex\``);
    if (!nonEmpty(d.hint)) problems.push(`${where} needs a \`hint\``);
    const allow = new Map();
    for (const [j, a] of (d.allow ?? []).entries()) {
      if (!isObject(a) || !nonEmpty(a.path) || !nonEmpty(a.why)) problems.push(`${where}.allow[${j}] needs \`path\` and \`why\``);
      else if (!isLocal(a.path)) problems.push(notLocal(`${where}.allow[${j}]`, a.path));
      else allow.set(a.path, a.why);
    }
    return [{ token: d.token, regex: d.regex ? new RegExp(d.regex) : undefined, files: new RegExp(d.files ?? "\\.md$"), hint: d.hint, allow, label: d.token ?? d.regex }];
  });

  const rules = (Array.isArray(json.rules) ? json.rules : reject(problems, `${file}: rules must be an array`)).flatMap((r, index) => {
    const where = `${file}: rules[${index}]`;
    if (!isObject(r)) return reject(problems, `${where} must be an object`);
    unknownKeys(r, ["pattern", "regex", "files", "replacement", "rationale"], where, problems);
    if (nonEmpty(r.pattern) === nonEmpty(r.regex)) return reject(problems, `${where} needs exactly one of \`pattern\` or \`regex\``);
    if (typeof r.replacement !== "string") return reject(problems, `${where} needs a \`replacement\` string`);
    if (!nonEmpty(r.rationale)) problems.push(`${where} needs a \`rationale\``);
    for (const [, name] of r.replacement.matchAll(ROLE_TOKEN)) {
      if (!catalog.roles.has(name)) problems.push(`${where} names role \`${name}\`, which models.json does not define`);
    }
    const sample = expand(r.replacement, "skills/x/SKILL.md");
    for (const d of denylist) if (denyHit(d, sample)) problems.push(`${where} replacement trips the denylist entry "${d.label}"`);
    const regex = r.regex !== undefined ? new RegExp(r.regex, "gm") : new RegExp(escapeRegex(r.pattern), "g");
    const rule = { index, pattern: r.pattern, regex, files: new RegExp(r.files ?? "\\.md$"), replacement: r.replacement, rationale: r.rationale, sample, label: r.pattern ?? `/${r.regex}/` };
    rule.apply = (text, path) => {
      const replacement = expand(r.replacement, path);
      let hits = 0;
      const out = text.replace(regex, (...m) => {
        hits++;
        return r.regex !== undefined ? replacement.replace(/\$(\d)/g, (_, n) => m[Number(n)] ?? "") : replacement;
      });
      return { text: out, hits };
    };
    return [rule];
  });

  rules.forEach((later, j) => {
    for (const earlier of rules.slice(0, j)) {
      if (!scopesOverlap(earlier, later)) continue;
      if (later.pattern !== undefined && matchesIn(earlier, later.pattern)) {
        problems.push(`${file}: rules[${j}] ${later.label} contains text that rules[${earlier.index}] ${earlier.label} rewrites first; move rules[${j}] above it`);
      }
      if (matchesIn(later, earlier.sample)) {
        problems.push(`${file}: rules[${j}] ${later.label} matches inside the replacement of rules[${earlier.index}], so it would rewrite that output`);
      }
    }
  });

  if (problems.length) throw new ConfigError(problems);
  return { rules, denylist };
}

const FORK_KINDS = ["policy", "port-feature", "local-fix"];

export function parseForks(jsonText) {
  const file = "sync/forks.json";
  const json = parseJson(jsonText, file);
  if (!isObject(json)) throw new ConfigError([`${file}: top level must be an object`]);
  const problems = [];
  const forks = new Map();
  for (const [path, e] of Object.entries(json)) {
    const where = `${file}: ${path}`;
    if (!isLocal(path) || !path.includes("/")) { problems.push(`${where} is not a plain path under skills/ or agents/`); continue; }
    if (!isObject(e)) { problems.push(`${where} must be an object`); continue; }
    unknownKeys(e, ["kind", "why", "since", "upstream"], where, problems);
    if (!FORK_KINDS.includes(e.kind)) problems.push(`${where} has kind ${JSON.stringify(e.kind)}, not one of ${FORK_KINDS.join(", ")}`);
    if (typeof e.why !== "string" || !e.why.trim() || /^todo\b/i.test(e.why.trim())) problems.push(`${where} needs a why that says why the fork exists (not empty or TODO)`);
    if (typeof e.since !== "string" || !/^\d+\.\d+\.\d+$/.test(e.since)) problems.push(`${where} has since ${JSON.stringify(e.since)}, not a version`);
    if (e.upstream !== "not-proposed" && !(typeof e.upstream === "string" && /^https:\/\/\S+$/.test(e.upstream))) problems.push(`${where} has upstream ${JSON.stringify(e.upstream)}, not "not-proposed" or an https URL`);
    forks.set(path, { kind: e.kind, why: e.why, since: e.since, upstream: e.upstream });
  }
  if (problems.length) throw new ConfigError(problems);
  return new Map([...forks].sort(byKey));
}

const underPrefix = (path, from) => (from.endsWith("/") ? path.startsWith(from) : path === from);

function mapSource(upstream, upstreamPath) {
  const source = upstream.sources
    .filter((s) => upstreamPath === s.from || upstreamPath.startsWith(`${s.from}/`))
    .sort((a, b) => b.from.length - a.from.length)[0];
  return source ? source.to + upstreamPath.slice(source.from.length) : null;
}

const isExcluded = (upstream, path) => upstream.excludes.some((e) => underPrefix(path, e.path));

export function mapPath(upstream, upstreamPath) {
  let path = mapSource(upstream, upstreamPath);
  if (path === null) return null;
  const rename = upstream.renames.find((r) => underPrefix(path, r.from));
  if (rename) path = rename.to + path.slice(rename.from.length);
  return { path, excluded: isExcluded(upstream, path) };
}

export function toBlob(bytes, exec) {
  const text = bytes.toString("utf8");
  if (bytes.includes(0) || !Buffer.from(text, "utf8").equals(bytes)) return { kind: "binary", bytes, exec };
  return { kind: "text", text, exec };
}

export function blobBytes(blob) {
  if (blob.kind === "text") return Buffer.from(blob.text, "utf8");
  if (blob.kind === "binary") return blob.bytes;
  return Buffer.from(blob.target, "utf8");
}

const sameContent = (a, b) =>
  Boolean(a && b && a.kind === b.kind && (a.kind === "text" ? a.text === b.text : a.kind === "binary" ? a.bytes.equals(b.bytes) : a.target === b.target));
const same = (a, b) => sameContent(a, b) && a.exec === b.exec;
const isStamped = (path) => path.endsWith(".md") && SCAN_DIRS.some((d) => path.startsWith(`${d}/`));

function applyRules(config, path, text, hits) {
  let out = text;
  for (const rule of config.subs.rules) {
    if (!rule.files.test(path)) continue;
    const r = rule.apply(out, path);
    out = r.text;
    if (hits) hits[rule.index] += r.hits;
  }
  return out;
}

export function deriveFile(config, path, blob) {
  if (blob.kind !== "text") return blob;
  const text = applyRules(config, path, blob.text);
  return { ...blob, text: isStamped(path) ? stampDoc(path, text, config.catalog).text : text };
}

export function deriveTree(config, rawTree) {
  const tree = new Map();
  const from = new Map();
  const problems = [];
  for (const [upstreamPath, blob] of [...rawTree].sort(byKey)) {
    const mapped = mapPath(config.upstream, upstreamPath);
    if (!mapped) continue;
    if (tree.has(mapped.path)) {
      problems.push({ kind: "path-collision", path: mapped.path, say: `upstream ${from.get(mapped.path)} and ${upstreamPath} both map here; fix sources or renames` });
      continue;
    }
    from.set(mapped.path, upstreamPath);
    tree.set(mapped.path, mapped.excluded ? blob : deriveFile(config, mapped.path, blob));
  }
  return { tree: new Map([...tree].sort(byKey)), problems };
}

function changedLines(a, b) {
  const x = a.split("\n");
  const y = b.split("\n");
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let end = 0;
  while (end < x.length - start && end < y.length - start && x[x.length - 1 - end] === y[y.length - 1 - end]) end++;
  const xs = x.slice(start, x.length - end);
  const ys = y.slice(start, y.length - end);
  const row = new Uint32Array(ys.length + 1);
  for (const line of xs) {
    let diag = 0;
    for (let j = 1; j <= ys.length; j++) {
      const up = row[j];
      row[j] = line === ys[j - 1] ? diag + 1 : Math.max(up, row[j - 1]);
      diag = up;
    }
  }
  return xs.length + ys.length - 2 * row[ys.length];
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const OUTCOMES = {
  unchanged: {},
  updated: {},
  added: {},
  deleted: {},
  gone: {},
  excluded: {},
  "port-only": {},
  forked: { fork: true },
  "mode-only": { fork: true },
  merged: { fork: true },
  conflicted: { fork: true, problem: (e) => `${plural(e.hunks, "hunk")}. Make the local file take upstream's change in our words, then rerun with --resolved ${e.path} to keep it as the merge (a mechanical difference wants a rule instead).` },
  "binary-conflict": { problem: (e) => `binary changed upstream and here; take one side by hand or exclude it, then rerun with --resolved ${e.path} to keep ours.` },
  symlink: { problem: () => "a symlink on some side; the sync never follows or writes links." },
  "removed-upstream": { followUp: () => "upstream deleted it; kept because it is ours. Delete it with its forks.json entry, or keep it as port-only." },
};
const FORK_CLASS = new Set(Object.keys(OUTCOMES).filter((o) => OUTCOMES[o].fork));

function classify(old, neu, local, merge3) {
  if ([old, neu, local].some((b) => b?.kind === "symlink")) return { outcome: "symlink", write: null };
  if (!old && !neu) return { outcome: "port-only", write: null };
  if (neu && local && same(local, neu)) return { outcome: "unchanged", write: null };
  if (!neu) {
    if (!local) return { outcome: "gone", write: null };
    return same(local, old) ? { outcome: "deleted", write: "delete" } : { outcome: "removed-upstream", write: null };
  }
  if (!local) return { outcome: "added", write: neu };
  if (same(local, old)) return { outcome: "updated", write: neu };
  if (same(old, neu)) {
    if (sameContent(local, old)) return { outcome: "mode-only", write: null };
    return { outcome: "forked", write: null, changedLines: local.kind === "text" && neu.kind === "text" ? changedLines(neu.text, local.text) : null };
  }
  if ([old, neu, local].some((b) => b?.kind === "binary")) return { outcome: "binary-conflict", write: null };
  const exec = old && neu.exec === old.exec ? local.exec : neu.exec;
  const m = merge3(local.text, old?.text ?? "", neu.text);
  if (m.conflicts) return { outcome: "conflicted", write: null, hunks: m.conflicts, conflict: m.text };
  const merged = { kind: "text", text: m.text, exec };
  if (same(merged, neu)) return { outcome: "updated", write: neu };
  return { outcome: "merged", write: same(merged, local) ? null : merged, changedLines: changedLines(neu.text, m.text) };
}

const PROBLEM_ORDER = ["config", "dirty", "resolved-unused", "markers", "local-unstamped", "undeclared", "stale-at-pin", "at-pin-write", "conflicted", "binary-conflict", "symlink", "path-collision", "denylist", "stamp", "stamp-repo"];
const FOLLOW_UP_ORDER = ["new-skill", "new-agent", "removed-skill", "removed-agent", "removed-upstream", "stale-fork", "excluded-changed", "excluded-local"];
const byOrder = (order) => (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || cmp(a.path ?? "", b.path ?? "");
const groupOf = (path) => /^skills\/[^/]+\//.exec(path)?.[0] ?? /^agents\/[^/]+$/.exec(path)?.[0] ?? null;
const prefixes = (path) => path.split("/").map((_, i, parts) => parts.slice(0, i + 1).join("/"));
const fold = (s) => s.normalize("NFC").toLowerCase();

function findingSay(f) {
  return { "unknown-role": `unknown role \`${f.role}\``, "loose-default": `loose default \`${f.text}\``, "loose-effort": `loose effort \`${f.text}\``, stale: `stale \`${f.role}\` default \`${f.found}\``, "stale-template": "stale template fence" }[f.kind] ?? f.kind;
}

function stampRepoSay(f) {
  if (f.kind === "missing-role") return `models.json role \`${f.role}\` would be stated in no skill prose`;
  if (f.kind === "template-count") return `the tree would hold ${f.fences.length} models.md template fences, not 1${f.fences.map((w) => ` (${w.file}:${w.line})`).join("")}`;
  return `${SPAWNING} would lose the effort rule`;
}

export function plan({ config, forks, oldTree, newTree, localTree, stampOnly = new Map(), target, version, merge3, resolved = [], preProblems = [] }) {
  const { upstream, catalog } = config;
  const atPin = target === upstream.pin;
  const problems = [...preProblems];
  const followUps = [];
  const paths = [...new Set([...oldTree.keys(), ...newTree.keys(), ...localTree.keys()])].sort();

  const entries = paths.map((path) => {
    const [old, neu, local] = [oldTree.get(path), newTree.get(path), localTree.get(path)];
    if (!isExcluded(upstream, path)) {
      const e = { path, ...classify(old, neu, local, merge3) };
      if (!resolved.includes(path) || (e.outcome !== "conflicted" && e.outcome !== "binary-conflict")) return e;
      return { path, outcome: "merged", write: null, resolved: true, changedLines: local.kind === "text" && neu.kind === "text" ? changedLines(neu.text, local.text) : null };
    }
    if (local) followUps.push({ kind: "excluded-local", path, say: "is under an exclude but present locally; the sync never deletes it. Delete it by hand or drop the exclude." });
    if ((old || neu) && !same(old, neu)) followUps.push({ kind: "excluded-changed", path, say: "changed upstream; check that the exclude still holds." });
    return { path, outcome: "excluded", write: null };
  });
  const byPath = new Map(entries.map((e) => [e.path, e]));
  for (const path of [...new Set(resolved)].sort()) {
    if (!byPath.get(path)?.resolved) problems.push({ kind: "resolved-unused", path, say: "--resolved names it, but it does not conflict in this run; drop the flag." });
  }

  for (const e of entries) {
    const row = OUTCOMES[e.outcome];
    if (row.problem) problems.push({ kind: e.outcome, path: e.path, say: row.problem(e), conflict: e.conflict });
    if (row.followUp) followUps.push({ kind: e.outcome, path: e.path, say: row.followUp(e) });
    if (row.fork && !forks.has(e.path)) {
      const what = e.outcome === "mode-only" ? "only the exec bit differs from upstream" : e.outcome === "forked" ? `forked, ${plural(e.changedLines ?? 0, "line")} differ from upstream` : `${e.outcome} with upstream`;
      problems.push({ kind: "undeclared", path: e.path, say: `${what}. Add a rule or a forks.json entry.` });
    }
    if (atPin && e.write) problems.push({ kind: "at-pin-write", path: e.path, say: `at the pin the sync would ${e.write === "delete" ? "delete" : "write"} it (${e.outcome}); restore it or exclude it.` });
  }

  for (const [path] of forks) {
    const outcome = byPath.get(path)?.outcome ?? "missing";
    if (FORK_CLASS.has(outcome) || outcome === "removed-upstream") continue;
    if (atPin) problems.push({ kind: "stale-at-pin", path, say: `forks.json declares it, but it is ${outcome} at the pin. Delete the entry.` });
    else followUps.push({ kind: "stale-fork", path, say: `is ${outcome} now; upstream may have taken our change. Delete its forks.json entry.` });
  }

  const after = new Map(localTree);
  for (const e of entries) {
    if (e.write === "delete") after.delete(e.path);
    else if (e.write) after.set(e.path, e.write);
  }
  const afterPaths = [...after.keys()].sort();

  const spellings = new Map();
  for (const p of afterPaths.flatMap(prefixes)) spellings.set(fold(p), (spellings.get(fold(p)) ?? new Set()).add(p));
  const dirs = new Set(afterPaths.flatMap((p) => prefixes(p).slice(0, -1)));
  for (const e of entries) {
    if (!e.write || e.write === "delete") continue;
    const twin = prefixes(e.path).find((p) => spellings.get(fold(p)).size > 1);
    const fileAbove = prefixes(e.path).slice(0, -1).find((p) => after.has(p));
    const reason = twin ? `${[...spellings.get(fold(twin))].sort().join(" and ")} differ only in case or Unicode form`
      : dirs.has(e.path) ? "a directory where upstream has a file"
      : fileAbove ? `${fileAbove} is a file where upstream has a directory` : null;
    if (reason) problems.push({ kind: "path-collision", path: e.path, say: reason });
  }

  for (const [path, blob] of after) {
    if (blob.kind !== "text") continue;
    for (const d of config.subs.denylist) {
      if (!d.files.test(path) || d.allow.has(path)) continue;
      blob.text.split("\n").forEach((line, i) => {
        if (denyHit(d, line)) problems.push({ kind: "denylist", path, line: i + 1, say: `"${d.label}": ${d.hint}` });
      });
    }
  }

  for (const [path, blob] of localTree) {
    if (blob.kind === "text" && /^(<{7}|>{7})( |$)/m.test(blob.text)) problems.push({ kind: "markers", path, say: "still has conflict markers; resolve them first." });
  }

  const docs = new Map();
  for (const [path, blob] of localTree) {
    if (blob.kind !== "text" || !isStamped(path)) continue;
    const s = stampDoc(path, blob.text, catalog);
    docs.set(path, s);
    for (const f of s.findings) {
      problems.push({ kind: "local-unstamped", path, line: f.at?.line, say: `${findingSay(f)}; run node scripts/stamp-models.mjs (or fix the prose) before syncing.` });
    }
  }
  for (const e of entries) {
    if (e.write === "delete") docs.delete(e.path);
    if (!e.write || e.write === "delete" || e.write.kind !== "text" || !isStamped(e.path)) continue;
    const s = stampDoc(e.path, e.write.text, catalog);
    docs.set(e.path, s);
    for (const f of s.findings) {
      problems.push({ kind: "stamp", path: e.path, line: f.at?.line, say: `${findingSay(f)}; map it with a {{role:...}} rule or write "the \`<role>\` role (default \`<value>\`)".` });
    }
  }
  for (const [path, blob] of stampOnly) if (blob.kind === "text") docs.set(path, stampDoc(path, blob.text, catalog));
  const spawning = after.get(SPAWNING);
  for (const f of checkRepo(catalog, [...docs.values()], spawning?.kind === "text" ? spawning.text : null)) {
    problems.push({ kind: "stamp-repo", say: stampRepoSay(f) });
  }

  const localGroups = new Set([...localTree.keys()].map(groupOf));
  const afterGroups = new Set(afterPaths.map(groupOf));
  const count = (group, outcome) => entries.filter((e) => e.outcome === outcome && groupOf(e.path) === group).length;
  for (const g of [...afterGroups].filter((g) => g && !localGroups.has(g)).sort()) {
    const what = g.startsWith("skills/") ? "skill" : "agent";
    followUps.push({ kind: `new-${what}`, path: g, say: `${plural(count(g, "added"), "file")} written. Review it, credit it if needed, or add it to excludes.` });
  }
  for (const g of [...localGroups].filter((g) => g && !afterGroups.has(g)).sort()) {
    const what = g.startsWith("skills/") ? "skill" : "agent";
    followUps.push({ kind: `removed-${what}`, path: g, say: `${plural(count(g, "deleted"), "file")} deleted. Update the README and flatpaper-help if they name it.` });
  }

  const forkStubs = Object.fromEntries(problems.filter((p) => p.kind === "undeclared").map((p) => [p.path, { kind: "policy", why: "", since: version, upstream: "not-proposed" }]));
  return { pin: upstream.pin, target, atPin, entries, forks, problems: problems.sort(byOrder(PROBLEM_ORDER)), followUps: followUps.sort(byOrder(FOLLOW_UP_ORDER)), forkStubs };
}

export const blocked = (p) => p.problems.length > 0;
export const writes = (p) => (blocked(p) ? [] : p.entries.filter((e) => e.write));
export const exitCode = (p) => (blocked(p) ? 2 : p.followUps.length ? 1 : 0);

const LISTED = ["added", "updated", "deleted", "merged", "forked", "mode-only", "port-only", "excluded"];
const COUNTED = ["unchanged", "updated", "added", "deleted", "merged", "forked", "mode-only", "port-only", "excluded"];
const pad = (s) => s.padEnd(16);

export function renderReport(p, { dryRun }) {
  const out = [];
  const short = (sha) => sha.slice(0, 7);
  out.push(p.atPin ? `upstream ${short(p.pin)} (at the pin)${dryRun ? ", dry run" : ""}` : `upstream ${short(p.pin)} -> ${short(p.target)}${dryRun ? ", dry run" : ""}`);
  if (blocked(p)) {
    out.push("", `PROBLEMS: ${p.problems.length} (nothing ${dryRun ? "will be" : "was"} written, the pin stays)`);
    for (const f of p.problems) {
      out.push(`  ${pad(f.kind)} ${f.path ?? "-"}${f.line ? `:${f.line}` : ""}  ${f.say}`);
      if (f.conflict) {
        const hunks = f.conflict.split("\n");
        let inside = false;
        for (const line of hunks) {
          if (line.startsWith("<<<<<<< ")) inside = true;
          if (inside) out.push(`      ${line}`);
          if (line.startsWith(">>>>>>> ")) inside = false;
        }
      }
    }
  } else {
    out.push("", "0 problems");
  }
  if (p.followUps.length) {
    out.push("", `FOLLOW-UPS: ${p.followUps.length} (${blocked(p) ? "once the problems are fixed" : dryRun ? "a real run writes these; a human must act" : "written; a human must act"})`);
    for (const f of p.followUps) out.push(`  ${pad(f.kind.replaceAll("-", " "))} ${f.path}  ${f.say}`);
  }
  const counts = COUNTED.map((o) => [o, p.entries.filter((e) => e.outcome === o).length]).filter(([, n]) => n);
  out.push("", `outcomes: ${counts.map(([o, n]) => `${o} ${n}`).join(", ")}`);
  for (const e of p.entries) {
    if (!LISTED.includes(e.outcome)) continue;
    const fork = p.forks.get(e.path);
    const detail = FORK_CLASS.has(e.outcome) ? `  ${fork?.kind ?? "undeclared"}${e.changedLines != null ? `, ${plural(e.changedLines, "line")} ours` : ""}${e.resolved ? ", resolved by hand" : ""}` : "";
    out.push(`  ${pad(e.outcome)} ${e.path}${detail}`);
  }
  if (Object.keys(p.forkStubs).length) {
    out.push("", "Paste into sync/forks.json and write each why:");
    out.push(Object.entries(p.forkStubs).map(([path, s]) => `  ${JSON.stringify(path)}: { "kind": ${JSON.stringify(s.kind)}, "why": "", "since": ${JSON.stringify(s.since)}, "upstream": "not-proposed" }`).join(",\n"));
  }
  if (!blocked(p) && !dryRun && !p.atPin) {
    out.push("", `pin -> ${p.target}`, "next: review the diff, then node scripts/stamp-models.mjs --check && node --test tests/*.test.mjs, and bun test in skills/flatpaper-mode/scripts");
  }
  return out.join("\n") + "\n";
}

export function checkRules(config, rawPinTree, localTree) {
  const findings = [];
  const hits = config.subs.rules.map(() => 0);
  const sourced = [];
  const mapped = [];
  for (const [upstreamPath, blob] of rawPinTree) {
    const s = mapSource(config.upstream, upstreamPath);
    if (s !== null) sourced.push(s);
    const m = mapPath(config.upstream, upstreamPath);
    if (!m) continue;
    mapped.push(m.path);
    if (!m.excluded && blob.kind === "text") applyRules(config, m.path, blob.text, hits);
  }
  config.subs.rules.forEach((r, i) => {
    if (!hits[i]) findings.push({ kind: "rule-no-hit", say: `rules[${i}] ${r.label} matches no file at the pin; delete it, or move text upstream may bring back to the denylist` });
  });
  for (const d of config.subs.denylist) {
    for (const path of d.allow.keys()) {
      const blob = localTree.get(path);
      if (!blob || blob.kind !== "text" || !blob.text.split("\n").some((line) => denyHit(d, line))) findings.push({ kind: "allow-no-hit", say: `denylist "${d.label}" allows ${path}, which no longer has a hit; delete the allow entry` });
    }
  }
  for (const r of config.upstream.renames) {
    if (!sourced.some((p) => underPrefix(p, r.from))) findings.push({ kind: "rename-missing", say: `rename ${r.from} matches nothing at the pin` });
  }
  for (const e of config.upstream.excludes) {
    if (!mapped.some((p) => underPrefix(p, e.path))) findings.push({ kind: "exclude-missing", say: `exclude ${e.path} matches nothing at the pin` });
  }
  return findings;
}
