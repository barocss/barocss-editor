import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const repository = 'barocss/barocss-editor';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const integrity = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

export function verifyRun(run, artifact, jobs, zip) {
  assert(run.repository?.full_name === repository && run.path === '.github/workflows/npm-release.yml'
    && run.event === 'workflow_dispatch' && run.head_branch === 'main'
    && run.status === 'completed' && run.conclusion === 'success'
    && /^[a-f0-9]{40}$/.test(run.head_sha), 'A successful manual npm release attempt on main is required');
  assert(artifact.expired === false && artifact.workflow_run?.id === run.id
    && artifact.workflow_run.head_sha === run.head_sha
    && artifact.name === `npm-release-${run.head_sha}`, 'Artifact does not belong to this release');
  assert(artifact.digest === `sha256:${sha256(zip)}`, 'Artifact archive digest mismatch');
  const releases = jobs.filter(job => job.name === 'release' && job.conclusion === 'success');
  assert(releases.length === 1, 'Expected one successful release job in this attempt');
  const job = releases[0];
  const published = job.steps.find(step => step.name === 'Publish the validated tarballs');
  const uploaded = job.steps.find(step => step.name === 'Keep package archives and verification reports');
  const created = Date.parse(artifact.created_at);
  assert(published?.conclusion === 'success' && uploaded?.conclusion === 'success'
    && created >= Date.parse(uploaded.started_at) && created <= Date.parse(uploaded.completed_at),
  'Artifact is not from the successful publication/upload in this attempt');
  return job.id;
}

export function verifyBatch({ manifestBytes, consumerBytes, publicationBytes, archives, expected, sourceCommit }) {
  const manifest = JSON.parse(manifestBytes);
  const consumer = JSON.parse(consumerBytes);
  const publication = JSON.parse(publicationBytes);
  assert(manifest.schemaVersion === 1 && manifest.sourceCommit === sourceCommit
    && publication.sourceCommit === sourceCommit, 'Batch source commit mismatch');
  assert(publication.status === 'published', 'Publication is incomplete or uncertain');
  assert(consumer.passed === true && consumer.manifestSha256 === sha256(manifestBytes), 'Consumer report does not match manifest');
  assert(Array.isArray(manifest.packages) && manifest.packages.length > 0
    && manifest.packages.length === expected.size && consumer.packages === expected.size,
  'Public package coverage mismatch');
  assert(Array.isArray(publication.completed) && publication.completed.length === expected.size, 'Publication coverage mismatch');
  const completed = new Map(publication.completed.map(entry => [entry.name, entry]));
  assert(completed.size === expected.size, 'Duplicate publication entry');
  const names = new Set(), files = new Set();
  const packages = manifest.packages.map(entry => {
    assert(/^@barocss\/[a-z0-9-]+$/.test(entry.name ?? '')
      && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(entry.version ?? ''), 'Invalid package identity');
    assert(!names.has(entry.name) && expected.get(entry.name) === entry.version, 'Package differs from released source');
    names.add(entry.name);
    assert(typeof entry.file === 'string' && /^[a-zA-Z0-9._-]+\.tgz$/.test(entry.file)
      && !entry.file.startsWith('.') && !files.has(entry.file), 'Unsafe or duplicate archive filename');
    files.add(entry.file);
    const archive = archives.get(entry.file);
    assert(archive && /^[a-f0-9]{64}$/.test(entry.sha256) && sha256(archive) === entry.sha256,
      `Missing or changed archive: ${entry.name}`);
    const done = completed.get(entry.name);
    assert(done?.version === entry.version && ['publish', 'skip-identical'].includes(done.action), 'Publication entry mismatch');
    return { ...entry, integrity: integrity(archive), tag: `${entry.name}@${entry.version}` };
  });
  return {
    packages: packages.sort((a, b) => a.name.localeCompare(b.name)),
    reports: {
      manifest: { sha256: sha256(manifestBytes), contents: manifest },
      consumer: { sha256: sha256(consumerBytes), contents: consumer },
      publication: { sha256: sha256(publicationBytes), contents: publication },
    },
  };
}

export function verifyRegistry(entry, metadata) {
  // A historical record must not require or change today's npm latest tag.
  assert(metadata?.name === entry.name && metadata.version === entry.version
    && metadata.dist?.integrity === entry.integrity, `Registry identity/integrity mismatch: ${entry.name}@${entry.version}`);
}

export function parseTags(output) {
  const refs = new Map();
  for (const line of output.trim().split('\n').filter(Boolean)) {
    const match = line.match(/^([a-f0-9]{40})\s+refs\/tags\/(.+)$/);
    assert(match, 'Unexpected remote tag response');
    assert(!refs.has(match[2]), 'Duplicate remote tag');
    refs.set(match[2], match[1]);
  }
  const tags = new Map();
  for (const [name, sha] of refs) {
    if (name.endsWith('^{}')) {
      assert(refs.has(name.slice(0, -3)), 'Peeled tag has no tag reference');
      continue;
    }
    tags.set(name, refs.get(`${name}^{}`) ?? sha);
  }
  return tags;
}

export function planTags(packages, sourceCommit, tags) {
  return packages.map(entry => {
    const current = tags.get(entry.tag);
    assert(current === undefined || current === sourceCommit, `Tag conflict: ${entry.tag}`);
    return { tag: entry.tag, sourceCommit, action: current ? 'reuse' : 'create' };
  });
}

export function saveRecord(file, contents) {
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) {
    assert(readFileSync(file, 'utf8') === contents, 'Existing release record differs; do not overwrite');
  } else writeFileSync(file, contents, { flag: 'wx' });
}
