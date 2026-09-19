import { describe, it, expect } from 'vitest';
import { createMathDocument, row, toLatex, parseLatex, type MathDocument } from '@barocss/math-editor/core';
import { mathEditorToWord, wordToMathEditor, wordMathExcludedStructures } from '../src/math-editor-bridge';
import { applyWordMathDraft, captureWordMathTarget } from '../src/math-editor-session';
import { setWordMathScale } from '../src/math-size';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createWordEditor } from '../src/word-kit';
import { getWordSchemaDefinition } from '../src/word-schema';
import { createStarterDocument } from '../src/starter-document';
const fraction = (): MathDocument => ({ version: 1, root: { ...row(), children: [{ type: 'fraction', id: row().id, slots: [row('한글+x'), row('2')] }] } });
function setup() {
 const schema = createSchema('word', getWordSchemaDefinition());
 const editor = createWordEditor({ editable: true, schema, dataStore: new DataStore(undefined as never, schema as never) } as never);
 editor.loadDocument(createStarterDocument(), 'word');
 const surface = editor.dataStore.getNode(editor.dataStore.getNode(editor.getRootId()!)!.content![1] as string)!;
 const paragraph = editor.dataStore.getNode(surface.content![0] as string)!;
 const id = paragraph.content![0] as string;
 editor.updateSelection({ type: 'range', startNodeId: id, endNodeId: id, startOffset: 0, endOffset: 0, collapsed: true });
 return editor;
}
describe('math editor bridge', () => {
 it('preserves equation size through draft replacement and separates size undo from content undo', async () => {
  const editor = setup();
  const snapshot = () => JSON.stringify(editor.exportDocument(), (key, value) =>
   key === 'attributes' && value && !Object.keys(value).length ? undefined : value);
  await applyWordMathDraft(editor, captureWordMathTarget(editor)!, fraction());
  const target = captureWordMathTarget(editor)!;
  const before = snapshot();
  await setWordMathScale(editor, target, 200);
  expect(editor.dataStore.getNode(target.id)?.attributes?.fontScale).toBe(2);
  const sized = snapshot();
  await applyWordMathDraft(editor, captureWordMathTarget(editor)!, createMathDocument('changed'));
  expect(captureWordMathTarget(editor)?.math?.attributes?.fontScale).toBe(2);
  await editor.executeCommand('undo');
  expect(snapshot()).toBe(sized);
  await editor.executeCommand('undo');
  expect(snapshot()).toBe(before);
 });
 it('rejects invalid sizes and stale or read-only targets without changing the document', async () => {
  const editor = setup();
  await applyWordMathDraft(editor, captureWordMathTarget(editor)!, fraction());
  const target = captureWordMathTarget(editor)!;
  const before = JSON.stringify(editor.exportDocument());
  for (const size of [49, 301, NaN, Infinity]) await expect(setWordMathScale(editor, target, size)).rejects.toThrow();
  await expect(setWordMathScale(editor, { ...target, rootId: 'another-document' }, 200)).rejects.toThrow();
  editor.setEditable(false);
  await expect(setWordMathScale(editor, target, 200)).rejects.toThrow();
  expect(JSON.stringify(editor.exportDocument())).toBe(before);
 });
 it('restores inherited size without leaving an explicit scale', async () => {
  const editor = setup();
  await applyWordMathDraft(editor, captureWordMathTarget(editor)!, fraction());
  const target = captureWordMathTarget(editor)!;
  await setWordMathScale(editor, target, 150);
  await setWordMathScale(editor, target, 100);
  expect(editor.dataStore.getNode(target.id)?.attributes?.fontScale).toBeUndefined();
  await editor.executeCommand('undo');
  expect(editor.dataStore.getNode(target.id)?.attributes?.fontScale).toBe(1.5);
 });
 it.each([
  String.raw`\text{조건: x > 0} + \mathrm{sin} x + \mathbf{AB}`,
  String.raw`\text{두  칸 \{조건\} \% \_}`,
  String.raw`\frac{\mathbf{x}}{\mathrm{ab}}`,
  String.raw`\sqrt[3]{x}`,
  String.raw`{x}_{i}^{2}`,
  String.raw`\sqrt[n]{\frac{{x}_{i}^{2}}{y}}`,
  String.raw`\left\{x\right\}+\left\langle y\right\rangle+\left\Vert z\right\Vert`,
 ])('round trips extended structures: %s', latex => {
  const parsed = parseLatex(latex, { excludedStructures: wordMathExcludedStructures });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const word = mathEditorToWord(parsed.document);
  expect(toLatex(wordToMathEditor(word))).toBe(toLatex(parsed.document));
 });
 it('preserves empty text groups and rejects nested formatting without changing the draft', () => {
  const empty: MathDocument = { version: 1, root: { ...row(), children: [{ id: row().id, type: 'textGroup', slots: [row('')] }] } };
  expect(toLatex(wordToMathEditor(mathEditorToWord(empty)))).toBe(String.raw`\text{}`);
  for (const latex of [String.raw`\mathbf{\frac{x}{y}}`, String.raw`\mathrm{\mathbf{x}}`]) {
   const parsed = parseLatex(latex);
   expect(parsed.ok).toBe(true);
   if (!parsed.ok) continue;
   const before = JSON.stringify(parsed.document);
   expect(() => mathEditorToWord(parsed.document)).toThrow('텍스트에 적용');
   expect(JSON.stringify(parsed.document)).toBe(before);
  }
 });
 it('keeps unsupported combined styles, marks and fonts on the native path', () => {
  for (const attributes of [{ literal: true, style: 'b' }, { style: 'bi' }, { script: 'fraktur' }, { style: 'p', futureFormatting: true }]) {
   expect(() => wordToMathEditor({ stype: 'oMath', content: [{ stype: 'mathRun', attributes, content: [{ stype: 'inline-text', text: 'x' }] }] })).toThrow();
  }
 });
 it('keeps an explicitly visible empty root index and rejects hidden index data', () => {
  const degree = { stype: 'mathDeg', content: [{ stype: 'mathRun', content: [{ stype: 'inline-text', text: '' }] }] };
  const radical = { stype: 'mathRadical', attributes: { hideDegree: false }, content: [degree, { stype: 'mathElement', content: [] }] };
  const word = mathEditorToWord(wordToMathEditor({ stype: 'oMath', content: [radical] }));
  expect(word.content?.find(n => n.stype === 'mathRadical')?.attributes?.hideDegree).toBe(false);
  degree.content[0].content[0].text = '3'; radical.attributes.hideDegree = true;
  expect(() => wordToMathEditor({ stype: 'oMath', content: [radical] })).toThrow();
 });
 it('refuses explicit fraction styles instead of silently dropping them', () => {
  const parsed = parseLatex(String.raw`\dfrac{x}{2}`);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) expect(() => mathEditorToWord(parsed.document)).toThrow('개별 표시 크기');
 });
 it('round trips nested structures and Unicode without LaTeX parsing', () => {
  const source = fraction(); const before = JSON.stringify(source);
  expect(toLatex(wordToMathEditor(mathEditorToWord(source)))).toBe(toLatex(source));
  expect(JSON.stringify(source)).toBe(before);
 });
 it('refuses unknown Word constructs and unsupported drafts', () => {
  expect(() => wordToMathEditor({ stype: 'oMath', content: [{ stype: 'mathAccent' }] })).toThrow();
  expect(() => mathEditorToWord({ ...fraction(), additionalLines: [row('x')] })).toThrow();
 });
 it('inserts with one undo and refuses a stale popup after document replacement', async () => {
  const editor = setup(), target = captureWordMathTarget(editor)!;
  const before = JSON.stringify(editor.exportDocument());
  await applyWordMathDraft(editor, target, fraction());
  expect(JSON.stringify(editor.exportDocument())).toContain('mathFraction');
  await editor.executeCommand('undo');
  expect(JSON.stringify(editor.exportDocument())).toBe(before);
  editor.loadDocument(createStarterDocument(), 'word');
  await expect(applyWordMathDraft(editor, target, createMathDocument('x'))).rejects.toThrow();
 });
});
