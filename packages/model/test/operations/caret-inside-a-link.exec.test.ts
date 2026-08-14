import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

/**
 * Every operation that inserts a block where the caret is, asked the same
 * question: what is "where the caret is" when the caret is inside a link?
 *
 * They all answer it the same way — take the caret's text node and take its
 * parent — and that is the paragraph only when runs are direct children of it.
 * A link wraps its text, so inside one the parent is the link, and a block
 * inserted "beside" it goes *inside the paragraph*, next to a run. A code block
 * nested among the words of a sentence is not a document any schema describes.
 *
 * This is the shape that broke Enter twice. It is asked of all of them at once
 * here, because they share the mistake by sharing the idiom, and one fixture
 * covers the lot.
 */
describe('inserting a block while the caret is inside a link', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        callout: { name: 'callout', group: 'block', content: 'block+' },
        checklist: { name: 'checklist', group: 'block', content: 'block*' },
        codeBlock: { name: 'codeBlock', group: 'block', content: 'inline-text*' },
        horizontalRule: { name: 'horizontalRule', group: 'block', content: '' },
        image: { name: 'image', group: 'block', content: '' },
        mathBlock: { name: 'mathBlock', group: 'block', content: 'inline-text*' },
        table: { name: 'table', group: 'block', content: 'block*' },
        bTable: { name: 'bTable', group: 'block', content: 'block*' },
        bTableRow: { name: 'bTableRow', group: 'block', content: 'block*' },
        bTableCell: { name: 'bTableCell', group: 'block', content: 'block*' },
        bTableHeader: { name: 'bTableHeader', group: 'block', content: 'block*' },
        bTableHeaderCell: { name: 'bTableHeaderCell', group: 'block', content: 'block*' },
        bTableFooter: { name: 'bTableFooter', group: 'block', content: 'block*' },
        bTableBody: { name: 'bTableBody', group: 'block', content: 'block*' },
        blockQuote: { name: 'blockQuote', group: 'block', content: 'block+' },
        taskItem: { name: 'taskItem', group: 'block', content: 'block*' },
        'inline-image': { name: 'inline-image', group: 'inline', content: '' },
        blockquote: { name: 'blockquote', group: 'block', content: 'block+' },
        list: { name: 'list', group: 'block', content: 'listItem+' },
        listItem: { name: 'listItem', group: 'block', content: 'block+' },
        link: { name: 'link', group: 'inline', content: 'inline-text*' },
        'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: [] }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);

    // 'see |this page| now' — one paragraph, the middle run wrapped in a link.
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['r-1', 'l-1', 'r-2'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'r-1', stype: 'inline-text', text: 'see ', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'l-1', stype: 'link', content: ['lt-1'], parentId: 'p-1', attributes: { href: 'https://example.com' } } as INode);
    dataStore.setNode({ sid: 'lt-1', stype: 'inline-text', text: 'this page', parentId: 'l-1' } as INode);
    dataStore.setNode({ sid: 'r-2', stype: 'inline-text', text: ' now', parentId: 'p-1' } as INode);
    context.selection.setCaret('lt-1', 4);
  });

  /** What the paragraph's children are, by type. */
  const paragraphChildTypes = (): string[] =>
    ((dataStore.getNode('p-1') as INode)?.content ?? []).map(
      (id) => (dataStore.getNode(id) as INode)?.stype ?? '(gone)'
    );

  const documentChildTypes = (): string[] =>
    ((dataStore.getNode('doc-1') as INode).content ?? []).map(
      (id) => (dataStore.getNode(id) as INode)?.stype ?? '(gone)'
    );

  const inserters: { name: string; payload?: Record<string, unknown> }[] = [
    { name: 'insertCallout' },
    { name: 'insertChecklist' },
    { name: 'insertCodeBlock' },
    { name: 'insertHorizontalRule' },
    { name: 'insertImage', payload: { src: 'a.png' } },
    { name: 'insertMathBlock' },
    { name: 'insertTable', payload: { rows: 2, cols: 2 } },
    { name: 'wrapInBlockquote' },
    { name: 'wrapInList' }
  ];

  for (const { name, payload } of inserters) {
    it(`${name} puts its block in the document, not inside the paragraph`, async () => {
      const op = globalOperationRegistry.get(name);
      expect(op, `${name} is not registered`).toBeDefined();
      await op!.execute({ type: name, payload: payload ?? {} } as any, context);

      // Whatever it made, the paragraph still holds only inline things: the
      // caret being inside a link does not make a paragraph a container of
      // blocks.
      // An inline image belongs in a paragraph — it is inline, and putting it
      // beside a run is the whole point of it.
      const inlineTypes = new Set(['inline-text', 'link', 'inline-image']);
      const strays = paragraphChildTypes().filter((stype) => !inlineTypes.has(stype));
      expect(
        strays,
        `${name} 이(가) 문단 안에 블록을 넣었습니다: ${JSON.stringify(paragraphChildTypes())}`
      ).toEqual([]);

      // And the document did gain something, or the operation did nothing at all.
      expect(
        documentChildTypes().length,
        `${name} 이(가) 아무것도 하지 않았습니다`
      ).toBeGreaterThanOrEqual(1);
    });
  }

  it('the link and its text survive whatever was inserted', async () => {
    const op = globalOperationRegistry.get('insertCodeBlock');
    await op!.execute({ type: 'insertCodeBlock', payload: {} } as any, context);
    expect(dataStore.getNode('l-1'), '링크가 사라졌습니다').toBeTruthy();
    expect((dataStore.getNode('lt-1') as INode)?.text).toBe('this page');
  });
});
