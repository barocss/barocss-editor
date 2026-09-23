import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { inspectTarball, root, run } from './packages.mjs';
import { repository, verifyRun, verifyBatch, verifyRegistry, parseTags, planTags, saveRecord } from './record.mjs';

// Read-only remote operations. This command never publishes, creates tags or creates releases.
const { values } = parseArgs({ options: {
  'run-id': { type: 'string' }, attempt: { type: 'string' }, 'artifact-id': { type: 'string' }, out: { type: 'string' },
} });
for (const key of ['run-id', 'attempt', 'artifact-id']) {
  if (!/^[1-9]\d*$/.test(values[key] ?? '') || !Number.isSafeInteger(Number(values[key]))) throw new Error(`Provide a positive --${key}`);
}
const api = path => JSON.parse(run('gh', ['api', `repos/${repository}/${path}`]));
const release = api(`actions/runs/${values['run-id']}/attempts/${values.attempt}`);
if (release.id !== Number(values['run-id']) || release.run_attempt !== Number(values.attempt)) throw new Error('Release attempt mismatch');
const jobs = api(`actions/runs/${values['run-id']}/attempts/${values.attempt}/jobs?per_page=100`);
if (jobs.total_count !== jobs.jobs.length) throw new Error('Incomplete release job response');
const artifact = api(`actions/artifacts/${values['artifact-id']}`);
if (artifact.id !== Number(values['artifact-id']) || artifact.size_in_bytes > 64 * 1024 * 1024) throw new Error('Invalid or oversized artifact');
const zip = execFileSync('gh', ['api', `repos/${repository}/actions/artifacts/${artifact.id}/zip`], { maxBuffer: 64 * 1024 * 1024 });
const jobId = verifyRun(release, artifact, jobs.jobs, zip);
const directory = mkdtempSync(join(tmpdir(), 'wonffice-npm-record-'));
try {
  const zipPath = join(directory, 'artifact.zip');
  writeFileSync(zipPath, zip);
  const paths = run('unzip', ['-Z1', zipPath]).trim().split('\n');
  if (new Set(paths).size !== paths.length) throw new Error('Duplicate ZIP entries');
  const manifests = paths.filter(path => /^batch-[a-zA-Z0-9]+\/manifest\.json$/.test(path));
  if (manifests.length !== 1) throw new Error('Expected exactly one publication batch');
  const batch = dirname(manifests[0]);
  const read = file => execFileSync('unzip', ['-p', zipPath, `${batch}/${file}`], { maxBuffer: 64 * 1024 * 1024 });
  const manifestBytes = read('manifest.json');
  const manifest = JSON.parse(manifestBytes);
  const archives = new Map();
  for (const entry of manifest.packages ?? []) {
    if (typeof entry.file !== 'string' || !/^[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.tgz$/.test(entry.file)) throw new Error('Unsafe archive name');
    archives.set(entry.file, read(entry.file));
  }

  // Read package identities from the published commit, never today's checkout.
  if (!/^[a-f0-9]{40}$/.test(release.head_sha)
    || run('git', ['cat-file', '-t', release.head_sha]).trim() !== 'commit') throw new Error('Fetch the released commit first');
  const packagePaths = run('git', ['ls-tree', '-r', '--name-only', release.head_sha, '--', 'packages'])
    .trim().split('\n').filter(path => /^packages\/[^/]+\/package\.json$/.test(path));
  const expected = new Map();
  for (const path of packagePaths) {
    const source = JSON.parse(run('git', ['show', `${release.head_sha}:${path}`]));
    if (!source.private) {
      if (expected.has(source.name)) throw new Error('Duplicate public source package');
      expected.set(source.name, source.version);
    }
  }
  const batchRecord = verifyBatch({ manifestBytes, consumerBytes: read('consumer.json'), publicationBytes: read('publication.json'),
    archives, expected, sourceCommit: release.head_sha });
  for (const entry of batchRecord.packages) {
    const file = join(directory, entry.file);
    writeFileSync(file, archives.get(entry.file));
    const packed = inspectTarball(file);
    if (packed.name !== entry.name || packed.version !== entry.version) throw new Error('Packed package identity mismatch');
    const url = `https://registry.npmjs.org/${encodeURIComponent(entry.name)}/${entry.version}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Registry lookup failed (${response.status}): ${entry.name}`);
    verifyRegistry(entry, await response.json());
  }
  const tags = parseTags(run('git', ['ls-remote', '--tags', `https://github.com/${repository}.git`]));
  const plan = planTags(batchRecord.packages, release.head_sha, tags);
  const record = {
    schemaVersion: 1, repository, sourceCommit: release.head_sha,
    evidence: {
      runId: release.id, attempt: release.run_attempt, jobId,
      runUrl: `https://github.com/${repository}/actions/runs/${release.id}/attempts/${release.run_attempt}`,
      artifactId: artifact.id, artifactDigest: artifact.digest, artifactCreatedAt: artifact.created_at,
    },
    ...batchRecord,
  };
  const contents = `${JSON.stringify(record, null, 2)}\n`;
  if (values.out) saveRecord(resolve(root, values.out), contents);
  console.log(JSON.stringify({ record, tagPlan: plan }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
