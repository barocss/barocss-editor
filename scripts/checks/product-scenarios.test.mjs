import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectReport, manifest, selectedProduct } from '../product-scenarios/report.mjs';

const product = {
  label: 'Office',
  scenarios: [
    { id: 'FIXTURE-CREATE', file: 'apps/office/tests/workspace.spec.ts', title: 'creates and reopens the same document', expected: 'Same document identity and authored content' },
    { id: 'FIXTURE-BACKUP', file: 'apps/office/tests/backup.spec.ts', title: 'downloads and restores an independent copy', expected: 'Original remains unchanged after editing the copy' },
  ],
};

// Small synthetic fixture in the native Playwright JSON format. Its file suite
// and describe suite reproduce the nesting in the real Office browser report.
// It proves report integrity only; it is not evidence of a product browser run.
function passedSpec(title, file, id) {
  return {
    title, file, id, ok: true, tags: [], line: 17, column: 3,
    tests: [{
      timeout: 45_000, annotations: [], expectedStatus: 'passed',
      projectId: 'chromium-desktop', projectName: 'chromium-desktop', status: 'expected',
      results: [{
        workerIndex: 0, parallelIndex: 0, status: 'passed', duration: 120,
        errors: [], stdout: [], stderr: [], retry: 0,
        startTime: '2026-09-30T12:04:39.657Z', annotations: [],
        attachments: [{ name: 'identity', contentType: 'application/json', body: 'eyJpZCI6InNhbWUifQ==' }],
      }],
    }],
  };
}

function nativeReport() {
  return {
    config: {
      rootDir: '/isolated/barocss-editor/apps/office/tests', workers: 1,
      projects: [{ id: 'chromium-desktop', name: 'chromium-desktop', retries: 0, repeatEach: 1 }],
    },
    suites: [
      { title: 'workspace.spec.ts', file: 'workspace.spec.ts', line: 0, column: 0,
        specs: [passedSpec('creates and reopens the same document', 'workspace.spec.ts', 'native-create')] },
      { title: 'backup.spec.ts', file: 'backup.spec.ts', line: 0, column: 0, specs: [],
        suites: [{ title: 'shared workspace backup', file: 'backup.spec.ts', line: 8, column: 1,
          specs: [passedSpec('downloads and restores an independent copy', 'backup.spec.ts', 'native-backup')] }] },
    ],
    errors: [],
    stats: { startTime: '2026-09-30T12:04:38.137Z', duration: 400, expected: 2, skipped: 0, unexpected: 0, flaky: 0 },
  };
}

const firstSpec = report => report.suites[0].specs[0];
const firstRun = report => firstSpec(report).tests[0];
const firstAttempt = report => firstRun(report).results[0];

function assertRejected(report, exitCode = 0, failedScenario) {
  let result;
  try {
    result = inspectReport(product, report, exitCode);
  } catch (error) {
    // run.mjs turns unreadable/malformed native reports into a failed artifact.
    assert.ok(error instanceof Error);
    return;
  }
  assert.equal(result.verdict, 'FAIL', 'Incomplete or invalid evidence must never pass');
  assert.ok(result.problems.length > 0, 'A failed report must explain its failure');
  if (failedScenario) {
    assert.equal(result.scenarios.find(row => row.id === failedScenario)?.verdict, 'FAIL');
  }
}

test('native nested suites identify each selected scenario and retain observed evidence', () => {
  const report = nativeReport();
  const before = structuredClone(report);
  const result = inspectReport(product, report, 0);
  assert.equal(result.verdict, 'PASS');
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.scenarios.map(row => [row.id, row.verdict, row.actual, row.attempts, row.retry]), [
    ['FIXTURE-CREATE', 'PASS', 'passed', 1, 0],
    ['FIXTURE-BACKUP', 'PASS', 'passed', 1, 0],
  ]);
  assert.equal(result.scenarios[0].expected, product.scenarios[0].expected);
  assert.equal(result.scenarios[0].durationMs, 120);
  assert.deepEqual(result.scenarios[0].attachments, firstAttempt(report).attachments);
  assert.deepEqual(report, before, 'Inspection must not modify the native report');
});

for (const file of [
  'apps/office/tests/workspace.spec.ts',
  'apps\\office\\tests\\workspace.spec.ts',
  '/isolated/barocss-editor/apps/office/tests/workspace.spec.ts',
  'C:\\isolated\\barocss-editor\\apps\\office\\tests\\workspace.spec.ts',
]) {
  test(`correct native product path identifies the selected file: ${file}`, () => {
    const report = nativeReport();
    firstSpec(report).file = file;
    assert.equal(inspectReport(product, report, 0).verdict, 'PASS');
  });
}

const missingEvidence = [
  ['missing suites', report => { delete report.suites; }],
  ['empty suites with misleading passed totals', report => { report.suites = []; }],
  ['non-array suites', report => { report.suites = {}; }],
  ['null suite entry', report => { report.suites.push(null); }],
  ['non-array nested suites', report => { report.suites[1].suites = {}; }],
  ['non-array suite specs', report => { report.suites[0].specs = { 0: firstSpec(report), length: 1 }; }],
  ['null spec entry', report => { report.suites[0].specs.push(null); }],
  ['missing nested case with misleading passed totals', report => { report.suites[1].suites = []; }],
  ['missing errors inventory', report => { delete report.errors; }],
  ['non-array errors inventory', report => { report.errors = {}; }],
  ['native run error', report => { report.errors = [{ message: 'Web server failed to start' }]; }],
  ['missing totals', report => { delete report.stats; }],
  ['empty totals', report => { report.stats = {}; }],
  ['incomplete passed total', report => { report.stats.expected = 1; }],
  ['inflated passed total', report => { report.stats.expected = 3; }],
  ['string passed total', report => { report.stats.expected = '2'; }],
  ['missing skipped total', report => { delete report.stats.skipped; }],
  ['missing unexpected total', report => { delete report.stats.unexpected; }],
  ['missing flaky total', report => { delete report.stats.flaky; }],
  ['skipped total', report => { report.stats.skipped = 1; }],
  ['unexpected total', report => { report.stats.unexpected = 1; }],
  ['flaky total', report => { report.stats.flaky = 1; }],
];
for (const [name, mutate] of missingEvidence) {
  test(`report rejects ${name}`, () => {
    const report = nativeReport();
    mutate(report);
    assertRejected(report);
  });
}

const misidentifiedEvidence = [
  ['changed title with same totals', report => { firstSpec(report).title = 'an unselected test'; }],
  ['changed file with same title', report => { firstSpec(report).file = 'other.spec.ts'; }],
  ['missing file', report => { delete firstSpec(report).file; }],
  ['non-string file', report => { firstSpec(report).file = { toString: () => 'workspace.spec.ts' }; }],
  ['arbitrary relative path prefix', report => { firstSpec(report).file = 'unrelated/tests/workspace.spec.ts'; }],
  ['relative prefix before the correct product path', report => { firstSpec(report).file = 'unrelated/apps/office/tests/workspace.spec.ts'; }],
  ['other product with same file and title', report => { firstSpec(report).file = 'apps/site/tests/workspace.spec.ts'; }],
  ['other absolute product path', report => { firstSpec(report).file = '/isolated/barocss-editor/apps/site/tests/workspace.spec.ts'; }],
  ['other Windows product path', report => { firstSpec(report).file = 'C:\\isolated\\barocss-editor\\apps\\site\\tests\\workspace.spec.ts'; }],
  ['duplicate replacing the other selected case', report => { report.suites[1].suites[0].specs[0] = structuredClone(firstSpec(report)); }],
];
for (const [name, mutate] of misidentifiedEvidence) {
  test(`report rejects ${name}`, () => {
    const report = nativeReport();
    mutate(report);
    assertRejected(report, 0, 'FIXTURE-CREATE');
  });
}

test('a missing selected case fails even when an unselected passed case replaces it', () => {
  const report = nativeReport();
  report.suites[1].suites[0].specs[0] = passedSpec('unselected green test', 'backup.spec.ts', 'native-unselected');
  assertRejected(report, 0, 'FIXTURE-BACKUP');
});

for (const duplicate of [false, true]) {
  test(`report rejects an extra ${duplicate ? 'duplicate' : 'unselected'} passed case`, () => {
    const report = nativeReport();
    report.suites[0].specs.push(duplicate ? structuredClone(firstSpec(report)) : passedSpec('extra green test', 'workspace.spec.ts', 'native-extra'));
    assertRejected(report);
  });
}

const failedAttempts = [
  ['failed spec flag', report => { firstSpec(report).ok = false; }],
  ['missing spec flag', report => { delete firstSpec(report).ok; }],
  ['skipped attempt', report => { firstAttempt(report).status = 'skipped'; }],
  ['failed attempt', report => { firstAttempt(report).status = 'failed'; }],
  ['timed out attempt', report => { firstAttempt(report).status = 'timedOut'; }],
  ['interrupted attempt', report => { firstAttempt(report).status = 'interrupted'; }],
  ['expected failure', report => { firstRun(report).expectedStatus = 'failed'; firstAttempt(report).status = 'failed'; }],
  ['unexpected pass of an expected failure', report => { firstRun(report).expectedStatus = 'failed'; firstRun(report).status = 'unexpected'; }],
  ['flaky classification', report => { firstRun(report).status = 'flaky'; }],
  ['skipped classification', report => { firstRun(report).status = 'skipped'; }],
  ['unexpected classification', report => { firstRun(report).status = 'unexpected'; }],
  ['passed retry without its earlier attempt', report => { firstAttempt(report).retry = 1; }],
  ['missing retry index', report => { delete firstAttempt(report).retry; }],
  ['failed attempt followed by passed retry', report => {
    const retry = structuredClone(firstAttempt(report)); retry.retry = 1;
    firstAttempt(report).status = 'failed'; firstRun(report).results.push(retry);
  }],
  ['repeated passed attempts', report => { firstRun(report).results.push(structuredClone(firstAttempt(report))); }],
  ['second project run', report => { firstSpec(report).tests.push(structuredClone(firstRun(report))); }],
  ['wrong project name', report => { firstRun(report).projectName = 'firefox'; }],
  ['missing project name', report => { delete firstRun(report).projectName; }],
  ['inconsistent project identity', report => { firstRun(report).projectId = 'firefox'; }],
  ['missing project identity', report => { delete firstRun(report).projectId; }],
  ['missing expected status', report => { delete firstRun(report).expectedStatus; }],
  ['error on a supposedly passed attempt', report => { firstAttempt(report).errors = [{ message: 'Assertion failed' }]; }],
  ['legacy error on a supposedly passed attempt', report => { firstAttempt(report).error = { message: 'Assertion failed' }; }],
];
for (const [name, mutate] of failedAttempts) {
  test(`report rejects ${name} despite green aggregate totals`, () => {
    const report = nativeReport();
    mutate(report);
    assertRejected(report, 0, 'FIXTURE-CREATE');
  });
}

const malformedAttempts = [
  ['missing tests', report => { delete firstSpec(report).tests; }],
  ['empty tests', report => { firstSpec(report).tests = []; }],
  ['array-like tests', report => { firstSpec(report).tests = { 0: firstRun(report), length: 1 }; }],
  ['null test entry', report => { firstSpec(report).tests = [null]; }],
  ['missing results', report => { delete firstRun(report).results; }],
  ['empty results', report => { firstRun(report).results = []; }],
  ['array-like results', report => { firstRun(report).results = { 0: firstAttempt(report), length: 1 }; }],
  ['null result entry', report => { firstRun(report).results = [null]; }],
  ['missing attempt status', report => { delete firstAttempt(report).status; }],
  ['missing attempt error inventory', report => { delete firstAttempt(report).errors; }],
  ['non-array attempt error inventory', report => { firstAttempt(report).errors = { length: 0 }; }],
];
for (const [name, mutate] of malformedAttempts) {
  test(`report fails closed for ${name}`, () => {
    const report = nativeReport();
    mutate(report);
    assertRejected(report, 0, 'FIXTURE-CREATE');
  });
}

for (const exitCode of [1, 137, null, undefined, '0']) {
  test(`green native results cannot override process exit ${String(exitCode)}`, () => {
    // Pass undefined directly: assertRejected has a convenience default of zero.
    const result = inspectReport(product, nativeReport(), exitCode);
    assert.equal(result.verdict, 'FAIL');
    assert.ok(result.problems.length > 0);
  });
}

test('the selected manifest retains all 27 distinct product journeys and runnable evidence', () => {
  assert.deepEqual(Object.keys(manifest.products).sort(), ['office', 'site', 'slide', 'word']);
  const scopes = { word: 2, slide: 6, site: 7, office: 12 };
  const ids = new Set();
  const ports = new Set();
  for (const [name, expectedCount] of Object.entries(scopes)) {
    const selected = selectedProduct(name);
    assert.equal(selected.scenarios.length, expectedCount, `${name} selected acceptance scope changed`);
    assert.ok(Number.isInteger(selected.port) && selected.port > 1024);
    assert.ok(!ports.has(selected.port), 'Products must use distinct isolated server ports');
    ports.add(selected.port);
    assert.ok(Number.isInteger(selected.timeout) && selected.timeout > 0);
    for (const scenario of selected.scenarios) {
      assert.ok(!ids.has(scenario.id), `Duplicate stable scenario ID: ${scenario.id}`);
      ids.add(scenario.id);
      assert.match(scenario.file, new RegExp(`^apps/${name}/tests/[a-z0-9.-]+\\.spec\\.ts$`));
      for (const field of ['title', 'interaction', 'expected']) assert.ok(scenario[field]?.trim(), `${scenario.id} lacks ${field}`);
      assert.ok(scenario.connectedIssues?.includes(303), `${scenario.id} lacks its acceptance issue`);
      assert.ok(Array.isArray(scenario.reproduce) && scenario.reproduce.length > 0, `${scenario.id} lacks reproduction steps`);
    }
  }
  assert.equal(ids.size, 27);
  for (const name of ['note', 'unknown', '__proto__', 'constructor', 'toString']) {
    assert.throws(() => selectedProduct(name), /No selected scenarios/);
  }
});

test('selection validation rejects an empty selection, duplicate identities and out-of-product files', () => {
  const original = manifest.products.office;
  const mutations = [
    selected => { selected.scenarios = []; },
    selected => { selected.scenarios[1].id = selected.scenarios[0].id; },
    selected => { selected.scenarios[1].title = selected.scenarios[0].title; },
    selected => { selected.scenarios[0].file = 'apps/site/tests/workspace.spec.ts'; },
    selected => { selected.scenarios[0].file = 'apps/office/tests/../workspace.spec.ts'; },
    selected => { selected.scenarios[0].id = ''; },
    selected => { selected.scenarios[0].title = ''; },
  ];
  try {
    for (const mutate of mutations) {
      manifest.products.office = structuredClone(original);
      mutate(manifest.products.office);
      assert.throws(() => selectedProduct('office'), /No selected scenarios|Invalid or duplicate scenario selection/);
    }
  } finally {
    manifest.products.office = original;
  }
});
