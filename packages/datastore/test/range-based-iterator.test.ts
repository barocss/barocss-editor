import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('Range-Based Iterator', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'document': {
          name: 'document',
          content: 'block+'
        },
        'heading': {
          name: 'heading',
          content: 'inline*',
          group: 'block',
          attrs: {
            level: { type: 'number', default: 1 }
          }
        },
        'paragraph': {
          name: 'paragraph',
          content: 'inline*',
          group: 'block'
        },
        'list': {
          name: 'list',
          content: 'listItem+',
          group: 'block',
          attrs: {
            type: { type: 'string', default: 'bullet' }
          }
        },
        'listItem': {
          name: 'listItem',
          content: 'block+',
          group: 'block'
        },
        'inline-text': {
          name: 'inline-text',
          content: 'text',
          group: 'inline'
        }
      },
      marks: {
        'bold': {
          name: 'bold',
          group: 'text-style'
        },
        'italic': {
          name: 'italic',
          group: 'text-style'
        },
        'code': {
          name: 'code',
          group: 'text-style'
        },
        'link': {
          name: 'link',
          group: 'link',
          attrs: {
            href: { type: 'string', default: '' }
          }
        }
      }
    });

    dataStore = new DataStore(undefined, schema);
  });

  describe('Basic range traversal', () => {
    beforeEach(() => {
      // Create simple document structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: '제목 1' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '첫 번째 문단' }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 2 },
            content: [
              { stype: 'inline-text', text: '제목 2' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '두 번째 문단' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '세 번째 문단' }
            ]
          }
        ]
      });
    });

    it('특정 범위 내에서만 순회', () => {
      const allNodes = dataStore.getAllNodes();
      const heading1 = allNodes.find(n => n.stype === 'heading' && n.attributes?.level === 1);
      const heading2 = allNodes.find(n => n.stype === 'heading' && n.attributes?.level === 2);

      expect(heading1).toBeTruthy();
      expect(heading2).toBeTruthy();

      const rangeIterator = dataStore.createRangeIterator(
        heading1!.sid!,
        heading2!.sid!
      );

      const rangeNodes: string[] = [];
      for (const nodeId of rangeIterator) {
        rangeNodes.push(nodeId);
      }

      console.log('=== 범위 내 노드들 ===');
      rangeNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.stype}) - ${node?.text || ''}`);
      });

      // Range should include heading1, paragraph1, heading2
      expect(rangeNodes.length).toBeGreaterThan(2);
      expect(rangeNodes).toContain(heading1!.sid);
      expect(rangeNodes).toContain(heading2!.sid);
    });

    it('범위 경계 포함/제외 옵션', () => {
      const allNodes = dataStore.getAllNodes();
      const heading1 = allNodes.find(n => n.stype === 'heading' && n.attributes?.level === 1);
      const heading2 = allNodes.find(n => n.stype === 'heading' && n.attributes?.level === 2);

      // Exclude start node
      const excludeStartIterator = dataStore.createRangeIterator(
        heading1!.sid!,
        heading2!.sid!,
        { includeStart: false }
      );

      const excludeStartNodes: string[] = [];
      for (const nodeId of excludeStartIterator) {
        excludeStartNodes.push(nodeId);
      }

      expect(excludeStartNodes).not.toContain(heading1!.sid);
      expect(excludeStartNodes).toContain(heading2!.sid);

      // Exclude end node
      const excludeEndIterator = dataStore.createRangeIterator(
        heading1!.sid!,
        heading2!.sid!,
        { includeEnd: false }
      );

      const excludeEndNodes: string[] = [];
      for (const nodeId of excludeEndIterator) {
        excludeEndNodes.push(nodeId);
      }

      expect(excludeEndNodes).toContain(heading1!.sid);
      expect(excludeEndNodes).not.toContain(heading2!.sid);
    });

    it('범위 내 노드 개수 확인', () => {
      const allNodes = dataStore.getAllNodes();
      const heading1 = allNodes.find(n => n.stype === 'heading' && n.attributes?.level === 1);
      const heading2 = allNodes.find(n => n.stype === 'heading' && n.attributes?.level === 2);

      const count = dataStore.getRangeNodeCount(heading1!.sid!, heading2!.sid!);
      expect(count).toBeGreaterThan(0);

      console.log(`범위 내 노드 개수: ${count}`);
    });

    it('범위 정보 확인', () => {
      const allNodes = dataStore.getAllNodes();
      const heading1 = allNodes.find(n => n.stype === 'heading' && n.attributes?.level === 1);
      const heading2 = allNodes.find(n => n.stype === 'heading' && n.attributes?.level === 2);

      const rangeIterator = dataStore.createRangeIterator(
        heading1!.sid!,
        heading2!.sid!,
        { includeStart: false, includeEnd: true }
      );

      const rangeInfo = rangeIterator.getRangeInfo();
      expect(rangeInfo).toBeTruthy();
      expect(rangeInfo!.start).toBe(heading1!.sid);
      expect(rangeInfo!.end).toBe(heading2!.sid);
      expect(rangeInfo!.includeStart).toBe(false);
      expect(rangeInfo!.includeEnd).toBe(true);
    });
  });

  describe('Using with filtering', () => {
    beforeEach(() => {
      // Create complex document structure
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: '메인 제목' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '첫 번째 문단' }
            ]
          },
          {
            stype: 'list',
            content: [
              {
                stype: 'listItem',
                content: [
                  {
                    stype: 'paragraph',
                    content: [
                      { stype: 'inline-text', text: '리스트 항목 1' }
                    ]
                  }
                ]
              },
              {
                stype: 'listItem',
                content: [
                  {
                    stype: 'paragraph',
                    content: [
                      { stype: 'inline-text', text: '리스트 항목 2' }
                    ]
                  }
                ]
              }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '마지막 문단' }
            ]
          }
        ]
      });
    });

    it('범위 내에서 특정 타입만 필터링', () => {
      const allNodes = dataStore.getAllNodes();
      const mainHeading = allNodes.find(n => n.stype === 'heading' && n.attributes?.level === 1);
      const lastParagraph = allNodes.find(n => n.stype === 'paragraph');

      const rangeIterator = dataStore.createRangeIterator(
        mainHeading!.sid!,
        lastParagraph!.sid!,
        {
          filter: { stype: 'inline-text' }
        }
      );

      const textNodes: string[] = [];
      for (const nodeId of rangeIterator) {
        textNodes.push(nodeId);
      }

      console.log('=== 범위 내 텍스트 노드들 ===');
      textNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} - "${node?.text}"`);
      });

      // All nodes should be inline-text type
      textNodes.forEach(nodeId => {
        const node = dataStore.getNode(nodeId);
        expect(node?.stype).toBe('inline-text');
      });

      expect(textNodes.length).toBeGreaterThan(0);
    });

    it('범위 내에서 사용자 정의 필터 적용', () => {
      const allNodes = dataStore.getAllNodes();
      const mainHeading = allNodes.find(n => n.stype === 'heading' && n.attributes?.level === 1);
      const lastParagraph = allNodes.find(n => n.stype === 'paragraph');

      const rangeIterator = dataStore.createRangeIterator(
        mainHeading!.sid!,
        lastParagraph!.sid!,
        {
          customFilter: (nodeId, node) => {
            return node.stype === 'paragraph' || node.stype === 'listItem';
          }
        }
      );

      const filteredNodes: string[] = [];
      for (const nodeId of rangeIterator) {
        filteredNodes.push(nodeId);
      }

      console.log('=== 범위 내 필터링된 노드들 ===');
      filteredNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.type})`);
      });

      // All nodes should be paragraph or listItem type
      filteredNodes.forEach(nodeId => {
        const node = dataStore.getNode(nodeId);
        expect(['paragraph', 'listItem']).toContain(node?.stype);
      });
    });
  });

  describe('역순 범위 순회', () => {
    beforeEach(() => {
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: '제목 1' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '문단 1' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '문단 2' }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 2 },
            content: [
              { stype: 'inline-text', text: '제목 2' }
            ]
          }
        ]
      });
    });

    it('역순으로 범위 순회', () => {
      const allNodes = dataStore.getAllNodes();
      const heading1 = allNodes.find(n => n.stype === 'heading' && n.attributes?.level === 1);
      const heading2 = allNodes.find(n => n.stype === 'heading' && n.attributes?.level === 2);

      const rangeIterator = dataStore.createRangeIterator(
        heading1!.sid!,
        heading2!.sid!,
        { reverse: true }
      );

      const reverseNodes: string[] = [];
      for (const nodeId of rangeIterator) {
        reverseNodes.push(nodeId);
      }

      console.log('=== 역순 범위 순회 ===');
      reverseNodes.forEach((id, index) => {
        const node = dataStore.getNode(id);
        console.log(`${index + 1}. ${id} (${node?.stype}) - ${node?.text || ''}`);
      });

      expect(reverseNodes.length).toBeGreaterThan(0);
      // Reverse order, so last node should appear first
      expect(reverseNodes[0]).toBe(heading2!.sid);
    });
  });

  describe('Error handling', () => {
    it('set range with non-existent nodes', () => {
      expect(() => {
        dataStore.createRangeIterator('nonexistent-1', 'nonexistent-2');
      }).not.toThrow();

      // Iterator is created but should return empty results when traversed
      const iterator = dataStore.createRangeIterator('nonexistent-1', 'nonexistent-2');
      const nodes: string[] = [];
      for (const nodeId of iterator) {
        nodes.push(nodeId);
      }

      expect(nodes.length).toBe(0);
    });

    it('잘못된 범위 (시작 > 끝)', () => {
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '문단 1' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '문단 2' }
            ]
          }
        ]
      });

      const allNodes = dataStore.getAllNodes();
      const paragraph1 = allNodes.find(n => n.text === '문단 1');
      const paragraph2 = allNodes.find(n => n.text === '문단 2');

      // Invalid range (paragraph2 -> paragraph1)
      const iterator = dataStore.createRangeIterator(
        paragraph2!.sid!,
        paragraph1!.sid!
      );

      const nodes: string[] = [];
      for (const nodeId of iterator) {
        nodes.push(nodeId);
      }

      // Invalid range should return empty result (or at least minimal result)
      expect(nodes.length).toBeLessThanOrEqual(2);
    });
  });

  describe('extractText/iterator 일관성 (동일 부모 fast-path 포함)', () => {
    it('동일 부모 content 상에서 start→end 구간 텍스트 추출', () => {
      // Document: two text nodes a, b under paragraph(parent)
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'hello ' },
              { stype: 'inline-text', text: 'world' }
            ]
          }
        ]
      });

      const all = dataStore.getAllNodes();
      const para = all.find(n => n.stype === 'paragraph');
      const a = dataStore.getNode(para!.content![0]);
      const b = dataStore.getNode(para!.content![1]);

      // 1) Verify extractText fast-path
      const rng = { stype: 'range' as const, startNodeId: a!.sid!, startOffset: 0, endNodeId: b!.sid!, endOffset: (b!.text as string).length };
      const extracted = dataStore.range.extractText(rng);
      expect(extracted).toBe('hello world');

      // 2) Basic verification that iterator traverses all same-parent sections
      const it = dataStore.createRangeIterator(a!.sid!, b!.sid!, { includeStart: true, includeEnd: true });
      const ids: string[] = [];
      for (const id of it) ids.push(id);
      expect(ids).toContain(a!.sid);
      expect(ids).toContain(b!.sid);
    });

    it('경계 오프셋 적용: 시작/끝 노드 부분만 포함', () => {
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: 'abcdef' },
              { stype: 'inline-text', text: 'XYZ' }
            ]
          }
        ]
      });
      const all = dataStore.getAllNodes();
      const para = all.find(n => n.stype === 'paragraph');
      const a = dataStore.getNode(para!.content![0]); // 'abcdef'
      const b = dataStore.getNode(para!.content![1]); // 'XYZ'
      const rng = { stype: 'range' as const, startNodeId: a!.sid!, startOffset: 2, endNodeId: b!.sid!, endOffset: 2 };
      const extracted = dataStore.range.extractText(rng);
      // expect: 'cdef' + 'XY'
      expect(extracted).toBe('cdefXY');
    });
  });
});
