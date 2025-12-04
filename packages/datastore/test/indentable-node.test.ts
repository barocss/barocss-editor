import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('Indentable Node - schema 기반 indent 메타 활용', () => {
  describe('기본 스키마에서 isIndentableNode 동작', () => {
    let schema: Schema;
    let dataStore: DataStore;

    beforeEach(() => {
      schema = new Schema('indentable-schema', {
        nodes: {
          document: {
            name: 'document',
            content: 'block+',
            group: 'document'
          },
          paragraph: {
            name: 'paragraph',
            content: 'inline*',
            group: 'block',
            indentable: true
          },
          heading: {
            name: 'heading',
            content: 'inline*',
            group: 'block'
          },
          'inline-text': {
            name: 'inline-text',
            group: 'inline'
          }
        },
        marks: {}
      });

      dataStore = new DataStore(undefined, schema);

      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Paragraph' }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: 'Heading' }
            ]
          }
        ]
      });
    });

    it('indentable: true 인 block 노드는 isIndentableNode 가 true 를 반환해야 한다', () => {
      const paragraphs = dataStore.findNodesByType('paragraph');
      expect(paragraphs.length).toBeGreaterThan(0);

      paragraphs.forEach(paragraph => {
        expect(dataStore.isIndentableNode(paragraph.sid!)).toBe(true);
      });
    });

    it('indentable 이 없는 block 노드는 isIndentableNode 가 false 를 반환해야 한다', () => {
      const headings = dataStore.findNodesByType('heading');
      expect(headings.length).toBeGreaterThan(0);

      headings.forEach(heading => {
        expect(dataStore.isIndentableNode(heading.sid!)).toBe(false);
      });
    });

    it('inline 노드는 isIndentableNode 가 false 를 반환해야 한다', () => {
      const textNodes = dataStore.findNodesByType('inline-text');
      expect(textNodes.length).toBeGreaterThan(0);

      textNodes.forEach(textNode => {
        expect(dataStore.isIndentableNode(textNode.sid!)).toBe(false);
      });
    });

    it('존재하지 않는 노드는 isIndentableNode 가 false 를 반환해야 한다', () => {
      expect(dataStore.isIndentableNode('non-existent-node')).toBe(false);
    });
  });

  describe('getIndentMetadata - indent 메타데이터 조회', () => {
    let schema: Schema;
    let dataStore: DataStore;

    beforeEach(() => {
      schema = new Schema('indent-metadata-schema', {
        nodes: {
          document: {
            name: 'document',
            content: 'block+',
            group: 'document'
          },
          listItem: {
            name: 'listItem',
            group: 'block',
            content: 'inline*',
            indentable: true,
            indentGroup: 'listItem',
            indentParentTypes: ['listItem', 'bulletList'],
            maxIndentLevel: 5
          },
          bulletList: {
            name: 'bulletList',
            group: 'block',
            content: 'block+'
          },
          paragraph: {
            name: 'paragraph',
            group: 'block',
            content: 'inline*'
          },
          'inline-text': {
            name: 'inline-text',
            group: 'inline'
          }
        },
        marks: {}
      });

      dataStore = new DataStore(undefined, schema);

      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'bulletList',
            content: [
              {
                stype: 'listItem',
                content: [
                  { stype: 'inline-text', text: 'Item 1' }
                ]
              }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'Paragraph' }
            ]
          }
        ]
      });
    });

    it('indentable 노드에 대해 indent 메타데이터를 반환해야 한다', () => {
      const listItems = dataStore.findNodesByType('listItem');
      expect(listItems.length).toBeGreaterThan(0);

      const meta = dataStore.getIndentMetadata(listItems[0].sid!);
      expect(meta).not.toBeNull();
      expect(meta!.indentable).toBe(true);
      expect(meta!.indentGroup).toBe('listItem');
      expect(meta!.indentParentTypes).toEqual(['listItem', 'bulletList']);
      expect(meta!.maxIndentLevel).toBe(5);
    });

    it('indentable 이 아닌 노드에 대해서도 기본 메타데이터를 반환하지만 indentable 은 false 여야 한다', () => {
      const paragraphs = dataStore.findNodesByType('paragraph');
      expect(paragraphs.length).toBeGreaterThan(0);

      const meta = dataStore.getIndentMetadata(paragraphs[0].sid!);
      expect(meta).not.toBeNull();
      expect(meta!.indentable).toBe(false);
      expect(meta!.indentGroup).toBeUndefined();
      expect(meta!.indentParentTypes).toBeUndefined();
      expect(meta!.maxIndentLevel).toBeUndefined();
    });

    it('존재하지 않는 노드에 대해서는 null 을 반환해야 한다', () => {
      const meta = dataStore.getIndentMetadata('non-existent-node');
      expect(meta).toBeNull();
    });
  });

  describe('indentNode / outdentNode - 구조 들여쓰기/내어쓰기', () => {
    let schema: Schema;
    let dataStore: DataStore;

    beforeEach(() => {
      schema = new Schema('indent-ops-schema', {
        nodes: {
          document: {
            name: 'document',
            content: 'block+',
            group: 'document'
          },
          paragraph: {
            name: 'paragraph',
            group: 'block',
            content: 'inline*',
            indentable: true,
            indentParentTypes: ['paragraph']
          },
          'inline-text': {
            name: 'inline-text',
            group: 'inline'
          }
        },
        marks: {}
      });

      dataStore = new DataStore(undefined, schema);
    });

    it('indentNode: 이전 형제가 있을 때 해당 형제의 자식으로 이동해야 한다', () => {
      const doc = dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [{ stype: 'inline-text', text: 'P1' }]
          },
          {
            stype: 'paragraph',
            content: [{ stype: 'inline-text', text: 'P2' }]
          }
        ]
      });

      const rootId = doc.sid!;
      const root = dataStore.getNode(rootId)!;
      const [p1Id, p2Id] = root.content as string[];
      const p1 = dataStore.getNode(p1Id)!;
      const [p1ChildId] = p1.content as string[];

      const result = dataStore.indentNode(p2Id);
      expect(result).toBe(true);

      const updatedRoot = dataStore.getNode(rootId)!;
      const updatedP1 = dataStore.getNode(p1Id)!;
      const updatedP2 = dataStore.getNode(p2Id)!;

      // 루트의 자식은 p1 하나만 남고, p2 는 p1 의 자식 리스트의 마지막에 추가된다.
      expect(updatedRoot.content).toEqual([p1Id]);
      expect(updatedP1.content).toEqual([p1ChildId, p2Id]);
      expect(updatedP2.parentId).toBe(p1Id);
    });

    it('indentNode: 이전 형제가 없으면 아무 것도 하지 않는다', () => {
      const doc = dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [{ stype: 'inline-text', text: 'P1' }]
          }
        ]
      });

      const rootId = doc.sid!;
      const root = dataStore.getNode(rootId)!;
      const [p1Id] = root.content as string[];

      const result = dataStore.indentNode(p1Id);
      expect(result).toBe(false);

      const updatedRoot = dataStore.getNode(rootId)!;
      expect(updatedRoot.content).toEqual([p1Id]);
    });

    it('outdentNode: 부모의 형제 수준으로 한 단계 outdent 해야 한다', () => {
      const doc = dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'P1' },
              {
                stype: 'paragraph',
                content: [{ stype: 'inline-text', text: 'Child' }]
              }
            ]
          }
        ]
      });

      const rootId = doc.sid!;
      const root = dataStore.getNode(rootId)!;
      const [p1Id] = root.content as string[];
      const p1 = dataStore.getNode(p1Id)!;
      const childId = (p1.content as string[])[1];

      const result = dataStore.outdentNode(childId);
      expect(result).toBe(true);

      const updatedRoot = dataStore.getNode(rootId)!;
      const updatedP1 = dataStore.getNode(p1Id)!;
      const updatedChild = dataStore.getNode(childId)!;

      // 루트: [p1, child] 순서
      expect(updatedRoot.content).toEqual([p1Id, childId]);
      // p1 의 content 에서 child 가 제거됨
      expect(updatedP1.content).toEqual([expect.any(String)]);
      // child 의 parentId 는 document 가 됨
      expect(updatedChild.parentId).toBe(rootId);
    });

    it('outdentNode: 최상위 수준에서는 아무 것도 하지 않는다', () => {
      const doc = dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [{ stype: 'inline-text', text: 'P1' }]
          }
        ]
      });

      const rootId = doc.sid!;
      const root = dataStore.getNode(rootId)!;
      const [p1Id] = root.content as string[];

      const result = dataStore.outdentNode(p1Id);
      expect(result).toBe(false);

      const updatedRoot = dataStore.getNode(rootId)!;
      expect(updatedRoot.content).toEqual([p1Id]);
    });
  });
});


