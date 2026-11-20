import { expect, it } from "bun:test";
import { runPort, suite } from "./port.test-helper.ts";

const program = `import { GhGitHubReader, resolveChecks, WatcherQueryError } from ${JSON.stringify(import.meta.dir + "/github.ts")};
try {
  console.log(JSON.stringify(await resolveChecks(new GhGitHubReader(), { owner: 'owner', repo: 'repo', number: 45 })));
} catch (error) {
  if (!(error instanceof WatcherQueryError)) throw error;
  console.log(JSON.stringify(error.failure));
  process.exit(7);
}`;

it("confirms no checks through both reads and the head's suites", () => {
  for (const suites of [[], [suite({ conclusion: "success" })], [suite({ conclusion: "neutral" })], [suite({ conclusion: "skipped" })], [suite({ status: "queued", conclusion: null, app: { slug: "claude" } })]]) {
    const result = runPort({ suites }, [], program);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ kind: "no-checks" });
  }
});

it("fails closed on one-sided absence, missing heads, and failed queries", () => {
  for (const scenario of [{ fast: "error" }, { fast: "empty" }, { rollup: "contexts" }, { rollup: "missing-head" }, { rollup: "error" }, { suites: "error" }]) {
    const result = runPort(scenario, [], program);
    expect(result.status).toBe(7);
    expect(JSON.parse(result.stdout)).toMatchObject({ retryable: true });
  }
});

it("keeps approval-gated, unfinished, failed, and unknown suites unavailable", () => {
  for (const fields of [
    {},
    ...["failure", "cancelled", "timed_out", "startup_failure"].map(conclusion => ({ conclusion })),
    ...["queued", "in_progress", "waiting", "requested"].map(status => ({ status, conclusion: null })),
    { status: "queued", conclusion: null, app: null },
    { status: "queued", conclusion: null, app: {} },
    { status: "queued", conclusion: null, app: { slug: "claude" }, latest_check_runs_count: 1 },
    { status: "queued", conclusion: null, app: { slug: "claude" }, latest_check_runs_count: null },
  ]) {
    const result = runPort({ suites: [suite(fields)] }, [], program);
    expect(result.status).toBe(7);
    expect(JSON.parse(result.stdout)).toMatchObject({ kind: "checks-unavailable" });
    if (Object.keys(fields).length === 0) expect(result.stdout).toContain("requires maintainer approval");
  }
});

it("validates every suite page and its head identity", () => {
  for (const pages of [[], [{}], [{ check_suites: [suite({ head_sha: "other" })] }], [{ check_suites: [] }, { check_suites: [suite()] }]]) {
    const result = runPort({ pages }, [], program);
    expect(result.status).toBe(7);
  }
});

it("does not read suites for reported checks", () => {
  const result = runPort({ fast: "reported", suites: "error" }, [], program);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ kind: "reported", source: "gh-pr-checks", checks: [{ name: "ci" }] });
});
