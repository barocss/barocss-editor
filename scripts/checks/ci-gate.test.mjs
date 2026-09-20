import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const jobs = Object.fromEntries([...workflow.matchAll(/^ {2}([\w-]+):\n((?:^(?: {4}.*|)\n)+)/gm)]
  .map(([, id, body]) => [id, body]));
const gate = jobs['lint-typecheck-test'];
// Execute the actual workflow shell block, including its handling of unset values.
const script = gate.match(/ {8}run: \|\n((?: {10}.*\n)+)/)[1]
  .replace(/^ {10}/gm, '');
const inputs = {
  LINT_RESULT: 'lint',
  SOURCE_RESULT: 'typecheck-source',
  TEST_TYPES_RESULT: 'typecheck-tests',
  UNIT_RESULT: 'unit-tests',
};
const success = Object.fromEntries(Object.keys(inputs).map(key => [key, 'success']));
const execute = env => spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
  encoding: 'utf8', env,
});

test('required check waits for every independent verification job, even after failure', () => {
  assert.match(gate, /name: Lint, type-check, unit test\n/);
  assert.match(gate, /if: \$\{\{ always\(\) \}\}/);
  assert.deepEqual(gate.match(/needs: \[([^\]]+)\]/)[1].split(', '), Object.values(inputs));
  for (const [key, job] of Object.entries(inputs)) {
    assert.ok(gate.includes(`${key}: \${{ needs.${job}.result }}`));
    assert.ok(jobs[job], `Missing verification job: ${job}`);
    assert.doesNotMatch(jobs[job], /^ {4}(?:needs|if|continue-on-error):/m);
    assert.doesNotMatch(jobs[job], /continue-on-error:|^ {8}if:/m);
  }
  const expectedCommands = {
    lint: ['pnpm test:release', 'pnpm test:checks', 'pnpm lint'],
    'typecheck-source': ['pnpm type-check'],
    'typecheck-tests': ['pnpm type-check:tests'],
    'unit-tests': ['pnpm test'],
  };
  for (const [job, commands] of Object.entries(expectedCommands)) {
    const runs = [...jobs[job].matchAll(/run: (.+)/g)].map(([, run]) => run);
    assert.deepEqual(runs, ['pnpm install --frozen-lockfile', ...commands]);
  }
});

test('required check succeeds only when all verification jobs succeed', () => {
  const result = execute(success);
  assert.equal(result.status, 0, result.stderr);
  for (const key of Object.keys(inputs)) {
    for (const state of ['failure', 'cancelled', 'skipped', '', 'unknown']) {
      const result = execute({ ...success, [key]: state });
      assert.equal(result.status, 1, `${key}=${state}: ${result.stderr}`);
    }
    const missing = { ...success };
    delete missing[key];
    assert.notEqual(execute(missing).status, 0, `Missing ${key} must fail`);
  }
  assert.notEqual(execute({}).status, 0);
});
