import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const registry = 'https://registry.npmjs.org';
export function run(command, args, cwd = root, options = {}) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...options });
}
export function packages(base = root) {
  return readdirSync(resolve(base, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = resolve(base, 'packages', entry.name);
      return { directory, manifest: JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8')) };
    }).filter(({ manifest }) => !manifest.private).sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}
export function digest(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
export function targets(value) {
  return typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(targets) : [];
}
export function validateManifest(manifest, files) {
  const errors = [];
  if (manifest.private) errors.push('Private packages cannot be published');
  if (!/^@barocss\/[a-z0-9-]+$/.test(manifest.name ?? '')) errors.push('Unexpected package name');
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version ?? '')) errors.push('Only stable versions are supported');
  const publish = manifest.publishConfig ?? {};
  if ((publish.registry && publish.registry.replace(/\/$/, '') !== registry) || (publish.tag && publish.tag !== 'latest') || (publish.access && publish.access !== 'public') || publish.directory) errors.push('Unsafe publishConfig override');
  if (manifest.type !== 'module') errors.push('Expected ESM package');
  if (manifest.license !== 'MIT') errors.push('Missing MIT license metadata');
  if (!manifest.exports || !manifest.types) errors.push('Missing exports or declaration entry');
  for (const target of [manifest.main, manifest.module, manifest.types, ...targets(manifest.exports)].filter(Boolean)) {
    if (!target.startsWith('./dist/') || target.includes('..', 2) || !files.has(`package/${target.slice(2)}`)) errors.push(`Missing or unsafe entry: ${target}`);
  }
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, range] of Object.entries(manifest[section] ?? {})) {
      if (/^(workspace:|file:|link:|catalog:)/.test(range)) errors.push(`Unresolved ${section}: ${name}@${range}`);
    }
  }
  if (![...files].some((file) => /^package\/readme(?:\.md)?$/i.test(file))) errors.push('Missing README');
  if (![...files].some((file) => /^package\/(?:dist\/)?licen[cs]e(?:\.md)?$/i.test(file))) errors.push('Missing LICENSE');
  if ([...files].some((file) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))) errors.push('Tests leaked into package');
  return errors;
}
export function inspectTarball(file) {
  const entries = run('tar', ['-tzf', file]).trim().split('\n');
  for (const entry of entries) {
    if (!entry.startsWith('package/') || entry.split('/').includes('..') || /[\r\0]/.test(entry)) throw new Error(`Unsafe archive path: ${entry}`);
  }
  if (run('tar', ['-tvzf', file]).split('\n').some((line) => /^[lh]/.test(line))) throw new Error('Archive links are not allowed');
  const manifest = JSON.parse(run('tar', ['-xOf', file, 'package/package.json']));
  const errors = validateManifest(manifest, new Set(entries));
  if (errors.length) throw new Error(`${manifest.name}:\n${errors.join('\n')}`);
  return manifest;
}
