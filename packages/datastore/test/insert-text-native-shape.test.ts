import { describe, expect, it } from 'vitest';
import { DataStore, DataStoreExporter, DataStoreLoader, type IMark, type INode } from '../src';

type Case = { name: string; marks?: IMark[]; position: number; expectedMarks?: IMark[] };
const cases: Case[] = [
  { name: 'omitted marks', position: 2 },
  { name: 'authored empty marks', marks: [], position: 2, expectedMarks: [] },
  { name: 'global mark at the end', marks: [{ stype: 'bold' }], position: 5, expectedMarks: [{ stype: 'bold' }] },
  { name: 'existing global mark extension inside the run', marks: [{ stype: 'italic' }], position: 2, expectedMarks: [{ stype: 'italic', range: [0, 7] }] },
  { name: 'ranged marks across and after the caret', position: 2,
    marks: [{ stype: 'bold', range: [0, 4] }, { stype: 'italic', range: [3, 5] }],
    expectedMarks: [{ stype: 'bold', range: [0, 6] }, { stype: 'italic', range: [5, 7] }] },
  { name: 'existing adjacent equal-mark coalescing', position: 5,
    marks: [{ stype: 'bold', attrs: { tone: 'ink' }, range: [0, 2] }, { stype: 'bold', attrs: { tone: 'ink' }, range: [2, 5] }],
    expectedMarks: [{ stype: 'bold', attrs: { tone: 'ink' }, range: [0, 5] }] }
];

function fixture(testCase: Case) {
  const store = new DataStore();
  const target: INode = { sid: 'target', stype: 'inline-text', text: 'Alpha', attributes: { language: 'en' }, metadata: { source: 'authored run' } };
  if (testCase.marks !== undefined) target.marks = structuredClone(testCase.marks);
  const input = {
    sid: 'document', stype: 'document', attributes: { id: 'native-shape' }, metadata: { title: 'Full native original', author: 'fixture' },
    content: [
      { sid: 'paragraph', stype: 'paragraph', attributes: { id: 'input' }, content: [target] },
      { sid: 'untouched', stype: 'paragraph', content: [{ sid: 'styled', stype: 'inline-text', text: 'Keep this original', marks: [{ stype: 'italic', range: [0, 4] }], metadata: { source: 'untouched' } }] },
      { sid: 'resources', stype: 'resources', attributes: { scope: 'document' }, content: [
        { sid: 'resource', stype: 'richText', attributes: { id: 'retained-body' }, metadata: { purpose: 'durable resource' }, content: [
          { sid: 'resource-paragraph', stype: 'paragraph', content: [{ sid: 'resource-run', stype: 'inline-text', text: 'Nested resource', marks: [] }] }
        ] }
      ] }
    ]
  };
  const root = new DataStoreLoader(store, 'native-shape').loadFromJSON(JSON.stringify(input));
  const exporter = new DataStoreExporter(store);
  const native = () => structuredClone(exporter.exportToTree(root)) as INode;
  const file = () => JSON.parse(exporter.exportToJSON(root)) as INode;
  const before = native();
  expect(run(before).marks).toStrictEqual(testCase.marks);
  expect(Object.hasOwn(run(file()), 'marks')).toBe(testCase.marks !== undefined);
  const expected = structuredClone(before);
  run(expected).text = `Alpha`.slice(0, testCase.position) + '++' + `Alpha`.slice(testCase.position);
  if (testCase.expectedMarks !== undefined) run(expected).marks = structuredClone(testCase.expectedMarks);
  return { store, native, file, before, expected };
}

function run(tree: INode): INode {
  if (tree.sid === 'target') return tree;
  for (const child of tree.content ?? []) {
    if (typeof child === 'string') continue;
    const found = findRun(child);
    if (found) return found;
  }
  throw new Error('The complete native fixture must contain the target run');
}
function findRun(tree: INode): INode | undefined {
  if (tree.sid === 'target') return tree;
  for (const child of tree.content ?? []) {
    if (typeof child !== 'string') { const found = findRun(child); if (found) return found; }
  }
  return undefined;
}

function insert(store: DataStore, position: number) {
  expect(store.range.insertText({ type: 'range', startNodeId: 'target', endNodeId: 'target', startOffset: position, endOffset: position }, '++')).toBe('++');
}

describe('native insertion shape', () => {
  for (const testCase of cases) {
    it(`imports, inserts and exports the complete original with ${testCase.name}`, () => {
      const { store, native, file, expected } = fixture(testCase);
      insert(store, testCase.position);
      expect(native()).toStrictEqual(expected);
      expect(file()).toStrictEqual(JSON.parse(JSON.stringify(expected)));
      expect(Object.hasOwn(run(file()), 'marks')).toBe(testCase.expectedMarks !== undefined);
    });

    it(`rolls back and commits the actual overlay with ${testCase.name}`, () => {
      const { store, native, file, before, expected } = fixture(testCase);
      store.begin();
      insert(store, testCase.position);
      expect(native()).toStrictEqual(expected);
      expect(store.end().length).toBeGreaterThan(0);
      store.rollback();
      expect(store.isTransactionActive()).toBe(false);
      expect(native()).toStrictEqual(before);
      expect(file()).toStrictEqual(JSON.parse(JSON.stringify(before)));

      store.begin();
      insert(store, testCase.position);
      expect(store.end().length).toBeGreaterThan(0);
      store.commit();
      expect(store.isTransactionActive()).toBe(false);
      expect(native()).toStrictEqual(expected);
      expect(file()).toStrictEqual(JSON.parse(JSON.stringify(expected)));
    });
  }
});
