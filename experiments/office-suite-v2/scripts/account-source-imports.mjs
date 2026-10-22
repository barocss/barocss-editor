import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourceRoots = ['office-api', 'office-service'].map(name =>
  pathToFileURL(resolve(repository, `apps/${name}/src/`)).href + '/');

/** Run the pinned application sources without importing an older dist build. */
export function installAccountSourceImports() {
  if (process.versions.node !== '22.22.0' || !process.execArgv.includes('--experimental-transform-types')) {
    throw new Error('Account source imports require Node 22.22.0 --experimental-transform-types.');
  }
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('@barocss/office-api/') || specifier.startsWith('@barocss/office-service/')) {
        const parts = specifier.split('/');
        const packageRoot = resolve(repository, 'apps', parts[1]);
        const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
        const entry = manifest.exports?.[`./${parts.slice(2).join('/')}`];
        const source = typeof entry === 'object' ? entry?.types : undefined;
        if (typeof source === 'string' && source.startsWith('./src/') && !source.includes('..', 2)) {
          const target = resolve(packageRoot, source);
          if (existsSync(target)) return { url: pathToFileURL(target).href, shortCircuit: true };
        }
      }
      if (specifier.startsWith('.') && specifier.endsWith('.js') &&
          sourceRoots.some(root => context.parentURL?.startsWith(root))) {
        const source = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
        if (existsSync(fileURLToPath(source))) return { url: source.href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}
