import test from 'node:test';
import assert from 'node:assert/strict';
import { examples, validatePackage } from './catalogue.mjs';

const readme = '# @barocss/example\n\n' + ['Purpose', 'Install', 'Public entry points', 'Usage', 'Integration notes', 'Documentation', 'License'].map((heading) => `## ${heading}\n\nText.\n`).join('\n') + '\n| `@barocss/example` | API |\n\n```ts\nexport const value = 1;\n```\n';
const entry = { manifest: { name: '@barocss/example', exports: { '.': './dist/index.js' } }, readme, group: 'Tools' };
test('adding a public CSS entry requires documenting it', () => {
  assert.deepEqual(validatePackage(entry), []);
  const changed = { ...entry, manifest: { ...entry.manifest, exports: { ...entry.manifest.exports, './style.css': './dist/style.css' } } };
  assert.match(validatePackage(changed).join('\n'), /Missing public entry: @barocss\/example\/style.css/);
});
test('new packages need a category and a substantive English README', () => {
  const problems = validatePackage({ ...entry, group: undefined, readme: '# @barocss/example\n\n설명\n' });
  assert.ok(problems.some((problem) => problem.includes('group')));
  assert.ok(problems.some((problem) => problem.includes('English')));
  assert.ok(problems.some((problem) => problem.includes('Usage')));
});
test('extracts complete TypeScript examples and preserves JSX', () => {
  const found = examples('```sh\nnpm install x\n```\n\n```tsx\nexport const view = <div />;\n```\n');
  assert.deepEqual(found, [{ language: 'tsx', code: 'export const view = <div />;\n' }]);
});
