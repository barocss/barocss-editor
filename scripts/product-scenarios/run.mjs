import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectReport, manifest, selectedProduct } from './report.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const name = process.argv[2];
if (process.argv.length !== 3) throw new Error('Specify exactly one product; listing/filter/retry flags are not acceptance runs');
const product = selectedProduct(name), app = join(root, 'apps', name);
const out = join(app, 'test-results/scenarios'), html = join(app, 'playwright-report/scenarios');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const source = () => {
  const files = git('ls-files', '-co', '--exclude-standard').split('\n').sort()
    .filter(file => lstatSync(join(root, file)).isFile());
  const hashes = Object.fromEntries(files.map(file => [file, hash(join(root, file))]));
  return { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
    githubSHA: process.env.GITHUB_SHA ?? null, status: git('status', '--porcelain'),
    sourceFiles: files.length, sourceSHA256: createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),
    selectedFiles: Object.fromEntries([...new Set(product.scenarios.map(scenario => scenario.file))]
      .map(file => [file, hashes[file]])) };
};
// These fixed paths contain only this runner's generated results, never input documents.
rmSync(out, { recursive: true, force: true }); rmSync(html, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const before = source(), startedAt = new Date().toISOString();
const command = ['exec', 'playwright', 'test', '--config', 'playwright.scenarios.config.ts'];
const run = spawnSync('pnpm', command, { cwd: app, stdio: 'inherit', env: process.env });
let inspection;
try {
  const raw = JSON.parse(readFileSync(join(out, 'results.json'), 'utf8'));
  inspection = inspectReport(product, raw, run.status);
} catch (error) {
  inspection = { verdict: 'FAIL', problems: [`Unreadable/incomplete native report: ${error.message}`], scenarios: [] };
}
if (run.error) inspection.problems.push(`Browser spawn failed: ${run.error.message}`);
if (!existsSync(join(html, 'index.html'))) inspection.problems.push('Native HTML report missing');
const after = source();
if (JSON.stringify(before) !== JSON.stringify(after)) inspection.problems.push('Selected source or Git state changed during browser execution');
if (inspection.problems.length) inspection.verdict = 'FAIL';
const result = { product: product.label, issue: 303, baselineSHA: manifest.baselineSHA,
  candidate: before, sourceAfter: after, manifestSHA256: hash(join(root, 'scripts/product-scenarios/manifest.json')),
  command: ['pnpm', ...command], cwd: app, node: process.version,
  pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
  startedAt, completedAt: new Date().toISOString(), exitCode: run.status,
  report: 'results.json', html: '../../playwright-report/scenarios/index.html', ...inspection };
writeFileSync(join(out, 'scenarios.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${product.label}: ${inspection.verdict}; ${product.scenarios.length} selected cases, ${inspection.problems.length} report problems`);
for (const problem of inspection.problems) console.error(problem);
process.exitCode = inspection.verdict === 'PASS' ? 0 : 1;
