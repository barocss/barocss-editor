import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
const schema = JSON.parse(readFileSync(new URL('./schema.json', import.meta.url), 'utf8'));

export const PRODUCT_PACKAGE_PATH = 'packages/wonffice-release/package.json';
export const MANIFEST_SCHEMA_VERSION = 1;
export const RELEASE_TAG_PREFIX = 'wonffice-v';
export const PROTOTYPE_NOTICE = 'Manifest validation checks release metadata integrity only. It is not QA approval and does not mean production release_ready.';

const SHA256_HEX = /^[a-f0-9]{64}$/;
const OCI_DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const IMAGE_MANIFEST_MEDIA_TYPES = new Set([
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
]);

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema);

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256File(filePath) {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
}

function schemaErrors() {
  return (validateSchema.errors ?? []).map((error) => {
    const location = error.instancePath || '/';
    if (error.keyword === 'additionalProperties') {
      const property = error.params?.additionalProperty;
      return `schema ${location === '/' ? '' : location}/${property} is not allowed`;
    }
    if (error.keyword === 'required') {
      const property = error.params?.missingProperty;
      return `schema ${location === '/' ? '' : location}/${property} is required`;
    }
    return `schema ${location} ${error.message}`;
  });
}

export function assertInsideRoot(repoRoot, relativePath, label, errors) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    errors.push(`${label} is required`);
    return null;
  }
  if (path.isAbsolute(relativePath)) {
    errors.push(`${label} must be relative: ${relativePath}`);
    return null;
  }
  const normalized = path.normalize(relativePath);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    errors.push(`${label} escapes repo root: ${relativePath}`);
    return null;
  }

  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, normalized);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    errors.push(`${label} escapes repo root: ${relativePath}`);
    return null;
  }

  if (existsSync(resolved)) {
    const realRoot = realpathSync(root);
    const realResolved = realpathSync(resolved);
    if (realResolved !== realRoot && !realResolved.startsWith(`${realRoot}${path.sep}`)) {
      errors.push(`${label} escapes repo root through symlink: ${relativePath}`);
      return null;
    }
  }

  return resolved;
}

export function readProductPackage(repoRoot) {
  const productPath = path.join(repoRoot, PRODUCT_PACKAGE_PATH);
  const productPackage = readJson(productPath);
  if (productPackage.private !== true) throw new Error(`${PRODUCT_PACKAGE_PATH} must be private`);
  if (!productPackage.name || !productPackage.version) throw new Error(`${PRODUCT_PACKAGE_PATH} must contain name and version`);
  if (!SEMVER.test(productPackage.version)) throw new Error(`${PRODUCT_PACKAGE_PATH} version must be strict SemVer`);
  return {
    name: productPackage.name,
    version: productPackage.version,
    packagePath: PRODUCT_PACKAGE_PATH,
  };
}

function workspaceDirs(repoRoot, pattern) {
  const normalized = pattern.replace(/\\/g, '/');
  if (!/^[^*?{}!]+\/\*$/.test(normalized)) throw new Error(`unsupported workspace pattern: ${pattern}`);
  const base = path.join(repoRoot, normalized.slice(0, -2));
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((entry) => path.join(base, entry))
    .filter((entryPath) => statSync(entryPath).isDirectory());
}

export function listPublicWorkspacePackages(repoRoot) {
  const rootPackage = readJson(path.join(repoRoot, 'package.json'));
  const workspaces = rootPackage.workspaces;
  if (!Array.isArray(workspaces) || workspaces.length === 0) throw new Error('root package.json must declare workspace patterns');
  const seen = new Set();
  const packages = [];

  for (const pattern of workspaces) {
    for (const dir of workspaceDirs(repoRoot, pattern)) {
      const packagePath = path.join(dir, 'package.json');
      if (!existsSync(packagePath)) continue;
      const pkg = readJson(packagePath);
      if (!pkg.name || !pkg.version || pkg.private === true) continue;
      if (seen.has(pkg.name)) continue;
      seen.add(pkg.name);
      packages.push({
        name: pkg.name,
        version: pkg.version,
        packagePath: path.relative(repoRoot, packagePath).replace(/\\/g, '/'),
      });
    }
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

export function gitHead(repoRoot) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function hasTrackedChanges(repoRoot) {
  const result = execFileSync('git', ['diff', '--quiet', 'HEAD', '--'], { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' });
  return result;
}

function assertNoTrackedChanges(repoRoot, errors) {
  try {
    hasTrackedChanges(repoRoot);
  } catch (error) {
    if (error?.status === 1) {
      errors.push('release validation requires no tracked uncommitted changes');
      return;
    }
    errors.push(`could not check tracked changes: ${error.message}`);
  }
}

export function createDevelopmentManifest({ repoRoot }) {
  const product = readProductPackage(repoRoot);
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    mode: 'development',
    product,
    source: {
      sha: gitHead(repoRoot),
      tag: null,
    },
    workspaceSourcePackages: listPublicWorkspacePackages(repoRoot),
    artifacts: [],
    evidence: [],
    documents: null,
    prototypeIntegrityNotice: PROTOTYPE_NOTICE,
  };
}

function addDuplicateErrors(items, key, label, errors) {
  const seen = new Set();
  for (const item of items ?? []) {
    const value = item?.[key];
    if (!value) continue;
    if (seen.has(value)) errors.push(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function expectSha256(value, label, errors) {
  if (typeof value !== 'string' || !SHA256_HEX.test(value)) {
    errors.push(`${label} must be a lowercase sha256 hex digest`);
    return false;
  }
  return true;
}

function expectOciDigest(value, label, errors) {
  if (typeof value !== 'string' || !OCI_DIGEST.test(value)) {
    errors.push(`${label} must be an OCI manifest digest like sha256:<64 hex>`);
    return false;
  }
  return true;
}

function expectSemVer(value, label, errors) {
  if (typeof value !== 'string' || !SEMVER.test(value)) {
    errors.push(`${label} must be strict SemVer`);
    return false;
  }
  return true;
}

function verifyPathDigest(repoRoot, relativePath, expectedSha256, label, errors) {
  const resolved = assertInsideRoot(repoRoot, relativePath, `${label}.path`, errors);
  if (!resolved) return null;
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    errors.push(`${label}.path does not exist as a file: ${relativePath}`);
    return null;
  }
  if (!expectSha256(expectedSha256, `${label}.sha256`, errors)) return resolved;
  const actual = sha256File(resolved);
  if (actual !== expectedSha256) {
    errors.push(`${label}.sha256 mismatch for ${relativePath}: expected ${expectedSha256}, got ${actual}`);
  }
  return resolved;
}

function validateProduct(manifest, repoRoot, errors) {
  let product;
  try {
    product = readProductPackage(repoRoot);
  } catch (error) {
    errors.push(error.message);
    return null;
  }

  expectSemVer(manifest.product.version, 'product.version', errors);
  if (manifest.product.name !== product.name) errors.push(`product.name must match ${PRODUCT_PACKAGE_PATH}`);
  if (manifest.product.version !== product.version) errors.push(`product.version must match ${PRODUCT_PACKAGE_PATH}`);
  if (manifest.product.packagePath !== PRODUCT_PACKAGE_PATH) errors.push(`product.packagePath must be ${PRODUCT_PACKAGE_PATH}`);
  return product;
}

function canonicalWorkspacePackages(packages) {
  return [...packages]
    .map(({ name, version, packagePath }) => ({ name, version, packagePath }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function validateWorkspacePackages(manifest, repoRoot, errors) {
  const actual = canonicalWorkspacePackages(listPublicWorkspacePackages(repoRoot));
  const fromManifest = canonicalWorkspacePackages(manifest.workspaceSourcePackages);
  if (JSON.stringify(fromManifest) !== JSON.stringify(actual)) {
    errors.push('workspaceSourcePackages must match current public workspace package.json source versions');
  }
}

function validateBase(manifest, repoRoot, errors) {
  validateProduct(manifest, repoRoot, errors);
  validateWorkspacePackages(manifest, repoRoot, errors);
  addDuplicateErrors(manifest.workspaceSourcePackages, 'name', 'package name', errors);
  addDuplicateErrors(manifest.artifacts, 'id', 'artifact id', errors);
  addDuplicateErrors(manifest.evidence, 'id', 'evidence id', errors);

  try {
    const actualHead = gitHead(repoRoot);
    if (manifest.source.sha !== actualHead) errors.push(`source.sha does not match git HEAD: expected ${actualHead}, got ${manifest.source.sha}`);
  } catch (error) {
    errors.push(`could not read git HEAD: ${error.message}`);
  }

  if (manifest.mode === 'development') {
    if (manifest.releaseReady === true) errors.push('development manifest must not claim releaseReady');
    if (manifest.source.tag) errors.push('development manifest must not contain a release tag');
  }
}

function validateEvidence(manifest, repoRoot, errors) {
  const evidence = manifest.evidence;
  if (evidence.length === 0) errors.push('release manifest requires evidence');
  const evidenceById = new Map();

  for (const item of evidence) {
    evidenceById.set(item.id, item);
    if (item.exitCode !== 0) errors.push(`evidence ${item.id} did not pass: exitCode ${item.exitCode}`);
    if (item.sourceSha !== manifest.source.sha) errors.push(`evidence ${item.id}.sourceSha must match manifest source.sha`);
    verifyPathDigest(repoRoot, item.path, item.sha256, `evidence ${item.id}`, errors);
  }

  return evidenceById;
}

function validateDescriptor(value, label, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (typeof value.mediaType !== 'string' || value.mediaType.length === 0) errors.push(`${label}.mediaType is required`);
  if (!expectOciDigest(value.digest, `${label}.digest`, errors)) return;
  if (!Number.isInteger(value.size) || value.size < 0) errors.push(`${label}.size must be a non-negative integer`);
}

function validateOciManifestArtifact(artifact, repoRoot, errors) {
  if (!expectOciDigest(artifact.ociManifestDigest, `artifact ${artifact.id}.ociManifestDigest`, errors)) return;
  const resolved = assertInsideRoot(repoRoot, artifact.ociManifestPath, `artifact ${artifact.id}.ociManifestPath`, errors);
  if (!resolved) return;
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    errors.push(`artifact ${artifact.id}.ociManifestPath does not exist as a file: ${artifact.ociManifestPath}`);
    return;
  }
  const actualDigest = `sha256:${sha256File(resolved)}`;
  if (actualDigest !== artifact.ociManifestDigest) {
    errors.push(`artifact ${artifact.id}.ociManifestDigest does not match OCI manifest JSON bytes: expected ${actualDigest}, got ${artifact.ociManifestDigest}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolved, 'utf8'));
  } catch {
    errors.push(`artifact ${artifact.id}.ociManifestPath must be an OCI image manifest JSON file`);
    return;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push(`artifact ${artifact.id} OCI manifest must be an object`);
    return;
  }
  if (parsed.schemaVersion !== 2) errors.push(`artifact ${artifact.id} OCI manifest schemaVersion must be 2`);
  if (!IMAGE_MANIFEST_MEDIA_TYPES.has(parsed.mediaType)) errors.push(`artifact ${artifact.id} OCI manifest mediaType is not an image manifest`);
  validateDescriptor(parsed.config, `artifact ${artifact.id}.config`, errors);
  if (!Array.isArray(parsed.layers)) {
    errors.push(`artifact ${artifact.id}.layers must be an array`);
  } else {
    for (const [index, layer] of parsed.layers.entries()) validateDescriptor(layer, `artifact ${artifact.id}.layers[${index}]`, errors);
  }
}

function validateArtifacts(manifest, repoRoot, evidenceById, errors) {
  const artifacts = manifest.artifacts;
  if (artifacts.length === 0) errors.push('release manifest requires artifacts');

  const imageByComponent = new Map();
  for (const artifact of artifacts) {
    if (!artifact.evidenceId || !evidenceById.has(artifact.evidenceId)) errors.push(`artifact ${artifact.id} references missing evidenceId`);

    if (artifact.kind === 'file') {
      verifyPathDigest(repoRoot, artifact.path, artifact.sha256, `artifact ${artifact.id}`, errors);
      continue;
    }

    if (artifact.kind === 'oci-image') {
      if (artifact.imageTarSha256 && artifact.ociManifestDigest === `sha256:${artifact.imageTarSha256}`) errors.push(`artifact ${artifact.id} confuses image tar hash with OCI manifest digest`);
      validateOciManifestArtifact(artifact, repoRoot, errors);

      const key = artifact.component;
      if (!imageByComponent.has(key)) imageByComponent.set(key, new Map());
      const envMap = imageByComponent.get(key);
      if (envMap.has(artifact.environment)) errors.push(`duplicate image artifact for ${key}/${artifact.environment}`);
      envMap.set(artifact.environment, artifact.ociManifestDigest);
    }
  }

  if (imageByComponent.size === 0) errors.push('release manifest requires at least one OCI image component with saas and internal digests');
  for (const [component, envMap] of imageByComponent.entries()) {
    const saas = envMap.get('saas');
    const internal = envMap.get('internal');
    if (!saas || !internal) errors.push(`component ${component} requires both saas and internal image digests`);
    else if (saas !== internal) errors.push(`component ${component} saas/internal image digests differ`);
  }
}

function validateDocuments(manifest, repoRoot, errors) {
  const documents = manifest.documents;
  verifyPathDigest(repoRoot, documents.schema.path, documents.schema.sha256, 'documents.schema', errors);

  addDuplicateErrors(documents.migrations, 'id', 'migration id', errors);
  for (const migration of documents.migrations) {
    verifyPathDigest(repoRoot, migration.path, migration.sha256, `migration ${migration.id}`, errors);
  }

  const upgrades = documents.upgrades;
  for (const version of upgrades.fromVersions) expectSemVer(version, 'documents.upgrades.fromVersions[]', errors);
  if (upgrades.freshInstall !== true && upgrades.fromVersions.length === 0) errors.push('documents.upgrades.fromVersions can be empty only when freshInstall is true');
}

function validateRelease(manifest, repoRoot, errors) {
  if (manifest.mode !== 'release') errors.push('release validation requires mode release');
  assertNoTrackedChanges(repoRoot, errors);
  const expectedTag = `${RELEASE_TAG_PREFIX}${manifest.product.version}`;
  if (manifest.source.tag !== expectedTag) errors.push(`source.tag must be ${expectedTag}`);

  const evidenceById = validateEvidence(manifest, repoRoot, errors);
  validateArtifacts(manifest, repoRoot, evidenceById, errors);
  validateDocuments(manifest, repoRoot, errors);
}

export function validateManifest(manifest, { repoRoot, mode } = {}) {
  const errors = [];
  if (!repoRoot) errors.push('repoRoot is required');
  if (mode && mode !== 'development' && mode !== 'release') errors.push('mode must be development or release');
  if (errors.length > 0) return { ok: false, errors, notice: PROTOTYPE_NOTICE };

  if (!validateSchema(manifest)) {
    return { ok: false, errors: schemaErrors(), notice: PROTOTYPE_NOTICE };
  }

  validateBase(manifest, repoRoot, errors);

  if (mode && manifest.mode !== mode) {
    errors.push(`manifest mode ${manifest.mode} does not match requested ${mode} validation`);
    return { ok: false, errors, notice: PROTOTYPE_NOTICE };
  }
  if (mode === 'release' || (!mode && manifest.mode === 'release')) validateRelease(manifest, repoRoot, errors);

  return { ok: errors.length === 0, errors, notice: PROTOTYPE_NOTICE };
}
