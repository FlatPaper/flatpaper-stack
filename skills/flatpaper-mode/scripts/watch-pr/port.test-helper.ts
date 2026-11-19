import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export function runPort(scenario: Record<string, unknown> = {}, args: string[] = [], program?: string) {
  const directory = mkdtempSync(join(tmpdir(), "watch-pr-no-ci-"));
  try {
    writeFileSync(join(directory, "fixture.json"), JSON.stringify(scenario));
    writeFileSync(join(directory, "gh"), `#!${process.execPath}
const s = await Bun.file(import.meta.dir + '/fixture.json').json();
const args = process.argv.slice(2);
const fail = (message) => { console.error(message); process.exit(1); };
let value;
if (args[0] === 'pr' && args[1] === 'view') {
  value = { mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', reviewDecision: '', headRefOid: 'head', headRefName: 'feature', baseRefName: 'main', state: 'OPEN', mergedAt: null, isDraft: false, ...s.facts };
} else if (args[0] === 'pr' && args[1] === 'checks') {
  if (s.fast === 'reported') value = [{ name: 'ci', state: 'SUCCESS', bucket: 'pass' }];
  else if (s.fast === 'empty') value = [];
  else fail(s.fast === 'error' ? 'HTTP 401' : "no checks reported on the 'feature' branch");
} else if (args.some(a => a.includes('query PrCheckRollup'))) {
  if (s.rollup === 'error') fail('HTTP 502');
  const commit = { oid: 'head', statusCheckRollup: s.rollup === 'contexts' ? { contexts: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } : null };
  value = { data: { repository: { pullRequest: { commits: { nodes: s.rollup === 'missing-head' ? [] : [{ commit }] } } } } };
} else if (args.some(a => a.includes('/check-suites'))) {
  if (s.suites === 'error') fail('HTTP 403');
  if (!args.includes('--paginate') || !args.includes('--slurp')) fail('pagination required');
  value = s.pages ?? [{ check_suites: s.suites ?? [] }];
} else if (args.some(a => a.includes('query PrCommitStatuses'))) {
  value = { data: { repository: { pullRequest: { commits: { nodes: (s.commits ?? [{ oid: 'head', state: null }]).map(c => ({ commit: { oid: c.oid, statusCheckRollup: c.state === null ? null : { state: c.state } } })) } } } } };
} else if (args.some(a => a.includes('query ReviewThreads'))) {
  value = { data: { repository: { pullRequest: { reviewThreads: { nodes: s.threads ?? [], pageInfo: { hasNextPage: false, endCursor: null } } } } } };
} else fail('unexpected fixture command');
console.log(JSON.stringify(value));
`, { mode: 0o755 });
    return spawnSync(process.execPath, program ? ["-e", program] : [join(import.meta.dir, "watch-pr"), "--owner", "owner", "--repo", "repo", "--pr", "45", "--max-query-errors", "1", ...args], {
      encoding: "utf8", timeout: 5000,
      env: { ...process.env, PATH: directory + ":" + process.env.PATH },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export const suite = (fields: Record<string, unknown> = {}) => ({
  head_sha: "head", status: "completed", conclusion: "action_required",
  app: { slug: "github-actions" }, latest_check_runs_count: 0, ...fields,
});
