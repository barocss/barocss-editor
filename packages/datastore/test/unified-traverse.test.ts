import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';
import { DocumentVisitor } from '../src/operations/utility-operations';

describe('Unified Traverse API', () => {
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

  describe('단일 Visitor', () => {
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

    it('단일 visitor로 순회', () => {
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

      console.log('=== 단일 Visitor 결과 ===');
      console.log('추출된 텍스트:', textExtractor.getTexts());
      console.log('순회 결과:', result);

      expect(textExtractor.getTexts()).toContain('제목');
      expect(textExtractor.getTexts()).toContain('내용');
      expect(result).toHaveProperty('visitedCount');
      expect(result).toHaveProperty('skippedCount');
      expect(result).toHaveProperty('stopped');
      expect(result.visitedCount).toBeGreaterThan(0);
    });

    it('단일 visitor + 옵션', () => {
      class NodeCounter implements DocumentVisitor {
        private count = 0;

        visit(nodeId: string, node: any) {
          this.count++;
        }

        getCount(): number {
          return this.count;
        }
      }

      const counter = new NodeCounter();
      const result = dataStore.traverse(counter, { maxDepth: 2 });

      console.log('=== 단일 Visitor + 옵션 결과 ===');
      console.log('노드 수:', counter.getCount());
      console.log('순회 결과:', result);

      expect(counter.getCount()).toBeGreaterThan(0);
      expect(result.visitedCount).toBe(counter.getCount());
    });
  });

  describe('다중 Visitor (가변 인자)', () => {
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
              { stype: 'inline-text', text: '내용', marks: [{ stype: 'bold' }] }
            ]
          }
        ]
      });
    });

    it('가변 인자로 다중 visitor 실행', () => {
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

      class MarkCollector implements DocumentVisitor {
        private marks: string[] = [];

        visit(nodeId: string, node: any) {
          if (node.stype === 'inline-text' && node.marks) {
            node.marks.forEach((mark: any) => {
              this.marks.push(mark.stype);
            });
          }
        }

        getMarks(): string[] {
          return this.marks;
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
      const markCollector = new MarkCollector();
      const nodeCounter = new NodeCounter();

      const results = dataStore.traverse(textExtractor, markCollector, nodeCounter);

      console.log('=== 가변 인자 다중 Visitor 결과 ===');
      console.log('텍스트:', textExtractor.getTexts());
      console.log('마크:', markCollector.getMarks());
      console.log('노드 수:', nodeCounter.getCount());
      console.log('순회 결과:', results);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(3);
      expect(textExtractor.getTexts()).toContain('제목');
      expect(textExtractor.getTexts()).toContain('내용');
      expect(markCollector.getMarks()).toContain('bold');
      expect(nodeCounter.getCount()).toBeGreaterThan(0);
    });

    it('가변 인자 + 옵션', () => {
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

      const results = dataStore.traverse(textExtractor, nodeCounter, { maxDepth: 3 });

      console.log('=== 가변 인자 + 옵션 결과 ===');
      console.log('텍스트:', textExtractor.getTexts());
      console.log('노드 수:', nodeCounter.getCount());
      console.log('순회 결과:', results);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
      expect(textExtractor.getTexts()).toContain('제목');
      expect(textExtractor.getTexts()).toContain('내용');
    });
  });

  describe('배열로 다중 Visitor', () => {
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

    it('배열로 다중 visitor 실행', () => {
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

      const results = dataStore.traverse([textExtractor, nodeCounter]);

      console.log('=== 배열 다중 Visitor 결과 ===');
      console.log('텍스트:', textExtractor.getTexts());
      console.log('노드 수:', nodeCounter.getCount());
      console.log('순회 결과:', results);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
      expect(textExtractor.getTexts()).toContain('제목');
      expect(textExtractor.getTexts()).toContain('내용');
    });

    it('배열 + 옵션', () => {
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

      const results = dataStore.traverse([textExtractor], { maxDepth: 3 });

      console.log('=== 배열 + 옵션 결과 ===');
      console.log('텍스트:', textExtractor.getTexts());
      console.log('순회 결과:', results);

      // 배열에 visitor가 하나만 있으면 단일 결과 반환
      expect(results).toHaveProperty('visitedCount');
      expect(results).toHaveProperty('skippedCount');
      expect(results).toHaveProperty('stopped');
      expect(textExtractor.getTexts()).toContain('제목');
      expect(textExtractor.getTexts()).toContain('내용');
    });
  });

  describe('에러 처리', () => {
    it('visitor 없이 호출 시 에러', () => {
      expect(() => {
        dataStore.traverse();
      }).toThrow('At least one visitor is required');
    });
  });
});
