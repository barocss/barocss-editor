import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import ts from 'typescript';
import { captureNative2ParagraphReview, Native2ParagraphReviewError, readNoteSnapshotFile } from '../dist/index.js';

// Read independently authored literal data without importing an application or session module.
const literal = readFileSync(new URL('../../../apps/note/src/native2-scenario-fixtures.ts', import.meta.url), 'utf8');
const start = literal.indexOf('{'), end = literal.indexOf('\n};', start);
assert.ok(start >= 0 && end > start);
const fixtures = JSON.parse(literal.slice(start, end + 2));
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const raw = value => JSON.stringify(value, null, 2) + '\n';
for (const [name, index] of [['SOURCE_A', 1], ['SOURCE_B', 0]]) {
  test('Node facade captures complete ' + name + ' without a DOM or editor instance', () => {
    assert.equal(typeof globalThis.window, 'undefined');
    assert.equal(typeof globalThis.document, 'undefined');
    const file = fixtures[name], before = raw(fixtures), snapshotText = raw(file);
    const paragraph = file.document.content[index], paragraphJSON = JSON.stringify(paragraph);
    const actual = captureNative2ParagraphReview(snapshotText, index);
    assert.equal(actual.kind, 'note-native2-paragraph-review');
    assert.equal(actual.snapshotText, snapshotText);
    assert.equal(actual.snapshotHash, hash(snapshotText));
    assert.deepEqual(JSON.parse(JSON.stringify(actual.paragraph)), paragraph);
    assert.equal(actual.paragraphJSON, paragraphJSON);
    assert.deepEqual(JSON.parse(JSON.stringify(actual.schemaBundle)), file.schemaBundle);
    assert.equal(actual.bundleHash, hash(JSON.stringify(['wonffice.note.paragraph.review.bundle.v1', file.schemaBundle])));
    assert.equal(actual.witnessHash, hash(JSON.stringify(['wonffice.note.paragraph.review.witness.v1', file.document.attributes.pageId, [index], paragraphJSON])));
    assert.deepEqual(JSON.parse(JSON.stringify(actual.segments)), paragraph.content.map((native, ordinal) => ({index: ordinal, kind: native.stype === 'inline-text' ? 'inline-text' : 'page-reference', native})));
    assert.ok(Object.isFrozen(actual) && Object.isFrozen(actual.paragraph) && Object.isFrozen(actual.segments));
    assert.equal('session' in actual, false); assert.equal('apply' in actual, false);
    assert.equal(raw(fixtures), before);
    assert.equal('error' in readNoteSnapshotFile(snapshotText), false);
  });
}
test('Node facade refuses an oversized whole source and an unsupported sibling without cropping', () => {
  const large = structuredClone(fixtures.SOURCE_A);large.document.metadata.labels = ['x'.repeat(65536)];
  assert.throws(() => captureNative2ParagraphReview(raw(large), 1), error => error instanceof Native2ParagraphReviewError && error.code === 'native2_paragraph_review_too_large');
  const other = structuredClone(fixtures.SOURCE_A);other.document.content.push({stype: 'mathBlock', attributes: {tex: 'x'}, content: []});
  assert.throws(() => captureNative2ParagraphReview(raw(other), 1));
});

test('public facade declares every exported capture data shape and function exactly', () => {
  const parse = (url) => ts.createSourceFile(url.pathname, readFileSync(url, 'utf8'), ts.ScriptTarget.Latest, true);
  const actual = parse(new URL('../../office-note/src/native2-paragraph-review.ts', import.meta.url));
  const facade = parse(new URL('../types.d.ts', import.meta.url));
  const named = (file, name) => file.statements.find(node => node.name?.text === name);
  const text = node => node.getText().replace(/\s+/g, ' ').trim();
  for (const name of ['Native2ReviewValue', 'Native2ReviewObject', 'Native2ParagraphReviewSegment', 'Native2ParagraphReviewWitness']) {
    const source = named(actual, name), declared = named(facade, name);
    assert.ok(source && declared);
    if (ts.isTypeAliasDeclaration(source)) assert.equal(text(declared.type), text(source.type));
    else assert.deepEqual(declared.members.map(text), source.members.map(text));
  }
  const sourceFn = named(actual, 'captureNative2ParagraphReview'), facadeFn = named(facade, 'captureNative2ParagraphReview');
  assert.deepEqual(facadeFn.parameters.map(text), sourceFn.parameters.map(text));
  assert.equal(text(facadeFn.type), text(sourceFn.type));
  const sourceError = named(actual, 'Native2ParagraphReviewError'), declaredError = named(facade, 'Native2ParagraphReviewError');
  const sourceConstructor = sourceError.members.find(ts.isConstructorDeclaration);
  const declaredConstructor = declaredError.members.find(ts.isConstructorDeclaration);
  assert.equal(text(sourceConstructor.parameters[0].type), text(declaredConstructor.parameters[0].type));
  assert.equal(text(sourceConstructor.parameters[0].type), text(declaredError.members.find(node => node.name?.text === 'code').type));
});

test('strict NodeNext consumers resolve the full registry witness instead of an any fallback', () => {
  const root = mkdtempSync('/private/tmp/native2-facade-types-');
  const require = createRequire(import.meta.url), compiler = require.resolve('typescript/lib/tsc.js');
  const facade = fileURLToPath(new URL('../types.d.ts', import.meta.url));
  const nodeModules = fileURLToPath(new URL('../../../node_modules/@types', import.meta.url));
  const compile = file => spawnSync(process.execPath, [compiler, '--noEmit', '--strict', '--skipLibCheck',
    '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--types', 'node',
    '--typeRoots', nodeModules, file], {encoding: 'utf8'});
  try {
    const good = join(root, 'consumer.mts');
    writeFileSync(good, 'import type {Native2ParagraphReviewWitness} from ' + JSON.stringify(facade) + ';\n' +
      'export const ids = (w:Native2ParagraphReviewWitness):string[] => w.schemaBundle.selected.map(ref => ref.schemaId);\n' +
      'export const definitions = (w:Native2ParagraphReviewWitness):string[] => w.schemaBundle.definitions.map(entry => entry.definitionText);\n');
    const positive = compile(good);assert.equal(positive.status, 0, positive.stdout + positive.stderr);
    const bad = join(root, 'invalid-consumer.mts');
    writeFileSync(bad, 'import type {Native2ParagraphReviewWitness} from ' + JSON.stringify(facade) + ';\n' +
      'export const invalid = (w:Native2ParagraphReviewWitness) => w.schemaBundle.selected.map(ref => { const wrong:number = ref.schemaId; return wrong; });\n');
    const negative = compile(bad);assert.notEqual(negative.status, 0);
    assert.match(negative.stdout + negative.stderr, /Type .string. is not assignable to type .number./);
  } finally {rmSync(root, {recursive:true,force:true});}
});
