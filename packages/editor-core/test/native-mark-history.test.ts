import { afterEach, describe, expect, it, vi } from 'vitest';
import { Schema } from '@barocss/schema';
import { BoldExtension, ItalicExtension, UnderlineExtension, StrikeThroughExtension, LinkExtension } from '@barocss/extensions';
import { applyMark, insertText, registerPreCommitGuard, transaction } from '@barocss/model';
import { Editor } from '../src/editor';
import type { ModelSelection } from '../src/types';

type NativeMark = { stype: string; range: [number, number]; attrs?: Record<string, unknown> };
type NativeNode = {
  sid?: string;
  stype: string;
  text?: string;
  marks?: NativeMark[];
  attributes?: Record<string, unknown>;
  content?: NativeNode[];
  metadata?: Record<string, unknown>;
};
type MarkInput = 'absent' | 'empty' | 'nonempty';

const commands = [
  ['toggleBold', 'bold'],
  ['toggleItalic', 'italic'],
  ['toggleUnderline', 'underline'],
  ['toggleStrikeThrough', 'strikethrough'],
] as const;
const editors: Editor[] = [];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  editors.splice(0).forEach(editor => editor.destroy());
});

function fixture(input: MarkInput = 'absent') {
  const schema = new Schema('native-mark-history', {
    topNode: 'document',
    nodes: {
      document: { name: 'document', content: 'resources section+' },
      resources: { name: 'resources', content: 'resource*' },
      resource: { name: 'resource', atom: true },
      section: { name: 'section', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      table: { name: 'table', group: 'block', content: 'row+' },
      row: { name: 'row', content: 'cell+' },
      cell: { name: 'cell', content: 'paragraph+' },
      codeBlock: { name: 'codeBlock', group: 'block', content: 'inline*', marks: [] },
      reference: { name: 'reference', group: 'inline', atom: true },
      'inline-text': { name: 'inline-text', group: 'inline' },
    },
    marks: {
      bold: { name: 'bold' }, italic: { name: 'italic' },
      underline: { name: 'underline' }, strikethrough: { name: 'strikethrough' },
      code: { name: 'code', attrs: { flavor: { type: 'string' } } },
      link: { name: 'link', attrs: { href: { type: 'string' }, title: { type: 'string' } } },
    },
  });
  const originalMarks: NativeMark[] = [{ stype: 'code', range: [0, 5], attrs: { flavor: 'inline' } }];
  const target: NativeNode = {
    sid: 'target-run', stype: 'inline-text', text: 'ABCDE',
    attributes: { language: 'ko', resourceId: 'shared-style' },
    ...(input === 'absent' ? {} : { marks: input === 'empty' ? [] : originalMarks }),
  };
  const source: NativeNode = {
    sid: 'native-document', stype: 'document',
    attributes: { title: 'Exact native mark history' },
    metadata: { loadedAt: 'original-owner-value', sourceId: 'native-fixture' },
    content: [
      { sid: 'native-resources', stype: 'resources', content: [
        { sid: 'shared-style', stype: 'resource', attributes: { id: 'shared-style', color: '#345678' } },
      ] },
      { sid: 'native-section', stype: 'section', attributes: { id: 'section-one', margin: 12 }, content: [
        { sid: 'target-paragraph', stype: 'paragraph', attributes: { styleId: 'shared-style' }, content: [target] },
        { sid: 'nested-table', stype: 'table', attributes: { border: 'solid' }, content: [
          { sid: 'nested-row', stype: 'row', content: [
            { sid: 'nested-cell', stype: 'cell', attributes: { colspan: 1 }, content: [
              { sid: 'nested-paragraph', stype: 'paragraph', content: [
                { sid: 'nested-run', stype: 'inline-text', text: 'Untouched rich text',
                  marks: [{ stype: 'italic', range: [0, 9] }] },
                { sid: 'incoming-reference', stype: 'reference',
                  attributes: { target: 'target-run', resourceId: 'shared-style', label: 'Native reference' } },
              ] },
            ] },
          ] },
        ] },
        { sid: 'locked-code', stype: 'codeBlock', content: [
          { sid: 'code-run', stype: 'inline-text', text: 'const original = true;' },
        ] },
      ] },
    ],
  };
  const editor = new Editor({ schema, editable: true, extensions: [
    new BoldExtension(), new ItalicExtension(), new UnderlineExtension(), new StrikeThroughExtension(), new LinkExtension(),
  ] });
  editors.push(editor);
  editor.loadDocument(source);
  editor.updateSelection(range('target-run', 1, 4));
  expect(editor.getHistoryStats()).toEqual({ totalEntries: 0, currentIndex: -1, canUndo: false, canRedo: false });
  // The exporter exposes its own optional fields. Compare its actual original
  // representation; do not require deletion of a marks: undefined own key.
  const before = documentOf(editor);
  const saved = JSON.parse(JSON.stringify(before)) as NativeNode;
  expect(Object.hasOwn(node(saved, 'target-run'), 'marks')).toBe(input !== 'absent');
  expect(node(before, 'target-run').marks).toEqual(input === 'absent' ? undefined : input === 'empty' ? [] : originalMarks);
  return { editor, before };
}

function range(sid: string, startOffset: number, endOffset: number): ModelSelection {
  return { type: 'range', startNodeId: sid, endNodeId: sid, startOffset, endOffset,
    collapsed: startOffset === endOffset, direction: 'forward' };
}

function documentOf(editor: Editor): NativeNode {
  return structuredClone(editor.exportDocument()) as NativeNode;
}

function node(document: NativeNode, sid: string): NativeNode {
  if (document.sid === sid) return document;
  for (const child of document.content ?? []) {
    const found = findNode(child, sid);
    if (found) return found;
  }
  throw new Error(`Fixture node not found: ${sid}`);
}

function findNode(document: NativeNode, sid: string): NativeNode | undefined {
  if (document.sid === sid) return document;
  for (const child of document.content ?? []) {
    const found = findNode(child, sid);
    if (found) return found;
  }
}

function marked(document: NativeNode, stype: string, sid = 'target-run', start = 1, end = 4,
  attrs?: Record<string, unknown>): NativeNode {
  const expected = structuredClone(document);
  const target = node(expected, sid);
  target.marks = [...(target.marks ?? []), { stype, range: [start, end], ...(attrs ? { attrs } : {}) }];
  return expected;
}

function state(editor: Editor) {
  return { document: documentOf(editor), selection: structuredClone(editor.selection),
    history: structuredClone(editor.historyManager.getHistory()), stats: editor.getHistoryStats() };
}

function expectPosition(editor: Editor, totalEntries: number, currentIndex: number) {
  expect(editor.getHistoryStats()).toEqual({ totalEntries, currentIndex,
    canUndo: currentIndex >= 0, canRedo: currentIndex < totalEntries - 1 });
}

describe.each(commands)('%s native history', (command, markType) => {
  it.each(['absent', 'empty', 'nonempty'] as const)('restores %s marks exactly through replay and a new branch', async input => {
    const { editor, before } = fixture(input);
    const selection = structuredClone(editor.selection);
    const expected = marked(before, markType);
    expect(editor.canRun(command)).toBe(true);
    expect(await editor.run(command)).toBe(true);
    expect(documentOf(editor)).toEqual(expected);
    expect(editor.selection).toEqual(selection);
    expectPosition(editor, 1, 0);

    for (let replay = 0; replay < 3; replay++) {
      expect(await editor.undo()).toBe(true);
      const undone = documentOf(editor);
      expect(undone).toEqual(before);
      expect(Object.hasOwn(node(undone, 'target-run'), 'marks')).toBe(Object.hasOwn(node(before, 'target-run'), 'marks'));
      expect(JSON.stringify(undone)).toBe(JSON.stringify(before));
      expect(editor.selection).toEqual(selection);
      expectPosition(editor, 1, -1);
      expect(await editor.redo()).toBe(true);
      expect(documentOf(editor)).toEqual(expected);
      expect(editor.selection).toEqual(selection);
      expectPosition(editor, 1, 0);
    }

    expect(await editor.undo()).toBe(true);
    const branchCommand = command === 'toggleBold' ? 'toggleItalic' : 'toggleBold';
    const branchMark = command === 'toggleBold' ? 'italic' : 'bold';
    const branch = marked(before, branchMark);
    expect(await editor.run(branchCommand)).toBe(true);
    expect(documentOf(editor)).toEqual(branch);
    expectPosition(editor, 1, 0);
    const branchedState = state(editor);
    expect(await editor.redo()).toBe(false);
    expect(state(editor)).toEqual(branchedState);
    expect(await editor.undo()).toBe(true);
    expect(documentOf(editor)).toEqual(before);
    expect(editor.selection).toEqual(selection);
    expect(await editor.redo()).toBe(true);
    expect(documentOf(editor)).toEqual(branch);
    expect(editor.selection).toEqual(selection);
    expectPosition(editor, 1, 0);
  });

  it('takes an existing mark off with one edit and restores it with one undo', async () => {
    const { editor, before } = fixture('nonempty');
    const selection = structuredClone(editor.selection);
    const expected = marked(before, markType);
    expect(await editor.run(command)).toBe(true);
    expect(documentOf(editor)).toEqual(expected);
    expect(await editor.run(command)).toBe(true);
    expect(documentOf(editor)).toEqual(before);
    expectPosition(editor, 2, 1);
    expect(await editor.undo()).toBe(true);
    expect(documentOf(editor)).toEqual(expected);
    expect(editor.selection).toEqual(selection);
    expectPosition(editor, 2, 0);
    expect(await editor.redo()).toBe(true);
    expect(documentOf(editor)).toEqual(before);
    expectPosition(editor, 2, 1);
  });

  it('refuses no selection without writing native data or history', async () => {
    const { editor } = fixture();
    editor.updateSelection(null);
    const withoutSelection = state(editor);
    expect(editor.canRun(command)).toBe(false);
    expect(await editor.run(command)).toBe(false);
    expect(state(editor)).toEqual(withoutSelection);

    expectPosition(editor, 0, -1);
  });
});

it.each(['absent', 'empty', 'nonempty'] as const)('restores %s marks through the actual Link command, replay and replacement branch', async input => {
  const { editor, before } = fixture(input);
  const selection = structuredClone(editor.selection);
  const address = { href: 'https://example.com/native', title: 'Native reference' };
  const expected = marked(before, 'link', 'target-run', 1, 4, address);
  expect(editor.canRun('toggleLink', { ...address, replace: true })).toBe(true);
  expect(await editor.run('toggleLink', { ...address, replace: true })).toBe(true);
  expect(documentOf(editor)).toEqual(expected);
  expect(editor.selection).toEqual(selection);
  expectPosition(editor, 1, 0);
  for (let replay = 0; replay < 3; replay++) {
    expect(await editor.undo()).toBe(true);
    expect(documentOf(editor)).toEqual(before);
    expect(JSON.stringify(documentOf(editor))).toBe(JSON.stringify(before));
    expect(editor.selection).toEqual(selection);
    expectPosition(editor, 1, -1);
    expect(await editor.redo()).toBe(true);
    expect(documentOf(editor)).toEqual(expected);
    expect(editor.selection).toEqual(selection);
    expectPosition(editor, 1, 0);
  }
  expect(await editor.undo()).toBe(true);
  const newAddress = { href: 'https://example.com/branch', title: 'Replacement reference' };
  const branched = marked(before, 'link', 'target-run', 1, 4, newAddress);
  expect(await editor.run('toggleLink', { ...newAddress, replace: true })).toBe(true);
  expect(documentOf(editor)).toEqual(branched);
  expectPosition(editor, 1, 0);
  const branchState = state(editor);
  expect(await editor.redo()).toBe(false);
  expect(state(editor)).toEqual(branchState);
  expect(await editor.undo()).toBe(true);
  expect(documentOf(editor)).toEqual(before);
  expect(editor.selection).toEqual(selection);
  expect(await editor.redo()).toBe(true);
  expect(documentOf(editor)).toEqual(branched);
  expect(editor.selection).toEqual(selection);
  expectPosition(editor, 1, 0);
});

it('rolls back an actual mark batch if its later endpoint is stale', async () => {
  const { editor } = fixture();
  const before = state(editor);
  const result = await transaction(editor, [
    applyMark('target-run', 1, 4, 'underline'),
    applyMark('removed-run', 0, 2, 'bold'),
  ]).commit();
  expect(result).toMatchObject({ success: false, committed: false });
  expect(state(editor)).toEqual(before);
});

it('refuses formatting prohibited by the existing ancestor schema without partial writes', async () => {
  const { editor } = fixture();
  editor.updateSelection(range('code-run', 0, 5));
  const before = state(editor);
  expect(await editor.run('toggleBold')).toBe(false);
  expect(state(editor)).toEqual(before);
});

it('keeps the original native property state when the host refuses the actual mark candidate', async () => {
  const { editor } = fixture();
  const before = state(editor);
  const guard = vi.fn(({ candidate }: Parameters<Parameters<typeof registerPreCommitGuard>[1]>[0]) => {
    expect(candidate.getNode('target-run')?.marks).toEqual([{ stype: 'underline', range: [1, 4] }]);
    return 'Current host refuses this edit';
  });
  const dispose = registerPreCommitGuard(editor, guard);
  expect(await editor.run('toggleUnderline')).toBe(false);
  expect(guard).toHaveBeenCalledOnce();
  expect(state(editor)).toEqual(before);
  dispose();
  expect(await editor.run('toggleUnderline')).toBe(true);
  expect(await editor.undo()).toBe(true);
  expect(documentOf(editor)).toEqual(before.document);
  expect(editor.selection).toEqual(before.selection);
});

it('keeps a formatting edit separate from typing before and after it', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  const { editor } = fixture('empty');
  editor.updateSelection(range('target-run', 5, 5));
  expect((await transaction(editor, [insertText('target-run', 5, '!')]).commit()).success).toBe(true);
  vi.setSystemTime(new Date('2026-01-01T00:00:00.050Z'));
  expect((await transaction(editor, [insertText('target-run', 6, '?')]).commit()).success).toBe(true);
  expectPosition(editor, 1, 0);
  const typed = documentOf(editor);
  expect(node(typed, 'target-run').text).toBe('ABCDE!?');
  editor.updateSelection(range('target-run', 1, 4));
  const markSelection = structuredClone(editor.selection);
  expect(await editor.run('toggleUnderline')).toBe(true);
  const formatted = marked(typed, 'underline');
  expect(documentOf(editor)).toEqual(formatted);
  expectPosition(editor, 2, 1);
  editor.updateSelection(range('target-run', 7, 7));
  expect((await transaction(editor, [insertText('target-run', 7, '+')]).commit()).success).toBe(true);
  expectPosition(editor, 3, 2);
  expect(await editor.undo()).toBe(true);
  expect(documentOf(editor)).toEqual(formatted);
  expectPosition(editor, 3, 1);
  expect(await editor.undo()).toBe(true);
  expect(documentOf(editor)).toEqual(typed);
  expect(editor.selection).toEqual(markSelection);
  expectPosition(editor, 3, 0);
  expect(await editor.redo()).toBe(true);
  expect(documentOf(editor)).toEqual(formatted);
  expect(editor.selection).toEqual(markSelection);
  expectPosition(editor, 3, 1);
});

it('replays an existing applyMark endpoint batch while retaining each original mark representation', async () => {
  const { editor, before } = fixture('absent');
  const selection = structuredClone(editor.selection);
  const expected = marked(marked(before, 'bold'), 'underline', 'nested-run', 9, 13);
  const result = await transaction(editor, [
    applyMark('target-run', 1, 4, 'bold'),
    applyMark('nested-run', 9, 13, 'underline'),
  ]).commit();
  expect(result).toMatchObject({ success: true, committed: true });
  expect(documentOf(editor)).toEqual(expected);
  expect(editor.selection).toEqual(selection);
  expectPosition(editor, 1, 0);
  expect(await editor.undo()).toBe(true);
  expect(documentOf(editor)).toEqual(before);
  expect(editor.selection).toEqual(selection);
  expectPosition(editor, 1, -1);
  expect(await editor.redo()).toBe(true);
  expect(documentOf(editor)).toEqual(expected);
  expectPosition(editor, 1, 0);
});
