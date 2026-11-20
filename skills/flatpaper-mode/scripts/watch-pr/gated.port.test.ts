import { expect, it } from "bun:test";
import { runPort, suite } from "./port.test-helper.ts";

const verdict = (stdout: string) => JSON.parse(stdout.trim().split("\n").at(-1)!);

it("blocks approval-gated Actions beside a passing third-party check instead of READY", () => {
  const result = runPort({ fast: "reported", suites: [suite()] });
  expect(verdict(result.stdout)).toMatchObject({ kind: "BLOCKER", blocker: {
    kind: "failing-checks", ci: { kind: "ci-failing", source: "gh-pr-checks",
      failed: [{ reportedState: "ACTION_REQUIRED", description: expect.stringContaining("approve the workflows") }] },
  } });
  expect(result.status).toBe(4);
});

it("blocks approval-gated Actions without reported checks on the first read", () => {
  const result = runPort({ suites: [suite()] });
  expect(result.status).toBe(4);
  expect(verdict(result.stdout)).toMatchObject({ blocker: { ci: {
    kind: "ci-failing", source: "check-suites", failed: [{ reportedState: "ACTION_REQUIRED" }],
  } } });
});

it("waits for unstarted Actions with and without reported checks", () => {
  for (const fast of [undefined, "reported"]) {
    const result = runPort({ fast, suites: [suite({ status: "queued", conclusion: null })] }, ["--status-only"]);
    expect(result.status).toBe(0);
    expect(verdict(result.stdout)).toMatchObject({ rows: [{ ci: { kind: "ci-pending", pending: [{ reportedState: "QUEUED" }] } }] });
  }
});

it("ignores replaced failures and cancellations beside reported checks", () => {
  const result = runPort({ fast: "reported", suites: [
    ...[0, 3].flatMap(latest_check_runs_count => ["failure", "cancelled"].map(conclusion => suite({ conclusion, latest_check_runs_count }))),
    suite({ status: "in_progress", conclusion: null, latest_check_runs_count: 2 }),
    suite({ latest_check_runs_count: 1 }),
  ] });
  expect(result.status).toBe(0);
  expect(verdict(result.stdout).kind).toBe("READY");
});

it("ignores another app's idle suite with and without reported checks", () => {
  for (const fast of [undefined, "reported"]) {
    const result = runPort({ fast, suites: [suite({ status: "queued", conclusion: null, app: { slug: "claude" } })] });
    expect(result.status).toBe(0);
    expect(verdict(result.stdout).kind).toBe("READY");
  }
});

it("fails closed on unreadable suites beside passing checks", () => {
  const result = runPort({ fast: "reported", suites: "error" });
  expect(result.status).toBe(7);
});

it("keeps already pending and failed checks without requiring suite access", () => {
  for (const [bucket, state, ci] of [["pending", "IN_PROGRESS", "ci-pending"], ["fail", "FAILURE", "ci-failing"]]) {
    const result = runPort({ fast: "reported", checks: [{ name: "ci", bucket, state }], suites: "error" }, ["--status-only"]);
    expect(result.status).toBe(0);
    expect(verdict(result.stdout)).toMatchObject({ rows: [{ ci: { kind: ci } }] });
  }
});

it("uses the PR facts head for the paginated suite lookup", () => {
  const result = runPort({ fast: "reported", facts: { headRefOid: "pushed" }, pages: [
    { check_suites: [] }, { check_suites: [suite({ head_sha: "pushed", app: { slug: "github-actions", name: "GitHub Actions" } })] },
  ] });
  expect(result.status).toBe(4);
  expect(verdict(result.stdout)).toMatchObject({ blocker: { ci: { failed: [{ name: "GitHub Actions check suite" }] } } });
});
