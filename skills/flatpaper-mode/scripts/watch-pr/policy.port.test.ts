import { expect, it } from "bun:test";
import { runPort } from "./port.test-helper.ts";

it("returns unconfirmed STATUS and eventually READY for a repository without CI", () => {
  for (const args of [["--status-only"], []]) {
    const result = runPort({}, args);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.trim().split("\n").at(-1)!)).toMatchObject(args.length ? {
      kind: "STATUS", rows: [{ ci: { kind: "ci-unreported" } }],
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
    expect(JSON.parse(result.stdout.trim().split("\n").at(-1)!)).toMatchObject({ kind: "BLOCKER", blocker: { kind } });
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
    expect(JSON.parse(result.stdout.trim().split("\n").at(-1)!)).toMatchObject({ blocker: { failure: { kind: "checks-unavailable" } } });
  }
});

import { fakeReader, pendingCheck } from "./fakes.test-helper.ts";
import { readSnapshot, runSimple, runQueued } from "./policy.ts";
import { parsePrNumber } from "./types.ts";
import type * as T from "./types.ts";

const context = (number = 1): T.PrContext => ({ owner: "owner", repo: "repo", number: parsePrNumber(number) });
const noChecks = () => ({ ...fakeReader({ fastPath: { kind: "none-reported" }, rollupPages: [{ rollup: "absent", checks: [], endCursor: null }], commitRollups: [{ oid: "head", state: null }] }), async checkRollupPage() { return { rollup: "absent" as const, checks: [], endCursor: null }; } });
const options = { interval: 10, sweepInterval: 300, timeout: 180, maxQueryErrors: 1, allowDraft: false };
function ticking() {
  let now = 0;
  return { now: () => now, observedAt: () => new Date(now * 1000).toISOString(), async sleep(seconds: number) { now += seconds; if (now > 3600) throw new Error("polling did not terminate"); } };
}
async function watch(reader = noChecks(), overrides: Partial<T.PollingOptions> = {}) {
  const clock = ticking();
  const events: T.ProgressVerdict[] = [];
  const verdict = await runSimple({ dependencies: { reader, clock, emit: event => events.push(event) }, contexts: [context()], mode: "single", statusOnly: false, options: { ...options, ...overrides } });
  return { verdict, events, elapsed: clock.now() };
}

it("does not call a fresh push READY before the first check registers", async () => {
  const result = await watch(noChecks(), { timeout: 5, interval: 60 });
  expect(result.verdict).toMatchObject({ kind: "TIMEOUT", exitCode: 5, reason: { kind: "checks-unreported" } });
  expect(result.events.every(event => event.kind === "WAITING" && event.reason.kind === "checks-unreported")).toBe(true);
  expect(result.elapsed).toBe(5);
});

it("does not confirm an isolated snapshot without a confirmer", async () => {
  expect(await readSnapshot({ reader: noChecks(), context: context(), pendingHistory: "omit", allowDraft: false })).toMatchObject({ ci: { kind: "ci-unreported" } });
});

it("requires 60 seconds whatever the poll interval", async () => {
  for (const interval of [1, 10, 59, 60, 90]) {
    const result = await watch(noChecks(), { interval });
    expect(result.verdict).toMatchObject({ kind: "READY", scope: { pr: { proof: { ci: { kind: "ci-none" } } } } });
    expect(result.elapsed).toBe(Math.ceil(60 / interval) * interval);
    expect(result.events.every(event => event.kind === "WAITING" && event.reason.kind === "checks-unreported")).toBe(true);
  }
});

it("resets confirmation when a new head is pushed", async () => {
  const reader = noChecks();
  const facts = reader.pullRequest;
  let polls = 0;
  reader.pullRequest = async requested => ({ ...await facts(requested), headRefOid: ++polls < 4 ? "head" : "pushed" });
  expect((await watch(reader)).elapsed).toBe(90);
});

it("honors checks that register after the first no-checks reading", async () => {
  const reader = noChecks();
  let polls = 0;
  reader.checksFastPath = async () => ++polls === 1 ? { kind: "none-reported" } : { kind: "checks", checks: [pendingCheck()] };
  const result = await watch(reader, { timeout: 20 });
  expect(result.events).toMatchObject([{ reason: { kind: "checks-unreported" } }, { reason: { kind: "pending-checks" } }, { reason: { kind: "pending-checks" } }]);
  expect(result.verdict).toMatchObject({ kind: "TIMEOUT", reason: { kind: "pending-checks" } });
});

it("confirms every PR in a stack independently", async () => {
  const reader = noChecks();
  const facts = reader.pullRequest;
  const clock = ticking();
  reader.pullRequest = async requested => ({ ...await facts(requested), headRefOid: requested.number === 2 && clock.now() >= 30 ? "pushed" : "head" });
  const events: T.ProgressVerdict[] = [];
  const verdict = await runSimple({ dependencies: { reader, clock, emit: event => events.push(event) }, contexts: [context(), context(2)], mode: "stack", statusOnly: false, options });
  expect(verdict.kind).toBe("READY");
  expect(clock.now()).toBe(90);
  expect(events.filter(event => event.kind === "WAITING").at(-1)).toMatchObject({ frontier: context(2), reason: { kind: "checks-unreported" } });
});

it("keeps a queued frontier unconfirmed until 60 seconds", async () => {
  const clock = ticking();
  const events: { at: number; event: T.ProgressVerdict }[] = [];
  const verdict = await runQueued({ dependencies: { reader: noChecks(), clock, emit: event => events.push({ at: clock.now(), event }) }, contexts: [context()], options: { ...options, timeout: 70 } });
  expect(verdict.kind).toBe("TIMEOUT");
  expect(events.filter(({ event }) => event.kind === "WAITING")).toMatchObject([
    { at: 0, event: { reason: { kind: "checks-unreported" } } },
    { at: 60, event: { reason: { kind: "merge-queue" } } },
  ]);
});
