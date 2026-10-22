import { existsSync, readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const workspaceRoots = ['apps', 'packages'].map(name => pathToFileURL(resolve(repository, name)).href + '/');
const fromRepository = createRequire(resolve(repository, 'package.json'));
const typescript = fromRepository('typescript');

function sourceExport(specifier) {
  const parts = specifier.split('/');
  for (const group of ['apps', 'packages']) {
    const packageRoot = resolve(repository, group, parts[1]);
    const manifestPath = resolve(packageRoot, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.name !== parts.slice(0, 2).join('/')) continue;
    const key = parts.length === 2 ? '.' : `./${parts.slice(2).join('/')}`;
    const entry = manifest.exports?.[key];
    const declared = typeof entry === 'string' ? entry : entry?.import ?? entry?.default ?? entry?.types;
    const source = typeof declared === 'string' && declared.startsWith('./dist/') && declared.endsWith('.js')
      ? declared.replace('./dist/', './src/').slice(0, -3) + '.ts' : declared;
    if (typeof source !== 'string' || !source.startsWith('./src/') || source.includes('..', 2)) continue;
    const target = resolve(packageRoot, source);
    if (existsSync(target)) return pathToFileURL(target).href;
  }
}

/** Run the pinned application sources without importing an older dist build. */
export function installAccountSourceImports() {
  if (process.versions.node !== '22.22.0' || !process.execArgv.includes('--experimental-transform-types')) {
    throw new Error('Account source imports require Node 22.22.0 --experimental-transform-types.');
  }
  if (typescript.version !== '5.9.3') throw new Error('Account sources require the frozen TypeScript 5.9.3 compiler.');
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('@barocss/')) {
        const source = sourceExport(specifier);
        if (source) return { url: source, shortCircuit: true };
      }
      if (specifier.startsWith('.') &&
          workspaceRoots.some(root => context.parentURL?.startsWith(root)) && context.parentURL.includes('/src/')) {
        const candidates = specifier.endsWith('.js') ? [specifier.slice(0, -3) + '.ts'] :
          !/\.[A-Za-z0-9]+$/.test(specifier) ? [specifier + '.ts', specifier + '/index.ts'] : [];
        for (const candidate of candidates) {
          const source = new URL(candidate, context.parentURL);
          if (existsSync(fileURLToPath(source))) return { url: source.href, shortCircuit: true };
        }
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (workspaceRoots.some(root => url.startsWith(root)) && /\.(?:ts|tsx)$/.test(url) && !url.endsWith('.d.ts')) {
        const file = fileURLToPath(url);
        // Existing application packages use ordinary type-position imports.
        // Match their TypeScript emission instead of treating those as runtime exports.
        const compiled = typescript.transpileModule(readFileSync(file, 'utf8'), {
          fileName: file, reportDiagnostics: true,
          compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.ESNext,
            jsx: typescript.JsxEmit.ReactJSX, esModuleInterop: true, verbatimModuleSyntax: false },
        });
        if (compiled.diagnostics?.some(diagnostic => diagnostic.category === typescript.DiagnosticCategory.Error)) {
          throw new Error('Current account source could not be transpiled.');
        }
        return { format: 'module', source: compiled.outputText, shortCircuit: true };
      }
      return nextLoad(url, context);
    },
  });
}
