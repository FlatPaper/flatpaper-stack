#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { parseCatalog, parseRef } from "./stamp-models.mjs";

export function parseLayer(text, source, path) {
  const problems = [];
  const layer = { source, path, lines: new Map(), problems };
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const text = raw.trim();
    if (!text || text.startsWith("#")) continue;
    const lineNo = index + 1;
    const fail = (message) => problems.push({ path, lineNo, message });
    const colon = text.indexOf(":");
    if (colon < 1) { fail("line needs a key and colon"); continue; }
    const key = text.slice(0, colon).trim();
    const value = text.slice(colon + 1).trim();
    if (key.toLowerCase() === "session hook") continue;
    if (key === "providers") {
      if (source !== "repo") { fail("providers: is allowed only in the repo layer"); continue; }
      const providers = value.split(/[\s,]+/).filter(Boolean);
      if (providers.some((p) => !["parent", "claude", "codex", "gemini"].includes(p))) {
        fail("providers: contains an unknown provider");
        continue;
      }
      layer.providers = new Set(providers);
      continue;
    }
    const refs = [];
    let invalid = false;
    for (const entry of value ? value.split(",") : []) {
      const ref = parseRef(entry.trim());
      if (typeof ref === "string") { fail(ref); invalid = true; }
      else refs.push(ref);
    }
    if (!invalid) layer.lines.set(key, { refs, source, path, lineNo });
  }
  return { layer, problems };
}

function readJSON(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { return null; }
}

export function readInstalled(home) {
  const plugins = new Set(Object.keys(readJSON(join(home, ".claude/plugins/installed_plugins.json"))?.plugins ?? {}));
  const cache = readJSON(join(home, ".codex/models_cache.json"));
  const codexModels = Array.isArray(cache?.models) ? new Map(cache.models
    .filter((m) => typeof m?.slug === "string")
    .map((m) => [m.slug, new Set((Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels : []).map((l) => l?.effort))])) : null;
  return { plugins, codexModels };
}

function entryProblems(ref, installed, providers) {
  const problems = [];
  if (ref.provider !== "parent" && providers && !providers.has(ref.provider)) problems.push(`provider ${ref.provider} is blocked by repo providers:`);
  if (ref.provider !== "codex") return problems;
  for (const plugin of ["codex-seats", "codex"]) {
    if (![...installed.plugins].some((key) => key.startsWith(`${plugin}@`))) problems.push(`codex/${ref.model} needs the ${plugin} plugin`);
  }
  if (installed.codexModels && !["matched", "default"].includes(ref.model)) {
    const efforts = installed.codexModels.get(ref.model);
    if (!efforts) problems.push(`Codex model ${ref.model} is absent from models_cache.json`);
    else if (!efforts.has(ref.effort)) problems.push(`Codex model ${ref.model} does not support effort ${ref.effort}`);
  }
  return problems;
}

const allowedProviders = (layers) => layers.findLast((layer) => layer.source === "repo" && layer.providers !== undefined)?.providers;

export function resolve(catalog, layers, installed) {
  const providers = allowedProviders(layers);
  return new Map([...catalog.roles.keys()].map((role) => {
    const skipped = [];
    let line = null;
    for (const layer of [...layers].reverse()) {
      const candidate = layer.lines.get(role);
      if (!candidate) continue;
      const reasons = candidate.refs.flatMap((ref) => entryProblems(ref, installed, providers));
      if (!reasons.length) { line = candidate; break; }
      skipped.push({ line: candidate, reason: reasons.join("; ") });
    }
    return [role, { line, skipped }];
  }));
}

export function check(catalog, layers, installed) {
  const providers = allowedProviders(layers);
  return layers.flatMap((layer) => [
    ...(layer.problems ?? []),
    ...[...layer.lines].flatMap(([role, line]) => {
      const messages = catalog.roles.has(role) ? [] : [`unknown role ${role}`];
      messages.push(...line.refs.flatMap((ref) => entryProblems(ref, installed, layer.source === "repo" ? providers : undefined)));
      return messages.map((message) => ({ path: line.path, lineNo: line.lineNo, message }));
    }),
  ]);
}

function repoRoot(cwd) {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

function readLayer(path, source) {
  try { return parseLayer(readFileSync(path, "utf8"), source, path).layer; }
  catch (error) {
    const layer = parseLayer("", source, path).layer;
    if (error.code !== "ENOENT") layer.problems.push({ path, message: error.message });
    return layer;
  }
}

const formatRef = (ref) => `${ref.provider === "parent" ? "parent" : `${ref.provider}/${ref.model}`}:${ref.effort}`;

function main() {
  const checking = process.argv.includes("--check");
  let problems;
  try {
    const path = fileURLToPath(new URL("../models.json", import.meta.url));
    const catalogText = readFileSync(path, "utf8");
    const catalog = parseCatalog(catalogText);
    const bundled = { source: "bundled", path, lines: new Map([...catalog.roles].map(([name, role]) =>
      [name, { refs: role.value, source: "bundled", path,
        lineNo: catalogText.slice(0, catalogText.indexOf(JSON.stringify(name))).split("\n").length }])) };
    const home = homedir();
    const root = repoRoot(process.cwd());
    const layers = [bundled, readLayer(join(home, ".claude/flatpaper-stack/models.md"), "user")];
    if (root) layers.push(readLayer(join(root, ".agents/models.md"), "repo"));
    const installed = readInstalled(home);
    problems = check(catalog, layers, installed);
    if (!checking) {
      const table = resolve(catalog, layers, installed);
      for (const [role, { line }] of table) console.log(`${role}: ${line?.refs.map(formatRef).join(", ") || "none"}  [${line?.source ?? "none"}]`);
      for (const [role, { skipped }] of table) for (const { line, reason } of skipped) {
        console.log(`skipped ${role}: ${line.refs.map(formatRef).join(", ")} [${line.source}] ${line.path}:${line.lineNo}: ${reason}`);
      }
    }
  } catch (error) {
    problems = [{ path: "resolve-models", message: error.message }];
    if (!checking) console.error(error.message);
  }
  if (checking && problems.length) console.log(JSON.stringify({ systemMessage: `flatpaper-stack models: ${problems.length} problem(s): ${problems.map((p) => `${p.path}${p.lineNo ? `:${p.lineNo}` : ""} ${p.message}`).join("; ")}` }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main();
