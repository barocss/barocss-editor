import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';
import { DocumentVisitor } from '../src/operations/utility-operations';

describe('Visitor Pattern', () => {
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
            level: { stype: 'number', default: 1 }
          }
        },
        'paragraph': {
          name: 'paragraph',
          content: 'inline*',
          group: 'block'
        },
        'inline-text': {
          name: 'inline-text',
          group: 'inline'
        }
      },
      marks: {
        'bold': {
          name: 'bold',
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

  describe('기본 Visitor 패턴', () => {
    beforeEach(() => {
      // 간단한 문서 구조 생성
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
          }
        ]
      });
    });

    it('기본 Visitor로 문서 순회', () => {
      const visitedNodes: string[] = [];
      const enteredNodes: string[] = [];
      const exitedNodes: string[] = [];

      const visitor: DocumentVisitor = {
        enter(nodeId, node) {
          enteredNodes.push(nodeId);
        },
        visit(nodeId, node) {
          visitedNodes.push(nodeId);
        },
        exit(nodeId, node) {
          exitedNodes.push(nodeId);
        }
      };

      const result = dataStore.traverse(visitor);

      console.log('=== Visitor 순회 결과 ===');
      console.log('방문한 노드:', visitedNodes);
      console.log('진입한 노드:', enteredNodes);
      console.log('종료한 노드:', exitedNodes);
      console.log('결과:', result);

      expect(result.visitedCount).toBeGreaterThan(0);
      expect(visitedNodes.length).toBe(result.visitedCount);
      expect(enteredNodes.length).toBe(visitedNodes.length);
      expect(exitedNodes.length).toBe(visitedNodes.length);
    });

    it('텍스트 추출 Visitor', () => {
      class TextExtractor implements DocumentVisitor {
        private texts: string[] = [];

        visit(nodeId: string, node: any) {
          if (node.stype === 'inline-text' && node.text) {
            this.texts.push(node.text);
          }
        }

        getTexts(): string[] {
          return this.texts;
        }
      }

      const textExtractor = new TextExtractor();
      const result = dataStore.traverse(textExtractor);

      const extractedTexts = textExtractor.getTexts();
      console.log('=== 텍스트 추출 결과 ===');
      console.log('추출된 텍스트:', extractedTexts);

      expect(extractedTexts).toContain('제목 1');
      expect(extractedTexts).toContain('첫 번째 문단');
      expect(extractedTexts).toContain('제목 2');
      expect(extractedTexts).toContain('두 번째 문단');
      expect(result.visitedCount).toBeGreaterThan(0);
    });

    it('노드 타입별 카운터 Visitor', () => {
      class NodeTypeCounter implements DocumentVisitor {
        private counts: Record<string, number> = {};

        visit(nodeId: string, node: any) {
          this.counts[node.stype] = (this.counts[node.stype] || 0) + 1;
        }

        getCounts(): Record<string, number> {
          return this.counts;
        }
      }

      const counter = new NodeTypeCounter();
      const result = dataStore.traverse(counter);

      const counts = counter.getCounts();
      console.log('=== 노드 타입별 카운트 ===');
      console.log('카운트:', counts);

      expect(counts['document']).toBe(1);
      expect(counts['heading']).toBe(2);
      expect(counts['paragraph']).toBe(2);
      expect(counts['inline-text']).toBe(4);
      expect(result.visitedCount).toBe(9); // 총 노드 수
    });

    it('조건부 하위 트리 스킵 Visitor', () => {
      const visitedNodes: string[] = [];
      const skippedNodes: string[] = [];

      const visitor: DocumentVisitor = {
        visit(nodeId, node) {
          visitedNodes.push(nodeId);
        },
        shouldVisitChildren(nodeId, node) {
          // heading 노드의 하위는 스킵
          if (node.stype === 'heading') {
            skippedNodes.push(nodeId);
            return false;
          }
          return true;
        }
      };

      const result = dataStore.traverse(visitor);

      console.log('=== 조건부 스킵 결과 ===');
      console.log('방문한 노드:', visitedNodes);
      console.log('스킵한 노드:', skippedNodes);
      console.log('결과:', result);

      expect(result.skippedCount).toBeGreaterThan(0);
      expect(skippedNodes.length).toBe(2); // heading 노드 2개
    });

    it('visit에서 false 반환하여 하위 노드 스킵', () => {
      const visitedNodes: string[] = [];

      const visitor: DocumentVisitor = {
        visit(nodeId, node) {
          visitedNodes.push(nodeId);
          // heading 노드에서 false 반환하여 하위 노드 스킵
          if (node.stype === 'heading') {
            return false;
          }
        }
      };

      const result = dataStore.traverse(visitor);

      console.log('=== visit false 반환 결과 ===');
      console.log('방문한 노드:', visitedNodes);
      console.log('결과:', result);

      expect(result.skippedCount).toBeGreaterThan(0);
      // heading 노드의 하위 inline-text는 방문되지 않아야 함
      const headingNodes = visitedNodes.filter(id => {
        const node = dataStore.getNode(id);
        return node?.stype === 'heading';
      });
      expect(headingNodes.length).toBe(2);
    });
  });

  describe('필터링과 함께 사용', () => {
    beforeEach(() => {
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
              { stype: 'inline-text', text: '일반 텍스트' },
              { stype: 'inline-text', text: '굵은 텍스트', marks: [{ stype: 'bold' }] }
            ]
          }
        ]
      });
    });

    it('특정 타입만 필터링하여 Visitor 실행', () => {
      class TextOnlyVisitor implements DocumentVisitor {
        private texts: string[] = [];

        visit(nodeId: string, node: any) {
          if (node.stype === 'inline-text' && node.text) {
            this.texts.push(node.text);
          }
        }

        getTexts(): string[] {
          return this.texts;
        }
      }

      const visitor = new TextOnlyVisitor();
      const result = dataStore.traverse(visitor, {
        filter: { stype: 'inline-text' }
      });

      const texts = visitor.getTexts();
      console.log('=== 필터링된 텍스트 추출 ===');
      console.log('추출된 텍스트:', texts);
      console.log('결과:', result);

      expect(texts).toContain('메인 제목');
      expect(texts).toContain('일반 텍스트');
      expect(texts).toContain('굵은 텍스트');
      expect(result.visitedCount).toBe(3); // inline-text 노드만
    });

    it('범위 기반 Visitor 실행', () => {
      const allNodes = dataStore.getAllNodes();
      const heading = allNodes.find(n => n.stype === 'heading');
      const paragraph = allNodes.find(n => n.stype === 'paragraph');

      const visitedNodes: string[] = [];

      const visitor: DocumentVisitor = {
        visit(nodeId, node) {
          visitedNodes.push(nodeId);
        }
      };

      const result = dataStore.traverse(visitor, {
        range: {
          startNodeId: heading!.sid!,
          endNodeId: paragraph!.sid!
        }
      });

      console.log('=== 범위 기반 Visitor ===');
      console.log('방문한 노드:', visitedNodes);
      console.log('결과:', result);

      expect(result.visitedCount).toBeGreaterThan(0);
      expect(result.visitedCount).toBeLessThan(5); // 전체 노드보다 적어야 함
    });
  });

  describe('여러 Visitor 순차 실행', () => {
    beforeEach(() => {
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: '제목' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '내용' }
            ]
          }
        ]
      });
    });

    it('여러 Visitor를 순차적으로 실행', () => {
      class TextExtractor implements DocumentVisitor {
        private texts: string[] = [];

        visit(nodeId: string, node: any) {
          if (node.stype === 'inline-text' && node.text) {
            this.texts.push(node.text);
          }
        }

        getTexts(): string[] {
          return this.texts;
        }
      }

      class NodeCounter implements DocumentVisitor {
        private count = 0;

        visit(nodeId: string, node: any) {
          this.count++;
        }

        getCount(): number {
          return this.count;
        }
      }

      const textExtractor = new TextExtractor();
      const nodeCounter = new NodeCounter();

      const results = dataStore.traverse(textExtractor, nodeCounter);

      console.log('=== 여러 Visitor 실행 결과 ===');
      console.log('텍스트 추출 결과:', textExtractor.getTexts());
      console.log('노드 카운트:', nodeCounter.getCount());
      console.log('실행 결과:', results);

      expect(results.length).toBe(2);
      expect(textExtractor.getTexts()).toContain('제목');
      expect(textExtractor.getTexts()).toContain('내용');
      expect(nodeCounter.getCount()).toBeGreaterThan(0);
    });
  });
});
