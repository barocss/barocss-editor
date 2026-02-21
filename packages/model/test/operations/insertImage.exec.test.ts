import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { insertImage as insertImageDsl } from '../../src/operations/insertImage';
import type { INode } from '@barocss/datastore';

describe('insertImage operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        'inline-image': { name: 'inline-image', group: 'inline', atom: true, attrs: { src: { type: 'string', required: true }, alt: { type: 'string', required: false } } },
        'inline-text': { name: 'inline-text', group: 'inline' }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  function setSelection(nodeId: string, offset: number): void {
    context.selection.setCaret(nodeId, offset);
  }

  function setupDoc(): void {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] });
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['text-1'], parentId: 'doc-1' });
    dataStore.setNode({ sid: 'text-1', stype: 'inline-text', text: 'Hello', parentId: 'p-1' });
  }

  it('inserts inline-image with src and alt', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertImage');
    expect(op).toBeDefined();
    const result = await op!.execute(
      { type: 'insertImage', payload: { src: 'https://example.com/img.png', alt: 'Test image' } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const p1 = dataStore.getNode('p-1') as INode;
    expect(p1.content!.length).toBe(2);

    const imageId = p1.content![1];
    const image = dataStore.getNode(imageId) as INode;
    expect(image.stype).toBe('inline-image');
    expect(image.attributes?.src).toBe('https://example.com/img.png');
    expect(image.attributes?.alt).toBe('Test image');
  });

  it('inserts image without alt', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertImage');
    const result = await op!.execute(
      { type: 'insertImage', payload: { src: 'https://example.com/photo.jpg' } } as any,
      context
    );

    expect(result.ok).toBe(true);
    const p1 = dataStore.getNode('p-1') as INode;
    const imageId = p1.content![1];
    const image = dataStore.getNode(imageId) as INode;
    expect(image.attributes?.alt).toBeUndefined();
  });

  it('DSL builds correct descriptor', () => {
    const d1 = insertImageDsl('a.png');
    expect(d1.type).toBe('insertImage');
    expect(d1.payload.src).toBe('a.png');

    const d2 = insertImageDsl('b.png', 'alt text');
    expect(d2.payload.alt).toBe('alt text');
  });

  it('provides inverse operation', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertImage');
    const result = await op!.execute(
      { type: 'insertImage', payload: { src: 'x.png' } } as any,
      context
    );
    expect(result.inverse).toBeDefined();
    expect(result.inverse.type).toBe('removeChild');
  });

  it('throws when src is missing', async () => {
    setupDoc();
    setSelection('text-1', 5);
    const op = globalOperationRegistry.get('insertImage');
    await expect(
      op!.execute({ type: 'insertImage', payload: {} } as any, context)
    ).rejects.toThrow(/src/);
  });

  it('throws when selection is missing', async () => {
    setupDoc();
    context.selection.current = null;
    const op = globalOperationRegistry.get('insertImage');
    await expect(
      op!.execute({ type: 'insertImage', payload: { src: 'x.png' } } as any, context)
    ).rejects.toThrow(/insertImage/);
  });
});
