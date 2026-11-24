import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";

const MODE_SKILL = "flatpaper-stack:flatpaper-mode";

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function invokesMode(line) {
  if (!line.includes(MODE_SKILL)) return false;
  if (line.includes(`<command-name>/${MODE_SKILL}</command-name>`)) return true;
  const content = parseLine(line)?.message?.content;
  return Array.isArray(content) && content.some((c) => c.type === "tool_use" && c.name === "Skill" && c.input?.skill === MODE_SKILL);
}

export function advanceModeScan(path, state) {
  const from = state.scannedTo ?? 0;
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return false;
    if (state.usedMode) return true;
    const buf = Buffer.alloc(Math.max(0, stat.size - from));
    readSync(fd, buf, 0, buf.length, from);
    const end = buf.lastIndexOf(0x0a) + 1;
    state.scannedTo = from + end;
    state.usedMode = buf.subarray(0, end).toString("utf8").split("\n").some(invokesMode);
  } finally {
    closeSync(fd);
  }
  return state.usedMode;
}

