import { expect, it } from "bun:test";
import { fakeReader, pendingCheck } from "./fakes.test-helper.ts";
import { classifyPr, readSnapshot, runQueued, runSimple } from "./policy.ts";
import { renderJson, renderPretty } from "./render.ts";
import { runPort } from "./port.test-helper.ts";
import { parsePrNumber } from "./types.ts";
import type * as T from "./types.ts";

const context = { owner: "owner", repo: "repo", number: parsePrNumber(1) };
const options = { interval: 10, sweepInterval: 300, timeout: 70, maxQueryErrors: 1, allowDraft: false };
const unknowns: Partial<T.PullRequestFacts>[] = [
  { mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" },
  { mergeable: "MERGEABLE", mergeStateStatus: "UNKNOWN" },
  { mergeable: "UNKNOWN", mergeStateStatus: "CLEAN" },
];
function readerFor(facts: Partial<T.PullRequestFacts>, noCi = false) {
  const reader = fakeReader({ facts, ...(noCi ? {
    fastPath: { kind: "none-reported" }, commitRollups: [{ oid: "head", state: null }],
  } : {}) });
  reader.checkRollupPage = async () => ({ rollup: "absent", checks: [], endCursor: null });
  return reader;
}
async function run(reader: T.GitHubReader, mode: T.WatchMode = "single") {
  let now = 0;
  const events: T.ProgressVerdict[] = [];
  const dependencies = { reader, clock: { now: () => now, observedAt: () => new Date(now * 1000).toISOString(), sleep: async (seconds: number) => { now += seconds; } }, emit: (event: T.ProgressVerdict) => events.push(event) };
  const verdict = mode === "queued-stack"
    ? await runQueued({ dependencies, contexts: [context], options })
    : await runSimple({ dependencies, contexts: mode === "stack" ? [context, { ...context, number: parsePrNumber(2) }] : [context], mode, statusOnly: false, options });
  return { verdict, events };
}

for (const [name, facts, noCi] of [
  ["probe A, passing checks", unknowns[0]!, false],
  ["probe B, confirmed no checks", unknowns[1]!, true],
] as const) {
  it(`does not return READY for ${name} when the reread finds conflicts`, async () => {
    const reader = readerFor(facts, noCi);
    const original = reader.pullRequest;
    let reads = 0;
    reader.pullRequest = async requested => ({ ...await original(requested), ...(++reads % 2 === 0 ? { mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" } as const : {}) });
    const result = await run(reader);
    expect(result.verdict.kind).toBe("TIMEOUT");
    expect(result.verdict).toMatchObject({ exitCode: 5, reason: { kind: "mergeability-unknown" } });
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "WAITING", reason: { kind: "mergeability-unknown" } }));
  });
}

for (const mode of ["single", "stack", "queued-stack"] as const) {
  for (const noCi of [false, true]) {
    it(`waits on either UNKNOWN field in ${mode}, noCi=${noCi}`, async () => {
      for (const facts of unknowns) {
        const result = await run(readerFor(facts, noCi), mode);
        expect(result.verdict.kind).toBe("TIMEOUT");
        const waits = result.events.filter(event => event.kind === "WAITING");
        expect(waits.at(-1)).toMatchObject({ reason: { kind: "mergeability-unknown" } });
        expect(renderJson(waits.at(-1)!)).toContain('"kind":"mergeability-unknown"');
        expect(renderPretty(waits.at(-1)!)).toContain("GitHub is still computing mergeability");
        if (mode !== "queued-stack") expect(renderPretty(result.verdict)).toContain("GitHub is still computing mergeability");
      }
    });
  }
}

it("status-only exits zero with an unknown merge cell and a non-ready decision", async () => {
  for (const facts of unknowns) {
    for (const noCi of [false, true]) {
      const row = await readSnapshot({ reader: readerFor(facts, noCi), context, pendingHistory: "omit", allowDraft: false, confirmNoChecks: () => true });
      expect(classifyPr(row).kind).toBe("mergeability-unknown");
      const result = runPort({ facts, ...(noCi ? {} : { fast: "reported" }) }, ["--status-only", "--pretty"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("GitHub is still computing mergeability");
      expect(result.stdout).not.toContain("READY");
      const json = runPort({ facts, ...(noCi ? {} : { fast: "reported" }) }, ["--status-only"]);
      expect(json.status).toBe(0);
      expect(JSON.parse(json.stdout)).toMatchObject({ kind: "STATUS", rows: [{ facts }] });
    }
  }
});

it("preserves pending and unreported check priority", async () => {
  const pending = readerFor(unknowns[0]!);
  pending.checksFastPath = async () => ({ kind: "checks", checks: [pendingCheck()] });
  expect((await run(pending)).verdict).toMatchObject({ reason: { kind: "pending-checks" } });
  const result = await run(readerFor(unknowns[0]!, true));
  expect(result.events[0]).toMatchObject({ reason: { kind: "checks-unreported" } });
});

it("resumes readiness or reports conflicts after mergeability resolves", async () => {
  for (const mergeable of ["MERGEABLE", "CONFLICTING"] as const) {
    const reader = readerFor(unknowns[0]!);
    const original = reader.pullRequest;
    let reads = 0;
    reader.pullRequest = async requested => ({
      ...await original(requested),
      ...(++reads > 2 ? { mergeable, mergeStateStatus: mergeable === "MERGEABLE" ? "CLEAN" : "DIRTY" } as const : {}),
    });
    const result = await run(reader);
    expect(result.events[0]).toMatchObject({ kind: "WAITING", reason: { kind: "mergeability-unknown" } });
    expect(result.verdict).toMatchObject(mergeable === "MERGEABLE"
      ? { kind: "READY", exitCode: 0 }
      : { kind: "BLOCKER", exitCode: 2, blocker: { kind: "merge-conflicts" } });
  }
});

it("defers drafts while computing mergeability but preserves immediate blockers", async () => {
  expect((await run(readerFor({ ...unknowns[0], isDraft: true }))).verdict)
    .toMatchObject({ kind: "TIMEOUT", reason: { kind: "mergeability-unknown" } });
  expect((await run(readerFor({ ...unknowns[0], reviewDecision: "CHANGES_REQUESTED" }))).verdict)
    .toMatchObject({ kind: "BLOCKER", exitCode: 6 });
});
