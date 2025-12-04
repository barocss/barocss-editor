import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('Operation collection', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'document': { name: 'document', content: 'block+' },
        'paragraph': { name: 'paragraph', content: 'inline*', group: 'block' },
        'inline-text': { name: 'inline-text', group: 'inline' }
      }
    });
    dataStore = new DataStore(undefined, schema);
  });

  it('collects create/update/delete/move operations between begin/end', () => {
    // 초기 문서 구성
    const doc = dataStore.createNodeWithChildren({
      stype: 'document',
      content: [
        { stype: 'paragraph', content: [ { stype: 'inline-text', text: 'Hello' } ] }
      ]
    });

    const paragraphId = (doc.content as string[])[0];
    const textId = (dataStore.getNode(paragraphId)!.content as string[])[0];

    dataStore.begin();

    // update
    dataStore.updateNode(textId, { text: 'Hello World' }, false);
    // create child (emit create)
    const newTextId = dataStore.addChild(paragraphId, { stype: 'inline-text', text: '!' });
    // move child: 다른 부모로 이동시켜 확실히 move emit
    const newParagraphId = dataStore.addChild(doc.sid!, { stype: 'paragraph', content: [] });
    dataStore.moveNode(newTextId, newParagraphId);
    // delete child: 부모에서 제거 후 실제 노드 삭제까지
    dataStore.removeChild(paragraphId, newTextId);
    dataStore.deleteNode(newTextId);

    // batch move: 여러 자식 이동도 move로 수집되는지 확인
    const textNodeIds = (dataStore.getNode(paragraphId)!.content as string[]);
    const anotherParagraphId = dataStore.addChild(doc.sid!, { stype: 'paragraph', content: [] });
    dataStore.moveChildren(paragraphId, anotherParagraphId, textNodeIds.slice());

    // reorderChildren: 동일 부모 내 순서 변경도 move 시퀀스로 수집
    const anotherParagraph = dataStore.getNode(anotherParagraphId);
    if (anotherParagraph && Array.isArray(anotherParagraph.content)) {
      const reordered = (anotherParagraph.content as string[]).slice().reverse();
      dataStore.reorderChildren(anotherParagraphId, reordered);
    }

    const ops = dataStore.end();

    // 최소 4개의 원자 연산이 수집되어야 함 (update/create/move/delete)
    expect(ops.length).toBeGreaterThanOrEqual(6);
    const types = ops.map(o => o.type);
    expect(types).toContain('update');
    expect(types).toContain('create');
    expect(types).toContain('move');
    expect(types).toContain('delete');

    // 각 operation이 대상 nodeId를 포함
    expect(ops.every(o => typeof o.nodeId === 'string')).toBe(true);
  });

  it('collects create + parent update (no move) for copyNode with newParent', () => {
    const doc = dataStore.createNodeWithChildren({
      stype: 'document',
      content: [
        { stype: 'paragraph', content: [ { stype: 'inline-text', text: 'A' } ] },
        { stype: 'paragraph', content: [] }
      ]
    });
    const [p1, p2] = (doc.content as string[]);

    dataStore.begin();
    dataStore.copyNode(p1, p2); // copy paragraph under p2
    const ops = dataStore.end();

    const types = ops.map(o => o.type);
    expect(types).toContain('create');
    // parent update might be represented as update on the copied node's parent
    expect(types).toContain('update');
    expect(types).not.toContain('move');
  });

  it('cloneNodeWithChildren emits creates for each node and parent updates, no move', () => {
    const doc = dataStore.createNodeWithChildren({
      stype: 'document',
      content: [
        { stype: 'paragraph', content: [ { stype: 'inline-text', text: 'A' }, { stype: 'inline-text', text: 'B' } ] },
        { stype: 'paragraph', content: [] }
      ]
    });
    const [p1, p2] = (doc.content as string[]);

    dataStore.begin();
    dataStore.cloneNodeWithChildren(p1, p2);
    const ops = dataStore.end();

    const types = ops.map(o => o.type);
    // paragraph + its children creates (>=2; 환경에 따라 자식 수가 달라질 수 있음)
    const createCount = types.filter(t => t === 'create').length;
    expect(createCount).toBeGreaterThanOrEqual(2);
    // Spec: parent content update should be emitted as update op
    expect(types).toContain('update');
    expect(types).not.toContain('move');
  });
});


