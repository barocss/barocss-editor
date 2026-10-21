import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { selectedProduct } from './report.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function productScenarioConfig(name) {
  const product = selectedProduct(name), app = join(root, 'apps', name);
  return defineConfig({
    testDir: join(app, 'tests'),
    testMatch: [...new Set(product.scenarios.map(scenario => relative(join(app, 'tests'), join(root, scenario.file))))],
    grep: new RegExp(`(?:${product.scenarios.map(scenario => escape(scenario.title)).join('|')})$`),
    fullyParallel: false, workers: 1, forbidOnly: true, retries: 0,
    timeout: product.timeout, expect: { timeout: 5_000 },
    reporter: [['list'], ['html', { open: 'never', outputFolder: join(app, 'playwright-report/scenarios') }],
      ['json', { outputFile: join(app, 'test-results/scenarios/results.json') }]],
    outputDir: join(app, 'test-results/scenarios/artifacts'),
    use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 },
      baseURL: `http://127.0.0.1:${product.port}`, trace: 'retain-on-failure',
      screenshot: 'only-on-failure', video: 'retain-on-failure' },
    projects: [{ name: 'chromium-desktop' }],
    webServer: { cwd: app,
      command: `pnpm exec vite --host 127.0.0.1 --port ${product.port} --strictPort`,
      url: `http://127.0.0.1:${product.port}`, reuseExistingServer: false, timeout: 60_000 },
  });
}
