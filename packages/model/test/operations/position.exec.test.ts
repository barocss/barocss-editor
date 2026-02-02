import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { PositionCalculator } from '../../src/position';

describe('PositionCalculator getDocumentSize', () => {
  let dataStore: DataStore;
  let schema: Schema;
  let calculator: PositionCalculator;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        'inline-text': { name: 'inline-text', group: 'inline' }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    calculator = new PositionCalculator(dataStore);
  });

  it('returns 0 when there is no root', () => {
    expect(calculator.getDocumentSize()).toBe(0);
  });

  it('returns size for root with one text node', () => {
    dataStore.setNode({ sid: 'doc', stype: 'document', content: ['p1'] } as any);
    dataStore.setNode({ sid: 'p1', stype: 'paragraph', content: ['t1'], parentId: 'doc' } as any);
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'Hi', parentId: 'p1' } as any);
    dataStore.setRootNodeId('doc');

    // doc: 1 + (p1: 1 + (t1: 1 + 2 + 1) + 1) + 1 = 1 + 6 + 1 = 8
    expect(calculator.getDocumentSize()).toBe(8);
  });

  it('matches findNodeByAbsolutePosition: size is one past last valid position', () => {
    dataStore.setNode({ sid: 'doc', stype: 'document', content: ['p1'] } as any);
    dataStore.setNode({ sid: 'p1', stype: 'paragraph', content: ['t1'], parentId: 'doc' } as any);
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'AB', parentId: 'p1' } as any);
    dataStore.setRootNodeId('doc');

    const size = calculator.getDocumentSize();
    expect(calculator.findNodeByAbsolutePosition(size)).toBeNull();
    const lastValid = calculator.findNodeByAbsolutePosition(size - 1);
    expect(lastValid).not.toBeNull();
    // Last character "B" of "AB" is at offset 1 in t1 (position 4 in doc)
    const atLastChar = calculator.findNodeByAbsolutePosition(size - 4);
    expect(atLastChar?.nodeId).toBe('t1');
    expect(atLastChar?.offset).toBe(1);
  });
});
