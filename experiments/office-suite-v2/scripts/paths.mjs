import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const groups = ['src', 'test', 'scripts', 'verification'];
const ignored = new Set(['node_modules', '.cache', 'coverage', 'reports']);

export function requireRuntime() {
  if (process.versions.node !== '22.22.0') {
    throw new Error(`Use Node 22.22.0; received ${process.versions.node}.`);
  }
}

function insideRoot(path) {
  const rel = relative(root, realpathSync(path));
  if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) {
    throw new Error(`Input is outside the experiment: ${path}`);
  }
}

function collect(path, predicate, files) {
  if (!existsSync(path)) throw new Error(`Input does not exist: ${path}`);
  insideRoot(path);
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      collect(resolve(path, entry.name), predicate, files);
    }
  } else if (predicate(path)) {
    files.add(path);
  }
}

export function inputs(args, predicate) {
  const selectors = args.filter(arg => arg !== '--');
  const files = new Set();
  if (selectors.length) {
    for (const selector of selectors) {
      const selected = new Set();
      collect(resolve(root, selector), predicate, selected);
      if (!selected.size) throw new Error(`No matching files for: ${selector}`);
      for (const file of selected) files.add(file);
    }
  } else {
    for (const group of groups) {
      const dir = resolve(root, group);
      if (existsSync(dir)) collect(dir, predicate, files);
    }
  }
  if (!files.size) throw new Error('No matching files; an empty check is not PASS.');
  return [...files].sort();
}
