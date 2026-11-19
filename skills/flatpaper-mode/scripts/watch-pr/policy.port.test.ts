import { expect, it } from "bun:test";
import { runPort } from "./port.test-helper.ts";

it("returns STATUS and READY for a repository without CI", () => {
  for (const args of [["--status-only"], []]) {
    const result = runPort({}, args);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject(args.length ? {
      kind: "STATUS", rows: [{ ci: { kind: "ci-none" } }],
    } : { kind: "READY", scope: { pr: { proof: { ci: { kind: "ci-none" } } } } });
  }
});

it("keeps existing conflicts, review threads, and merge gates", () => {
  const cases = [
    [{ facts: { mergeable: "CONFLICTING" } }, 2, "merge-conflicts"],
    [{ threads: [{ id: "thread", isResolved: false, comments: { nodes: [] } }] }, 3, "review-threads"],
    [{ facts: { reviewDecision: "CHANGES_REQUESTED" } }, 6, "merge-gate"],
    [{ facts: { isDraft: true } }, 6, "merge-gate"],
  ] as const;
  for (const [scenario, code, kind] of cases) {
    const result = runPort(scenario);
    expect(result.status).toBe(code);
    expect(JSON.parse(result.stdout)).toMatchObject({ kind: "BLOCKER", blocker: { kind } });
  }
});

it("waits when any PR commit reported CI or mergeability is unknown", () => {
  for (const scenario of [
    { commits: [{ oid: "earlier", state: "SUCCESS" }, { oid: "head", state: null }] },
    { commits: [{ oid: "head", state: "PENDING" }] },
    { facts: { mergeable: "UNKNOWN" } },
  ]) {
    const result = runPort(scenario);
    expect(result.status).toBe(7);
    expect(JSON.parse(result.stdout)).toMatchObject({ blocker: { failure: { kind: "checks-unavailable" } } });
  }
});
