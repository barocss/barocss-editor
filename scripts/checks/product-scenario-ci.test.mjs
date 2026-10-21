import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { productScenarioConfig } from '../product-scenarios/config.mjs';
import { manifest } from '../product-scenarios/report.mjs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const workflow = parse(read('.github/workflows/ci.yml'));
const job = workflow.jobs['e2e-product-scenarios'];

test('all four product jobs execute validated journeys and retain exact-version native reports', () => {
  assert.deepEqual(job.strategy.matrix.include, [
    { product: 'word', label: 'Word' }, { product: 'slide', label: 'Slides' },
    { product: 'site', label: 'Site' }, { product: 'office', label: 'Office' },
  ]);
  assert.equal(job.strategy['fail-fast'], false);
  assert.equal(job['timeout-minutes'], 15);
  assert.equal(job['continue-on-error'], undefined);
  const run = job.steps.find(step => step.run?.startsWith('pnpm test:e2e:'));
  assert.equal(run.run, 'pnpm test:e2e:${{ matrix.product }}:scenarios');
  assert.equal(run.env.CI, true);
  assert.equal(run.if, undefined);
  assert.equal(run['continue-on-error'], undefined);
  assert.ok(job.steps.some(step => step.run === 'pnpm install --frozen-lockfile'));
  assert.ok(job.steps.some(step => step.run === 'pnpm exec playwright install --with-deps chromium'));
  assert.equal(job.steps.find(step => step.uses === 'pnpm/action-setup@v2').with.version, '8.15.0');
  assert.equal(job.steps.find(step => step.uses === 'actions/setup-node@v4').with['node-version-file'], '.nvmrc');
  const upload = job.steps.find(step => step.uses === 'actions/upload-artifact@v4');
  assert.equal(upload.if, '${{ !cancelled() }}');
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.equal(upload.with.name, '${{ matrix.product }}-scenario-results-${{ github.sha }}');
  assert.deepEqual(upload.with.path.trim().split('\n'), [
    'apps/${{ matrix.product }}/test-results/scenarios/',
    'apps/${{ matrix.product }}/playwright-report/scenarios/',
  ]);
});

test('each selected configuration refuses server reuse and keeps isolated desktop execution', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  const ports = new Set();
  for (const name of Object.keys(manifest.products)) {
    const config = productScenarioConfig(name);
    assert.equal(config.workers, 1);
    assert.equal(config.retries, 0);
    assert.equal(config.fullyParallel, false);
    assert.equal(config.forbidOnly, true);
    assert.equal(config.webServer.reuseExistingServer, false);
    assert.match(config.webServer.command, /--host 127\.0\.0\.1 --port \d+ --strictPort$/);
    assert.ok(!ports.has(config.webServer.url));
    ports.add(config.webServer.url);
    assert.ok(config.webServer.cwd.endsWith(`/apps/${name}`));
    assert.equal(config.webServer.timeout, 60_000);
    assert.deepEqual(config.projects.map(project => project.name), ['chromium-desktop']);
    assert.deepEqual(config.use.viewport, { width: 1280, height: 900 });
    assert.equal(scripts[`test:e2e:${name}:scenarios`], `node scripts/product-scenarios/run.mjs ${name}`);
    for (const scenario of manifest.products[name].scenarios) {
      assert.ok(config.grep.test(scenario.title), `${scenario.id} excluded by selection`);
      assert.ok(!config.grep.test(`${scenario.title} unselected mobile case`));
      assert.ok(config.testMatch.includes(scenario.file.split('/tests/')[1]));
    }
    assert.ok(read(`apps/${name}/playwright.scenarios.config.ts`).includes(`productScenarioConfig('${name}')`));
  }
});
