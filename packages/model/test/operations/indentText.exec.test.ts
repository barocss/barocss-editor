import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import { indentText as indentTextDsl } from '../../src/operations-dsl/indentText';

describe('indentText operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'document': { name: 'document', group: 'block', content: 'block+' },
        'inline-text': { name: 'inline-text', content: 'text*', marks: ['bold', 'italic'] }
      },
      marks: { bold: { name: 'bold' }, italic: { name: 'italic' } }
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('indents lines in a single node range (default two spaces)', async () => {
    // 노드를 트리에 연결 (부모 필요)
    const rootId = 'root';
    dataStore.setNode({ sid: rootId, stype: 'document', content: ['t1'] });
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'A\nB', parentId: rootId });
    const op = globalOperationRegistry.get('indentText');
    const res = await op!.execute({ type: 'indentText', payload: { nodeId: 't1', start: 0, end: 3 } } as any, context);
    expect(res.ok).toBe(true);
    expect(typeof res.data).toBe('string');
    // range.indent는 각 줄 앞에 indent를 추가하므로 '  A\n  B'가 되어야 함
    // range.indent는 transformed 텍스트를 반환함
    expect(res.data).toBe('  A\n  B');
  });

  it('indents cross-node range with custom indent', async () => {
    dataStore.setNode({ sid: 'a', stype: 'inline-text', text: 'X' });
    dataStore.setNode({ sid: 'b', stype: 'inline-text', text: 'Y' });
    const op = globalOperationRegistry.get('indentText');
    const range = {
      type: 'range' as const,
      startNodeId: 'a',
      startOffset: 0,
      endNodeId: 'b',
      endOffset: 1,
      collapsed: false,
      direction: 'forward' as const
    };
    const res = await op!.execute({ type: 'indentText', payload: { range, indent: '\t' } } as any, context);
    expect(typeof res.data).toBe('string');
  });

  describe('indentText operation DSL', () => {
    it('builds descriptor from DSL (control, single node)', () => {
      const dsl = indentTextDsl(0, 3, '>>');
      expect(dsl).toEqual({ type: 'indentText', payload: { start: 0, end: 3, indent: '>>' } });
    });
    it('builds descriptor from DSL (direct, single node)', () => {
      const dsl = indentTextDsl('t1', 0, 3, '  ');
      expect(dsl).toEqual({ type: 'indentText', payload: { nodeId: 't1', start: 0, end: 3, indent: '  ' } });
    });
    it('builds descriptor from DSL (cross-node)', () => {
      const dsl = indentTextDsl('a', 0, 'b', 1, '  ');
      expect(dsl.type).toBe('indentText');
      expect(dsl.payload).toHaveProperty('range');
    });
  });
});

