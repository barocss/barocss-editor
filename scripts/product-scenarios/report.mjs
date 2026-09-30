import { readFileSync } from 'node:fs';

export const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));

export function selectedProduct(name) {
  const product = Object.hasOwn(manifest.products, name) ? manifest.products[name] : undefined;
  if (!product || !product.scenarios.length) throw new Error(`No selected scenarios for ${name}`);
  const ids = new Set(), titles = new Set();
  for (const scenario of product.scenarios) {
    if (!scenario.id || ids.has(scenario.id) || !scenario.title || titles.has(scenario.title)
      || !new RegExp(`^apps/${name}/tests/[a-z0-9.-]+\\.spec\\.ts$`).test(scenario.file)) {
      throw new Error(`Invalid or duplicate scenario selection: ${name}/${scenario.id}`);
    }
    ids.add(scenario.id); titles.add(scenario.title);
  }
  return product;
}

function specsIn(suites) {
  if (!Array.isArray(suites)) throw new Error('Missing native Playwright suites');
  return suites.flatMap(suite => {
    if (!Array.isArray(suite.specs ?? [])) throw new Error('Invalid native Playwright specs');
    return [...(suite.specs ?? []), ...specsIn(suite.suites ?? [])];
  });
}

function matchesFile(expected, actual) {
  if (typeof actual !== 'string') return false;
  const normalized = actual.replaceAll('\\', '/');
  const relative = expected.split('/tests/')[1];
  const absolute = normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized);
  return normalized === relative || normalized === expected
    || (absolute && normalized.endsWith(`/${expected}`));
}

export function inspectReport(product, native, exitCode) {
  const problems = [];
  const specs = specsIn(native.suites);
  if (exitCode !== 0) problems.push(`Browser process exit: ${exitCode}`);
  if (!Array.isArray(native.errors) || native.errors.length) problems.push('Native report contains run errors or lacks errors inventory');
  if (specs.length !== product.scenarios.length) problems.push(`Selected ${product.scenarios.length} cases; observed ${specs.length}`);
  const stats = native.stats;
  if (!stats || stats.expected !== product.scenarios.length || stats.skipped !== 0 || stats.unexpected !== 0 || stats.flaky !== 0) {
    problems.push('Native totals are missing, skipped, failed, flaky or incomplete');
  }
  const observed = new Set();
  const rows = product.scenarios.map(scenario => {
    const matches = specs.filter(spec => spec.title === scenario.title && matchesFile(scenario.file, spec.file));
    if (matches.length !== 1) {
      problems.push(`${scenario.id}: expected one exact file/title; observed ${matches.length}`);
      return { ...scenario, verdict: 'FAIL', actual: 'Missing or ambiguous native result' };
    }
    const spec = matches[0]; observed.add(spec);
    const tests = Array.isArray(spec.tests) ? spec.tests : [];
    const run = tests[0], results = Array.isArray(run?.results) ? run.results : [];
    const result = results[0];
    const passed = spec.ok === true && tests.length === 1 && run.projectName === 'chromium-desktop'
      && run.projectId === 'chromium-desktop'
      && run.expectedStatus === 'passed' && run.status === 'expected'
      && results.length === 1 && result.status === 'passed' && result.retry === 0
      && Array.isArray(result.errors) && result.errors.length === 0 && !result.error;
    if (!passed) problems.push(`${scenario.id}: requires one passed desktop attempt, no skips/retries/expected failures`);
    return { ...scenario, verdict: passed ? 'PASS' : 'FAIL', actual: result?.status ?? 'No attempt',
      attempts: results.length, retry: result?.retry,
      durationMs: result?.duration, attachments: result?.attachments ?? [] };
  });
  if (observed.size !== specs.length) problems.push('Report includes unselected or duplicate cases');
  return { verdict: problems.length ? 'FAIL' : 'PASS', problems, scenarios: rows };
}
