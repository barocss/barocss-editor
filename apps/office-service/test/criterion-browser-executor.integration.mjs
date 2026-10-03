import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCriterionBrowserExecutor } from '../dist/criterion-browser-executor.js';
import { getCriterionSpecimen } from '@barocss/office-word/criterion-confirmation';

// Executor-only browser proof. The full authenticated author/confirmation/run flow is separate.
const execute = createCriterionBrowserExecutor();
const criterion = { schemaVersion: 1, kind: 'fictional-active-button-contrast', minimumRatio: 4.5,
  authoredSentence: 'Fictional active-button contrast: minimum 4.5:1.' };
const evidence = [];
for (const id of ['dark', 'low', 'transparent']) {
  const specimen = getCriterionSpecimen(id);
  const result = await execute.execute(specimen, criterion);
  assert.equal(result.executor.id, 'local-playwright-chromium');
  assert.equal(result.executor.version, 1); assert.ok(result.executor.browserVersion);
  assert.equal(result.rendered.tagName, 'BUTTON'); assert.equal(result.rendered.disabled, false);
  assert.equal(result.rendered.backgroundImage, 'none');
  assert.deepEqual(result.evaluation.inputs, result.rendered);
  if (id === 'dark') {
    assert.equal(result.rendered.color, 'rgb(0, 0, 0)'); assert.equal(result.rendered.backgroundColor, 'rgb(255, 255, 255)');
    assert.equal(result.evaluation.status, 'passed'); assert.equal(result.evaluation.ratio, 21);
  } else if (id === 'low') {
    assert.equal(result.rendered.color, 'rgb(119, 119, 119)'); assert.equal(result.rendered.backgroundColor, 'rgb(136, 136, 136)');
    assert.equal(result.evaluation.status, 'failed'); assert.ok(result.evaluation.ratio > 1 && result.evaluation.ratio < criterion.minimumRatio);
  } else {
    assert.equal(result.rendered.color, 'rgba(255, 255, 255, 0.5)'); assert.equal(result.evaluation.status, 'unsupported');
    assert.ok(result.evaluation.reason); assert.equal('ratio' in result.evaluation, false);
  }
  evidence.push({ specimen: { ...specimen, sourceHash: createHash('sha256').update(specimen.sourceText).digest('hex') }, ...result });
}
await assert.rejects(execute.execute({ ...getCriterionSpecimen('dark'), sourceText: '<script>throw 1</script>' }, criterion), /registered_specimen_changed/);
await assert.rejects(execute.execute({ ...getCriterionSpecimen('dark'), version: 2 }, criterion), /registered_specimen_changed/);
console.log(JSON.stringify({ status: 'passed', browserCases: 3, arbitrarySourceAndVersionRefused: true, evidence }));
