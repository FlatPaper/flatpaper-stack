import { expect, it } from "bun:test";
import { fakeReader, failedCheck, passingCheck, pendingCheck } from "./fakes.test-helper.ts";
import { WatcherQueryError } from "./github.ts";
import { classifyPr, readSnapshot, runSimple, verdictFactory } from "./policy.ts";
import { renderPretty } from "./render.ts";
import { parsePrNumber } from "./types.ts";
import type * as T from "./types.ts";

const context: T.PrContext = { owner: "owner", repo: "repo", number: parsePrNumber(1) };
const snapshot = (reader: T.GitHubReader, confirmNoChecks?: () => boolean) =>
  readSnapshot({ reader, context, pendingHistory: "omit", allowDraft: false, confirmNoChecks });

it("retries a head pushed before checks instead of READY beside gated Actions", async () => {
  const reader = fakeReader({ commitRollups: [{ oid: "head", state: "SUCCESS" }, { oid: "pushed", state: "SUCCESS" }] });
  const facts = reader.pullRequest;
  let head = "head";
  reader.pullRequest = async requested => ({ ...await facts(requested), headRefOid: head });
  reader.checksFastPath = async () => {
    head = "pushed";
    return { kind: "checks", checks: [passingCheck("third-party")] };
  };
  reader.unsettledSuites = async (_requested, oid) => oid === "pushed" ? [failedCheck("Actions approval")] : [];
  const events: T.ProgressVerdict[] = [];
  let now = 0;
  const verdict = await runSimple({
    dependencies: { reader, emit: event => events.push(event), clock: {
      now: () => now, observedAt: () => new Date(now * 1000).toISOString(), sleep: async seconds => { now += seconds; },
    } },
    contexts: [context], mode: "single", statusOnly: false,
    options: { interval: 10, sweepInterval: 300, timeout: 180, maxQueryErrors: 2, allowDraft: false },
  });
  expect(verdict.kind).toBe("BLOCKER");
  expect(verdict).toMatchObject({ exitCode: 4, blocker: { kind: "failing-checks" } });
  expect(events).toMatchObject([{ kind: "RETRY", failure: { kind: "snapshot-changed", retryable: true } }]);
  expect(events[0]?.kind === "RETRY" && events[0].failure.detail).toContain("headRefOid head -> pushed");
});

const changes: Partial<Omit<T.PullRequestFacts, "context">>[] = [
  { headRefOid: "pushed" }, { headRefName: "renamed" }, { baseRefName: "release" },
  { state: "CLOSED" }, { state: "MERGED" }, { mergedAt: "2026-01-01T00:00:00Z" },
  { isDraft: true }, { reviewDecision: "CHANGES_REQUESTED" },
  { mergeable: "CONFLICTING" }, { mergeStateStatus: "DIRTY" },
];
for (const change of changes) {
  it(`rejects changed facts ${JSON.stringify(change)}`, async () => {
    const reader = fakeReader();
    const facts = reader.pullRequest;
    let collected = false;
    reader.commitRollups = async () => {
      collected = true;
      return [{ oid: "head", state: "SUCCESS" }];
    };
    reader.pullRequest = async requested => ({ ...await facts(requested), ...collected ? change : {} });
    await expect(snapshot(reader)).rejects.toMatchObject({ failure: { kind: "snapshot-changed", retryable: true } });
  });
}

for (const confirmed of [false, true]) {
  it(`rechecks facts after no-checks CI with confirmation ${confirmed}`, async () => {
    const reader = fakeReader({ fastPath: { kind: "none-reported" } });
    const facts = reader.pullRequest;
    let collected = false;
    reader.checkRollupPage = async () => ({ rollup: "absent", checks: [], endCursor: null });
    reader.commitRollups = async () => { collected = true; return [{ oid: "head", state: null }]; };
    reader.pullRequest = async requested => ({ ...await facts(requested), baseRefName: collected ? "release" : "main" });
    await expect(snapshot(reader, () => confirmed)).rejects.toMatchObject({ failure: { kind: "snapshot-changed", retryable: true } });
  });
}

it("rechecks facts when pending history is omitted", async () => {
  const reader = fakeReader();
  const facts = reader.pullRequest;
  let collected = false;
  reader.checksFastPath = async () => { collected = true; return { kind: "checks", checks: [pendingCheck()] }; };
  reader.pullRequest = async requested => ({ ...await facts(requested), isDraft: collected });
  await expect(snapshot(reader)).rejects.toBeInstanceOf(WatcherQueryError);
});

it("rejects commit responses missing the expected non-null head", async () => {
  for (const commits of [[], [{ oid: "pushed", state: "SUCCESS" as const }]]) {
    await expect(snapshot(fakeReader({ commitRollups: commits }))).rejects.toMatchObject({
      failure: { kind: "snapshot-changed", retryable: true, detail: "commit response does not contain expected head head" },
    });
  }
});

it("accepts a present head with a null rollup", async () => {
  expect(classifyPr(await snapshot(fakeReader({ commitRollups: [{ oid: "head", state: null }] })))).toMatchObject({ kind: "ready" });
});

it("explains snapshot retries in human output", () => {
  const stamp = verdictFactory({ now: () => 0, observedAt: () => "now", sleep: async () => {} }, "single");
  const verdict = stamp({ kind: "RETRY", terminal: false, consecutiveFailures: 1, retryInSeconds: 60,
    failure: { kind: "snapshot-changed", retryable: true, detail: "head moved" } });
  expect(renderPretty(verdict)).toContain("the PR changed while its status was being read");
});
