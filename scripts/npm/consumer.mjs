import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { checkArchiveImports } from './imports.mjs';
import { root, run, inspectTarball, digest } from './packages.mjs';

const batch = JSON.parse(readFileSync(resolve(root, 'output/npm/latest.json'), 'utf8')).directory;
const report = JSON.parse(readFileSync(resolve(batch, 'manifest.json'), 'utf8'));
const directory = mkdtempSync(resolve(tmpdir(), 'wonffice-npm-consumer-'));
const dependencies = { react: '18.3.1', 'react-dom': '18.3.1' };
const imports = [];
const css = [];
for (const entry of report.packages) {
  const file = resolve(batch, entry.file);
  if (digest(file) !== entry.sha256) throw new Error('Archive changed after validation');
  const manifest = inspectTarball(file);
  checkArchiveImports(file);
  dependencies[manifest.name] = `file:${file}`;
  for (const subpath of Object.keys(manifest.exports)) {
    const specifier = `${manifest.name}${subpath === '.' ? '' : subpath.slice(1)}`;
    if (subpath.endsWith('.css')) css.push(`import '${specifier}';`);
    else imports.push(`import * as package${imports.length} from '${specifier}';\nconsole.log(package${imports.length});`);
  }
}
writeFileSync(resolve(directory, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies, devDependencies: { typescript: '5.9.3', vite: '5.4.21', '@types/react': '18.3.31', '@types/react-dom': '18.3.7' } }, null, 2));
writeFileSync(resolve(directory, 'index.ts'), `${imports.join('\n')}\n${css.join('\n')}\n`);
writeFileSync(resolve(directory, 'index.html'), '<html><body><script type="module" src="/index.ts"></script></body></html>');
writeFileSync(resolve(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: false, noEmit: true, jsx: 'react-jsx', lib: ['ES2022', 'DOM', 'DOM.Iterable'] }, include: ['index.ts'] }));
console.log(`Testing isolated consumer: ${directory}`);
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', `--cache=${resolve(directory, '.npm-cache')}`, '--registry=https://registry.npmjs.org'], directory, { stdio: 'inherit' });
run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], directory, { stdio: 'inherit' });
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], directory, { stdio: 'inherit' });
writeFileSync(resolve(batch, 'consumer.json'), JSON.stringify({ passed: true, packages: report.packages.length, manifestSha256: digest(resolve(batch, 'manifest.json')) }, null, 2));
console.log(`Consumer passed: ${report.packages.length} packages, ${imports.length} JS/type entry points, ${css.length} CSS entry points`);
