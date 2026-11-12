import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const context = readFileSync(join(root, "hooks/session-start-context.md"), "utf8");

function runHook(modelsFile, args = []) {
  const config = mkdtempSync(join(tmpdir(), "flatpaper-hook-"));
  if (modelsFile !== undefined) {
    mkdirSync(join(config, ".claude/flatpaper-stack"), { recursive: true });
    writeFileSync(join(config, ".claude/flatpaper-stack/models.md"), modelsFile);
  }
  return execFileSync(join(root, "hooks/session-start.sh"), args, {
    env: { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: root, HOME: config },
    encoding: "utf8",
  });
}

test("with no models file, the hook routes the session to flatpaper-mode", () => {
  const out = runHook();
  assert.equal(out, context);
  assert.match(out, /flatpaper-stack:flatpaper-mode/);
});

test("session hook: on keeps routing", () => {
  assert.equal(runHook("# budget: small (medium)\nsession hook: on\n"), context);
});

test("session hook: off prints nothing", () => {
  assert.equal(runHook("# budget: small (medium)\nsession hook: off\nfeature, refactoring: parent:medium\n"), "");
});

test("the off switch tolerates case and spacing", () => {
  assert.equal(runHook("  Session Hook:   OFF  \n"), "");
});

test("with HOME unset, the hook still routes", () => {
  const out = execFileSync(join(root, "hooks/session-start.sh"), {
    env: { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: root },
    encoding: "utf8",
  });
  assert.equal(out, context);
});

test("after a compaction, the hook also tells a flatpaper-mode session to re-invoke it and rebuild its task list", () => {
  const out = runHook(undefined, ["compact"]);
  assert.ok(out.startsWith(context));
  assert.match(out.slice(context.length), /flatpaper-stack:flatpaper-mode/);
  assert.match(out.slice(context.length), /TaskList/);
});

test("only the compact source gets the re-invoke line", () => {
  assert.equal(runHook(undefined, ["startup"]), context);
});

test("session hook: off silences the compact line too", () => {
  assert.equal(runHook("session hook: off\n", ["compact"]), "");
});

test("hooks.json passes compact to the hook only on compaction", () => {
  const entries = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8")).hooks.SessionStart;
  const commandFor = (source) => entries.find((e) => new RegExp(`^(?:${e.matcher})$`).test(source)).hooks[0].command;
  assert.match(commandFor("compact"), /session-start\.sh" compact$/);
  for (const source of ["startup", "resume", "clear"]) assert.match(commandFor(source), /session-start\.sh"$/);
});

test("a role line that mentions off does not turn the hook off", () => {
  assert.equal(runHook("judgment and prose: parent:medium # was session hook: off\n"), context);
});
