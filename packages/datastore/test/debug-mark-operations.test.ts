import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { createSchema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('Debug Mark Operations', () => {
  let dataStore: DataStore;
  let schema: any;

  beforeEach(() => {
    dataStore = new DataStore();
    schema = createSchema('test', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', group: 'document', content: 'paragraph+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline-text+' },
        'inline-text': { 
          name: 'inline-text', 
          group: 'inline'
        }
      }
    });
    dataStore.registerSchema(schema);
  });

  it('should debug applyMark step by step', () => {
    const textNode: INode = {
      sid: 'text-1',
      stype: 'inline-text',
      text: 'Hello World',
      parentId: 'para-1'
    };
    dataStore.setNode(textNode);
    console.log('1. Initial node:', dataStore.getNode('text-1'));

    const mark = { stype: 'bold', range: [0, 5] as [number, number] };
    const contentRange = {
      startNodeId: 'text-1',
      startOffset: 0,
      endNodeId: 'text-1',
      endOffset: 5
    };

    console.log('2. Before applyMark:', dataStore.getNode('text-1'));
    
    // Test range iterator directly
    const rangeIterator = dataStore.createRangeIterator(
      contentRange.startNodeId,
      contentRange.endNodeId,
      { includeStart: true, includeEnd: true }
    );
    console.log('3. Range iterator nodes:', Array.from(rangeIterator));

    const appliedMark = dataStore.range.applyMark(contentRange, mark);
    console.log('4. After applyMark:', dataStore.getNode('text-1'));
    console.log('5. Applied mark:', appliedMark);

    const updatedNode = dataStore.getNode('text-1');
    expect(updatedNode?.marks).toBeDefined();
  });

  it('should debug updateNode directly', () => {
    const textNode: INode = {
      sid: 'text-1',
      stype: 'inline-text',
      text: 'Hello World',
      parentId: 'para-1'
    };
    dataStore.setNode(textNode);
    console.log('1. Initial node:', dataStore.getNode('text-1'));

    const result = dataStore.updateNode('text-1', { 
      marks: [{ stype: 'bold', range: [0, 5] }] 
    });
    console.log('2. Update result:', result);
    console.log('3. Updated node:', dataStore.getNode('text-1'));

    const updatedNode = dataStore.getNode('text-1');
    expect(updatedNode?.marks).toEqual([{ stype: 'bold', range: [0, 5] }]);
  });
});
