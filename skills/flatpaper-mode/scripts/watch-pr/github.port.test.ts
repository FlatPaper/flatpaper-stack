import { expect, it } from "bun:test";
import { PR_COMMIT_STATUS_QUERY, unsettledSuiteChecks } from "./github.ts";
import { runPort, suite } from "./port.test-helper.ts";

const program = `import { GhGitHubReader, resolveChecks, WatcherQueryError } from ${JSON.stringify(import.meta.dir + "/github.ts")};
try {
  console.log(JSON.stringify(await resolveChecks(new GhGitHubReader(), { owner: 'owner', repo: 'repo', number: 45 })));
} catch (error) {
  if (!(error instanceof WatcherQueryError)) throw error;
  console.log(JSON.stringify(error.failure));
  process.exit(7);
}`;

it("confirms no checks through both check reads", () => {
  const result = runPort({}, [], program);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ kind: "no-checks" });
});

it("fails closed on one-sided absence, missing heads, and failed queries", () => {
  for (const scenario of [{ fast: "error" }, { fast: "empty" }, { rollup: "contexts" }, { rollup: "missing-head" }, { rollup: "error" }]) {
    const result = runPort(scenario, [], program);
    expect(result.status).toBe(7);
    expect(JSON.parse(result.stdout)).toMatchObject({ retryable: true });
  }
});

it("reads unsettled suites as failed or pending checks when no checks are reported", () => {
  for (const conclusion of ["action_required", "failure", "cancelled", "timed_out", "startup_failure", "stale"]) {
    expect(unsettledSuiteChecks([{ check_suites: [suite({ conclusion })] }], "head", "no-checks"))
      .toMatchObject([{ kind: "failed", reportedState: conclusion.toUpperCase() }]);
  }
  for (const fields of [
    ...["queued", "in_progress", "waiting", "requested"].map(status => ({ status, conclusion: null })),
    { status: "queued", conclusion: null, app: null },
    { status: "queued", conclusion: null, app: {} },
    { status: "queued", conclusion: null, app: { slug: "claude" }, latest_check_runs_count: 1 },
    { status: "queued", conclusion: null, app: { slug: "claude" }, latest_check_runs_count: null },
  ]) {
    expect(unsettledSuiteChecks([{ check_suites: [suite(fields)] }], "head", "no-checks"))
      .toMatchObject([{ kind: "pending" }]);
  }
});

it("validates every suite page and its head identity", () => {
  for (const pages of [[], [{}], [{ check_suites: [suite({ head_sha: "other" })] }], [{ check_suites: [suite({ conclusion: null })] }]]) {
    expect(() => unsettledSuiteChecks(pages, "head", "no-checks")).toThrow();
  }
});

it("ignores clean suites and another app's idle suites in either reading", () => {
  for (const kind of ["reported", "no-checks"] as const) {
    for (const fields of [
      ...["success", "neutral", "skipped"].map(conclusion => ({ conclusion })),
      { status: "queued", conclusion: null, app: { slug: "claude" } },
    ]) expect(unsettledSuiteChecks([{ check_suites: [suite(fields)] }], "head", kind)).toEqual([]);
  }
});

it("counts only unseen approval gates and unstarted Actions beside reported checks", () => {
  for (const fields of [
    { conclusion: "failure" }, { conclusion: "cancelled" },
    { latest_check_runs_count: 1 },
    { status: "in_progress", conclusion: null, latest_check_runs_count: 2 },
    { status: "in_progress", conclusion: null, app: { slug: "wip" } },
  ]) expect(unsettledSuiteChecks([{ check_suites: [suite(fields)] }], "head", "reported")).toEqual([]);
  expect(unsettledSuiteChecks([{ check_suites: [suite({ app: { slug: "gate", name: "Gate" } })] }], "head", "reported"))
    .toMatchObject([{ kind: "failed", name: "Gate check suite", reportedState: "ACTION_REQUIRED" }]);
});

it("leaves suite inspection to the snapshot after resolving reported checks", () => {
  const result = runPort({ fast: "reported", suites: "error" }, [], program);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ kind: "reported", source: "gh-pr-checks", checks: [{ name: "third-party" }] });
});

it("keeps commit ids in the history query for head matching and previous CI", () => {
  expect(PR_COMMIT_STATUS_QUERY).toMatch(/commit\s*\{\s*oid\s+statusCheckRollup/);
});
