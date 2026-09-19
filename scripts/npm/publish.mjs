import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import semver from 'semver';
import { checkArchiveImports } from './imports.mjs';
import { root, registry, packages, run, digest, inspectTarball } from './packages.mjs';

export function assertContext(env) {
  if (env.GITHUB_REPOSITORY !== 'barocss/barocss-editor' || env.GITHUB_REF !== 'refs/heads/main'
      || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_WORKFLOW_REF !== 'barocss/barocss-editor/.github/workflows/npm-release.yml@refs/heads/main'
      || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) throw new Error('Publishing requires the manual npm-release workflow on main');
}
export function assertChecks(checks) {
  for (const name of ['Lint, type-check, unit test', 'E2E (editor-react)', 'Npm package consumers']) {
    const latest = checks.filter((check) => check.name === name && check.app?.slug === 'github-actions').sort((a, b) => b.id - a.id)[0];
    if (!latest || latest.status !== 'completed' || latest.conclusion !== 'success') throw new Error(`Required check is not successful: ${name}`);
  }
}
export function planPublication(manifest, metadata, integrity) {
  if (metadata === null) return 'publish';
  const latest = metadata['dist-tags']?.latest;
  if (latest && (!semver.valid(latest) || semver.gt(latest, manifest.version))) throw new Error(`${manifest.name}: latest would move backwards`);
  const existing = metadata.versions?.[manifest.version];
  if (!existing) return 'publish';
  if (existing.dist?.integrity !== integrity) throw new Error(`${manifest.name}@${manifest.version} already exists with different content; create a Changeset version PR`);
  if (latest !== manifest.version) throw new Error(`${manifest.name}: existing version is not latest; inspect the release before retrying`);
  return 'skip-identical';
}
export function publicationOrder(entries) {
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const result = [], active = new Set(), done = new Set();
  function visit(entry) {
    if (done.has(entry.name)) return;
    if (active.has(entry.name)) throw new Error(`Runtime dependency cycle: ${entry.name}`);
    active.add(entry.name);
    for (const name of Object.keys({ ...entry.manifest.dependencies, ...entry.manifest.optionalDependencies })) if (byName.has(name)) visit(byName.get(name));
    active.delete(entry.name); done.add(entry.name); result.push(entry);
  }
  entries.forEach(visit);
  return result;
}
async function json(url, { missing = false, github = false } = {}) {
  const response = await fetch(url, { headers: github ? { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' } : {}, signal: AbortSignal.timeout(30000) });
  if (missing && response.status === 404) return null;
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  return response.json();
}
export async function publish() {
  assertContext(process.env);
  if (run('git', ['rev-parse', 'HEAD']).trim() !== process.env.GITHUB_SHA) throw new Error('Checkout does not match workflow commit');
  if (run('git', ['status', '--porcelain', '--untracked-files=no']).trim()) throw new Error('Tracked checkout changes found');
  if (readdirSync(resolve(root, '.changeset')).some((file) => file.endsWith('.md') && file !== 'README.md')) throw new Error('Merge the Changesets version PR first');
  const checks = [];
  for (let page = 1; ; page++) {
    const data = await json(`https://api.github.com/repos/barocss/barocss-editor/commits/${process.env.GITHUB_SHA}/check-runs?per_page=100&page=${page}`, { github: true });
    checks.push(...data.check_runs);
    if (data.check_runs.length < 100) break;
  }
  assertChecks(checks);
  const batch = JSON.parse(readFileSync(resolve(root, 'output/npm/latest.json'), 'utf8')).directory;
  const report = JSON.parse(readFileSync(resolve(batch, 'manifest.json'), 'utf8'));
  const consumer = JSON.parse(readFileSync(resolve(batch, 'consumer.json'), 'utf8'));
  if (report.sourceCommit !== process.env.GITHUB_SHA || consumer.passed !== true || consumer.manifestSha256 !== digest(resolve(batch, 'manifest.json'))) throw new Error('Validated consumer report does not match this commit/batch');
  const expected = new Map(packages().map(({ manifest }) => [manifest.name, manifest.version]));
  if (report.packages.length !== expected.size || new Set(report.packages.map((entry) => entry.name)).size !== expected.size) throw new Error('Package coverage mismatch');
  const entries = [];
  for (const entry of report.packages) {
    if (entry.file !== basename(entry.file) || expected.get(entry.name) !== entry.version) throw new Error('Invalid release entry');
    const file = resolve(batch, entry.file);
    if (digest(file) !== entry.sha256) throw new Error(`Changed archive: ${entry.name}`);
    const manifest = inspectTarball(file);
    checkArchiveImports(file);
    if (manifest.name !== entry.name || manifest.version !== entry.version) throw new Error('Archive identity mismatch');
    for (const [name, range] of Object.entries({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies })) {
      if (expected.has(name) && !semver.satisfies(expected.get(name), range)) throw new Error(`Incompatible dependency: ${manifest.name} → ${name}@${range}`);
    }
    const integrity = `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`;
    const metadata = await json(`${registry}/${encodeURIComponent(entry.name)}`, { missing: true });
    entries.push({ ...entry, file, manifest, action: planPublication(manifest, metadata, integrity) });
  }
  // Validate every package before the first irreversible publish. Retry only identical completed versions.
  const state = { sourceCommit: report.sourceCommit, status: 'publishing', completed: [] };
  const save = () => writeFileSync(resolve(batch, 'publication.json'), `${JSON.stringify(state, null, 2)}\n`);
  save();
  try {
    for (const entry of publicationOrder(entries)) {
      if (entry.action === 'publish') run('npm', ['publish', entry.file, '--access=public', '--tag=latest', `--registry=${registry}`, '--ignore-scripts'], root, { stdio: 'inherit' });
      state.completed.push({ name: entry.name, version: entry.version, action: entry.action }); save();
    }
    for (const entry of entries) {
      const metadata = await json(`${registry}/${encodeURIComponent(entry.name)}`);
      if (!metadata.versions?.[entry.version] || metadata['dist-tags']?.latest !== entry.version) throw new Error(`Registry verification pending or failed: ${entry.name}`);
    }
    state.status = 'published'; save();
  } catch (error) { state.status = 'failed-or-uncertain'; save(); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3 || process.argv[2] !== '--publish') throw new Error('Publishing needs --publish and the authorized GitHub workflow');
  await publish();
}
