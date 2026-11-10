import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const context = readFileSync(join(root, "hooks/session-start-context.md"), "utf8");

function runHook(modelsFile) {
  const config = mkdtempSync(join(tmpdir(), "flatpaper-hook-"));
  if (modelsFile !== undefined) {
    mkdirSync(join(config, "flatpaper-stack"));
    writeFileSync(join(config, "flatpaper-stack/models.md"), modelsFile);
  }
  return execFileSync(join(root, "hooks/session-start.sh"), {
    env: { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: root, CLAUDE_CONFIG_DIR: config },
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

test("a role line that mentions off does not turn the hook off", () => {
  assert.equal(runHook("judgment and prose: parent:medium # was session hook: off\n"), context);
});
