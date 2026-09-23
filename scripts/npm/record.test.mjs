import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repository, sha256, integrity, verifyRun, verifyBatch, verifyRegistry, parseTags, planTags, saveRecord } from './record.mjs';

const sourceCommit = 'a'.repeat(40);
const bytes = value => Buffer.from(JSON.stringify(value));
function fixture() {
  const archive = Buffer.from('validated archive');
  const entry = { name: '@barocss/example', version: '1.2.3', file: 'example-1.2.3.tgz', sha256: sha256(archive) };
  const manifestBytes = bytes({ schemaVersion: 1, sourceCommit, packages: [entry] });
  return { sourceCommit, manifestBytes,
    consumerBytes: bytes({ passed: true, packages: 1, manifestSha256: sha256(manifestBytes) }),
    publicationBytes: bytes({ sourceCommit, status: 'published', completed: [{ name: entry.name, version: entry.version, action: 'publish' }] }),
    archives: new Map([[entry.file, archive]]), expected: new Map([[entry.name, entry.version]]) };
}
function change(input, key, edit) {
  const value = JSON.parse(input[key]);
  edit(value);
  return { ...input, [key]: bytes(value) };
}

test('only a successful publication artifact from the selected attempt is accepted', () => {
  const zip = Buffer.from('artifact zip');
  const run = { id: 10, repository: { full_name: repository }, path: '.github/workflows/npm-release.yml',
    event: 'workflow_dispatch', head_branch: 'main', status: 'completed', conclusion: 'success', head_sha: sourceCommit };
  const artifact = { expired: false, workflow_run: { id: 10, head_sha: sourceCommit }, name: `npm-release-${sourceCommit}`,
    digest: `sha256:${sha256(zip)}`, created_at: '2026-09-20T02:45:57Z' };
  const jobs = [{ id: 20, name: 'release', conclusion: 'success', steps: [
    { name: 'Publish the validated tarballs', conclusion: 'success' },
    { name: 'Keep package archives and verification reports', conclusion: 'success', started_at: '2026-09-20T02:45:56Z', completed_at: '2026-09-20T02:45:58Z' },
  ] }];
  assert.equal(verifyRun(run, artifact, jobs, zip), 20);
  for (const override of [
    { conclusion: 'failure' }, { status: 'in_progress' }, { head_branch: 'other' }, { event: 'pull_request' },
    { path: '.github/workflows/ci.yml' }, { repository: { full_name: 'other/repo' } }, { head_sha: 'HEAD' },
  ]) assert.throws(() => verifyRun({ ...run, ...override }, artifact, jobs, zip));
  for (const override of [
    { expired: true }, { workflow_run: { id: 11, head_sha: sourceCommit } },
    { workflow_run: { id: 10, head_sha: 'b'.repeat(40) } }, { digest: 'sha256:changed' },
    { created_at: '2026-09-20T02:37:43Z' }, { created_at: 'invalid' }, { name: 'other' },
  ]) assert.throws(() => verifyRun(run, { ...artifact, ...override }, jobs, zip));
  assert.throws(() => verifyRun(run, artifact, [], zip));
  assert.throws(() => verifyRun(run, artifact, [...jobs, ...jobs], zip));
  for (const state of ['failure', 'cancelled', 'skipped']) {
    for (let index = 0; index < 2; index++) {
      const changed = structuredClone(jobs); changed[0].steps[index].conclusion = state;
      assert.throws(() => verifyRun(run, artifact, changed, zip));
    }
  }
});

test('successful batch binds archives, source identities and all reports', () => {
  const input = fixture();
  const record = verifyBatch(input);
  assert.equal(record.packages[0].integrity, integrity(Buffer.from('validated archive')));
  assert.equal(record.packages[0].tag, '@barocss/example@1.2.3');
  assert.equal(record.reports.manifest.sha256, sha256(input.manifestBytes));
  assert.deepEqual(record, verifyBatch(input));
  const retry = change(input, 'publicationBytes', report => { report.completed[0].action = 'skip-identical'; });
  assert.equal(verifyBatch(retry).packages[0].sha256, record.packages[0].sha256);
});

test('incomplete, uncertain, mismatched and duplicate publication reports fail', () => {
  const input = fixture();
  for (const edit of [
    r => { r.status = 'failed-or-uncertain'; }, r => { r.status = 'publishing'; },
    r => { r.sourceCommit = 'b'.repeat(40); }, r => { r.completed = []; },
    r => { r.completed.push(r.completed[0]); }, r => { r.completed[0].name = '@barocss/other'; },
    r => { r.completed[0].version = '1.0.0'; }, r => { r.completed[0].action = 'pending'; },
  ]) assert.throws(() => verifyBatch(change(input, 'publicationBytes', edit)));
  for (const edit of [r => { r.passed = false; }, r => { r.packages = 0; }, r => { r.manifestSha256 = 'changed'; }]) {
    assert.throws(() => verifyBatch(change(input, 'consumerBytes', edit)));
  }
  assert.throws(() => verifyBatch({ ...input, sourceCommit: 'b'.repeat(40) }));
  assert.throws(() => verifyBatch({ ...input, expected: new Map([['@barocss/example', '2.0.0']]) }));
  assert.throws(() => verifyBatch({ ...input, expected: new Map([...input.expected, ['@barocss/new', '1.0.0']]) }));
});

test('missing, changed and unsafe archives cannot become release evidence', () => {
  const input = fixture();
  assert.throws(() => verifyBatch({ ...input, archives: new Map() }));
  assert.throws(() => verifyBatch({ ...input, archives: new Map([['example-1.2.3.tgz', Buffer.from('changed')]]) }));
  for (const edit of [
    r => { r.packages = []; }, r => { r.packages.push(r.packages[0]); }, r => { r.schemaVersion = 2; },
    r => { r.packages[0].file = '../escape.tgz'; }, r => { r.packages[0].name = 'private'; },
    r => { r.packages[0].version = '1.2.3; echo bad'; }, r => { r.packages[0].sha256 = 'changed'; },
  ]) {
    const changed = change(input, 'manifestBytes', edit);
    const consistentConsumer = change(changed, 'consumerBytes', r => { r.manifestSha256 = sha256(changed.manifestBytes); });
    assert.throws(() => verifyBatch(consistentConsumer));
  }
});

test('historical registry verification uses the exact version, not latest', () => {
  const entry = verifyBatch(fixture()).packages[0];
  const metadata = { name: entry.name, version: entry.version, dist: { integrity: entry.integrity }, 'dist-tags': { latest: '9.0.0' } };
  assert.doesNotThrow(() => verifyRegistry(entry, metadata));
  for (const override of [{ name: 'other' }, { version: '9.0.0' }, { dist: { integrity: 'changed' } }]) {
    assert.throws(() => verifyRegistry(entry, { ...metadata, ...override }));
  }
  assert.throws(() => verifyRegistry(entry, null));
});

test('lightweight and annotated tags reuse only the released commit; conflicts fail', () => {
  const packages = verifyBatch(fixture()).packages;
  const tag = packages[0].tag;
  assert.equal(planTags(packages, sourceCommit, parseTags(''))[0].action, 'create');
  for (const output of [
    `${sourceCommit}\trefs/tags/${tag}\n`,
    `${'b'.repeat(40)}\trefs/tags/${tag}\n${sourceCommit}\trefs/tags/${tag}^{}\n`,
  ]) {
    const tags = parseTags(output);
    assert.equal(planTags(packages, sourceCommit, tags)[0].action, 'reuse');
    assert.deepEqual(planTags(packages, sourceCommit, tags), planTags(packages, sourceCommit, tags));
  }
  assert.throws(() => planTags(packages, sourceCommit, new Map([[tag, 'c'.repeat(40)]])));
  assert.throws(() => parseTags(`${sourceCommit}\trefs/tags/${tag}^{}\n`));
  assert.throws(() => parseTags(`${sourceCommit}\trefs/tags/${tag}\n${sourceCommit}\trefs/tags/${tag}\n`));
  assert.throws(() => parseTags('unexpected network error'));
});

test('saving an identical record is idempotent and a conflicting record is never overwritten', () => {
  const directory = mkdtempSync(join(tmpdir(), 'npm-record-test-'));
  try {
    const file = join(directory, 'releases', 'record.json');
    saveRecord(file, '{"evidence":"original"}\n');
    saveRecord(file, '{"evidence":"original"}\n');
    assert.throws(() => saveRecord(file, '{"evidence":"changed"}\n'));
    assert.equal(readFileSync(file, 'utf8'), '{"evidence":"original"}\n');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
