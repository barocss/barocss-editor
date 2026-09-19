import { ESLint } from 'eslint';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintEntries, compareLint } from './checks/lint-baseline.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.some(arg => !['--adopt', '--strict'].includes(arg))) throw new Error('Use --adopt or --strict');
const eslint = new ESLint({ cwd: root });
// Include new work before it is staged; exclude ignored build output and dependencies.
const names = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
}).split('\0');
const files = [];
for (const name of new Set(names)) {
  if (/\.(?:[cm]?js|jsx|ts|tsx)$/.test(name) && existsSync(join(root, name)) &&
    !await eslint.isPathIgnored(join(root, name))) files.push(join(root, name));
}
if (!files.length) throw new Error('No lint inputs found');
const results = await eslint.lintFiles(files);
const actual = lintEntries(results, root);
const baselinePath = join(root, 'lint-baseline.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const { grew, shrank } = compareLint(actual, baseline);
const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
const warnings = results.reduce((sum, result) => sum + result.warningCount, 0);
console.log(`ESLint: ${files.length} files, ${errors} errors, ${warnings} warnings; ${grew.length} new/increased diagnostics.`);
if (grew.length || args.includes('--strict')) {
  console.log(await (await eslint.loadFormatter('stylish')).format(results.filter(result =>
    args.includes('--strict') || grew.some(entry => join(root, entry.file) === result.filePath))));
}
if (args.includes('--adopt') && !grew.length) {
  writeFileSync(baselinePath, `${JSON.stringify(actual, null, 2)}\n`);
  console.log('Recorded current errors. The baseline can only decrease.');
} else if (shrank.length) {
  console.error('Existing errors decreased. Run pnpm lint --adopt and commit the smaller baseline.');
}
if (grew.length || (args.includes('--strict') && errors) ||
  (shrank.length && !args.includes('--adopt'))) process.exitCode = 1;
