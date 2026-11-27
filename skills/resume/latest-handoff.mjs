import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

function canonicalPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return path.replace(/\/+$/, "") || "/";
  }
}

const cwd = process.argv[2];
if (cwd === undefined) {
  console.error("Usage: node latest-handoff.mjs <cwd>");
  process.exit(2);
}
const canonicalCwd = canonicalPath(cwd);
const dir = join(homedir(), ".claude/flatpaper-stack/handoffs");

let entries;
try {
  entries = readdirSync(dir, { withFileTypes: true });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  console.error(`No handoff notes in ${dir}.`);
  process.exit(1);
}

const notes = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .map((entry) => entry.name)
  .sort()
  .reverse()
  .map((name) => {
    const path = join(dir, name);
    const firstLine = readFileSync(path, "utf8").split(/\r?\n/, 1)[0];
    return { path, firstLine };
  });

const prefix = "Working directory: ";
const match = notes.find((note) => {
  if (!note.firstLine.startsWith(prefix)) return false;
  const recordedPath = note.firstLine.slice(prefix.length);
  return recordedPath.length > 0 && isAbsolute(recordedPath) && canonicalPath(recordedPath) === canonicalCwd;
});
if (match) {
  console.log(match.path);
} else {
  console.error(`No handoff note for ${cwd}.`);
  for (const note of notes.slice(0, 5)) {
    console.error(`${note.path} ${note.firstLine}`);
  }
  process.exitCode = 1;
}
