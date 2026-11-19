import { expect, it } from "bun:test";
import { runPort } from "./port.test-helper.ts";

it("names absent checks in pretty status and READY output", () => {
  const status = runPort({}, ["--status-only", "--pretty"]);
  expect(status.status).toBe(0);
  expect(status.stdout).toContain("⏳ no checks reported yet");
  const ready = runPort({}, ["--pretty"]);
  expect(ready.status).toBe(0);
  expect(ready.stdout).toContain("checks=none reported on the head commit");
});

it("does not report a fresh head with empty rollup and suites READY", () => {
  for (const scenario of [{}, { suites: [{ head_sha: "head", status: "queued", conclusion: null, app: { slug: "third-party" }, latest_check_runs_count: 0 }] }]) {
    const result = runPort(scenario, ["--timeout", "5", "--interval", "60"]);
    expect(result.status).toBe(5);
    expect(result.stdout).not.toContain('"kind":"READY"');
    expect(JSON.parse(result.stdout.trim().split("\n").at(-1)!)).toMatchObject({ kind: "TIMEOUT", reason: { kind: "checks-unreported" } });
  }
});
