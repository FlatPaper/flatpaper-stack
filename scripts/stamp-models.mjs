#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const PROVIDERS = ["claude", "codex", "gemini"];
const IMPLICIT_EFFORT = "medium";
const EFFORT_RULE = "A default written without an effort means `medium`.";
const SPAWNING = "skills/flatpaper-mode/references/spawning.md";
const SPAN = /`([^`]+)` role \(default `([^`]+)`\)/g;
const LOOSE_DEFAULT = new RegExp(`default \`((?:parent|${PROVIDERS.map((p) => `${p}/`).join("|")})[^\`]*)\``, "g");
const LOOSE_EFFORT = new RegExp(`\`(${EFFORTS.join("|")})\` by default`, "g");
const TEMPLATE_FIRST_LINE = "# flatpaper-stack model configuration.";
const SCAN_DIRS = ["skills", "agents", "hooks"];

const KINDS = ["single", "panel", "pool"];
const FAMILIES = {
  any: () => true,
  claude: (ref) => ref.provider === "parent" || ref.provider === "claude",
  other: (ref) => ref.provider !== "parent" && ref.provider !== "claude",
};
const FAMILY_RULE = { claude: "needs MCP tools, so only parent or claude/*", other: "needs a family other than Claude, so no parent or claude/*" };

class CatalogError extends Error {
  constructor(problems) {
    super(problems.join("\n"));
    this.problems = problems;
  }
}

function parseRef(text) {
  const m = new RegExp(`^(?:(parent)|(${PROVIDERS.join("|")})/([^\\s:,\`]+)):([a-z]+)$`).exec(text);
  if (!m) return `\`${text}\` is not provider/model:effort or parent:effort`;
  if (!EFFORTS.includes(m[4])) return `\`${text}\` has effort \`${m[4]}\`, not one of ${EFFORTS.join(", ")}`;
  return m[1] ? { provider: "parent", effort: m[4] } : { provider: m[2], model: m[3], effort: m[4] };
}

function parseCatalog(jsonText) {
  let json;
  try {
    json = JSON.parse(jsonText);
  } catch (e) {
    throw new CatalogError([`not valid JSON (${e.message})`]);
  }
  const problems = [];
  const unknownKeys = (obj, allowed, where) => {
    for (const key of Object.keys(obj)) if (!allowed.includes(key)) problems.push(`${where} has unknown key \`${key}\``);
  };
  const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const isStrings = (v) => Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string");

  if (!isObject(json)) throw new CatalogError(["top level must be an object"]);
  unknownKeys(json, ["template", "roles"], "top level");

  const head = json.template?.head;
  if (!isObject(json.template) || !isStrings(head)) problems.push("template.head must be a non-empty array of strings");
  else {
    unknownKeys(json.template, ["head"], "template");
    if (!head[0].startsWith(TEMPLATE_FIRST_LINE)) problems.push(`template.head must start with "${TEMPLATE_FIRST_LINE}"`);
    if (!head.some((l) => l.startsWith("session hook: "))) problems.push("template.head has no `session hook: ` line");
  }

  const roles = new Map();
  if (!Array.isArray(json.roles) || json.roles.length === 0) problems.push("roles must be a non-empty array");
  for (const [i, entry] of (Array.isArray(json.roles) ? json.roles : []).entries()) {
    const name = typeof entry?.role === "string" ? entry.role : `roles[${i}]`;
    const fail = (why) => problems.push(`role \`${name}\` ${why}`);
    if (!isObject(entry)) { fail("must be an object"); continue; }
    unknownKeys(entry, ["role", "default", "kind", "family"], `role \`${name}\``);
    if (typeof entry.role !== "string" || entry.role === "") fail("needs a non-empty `role` name");
    else if (/: |`|\n/.test(entry.role)) fail('has a name containing ": ", a backtick, or a newline');
    else if (roles.has(entry.role)) fail("is listed twice");

    const kind = entry.kind ?? "single";
    const family = entry.family ?? "any";
    if (!KINDS.includes(kind)) fail(`has kind \`${kind}\`, not one of ${KINDS.join(", ")}`);
    if (!(family in FAMILIES)) fail(`has family \`${family}\`, not one of ${Object.keys(FAMILIES).join(", ")}`);
    if (!isStrings(entry.default)) { fail("needs `default`, a non-empty array of strings"); continue; }

    const value = [];
    for (const text of entry.default) {
      const ref = parseRef(text);
      if (typeof ref === "string") fail(`default ${ref}`);
      else if (FAMILIES[family] && !FAMILIES[family](ref)) fail(`default \`${text}\` breaks family \`${family}\` (${FAMILY_RULE[family]})`);
      else value.push(ref);
    }
    if (kind === "single" && entry.default.length !== 1) fail(`is kind single but has ${entry.default.length} default entries`);
    if (typeof entry.role === "string") roles.set(entry.role, { name: entry.role, value });
  }

  if (problems.length) throw new CatalogError(problems);
  return { roles, templateHead: head };
}

const refText = (ref) => (ref.provider === "parent" ? "parent" : `${ref.provider}/${ref.model}`);
const proseValue = (role) => role.value.map((r) => refText(r) + (r.effort === IMPLICIT_EFFORT ? "" : `:${r.effort}`)).join(", ");
const templateLine = (role) => `${role.name}: ${role.value.map((r) => `${refText(r)}:${r.effort}`).join(", ")}`;
const templateBody = (c) => [...c.templateHead, ...[...c.roles.values()].map(templateLine)];

const FINDINGS = {
  "stale": { fixable: true, say: (f) => `${at(f)} stale \`${f.role}\` default: found \`${f.found}\`, models.json says \`${f.expected}\`` },
  "stale-template": { fixable: true, say: (f) => `${at(f)} template fence is stale` },
  "unknown-role": { fixable: false, say: (f) => `${at(f)} unknown role \`${f.role}\` (models.json has no such role)` },
  "loose-default": { fixable: false, say: (f) => `${at(f)} loose default \`${f.text}\`; write it as "the \`<role>\` role (default \`<value>\`)"` },
  "loose-effort": { fixable: false, say: (f) => `${at(f)} loose effort \`${f.text}\` by default; the effort belongs in models.json` },
  "missing-role": { fixable: false, say: (f) => `models.json: role \`${f.role}\` is stated in no skill prose` },
  "template-count": { fixable: false, say: (f) => `found ${f.fences.length} models.md template fences (want exactly 1, starting "${TEMPLATE_FIRST_LINE}")${f.fences.map((w) => ` ${at({ at: w })}`).join("")}` },
  "effort-rule": { fixable: false, say: () => `${SPAWNING}: no longer says "${EFFORT_RULE}"` },
  "catalog": { fixable: false, say: (f) => `models.json: ${f.problem}` },
};
const at = ({ at: w }) => `${w.file}:${w.line}${w.col ? `:${w.col}` : ""}`;

function whereAt(file, text, index) {
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  return { file, line, col: index - before.lastIndexOf("\n") };
}

function templateFences(lines) {
  const fences = [];
  for (let i = 0, open = -1; i < lines.length; i++) {
    if (!lines[i].startsWith("```")) continue;
    if (open < 0) { open = i; continue; }
    if (lines[open + 1]?.startsWith(TEMPLATE_FIRST_LINE)) fences.push({ open, close: i });
    open = -1;
  }
  return fences;
}

function stampDoc(file, text, c) {
  const findings = [];
  const rolesSeen = new Set();
  const spans = [...text.matchAll(SPAN)];
  const edits = [];

  for (const m of spans) {
    const role = c.roles.get(m[1]);
    if (!role) { findings.push({ kind: "unknown-role", at: whereAt(file, text, m.index), role: m[1] }); continue; }
    rolesSeen.add(role.name);
    const expected = proseValue(role);
    if (m[2] === expected) continue;
    findings.push({ kind: "stale", at: whereAt(file, text, m.index), role: role.name, found: m[2], expected });
    const end = m.index + m[0].length - "`)".length;
    edits.push({ start: end - m[2].length, end, text: expected });
  }
  for (const m of text.matchAll(LOOSE_DEFAULT)) {
    const inside = spans.some((s) => s.index <= m.index && m.index + m[0].length <= s.index + s[0].length);
    if (!inside) findings.push({ kind: "loose-default", at: whereAt(file, text, m.index), text: m[1] });
  }
  for (const m of text.matchAll(LOOSE_EFFORT)) findings.push({ kind: "loose-effort", at: whereAt(file, text, m.index), text: m[1] });

  let out = text;
  for (const e of edits.reverse()) out = out.slice(0, e.start) + e.text + out.slice(e.end);

  const lines = out.split("\n");
  const fences = templateFences(lines);
  if (fences.length === 1) {
    const { open, close } = fences[0];
    const body = templateBody(c);
    if (lines.slice(open + 1, close).join("\n") !== body.join("\n")) {
      findings.push({ kind: "stale-template", at: { file, line: open + 2 } });
      lines.splice(open + 1, close - open - 1, ...body);
    }
  }
  return { text: lines.join("\n"), findings, rolesSeen, fences: fences.map((f) => ({ file, line: f.open + 2 })) };
}

function checkRepo(c, docs, spawningText) {
  const findings = [];
  const seen = new Set(docs.flatMap((d) => [...d.rolesSeen]));
  for (const name of c.roles.keys()) if (!seen.has(name)) findings.push({ kind: "missing-role", role: name });
  const fences = docs.flatMap((d) => d.fences);
  if (fences.length !== 1) findings.push({ kind: "template-count", fences });
  if (!spawningText?.includes(EFFORT_RULE)) findings.push({ kind: "effort-rule" });
  return findings;
}

function markdownFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else if (e.name.endsWith(".md")) files.push(relative(root, path));
    }
  };
  for (const dir of SCAN_DIRS) if (existsSync(join(root, dir))) walk(join(root, dir));
  return files.sort();
}

function parseArgs(argv) {
  const opts = { check: false, root: join(dirname(fileURLToPath(import.meta.url)), "..") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--check") opts.check = true;
    else if (argv[i] === "--root" && argv[i + 1]) opts.root = argv[++i];
    else return `unknown argument \`${argv[i]}\`; usage: node scripts/stamp-models.mjs [--check] [--root DIR]`;
  }
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (typeof opts === "string") { console.error(opts); return 2; }
  const read = (rel) => readFileSync(join(opts.root, rel), "utf8");

  let catalog;
  try {
    catalog = parseCatalog(read("models.json"));
  } catch (e) {
    const problems = e instanceof CatalogError ? e.problems : [e.message];
    console.error(problems.map((problem) => FINDINGS.catalog.say({ problem })).join("\n"));
    return 2;
  }

  const docs = markdownFiles(opts.root).map((file) => {
    const before = read(file);
    return { file, before, ...stampDoc(file, before, catalog) };
  });
  const spawning = docs.find((d) => d.file === SPAWNING)?.before ?? null;
  const findings = [...docs.flatMap((d) => d.findings), ...checkRepo(catalog, docs, spawning)];
  const invalid = findings.some((f) => !FINDINGS[f.kind].fixable);

  if (opts.check || invalid) {
    if (findings.length) console.error(findings.map((f) => FINDINGS[f.kind].say(f)).join("\n"));
    return invalid ? 2 : findings.length ? 1 : 0;
  }
  for (const d of docs) {
    if (d.text === d.before) continue;
    writeFileSync(join(opts.root, d.file), d.text);
    console.log(`stamped ${d.file}`);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
