import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { createSchema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('Debug Commit Operations', () => {
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

  it('should debug commit process step by step', () => {
    const textNode: INode = {
      sid: 'text-1',
      stype: 'inline-text',
      text: 'Hello World',
      parentId: 'para-1'
    };
    dataStore.setNode(textNode);
    console.log('1. Initial node:', dataStore.getNode('text-1'));

    dataStore.begin();
    console.log('2. After begin - overlay active:', dataStore._overlay?.isActive());

    const mark = { stype: 'bold', range: [0, 5] as [number, number] };
    const result = dataStore.updateNode('text-1', { marks: [mark] });
    console.log('3. Update result:', result);
    console.log('4. Node after update:', dataStore.getNode('text-1'));

    dataStore.end();
    console.log('5. After end - overlay active:', dataStore._overlay?.isActive());
    console.log('6. Node after end:', dataStore.getNode('text-1'));

    dataStore.commit();
    console.log('7. After commit - overlay active:', dataStore._overlay?.isActive());
    console.log('8. Final node:', dataStore.getNode('text-1'));

    const finalNode = dataStore.getNode('text-1');
    expect(finalNode?.marks).toEqual([mark]);
  });
});
