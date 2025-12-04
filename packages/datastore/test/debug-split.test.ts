import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { createSchema } from '@barocss/schema';
import type { INode } from '../src/types';

describe('Debug Split Operations', () => {
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

  it('should debug splitBlockNode step by step', () => {
    const docNode: INode = { sid: 'doc-1', type: 'document', content: ['para-1'] };
    const paraNode: INode = { 
      sid: 'para-1', 
      stype: 'paragraph', 
      content: ['text-1', 'text-2', 'text-3'],
      parentId: 'doc-1'
    };
    const text1: INode = { sid: 'text-1', type: 'inline-text', text: 'First', parentId: 'para-1' };
    const text2: INode = { sid: 'text-2', type: 'inline-text', text: 'Second', parentId: 'para-1' };
    const text3: INode = { sid: 'text-3', type: 'inline-text', text: 'Third', parentId: 'para-1' };
    
    dataStore.setNode(docNode);
    dataStore.setNode(paraNode);
    dataStore.setNode(text1);
    dataStore.setNode(text2);
    dataStore.setNode(text3);

    console.log('1. Before split:');
    console.log('   para-1 content:', dataStore.getNode('para-1')?.content);

    const newParaId = dataStore.splitMerge.splitBlockNode('para-1', 1);
    console.log('2. New para ID:', newParaId);

    const originalPara = dataStore.getNode('para-1');
    const newPara = dataStore.getNode(newParaId);
    
    console.log('3. After split:');
    console.log('   para-1 content:', originalPara?.content);
    console.log('   new para content:', newPara?.content);
    console.log('   text-2 parentId:', dataStore.getNode('text-2')?.parentId);
    console.log('   text-3 parentId:', dataStore.getNode('text-3')?.parentId);

    expect(newParaId).toBeDefined();
    expect(newParaId).not.toBe('para-1');
  });
});
