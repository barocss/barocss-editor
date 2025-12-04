import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';
import { DocumentVisitor } from '../src/operations/utility-operations';

describe('Advanced Visitor Examples', () => {
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
        'list': {
          name: 'list',
          content: 'listItem+',
          group: 'block'
        },
        'listItem': {
          name: 'listItem',
          content: 'block+',
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
        'italic': {
          name: 'italic',
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

  describe('실용적인 Visitor 클래스들', () => {
    beforeEach(() => {
      // 복잡한 문서 구조 생성
      dataStore.createNodeWithChildren({
        stype: 'document',
        content: [
          {
            stype: 'heading',
            attributes: { level: 1 },
            content: [
              { stype: 'inline-text', text: 'React 에디터 개발 가이드' }
            ]
          },
          {
            stype: 'paragraph',
            content: [
              { stype: 'inline-text', text: '이 문서는 ' },
              { stype: 'inline-text', text: 'React', marks: [{ stype: 'bold' }] },
              { stype: 'inline-text', text: ' 기반 에디터를 설명합니다. ' },
              { stype: 'inline-text', text: 'GitHub', marks: [{ stype: 'link', attributes: { href: 'https://github.com' } }] },
              { stype: 'inline-text', text: '에서 더 많은 정보를 확인할 수 있습니다.' }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 2 },
            content: [
              { stype: 'inline-text', text: '주요 기능' }
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
                      { stype: 'inline-text', text: '텍스트 포맷팅: ' },
                      { stype: 'inline-text', text: 'bold', marks: [{ stype: 'bold' }] },
                      { stype: 'inline-text', text: ', ' },
                      { stype: 'inline-text', text: 'italic', marks: [{ stype: 'italic' }] }
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
                      { stype: 'inline-text', text: '리스트 지원: 중첩된 리스트와 다양한 타입' }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });
    });

    it('링크 수집 Visitor', () => {
      class LinkCollector implements DocumentVisitor {
        private links: Array<{nodeId: string, text: string, href: string}> = [];

        visit(nodeId: string, node: any) {
          if (node.stype === 'inline-text' && node.marks) {
            const linkMark = node.marks.find((m: any) => m.stype === 'link');
            if (linkMark) {
              this.links.push({
                nodeId,
                text: node.text,
                href: linkMark.attributes?.href || ''
              });
            }
          }
        }

        getLinks() {
          return this.links;
        }
      }

      const linkCollector = new LinkCollector();
      const result = dataStore.traverse(linkCollector);

      const links = linkCollector.getLinks();
      console.log('=== 링크 수집 결과 ===');
      console.log('수집된 링크:', links);

      expect(links.length).toBe(1);
      expect(links[0].text).toBe('GitHub');
      expect(links[0].href).toBe('https://github.com');
      expect(result.visitedCount).toBeGreaterThan(0);
    });

    it('마크 분석 Visitor', () => {
      class MarkAnalyzer implements DocumentVisitor {
        private markStats: Record<string, number> = {};
        private markedTexts: Record<string, string[]> = {};

        visit(nodeId: string, node: any) {
          if (node.stype === 'inline-text' && node.marks && node.marks.length > 0) {
            node.marks.forEach((mark: any) => {
              this.markStats[mark.stype] = (this.markStats[mark.stype] || 0) + 1;
              
              if (!this.markedTexts[mark.stype]) {
                this.markedTexts[mark.stype] = [];
              }
              this.markedTexts[mark.stype].push(node.text);
            });
          }
        }

        getMarkStats() {
          return this.markStats;
        }

        getMarkedTexts() {
          return this.markedTexts;
        }
      }

      const markAnalyzer = new MarkAnalyzer();
      const result = dataStore.traverse(markAnalyzer);

      const markStats = markAnalyzer.getMarkStats();
      const markedTexts = markAnalyzer.getMarkedTexts();

      console.log('=== 마크 분석 결과 ===');
      console.log('마크 통계:', markStats);
      console.log('마크된 텍스트:', markedTexts);

      expect(markStats['bold']).toBe(2); // React, bold
      expect(markStats['italic']).toBe(1); // italic
      expect(markStats['link']).toBe(1); // GitHub
      expect(markedTexts['bold']).toContain('React');
      expect(markedTexts['bold']).toContain('bold');
      expect(markedTexts['italic']).toContain('italic');
      expect(markedTexts['link']).toContain('GitHub');
    });

    it('구조 분석 Visitor', () => {
      class StructureAnalyzer implements DocumentVisitor {
        private structure: any = {};
        private nodeDepths: Record<string, number> = {};

        visit(nodeId: string, node: any) {
          // 노드의 실제 깊이 계산
          let depth = 1;
          let currentId = node.parentId;
          while (currentId) {
            depth++;
            const parentNode = dataStore.getNode(currentId);
            currentId = parentNode?.parentId;
          }

          this.nodeDepths[nodeId] = depth;
          
          this.structure[nodeId] = {
            type: node.stype,
            depth: depth,
            parent: node.parentId,
            children: node.content || [],
            hasChildren: node.content && node.content.length > 0
          };
        }

        getStructure() {
          return this.structure;
        }

        getMaxDepth(): number {
          return Math.max(...Object.values(this.nodeDepths));
        }

        getNodeCount(): number {
          return Object.keys(this.structure).length;
        }

        getNodesByDepth(depth: number): string[] {
          return Object.keys(this.nodeDepths).filter(nodeId => this.nodeDepths[nodeId] === depth);
        }
      }

      const structureAnalyzer = new StructureAnalyzer();
      const result = dataStore.traverse(structureAnalyzer);

      const structure = structureAnalyzer.getStructure();
      const maxDepth = structureAnalyzer.getMaxDepth();
      const nodeCount = structureAnalyzer.getNodeCount();

      console.log('=== 구조 분석 결과 ===');
      console.log('최대 깊이:', maxDepth);
      console.log('노드 수:', nodeCount);
      console.log('깊이별 노드 수:', {
        depth1: structureAnalyzer.getNodesByDepth(1).length,
        depth2: structureAnalyzer.getNodesByDepth(2).length,
        depth3: structureAnalyzer.getNodesByDepth(3).length,
        depth4: structureAnalyzer.getNodesByDepth(4).length
      });

      expect(maxDepth).toBeGreaterThan(1); // 깊이 있는 구조
      expect(nodeCount).toBeGreaterThan(5);
      
      // 루트 노드 확인
      const rootNodes = structureAnalyzer.getNodesByDepth(1);
      expect(rootNodes.length).toBe(1);
      const rootNode = structure[rootNodes[0]];
      expect(rootNode.type).toBe('document');
    });

    it('텍스트 통계 Visitor', () => {
      class TextStatistics implements DocumentVisitor {
        private totalCharacters = 0;
        private totalWords = 0;
        private textByType: Record<string, string[]> = {};
        private wordCount: Record<string, number> = {};

        visit(nodeId: string, node: any) {
          if (node.stype === 'inline-text' && node.text) {
            this.totalCharacters += node.text.length;
            
            const words = node.text.split(/\s+/).filter((word: string) => word.length > 0);
            this.totalWords += words.length;
            
            if (!this.textByType[node.stype]) {
              this.textByType[node.stype] = [];
            }
            this.textByType[node.stype].push(node.text);
            
            words.forEach((word: string) => {
              this.wordCount[word] = (this.wordCount[word] || 0) + 1;
            });
          }
        }

        getStatistics() {
          return {
            totalCharacters: this.totalCharacters,
            totalWords: this.totalWords,
            textByType: this.textByType,
            wordCount: this.wordCount,
            averageWordLength: this.totalWords > 0 ? this.totalCharacters / this.totalWords : 0
          };
        }
      }

      const textStats = new TextStatistics();
      const result = dataStore.traverse(textStats);

      const stats = textStats.getStatistics();
      console.log('=== 텍스트 통계 결과 ===');
      console.log('통계:', stats);

      expect(stats.totalCharacters).toBeGreaterThan(0);
      expect(stats.totalWords).toBeGreaterThan(0);
      expect(stats.averageWordLength).toBeGreaterThan(0);
      expect(stats.textByType['inline-text']).toBeTruthy();
      expect(stats.textByType['inline-text'].length).toBeGreaterThan(0);
    });

    it('조건부 검색 Visitor', () => {
      class ConditionalSearcher implements DocumentVisitor {
        private foundNodes: Array<{nodeId: string, node: any, reason: string}> = [];

        visit(nodeId: string, node: any) {
          // React 관련 텍스트 찾기
          if (node.stype === 'inline-text' && node.text && node.text.includes('React')) {
            this.foundNodes.push({
              nodeId,
              node,
              reason: 'Contains "React"'
            });
          }

          // 링크가 있는 텍스트 찾기
          if (node.stype === 'inline-text' && node.marks && 
              node.marks.some((m: any) => m.stype === 'link')) {
            this.foundNodes.push({
              nodeId,
              node,
              reason: 'Has link mark'
            });
          }

          // 제목 레벨 2 찾기
          if (node.stype === 'heading' && node.attributes?.level === 2) {
            this.foundNodes.push({
              nodeId,
              node,
              reason: 'Level 2 heading'
            });
          }
        }

        getFoundNodes() {
          return this.foundNodes;
        }
      }

      const searcher = new ConditionalSearcher();
      const result = dataStore.traverse(searcher);

      const foundNodes = searcher.getFoundNodes();
      console.log('=== 조건부 검색 결과 ===');
      console.log('찾은 노드들:', foundNodes);

      expect(foundNodes.length).toBeGreaterThan(0);
      expect(foundNodes.some(n => n.reason === 'Contains "React"')).toBe(true);
      expect(foundNodes.some(n => n.reason === 'Has link mark')).toBe(true);
      expect(foundNodes.some(n => n.reason === 'Level 2 heading')).toBe(true);
    });
  });

  describe('Visitor 조합 사용', () => {
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
              { stype: 'inline-text', text: '내용 1' },
              { stype: 'inline-text', text: '내용 2', marks: [{ stype: 'bold' }] }
            ]
          }
        ]
      });
    });

    it('여러 Visitor를 조합하여 복합 분석', () => {
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

      console.log('=== 복합 분석 결과 ===');
      console.log('텍스트:', textExtractor.getTexts());
      console.log('마크:', markCollector.getMarks());
      console.log('노드 수:', nodeCounter.getCount());
      console.log('실행 결과:', results);

      expect(textExtractor.getTexts()).toContain('제목');
      expect(textExtractor.getTexts()).toContain('내용 1');
      expect(textExtractor.getTexts()).toContain('내용 2');
      expect(markCollector.getMarks()).toContain('bold');
      expect(nodeCounter.getCount()).toBe(6); // 총 노드 수
      expect(results.length).toBe(3);
    });
  });
});
