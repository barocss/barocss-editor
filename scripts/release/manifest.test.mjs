import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDevelopmentManifest,
  PROTOTYPE_NOTICE,
  readJson,
  validateManifest,
  writeJson,
} from './manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(here, 'cli.mjs');

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function writeText(repoRoot, relativePath, text) {
  const filePath = path.join(repoRoot, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text);
  return { path: relativePath, sha256: sha256(text) };
}

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

const temporaryDirectories = [];
afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function buildRepo() {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'wonffice-release-test-'));
  temporaryDirectories.push(repoRoot);
  writeText(repoRoot, 'package.json', JSON.stringify({
    name: 'fixture-root',
    private: true,
    workspaces: ['packages/*', 'apps/*'],
  }, null, 2));
  writeText(repoRoot, 'packages/wonffice-release/package.json', JSON.stringify({
    name: '@barocss/wonffice-release',
    version: '0.0.0',
    private: true,
  }, null, 2));
  writeText(repoRoot, 'packages/editor-core/package.json', JSON.stringify({
    name: '@barocss/editor-core',
    version: '1.0.2',
  }, null, 2));
  writeText(repoRoot, 'packages/renderer-dom/package.json', JSON.stringify({
    name: '@barocss/renderer-dom',
    version: '2.3.4',
  }, null, 2));
  writeText(repoRoot, 'apps/office/package.json', JSON.stringify({
    name: '@barocss/office-app',
    version: '0.1.0',
    private: true,
  }, null, 2));
  writeText(repoRoot, 'README.md', 'initial\n');

  git(repoRoot, ['init']);
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['-c', 'user.name=Wonffice Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'initial']);
  const head = git(repoRoot, ['rev-parse', 'HEAD']);
  return { repoRoot, head };
}

function releaseManifest(repoRoot, head, overrides = {}) {
  const buildLog = writeText(repoRoot, 'release/evidence/build.log', 'build ok\n');
  const imageInspect = writeText(repoRoot, 'release/evidence/image-inspect.json', '{"digest":"sha256"}\n');
  const ociManifestText = JSON.stringify({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: `sha256:${'1'.repeat(64)}`, size: 2 },
    layers: []
  });
  const ociManifest = writeText(repoRoot, 'release/artifacts/app.oci-manifest.json', ociManifestText);
  const ociDigest = `sha256:${ociManifest.sha256}`;
  const bundle = writeText(repoRoot, 'release/artifacts/internal.tar', 'bundle bytes\n');
  const schema = writeText(repoRoot, 'docs/schema/document-schema.md', 'schema v1\n');
  const migration = writeText(repoRoot, 'db/migrations/001.sql', 'create table note(id text);\n');
  const manifest = {
    schemaVersion: 1,
    mode: 'release',
    product: {
      name: '@barocss/wonffice-release',
      version: '0.0.0',
      packagePath: 'packages/wonffice-release/package.json',
    },
    source: {
      sha: head,
      tag: 'wonffice-v0.0.0',
    },
    workspaceSourcePackages: [
      { packagePath: 'packages/renderer-dom/package.json', version: '2.3.4', name: '@barocss/renderer-dom' },
      { packagePath: 'packages/editor-core/package.json', version: '1.0.2', name: '@barocss/editor-core' },
    ],
    artifacts: [
      { id: 'app-saas-image', kind: 'oci-image', component: 'app', environment: 'saas', ociManifestDigest: ociDigest, ociManifestPath: ociManifest.path, evidenceId: 'image-digest' },
      { id: 'app-internal-image', kind: 'oci-image', component: 'app', environment: 'internal', ociManifestDigest: ociDigest, ociManifestPath: ociManifest.path, evidenceId: 'image-digest' },
      { id: 'internal-bundle', kind: 'file', path: bundle.path, sha256: bundle.sha256, evidenceId: 'build-log' },
    ],
    evidence: [
      { id: 'build-log', kind: 'command-log', command: 'pnpm build', exitCode: 0, sourceSha: head, path: buildLog.path, sha256: buildLog.sha256 },
      { id: 'image-digest', kind: 'oci-inspect', command: 'docker buildx imagetools inspect', exitCode: 0, sourceSha: head, path: imageInspect.path, sha256: imageInspect.sha256 },
    ],
    documents: {
      schema: { version: 'doc-schema-v1', path: schema.path, sha256: schema.sha256 },
      migrations: [{ id: '001', path: migration.path, sha256: migration.sha256 }],
      upgrades: { freshInstall: true, fromVersions: [] },
    },
    prototypeIntegrityNotice: PROTOTYPE_NOTICE,
  };

  return { ...manifest, ...overrides };
}

function expectInvalid(repoRoot, manifest, text) {
  const result = validateManifest(manifest, { repoRoot, mode: 'release' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), text);
}

test('createDevelopmentManifest uses the private product package and public workspace versions only', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = createDevelopmentManifest({ repoRoot });

  assert.equal(manifest.mode, 'development');
  assert.equal(manifest.product.version, '0.0.0');
  assert.equal(manifest.product.packagePath, 'packages/wonffice-release/package.json');
  assert.equal(manifest.source.sha, head);
  assert.deepEqual(manifest.workspaceSourcePackages, [
    { name: '@barocss/editor-core', version: '1.0.2', packagePath: 'packages/editor-core/package.json' },
    { name: '@barocss/renderer-dom', version: '2.3.4', packagePath: 'packages/renderer-dom/package.json' },
  ]);
  assert.equal(validateManifest(manifest, { repoRoot, mode: 'development' }).ok, true);
  assert.equal(validateManifest(manifest, { repoRoot, mode: 'release' }).ok, false);
});

test('valid release permits first release freshInstall with no upgrade source versions', () => {
  const { repoRoot, head } = buildRepo();
  const result = validateManifest(releaseManifest(repoRoot, head), { repoRoot, mode: 'release' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.match(result.notice, /not QA approval/);
});

test('release rejects product version from root or app instead of product package', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head, {
    product: { name: '@barocss/wonffice-release', version: '0.1.0', packagePath: 'packages/wonffice-release/package.json' },
  });
  expectInvalid(repoRoot, manifest, /product\.version/);
});

test('release rejects path traversal before reading artifact files', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  manifest.artifacts[2] = { ...manifest.artifacts[2], path: '../outside.tar' };
  expectInvalid(repoRoot, manifest, /escapes repo root/);
});

test('release rejects mismatched real file digest', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  manifest.artifacts[2] = { ...manifest.artifacts[2], sha256: 'b'.repeat(64) };
  expectInvalid(repoRoot, manifest, /sha256 mismatch/);
});

test('release rejects failed evidence', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  manifest.evidence[0] = { ...manifest.evidence[0], exitCode: 1 };
  expectInvalid(repoRoot, manifest, /did not pass/);
});

test('release rejects duplicate ids and duplicate image environment for a component', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  manifest.artifacts.push({ ...manifest.artifacts[0] });
  expectInvalid(repoRoot, manifest, /duplicate artifact id|duplicate image artifact/);
});

test('release rejects OCI image artifacts that use tar sha as the image digest', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  const tarHash = 'c'.repeat(64);
  manifest.artifacts[0] = {
    id: 'app-saas-image',
    kind: 'oci-image',
    component: 'app',
    environment: 'saas',
    ociManifestDigest: `sha256:${tarHash}`,
    ociManifestPath: manifest.artifacts[1].ociManifestPath,
    imageTarSha256: tarHash,
    evidenceId: 'image-digest',
  };
  expectInvalid(repoRoot, manifest, /image tar hash/);
});

test('release rejects different SaaS and internal image digests for the same component', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  manifest.artifacts[1] = { ...manifest.artifacts[1], ociManifestDigest: `sha256:${'d'.repeat(64)}` };
  expectInvalid(repoRoot, manifest, /digests differ/);
});

test('release rejects source commit and tag mismatch', () => {
  const { repoRoot, head } = buildRepo();
  const wrongCommit = releaseManifest(repoRoot, head, { source: { sha: '1'.repeat(40), tag: 'wonffice-v0.0.0' } });
  expectInvalid(repoRoot, wrongCommit, /does not match git HEAD/);

  const wrongTag = releaseManifest(repoRoot, head, { source: { sha: head, tag: 'wonffice-v0.1.0' } });
  expectInvalid(repoRoot, wrongTag, /source\.tag/);
});

test('release rejects empty upgrade sources unless freshInstall is explicit', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  manifest.documents.upgrades = { freshInstall: false, fromVersions: [] };
  expectInvalid(repoRoot, manifest, /fromVersions can be empty only when freshInstall is true/);
});

test('CLI validate exits 1 on invalid release evidence', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  manifest.evidence[0] = { ...manifest.evidence[0], exitCode: 2 };
  const manifestPath = path.join(repoRoot, 'release/manifest.json');
  writeJson(manifestPath, manifest);

  const run = spawnSync(process.execPath, [cliPath, 'validate', '--repo-root', repoRoot, '--manifest', manifestPath, '--mode', 'release'], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /did not pass/);
});

test('CLI create writes a development manifest that is not release-valid', () => {
  const { repoRoot } = buildRepo();
  const manifestPath = path.join(repoRoot, 'release/dev-manifest.json');
  const create = spawnSync(process.execPath, [cliPath, 'create', '--repo-root', repoRoot, '--out', manifestPath], { encoding: 'utf8' });
  assert.equal(create.status, 0, create.stderr);

  const manifest = readJson(manifestPath);
  assert.equal(manifest.mode, 'development');

  const release = spawnSync(process.execPath, [cliPath, 'validate', '--repo-root', repoRoot, '--manifest', manifestPath, '--mode', 'release'], { encoding: 'utf8' });
  assert.equal(release.status, 1);
  assert.match(release.stderr, /manifest mode development does not match requested release validation/);
});

test('release rejects arbitrary OCI digest even when evidence log exists', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  manifest.artifacts[0] = { ...manifest.artifacts[0], ociManifestDigest: `sha256:${'a'.repeat(64)}` };
  manifest.artifacts[1] = { ...manifest.artifacts[1], ociManifestDigest: `sha256:${'a'.repeat(64)}` };
  expectInvalid(repoRoot, manifest, /does not match OCI manifest JSON bytes/);
});

test('release rejects image tar bytes where OCI manifest JSON is required', () => {
  const { repoRoot, head } = buildRepo();
  const tar = writeText(repoRoot, 'release/artifacts/not-json.tar', 'tar bytes');
  const manifest = releaseManifest(repoRoot, head);
  manifest.artifacts[0] = { ...manifest.artifacts[0], ociManifestPath: tar.path, ociManifestDigest: `sha256:${tar.sha256}` };
  manifest.artifacts[1] = { ...manifest.artifacts[1], ociManifestPath: tar.path, ociManifestDigest: `sha256:${tar.sha256}` };
  expectInvalid(repoRoot, manifest, /must be an OCI image manifest JSON file/);
});

test('release rejects file-only artifacts without any OCI component', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  manifest.artifacts = [manifest.artifacts[2]];
  expectInvalid(repoRoot, manifest, /requires at least one OCI image component/);
});

test('release rejects evidence from a different source SHA', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  manifest.evidence[0] = { ...manifest.evidence[0], sourceSha: '2'.repeat(40) };
  expectInvalid(repoRoot, manifest, /sourceSha must match manifest source\.sha/);
});

test('release rejects workspace source package list drift', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  manifest.workspaceSourcePackages[0] = { ...manifest.workspaceSourcePackages[0], version: '9.9.9' };
  expectInvalid(repoRoot, manifest, /workspaceSourcePackages must match/);
});

test('release rejects non-SemVer product and upgrade versions', () => {
  const { repoRoot, head } = buildRepo();
  writeText(repoRoot, 'packages/wonffice-release/package.json', JSON.stringify({
    name: '@barocss/wonffice-release',
    version: 'alpha',
    private: true,
  }, null, 2));
  const invalidProduct = releaseManifest(repoRoot, head);
  invalidProduct.product.version = 'alpha';
  invalidProduct.source.tag = 'wonffice-valpha';
  expectInvalid(repoRoot, invalidProduct, /pattern|strict SemVer/);

  const repo = buildRepo();
  const invalidUpgrade = releaseManifest(repo.repoRoot, repo.head);
  invalidUpgrade.documents.upgrades = { freshInstall: false, fromVersions: ['not-semver'] };
  expectInvalid(repo.repoRoot, invalidUpgrade, /fromVersions\/0 must match pattern/);
});

test('development validation rejects releaseReady claim and release tag', () => {
  const { repoRoot } = buildRepo();
  const manifest = createDevelopmentManifest({ repoRoot });
  manifest.releaseReady = true;
  manifest.source.tag = 'wonffice-v0.0.0';
  const result = validateManifest(manifest, { repoRoot, mode: 'development' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /releaseReady|release tag/);
});

test('release rejects symlink paths that escape the repo root', () => {
  const { repoRoot, head } = buildRepo();
  const outside = mkdtempSync(path.join(tmpdir(), 'wonffice-outside-'));
  writeFileSync(path.join(outside, 'outside.log'), 'outside');
  mkdirSync(path.join(repoRoot, 'release'), { recursive: true });
  symlinkSync(path.join(outside, 'outside.log'), path.join(repoRoot, 'release', 'outside-link.log'));
  const manifest = releaseManifest(repoRoot, head);
  manifest.evidence[0] = {
    ...manifest.evidence[0],
    path: 'release/outside-link.log',
    sha256: sha256('outside'),
  };
  expectInvalid(repoRoot, manifest, /symlink/);
});

test('validator rejects unknown fields and missing required fields', () => {
  const { repoRoot, head } = buildRepo();
  const unknown = releaseManifest(repoRoot, head);
  unknown.extra = true;
  expectInvalid(repoRoot, unknown, /schema \/extra is not allowed/);

  const missing = releaseManifest(repoRoot, head);
  delete missing.source.sha;
  expectInvalid(repoRoot, missing, /source\/sha is required/);
});


test('validator rejects null root, wrong arrays, numeric ids, empty command, and nested unknown fields', () => {
  const { repoRoot, head } = buildRepo();

  let result = validateManifest(null, { repoRoot, mode: 'release' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /schema \/ must be object/);

  const wrongArrays = releaseManifest(repoRoot, head);
  wrongArrays.evidence = {};
  result = validateManifest(wrongArrays, { repoRoot, mode: 'release' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /evidence.*array/);

  const numericId = releaseManifest(repoRoot, head);
  numericId.evidence[0] = { ...numericId.evidence[0], id: 123 };
  result = validateManifest(numericId, { repoRoot, mode: 'release' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /evidence\/0\/id.*string/);

  const emptyCommand = releaseManifest(repoRoot, head);
  emptyCommand.evidence[0] = { ...emptyCommand.evidence[0], command: '' };
  result = validateManifest(emptyCommand, { repoRoot, mode: 'release' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /command.*must NOT have fewer than 1 characters/);

  const nestedUnknown = releaseManifest(repoRoot, head);
  nestedUnknown.documents.schema.extra = true;
  result = validateManifest(nestedUnknown, { repoRoot, mode: 'release' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /documents\/schema\/extra is not allowed/);
});

test('release rejects OCI manifest JSON without config descriptor or layers array', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  const incomplete = writeText(repoRoot, 'release/artifacts/incomplete.oci.json', JSON.stringify({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json'
  }));
  const digest = `sha256:${incomplete.sha256}`;
  manifest.artifacts[0] = { ...manifest.artifacts[0], ociManifestPath: incomplete.path, ociManifestDigest: digest };
  manifest.artifacts[1] = { ...manifest.artifacts[1], ociManifestPath: incomplete.path, ociManifestDigest: digest };
  expectInvalid(repoRoot, manifest, /config|layers/);
});

test('release rejects tracked uncommitted source changes but ignores untracked artifacts', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  writeText(repoRoot, 'README.md', 'changed\n');
  expectInvalid(repoRoot, manifest, /tracked uncommitted changes/);
});

test('workspaceSourcePackages comparison is canonical by name and fields', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  manifest.workspaceSourcePackages = [
    { packagePath: 'packages/renderer-dom/package.json', version: '2.3.4', name: '@barocss/renderer-dom' },
    { version: '1.0.2', name: '@barocss/editor-core', packagePath: 'packages/editor-core/package.json' },
  ];
  const result = validateManifest(manifest, { repoRoot, mode: 'release' });
  assert.equal(result.ok, true, result.errors.join('\n'));
});


test('null OCI JSON fails validation without throwing', () => {
  const { repoRoot, head } = buildRepo();
  const manifest = releaseManifest(repoRoot, head);
  const file = writeText(repoRoot, 'release/null.json', 'null');
  for (const artifact of manifest.artifacts.filter((one) => one.kind === 'oci-image')) {
    artifact.ociManifestPath = file.path;
    artifact.ociManifestDigest = `sha256:${file.sha256}`;
  }
  expectInvalid(repoRoot, manifest, /OCI manifest must be an object/);
});

test('unsupported workspace patterns fail instead of silently omitting packages', () => {
  const { repoRoot } = buildRepo();
  writeText(repoRoot, 'package.json', JSON.stringify({ private: true, workspaces: ['packages/**'] }));
  assert.throws(() => createDevelopmentManifest({ repoRoot }), /unsupported workspace pattern/);
});
