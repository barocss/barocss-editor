import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const workflow = name => YAML.parse(readFileSync(resolve('.github/workflows', name), 'utf8'));

test('verification workflows run for develop batches and main release PRs', () => {
  for (const name of ['ci.yml', 'backend-postgres.yml', 'backend-container.yml', 'docs.yml']) {
    const config = workflow(name);
    assert.deepEqual(new Set(config.on.pull_request.branches), new Set(['develop', 'main']), `${name} PR targets`);
    assert.deepEqual(new Set(config.on.push.branches), new Set(['develop', 'main']), `${name} push targets`);
  }
  assert.equal(workflow('ci.yml').jobs['lint-typecheck-test'].name, 'Lint, type-check, unit test');
});

test('documentation builds on develop but only main can publish Pages', () => {
  const docs = workflow('docs.yml');
  assert.equal(docs.jobs.build.if, undefined);
  const mainOnly = "github.event_name != 'pull_request' && github.ref == 'refs/heads/main'";
  assert.equal(docs.jobs.build.steps.find(step => step.uses?.startsWith('actions/upload-pages-artifact@')).if, mainOnly);
  assert.equal(docs.jobs.deploy.if, mainOnly);
});
