import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPlaybooks } from "../skills/flatpaper-mode/scripts/check-playbooks.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "../skills/flatpaper-mode/scripts/check-playbooks.mjs");

function run(playbooks, { throughSymlink = false, cwd = ".", args = ["."] } = {}) {
  // The script reports the resolved working directory; macOS tmpdir() sits behind the /var symlink.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flatpaper-check-playbooks-")));
  try {
    if (playbooks) {
      mkdirSync(join(root, ".agents/playbooks"), { recursive: true });
      for (const [name, text] of Object.entries(playbooks)) writeFileSync(join(root, ".agents/playbooks", name), text);
    }
    const workingDirectory = join(root, cwd);
    mkdirSync(workingDirectory, { recursive: true });
    let entry = script;
    if (throughSymlink) {
      entry = join(root, "check-playbooks.mjs");
      symlinkSync(script, entry);
    }
    const result = spawnSync(process.execPath, [entry, ...args.map((arg) => join(root, arg))], { encoding: "utf8", cwd: workingDirectory });
    return { code: result.status, out: (result.stdout + result.stderr).replaceAll(root, "<root>") };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("project playbooks", { timeout: 30_000 }, () => {
  test("a change anchored on a bundled step passes", () => {
    const result = run({
      "bug-fix.md": '---\nextends: bug-fix\nwhen: Use it for any bug report.\n---\n- **In** "Binary-search the cause": compare with main.\n',
    });
    assert.deepEqual(result, { code: 0, out: "Every project playbook matches this flatpaper-stack's playbooks.\n" });
  });

  test("an unknown base, step text the base does not say, and an unquoted change all fail", () => {
    const result = run({
      "bug-fix.md": '---\nextends: bug-fix\nwhen: Use it for any bug report.\n---\n- **After** "Ask the user to reproduce it": compare with main.\n',
      "ship.md": "---\nextends: shipping-v2\nwhen: Use it to ship.\n---\n",
      "fix.md": "---\nextends: bug-fix\nwhen: Use it to fix.\n---\n- **After** “Binary-search the cause”: compare with main.\n",
    });
    assert.equal(result.code, 1);
    assert.ok(result.out.includes('.agents/playbooks/bug-fix.md: "Ask the user to reproduce it" is not in any playbook it extends'));
    assert.ok(result.out.includes(".agents/playbooks/ship.md: extends `shipping-v2`, which this flatpaper-stack has no playbook for"));
    assert.ok(result.out.includes(".agents/playbooks/fix.md: a change has no straight-quoted step text to anchor on"));
  });

  test("the check still runs when the script is reached through a symlink", () => {
    const result = run(
      { "ship.md": "---\nextends: shipping-v2\nwhen: Use it to ship.\n---\n" },
      { throughSymlink: true },
    );
    assert.deepEqual(result, {
      code: 1,
      out: ".agents/playbooks/ship.md: extends `shipping-v2`, which this flatpaper-stack has no playbook for\n",
    });
  });

  test("a numbered change is checked like a bulleted one", () => {
    const result = run({
      "bug-fix.md": '---\nextends: bug-fix\nwhen: Use it for any bug report.\n---\n1. **After** "Ask the user to reproduce it": compare with main.\n2. **Before** Binary-search the cause: compare with main.\n',
    });
    assert.equal(result.code, 1);
    assert.ok(result.out.includes('.agents/playbooks/bug-fix.md: "Ask the user to reproduce it" is not in any playbook it extends'));
    assert.ok(result.out.includes(".agents/playbooks/bug-fix.md: a change has no straight-quoted step text to anchor on"));
  });

  test("a playbook saved with CRLF line endings passes", () => {
    const result = run({
      "bug-fix.md": '---\r\nextends: bug-fix\r\nwhen: Use it for any bug report.\r\n---\r\n- **In** "Binary-search the cause": compare with main.\r\n',
    });
    assert.deepEqual(result, { code: 0, out: "Every project playbook matches this flatpaper-stack's playbooks.\n" });
  });

  test("a playbook saved with a UTF-8 byte-order mark passes", () => {
    const result = run({
      "bug-fix.md": '﻿---\r\nextends: bug-fix\r\nwhen: Use it for any bug report.\r\n---\r\n- **In** "Binary-search the cause": compare with main.\r\n',
    });
    assert.deepEqual(result, { code: 0, out: "Every project playbook matches this flatpaper-stack's playbooks.\n" });
  });

  test("with no argument the root is the working directory", () => {
    const result = run({ "ship.md": "---\nextends: shipping-v2\nwhen: Use it to ship.\n---\n" }, { args: [] });
    assert.deepEqual(result, {
      code: 1,
      out: ".agents/playbooks/ship.md: extends `shipping-v2`, which this flatpaper-stack has no playbook for\n",
    });
  });

  test("a root with no .agents/playbooks directory passes and the check says so", () => {
    assert.deepEqual(run(null), {
      code: 0,
      out: "No project playbooks to check: <root>/.agents/playbooks does not exist.\n",
    });
  });

  test("from a subdirectory the check names the directory it looked for and does not report a match", () => {
    const result = run({ "ship.md": "---\nextends: shipping-v2\nwhen: Use it to ship.\n---\n" }, { cwd: "src", args: [] });
    assert.deepEqual(result, {
      code: 0,
      out: "No project playbooks to check: <root>/src/.agents/playbooks does not exist.\n",
    });
  });

  test("a root that does not exist is an error", () => {
    assert.deepEqual(run(null, { args: ["nope"] }), { code: 1, out: "<root>/nope is not a directory\n" });
  });

  test("a root that is a file is an error", () => {
    assert.deepEqual(run({ "ship.md": "" }, { args: [".agents/playbooks/ship.md"] }), {
      code: 1,
      out: "<root>/.agents/playbooks/ship.md is not a directory\n",
    });
  });

  test("an extends stem that leaves the playbooks directory is not a playbook", () => {
    const result = run({ "ship.md": "---\nextends: ../SKILL\nwhen: Use it to ship.\n---\n" });
    assert.deepEqual(result, {
      code: 1,
      out: ".agents/playbooks/ship.md: extends `../SKILL`, which this flatpaper-stack has no playbook for\n",
    });
  });

  test("an extends stem with either path separator is not a playbook, even where that file exists", () => {
    const root = mkdtempSync(join(tmpdir(), "flatpaper-check-playbooks-"));
    try {
      const bundled = join(root, "bundled");
      mkdirSync(join(bundled, "sub"), { recursive: true });
      // On POSIX the second path is a file named `sub\x.md`. On Windows both paths are sub/x.md.
      for (const file of ["sub/x.md", "sub\\x.md"]) writeFileSync(join(bundled, file), "");
      mkdirSync(join(root, ".agents/playbooks"), { recursive: true });
      writeFileSync(join(root, ".agents/playbooks/ship.md"), "---\nextends: sub/x, sub\\x\nwhen: Use it to ship.\n---\n");
      assert.deepEqual(checkPlaybooks(root, bundled), [
        ".agents/playbooks/ship.md: extends `sub/x`, which this flatpaper-stack has no playbook for",
        ".agents/playbooks/ship.md: extends `sub\\x`, which this flatpaper-stack has no playbook for",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
