import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('Schema-agnostic text nodes (text presence only)', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    // Custom schema: text 노드 타입 이름은 임의이지만 .text 필드만 있으면 텍스트로 취급
    schema = new Schema('custom', {
      topNode: 'doc',
      nodes: {
        doc: { name: 'doc', group: 'document', content: 'block+' },
        p: { name: 'p', group: 'block', content: 'inline*' },
        tnode: { name: 'tnode', group: 'inline' } // 텍스트 타입명은 tnode
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);

    const doc = { sid: 'd', type: 'doc', content: ['p1'], attributes: {} } as any;
    const p1 = { sid: 'p1', type: 'p', content: ['a','b'], parentId: 'd', attributes: {} } as any;
    const a = { sid: 'a', type: 'tnode', text: 'Hello', parentId: 'p1', attributes: {} } as any;
    const b = { sid: 'b', type: 'tnode', text: ' World', parentId: 'p1', attributes: {} } as any;
    dataStore.setNode(doc, false);
    dataStore.setNode(p1, false);
    dataStore.setNode(a, false);
    dataStore.setNode(b, false);
  });

  it('treats nodes with .text as text regardless of type name', () => {
    dataStore.begin();
    dataStore.replaceText({ stype: 'range' as const, startNodeId: 'a', startOffset: 0, endNodeId: 'a', endOffset: 5 }, 'Hi');
    const ops = dataStore.end();
    // replaceText가 최소한 update 흐름을 탈 수 있도록 보장(구현에 따라 수집 방식이 다를 수 있어도 성공적으로 종료되어야 함)
    expect(Array.isArray(ops)).toBe(true);
    dataStore.commit();
    const p1 = dataStore.getNode('p1')!;
    const text = p1.content!.map(id => dataStore.getNode(id as string)!.text || '').join('');
    expect(text).toContain('Hi');
  });
});


