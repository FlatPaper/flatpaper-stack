import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "../skills/resume/latest-handoff.mjs");

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), "flatpaper-handoff-"));
  const dir = join(home, ".claude/flatpaper-stack/handoffs");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return {
    dir,
    note(name, cwd) {
      mkdirSync(dir, { recursive: true });
      const path = join(dir, name);
      writeFileSync(path, `Working directory: ${cwd}\n\nResume here.\n`);
      return path;
    },
    run(cwd) {
      return spawnSync(process.execPath, cwd === undefined ? [script] : [script, cwd], {
        env: { PATH: process.env.PATH, HOME: home },
        encoding: "utf8",
      });
    },
  };
}

test("picks the newest note for the cwd by filename, not mtime", (t) => {
  const f = fixture(t);
  const newest = f.note("2026-11-26-1200-new.md", "/work/project");
  const older = f.note("2026-11-25-1200-old.md", "/work/project");
  f.note("2026-11-24-1200-first.md", "/work/project");
  utimesSync(newest, new Date("2020-01-01"), new Date("2020-01-01"));
  utimesSync(older, new Date("2026-11-26"), new Date("2026-11-26"));
  const result = f.run("/work/project");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${newest}\n`);
  assert.equal(result.stderr, "");
});

test("skips a newer note written for a different cwd", (t) => {
  const f = fixture(t);
  const matching = f.note("2026-11-25-1200-project.md", "/work/project");
  f.note("2026-11-26-1200-other.md", "/work/other");
  const result = f.run("/work/project");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${matching}\n`);
  assert.equal(result.stderr, "");
});

for (const recordedPath of [".", ""]) {
  test(`skips a newer note recording ${recordedPath === "" ? "an empty path" : "."}`, (t) => {
    const f = fixture(t);
    const cwd = process.cwd();
    const matching = f.note("2026-11-25-1200-project.md", cwd);
    f.note("2026-11-26-1200-invalid.md", recordedPath);
    const result = f.run(cwd);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${matching}\n`);
    assert.equal(result.stderr, "");
  });
}

test("no matching note exits 1 and lists only the five newest notes on stderr", (t) => {
  const f = fixture(t);
  const notes = [];
  for (let day = 20; day <= 25; day++) {
    notes.push(f.note(`2026-11-${day}-1200-other.md`, `/work/other-${day}`));
  }
  const result = f.run("/work/project");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, [
    "No handoff note for /work/project.",
    ...notes.slice(1).reverse().map((path, i) => `${path} Working directory: /work/other-${25 - i}`),
    "",
  ].join("\n"));
});

test("a missing handoffs directory exits 1 with its message", (t) => {
  const f = fixture(t);
  const result = f.run("/work/project");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, `No handoff notes in ${f.dir}.\n`);
});

test("a missing cwd argument prints usage and exits 2", (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Usage: node latest-handoff.mjs <cwd>\n");
});

test("treats a trailing slash on the cwd as the same path", (t) => {
  const f = fixture(t);
  const matching = f.note("2026-11-26-1200-project.md", "/work/project");
  const result = f.run("/work/project/");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${matching}\n`);
});

test("keeps the root cwd when removing trailing slashes", (t) => {
  const f = fixture(t);
  const matching = f.note("2026-11-26-1200-root.md", "/");
  const result = f.run("/");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${matching}\n`);
});

for (const recordedAs of ["real path", "symlink"]) {
  test(`matches equivalent directories when the note records the ${recordedAs}`, (t) => {
    const f = fixture(t);
    const root = mkdtempSync(join(tmpdir(), "flatpaper-project-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const real = realpathSync(root);
    const link = join(root, "alias");
    symlinkSync(real, link, "dir");
    const matching = f.note("2026-11-26-1200-project.md", recordedAs === "real path" ? real : link);
    const result = f.run(recordedAs === "real path" ? link : real);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${matching}\n`);
    assert.equal(result.stderr, "");
  });
}

test("matches a missing directory when the recorded path ends in a slash", (t) => {
  const f = fixture(t);
  const matching = f.note("2026-11-26-1200-project.md", "/work/project/");
  const result = f.run("/work/project");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${matching}\n`);
  assert.equal(result.stderr, "");
});

test("keeps the cwd argument as given in the no-match message", (t) => {
  const f = fixture(t);
  const other = f.note("2026-11-26-1200-other.md", "/work/other");
  const result = f.run("/work/project/");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, `No handoff note for /work/project/.\n${other} Working directory: /work/other\n`);
});

test("ignores files that do not end in .md", (t) => {
  const f = fixture(t);
  const matching = f.note("2026-11-25-1200-project.md", "/work/project");
  f.note("2026-11-26-1200-project.txt", "/work/project");
  const result = f.run("/work/project");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${matching}\n`);
});

test("matches a note with CRLF line endings", (t) => {
  const f = fixture(t);
  const matching = f.note("2026-11-26-1200-project.md", "/work/project");
  writeFileSync(matching, "Working directory: /work/project\r\n\r\nResume here.\r\n");
  const result = f.run("/work/project");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${matching}\n`);
  assert.equal(result.stderr, "");
});

test("matches the entire first line only", (t) => {
  const f = fixture(t);
  const matching = f.note("2026-11-24-1200-project.md", "/work/project");
  f.note("2026-11-25-1200-prefix.md", "/work/project-extra");
  const laterLine = f.note("2026-11-26-1200-later.md", "/work/other");
  writeFileSync(laterLine, "# Handoff\nWorking directory: /work/project\n");
  const result = f.run("/work/project");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${matching}\n`);
});
