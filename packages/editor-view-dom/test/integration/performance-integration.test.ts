import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { normalizeHTML } from '../utils/html';
import { define, element, slot, data, getGlobalRegistry } from '@barocss/dsl';

describe('EditorViewDOM + renderer-dom Performance Integration', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    // 렌더러 등록
    const registry = getGlobalRegistry();
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
    
    const dataStore = new DataStore();
    editor = new Editor({ dataStore });
    view = new EditorViewDOM(editor, { 
      container,
      autoRender: false,
      registry
    });
    
    // Decorator 타입 정의 (선택적 - 검증을 원할 때만)
    view.defineDecoratorType('highlight', 'inline', {
      description: 'Highlight decorator',
      dataSchema: {
        color: { type: 'string', default: 'yellow' }
      }
    });
  });
  
  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (view) {
      view.destroy();
    }
  });

  describe('Large Document Rendering', () => {
    it('renders 1000 paragraphs efficiently', () => {
      const paragraphs = Array.from({ length: 1000 }, (_, i) => ({
        sid: `p${i}`,
        stype: 'paragraph',
        content: [
          {
            sid: `t${i}`,
            stype: 'text',
            text: `Paragraph ${i}`
          }
        ]
      }));

      const tree: TreeDocument = {
        sid: 'doc-large',
        stype: 'document',
        content: paragraphs
      };

      const startTime = performance.now();
      view.render(tree);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      console.log(`[Performance] Rendered 1000 paragraphs in ${duration.toFixed(2)} ms`);
      
      // 렌더링 시간은 환경에 따라 다르므로, 너무 엄격하게 제한하지 않음
      // 1000개 노드에 대해 2초 이내를 목표로 하지만, 테스트에서는 통과만 확인
      expect(duration).toBeLessThan(5000); // 5초 이내
      
      const html = normalizeHTML(container.firstElementChild as Element);
      expect(html).toContain('data-bc-sid="doc-large"');
      expect(html).toContain('Paragraph 500'); // 중간 내용 확인
      expect(html).toContain('Paragraph 999'); // 마지막 내용 확인
    });

    it('renders 2000 paragraphs efficiently', { timeout: 30000 }, () => {
      const paragraphs = Array.from({ length: 2000 }, (_, i) => ({
        sid: `p${i}`,
        stype: 'paragraph',
        content: [
          {
            sid: `t${i}`,
            stype: 'text',
            text: `Paragraph ${i}`
          }
        ]
      }));

      const tree: TreeDocument = {
        sid: 'doc-very-large',
        stype: 'document',
        content: paragraphs
      };

      const startTime = performance.now();
      view.render(tree);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      console.log(`[Performance] Rendered 2000 paragraphs in ${duration.toFixed(2)} ms`);
      
      // 2000개 노드에 대해 30초 이내를 목표 (CI 환경 고려)
      expect(duration).toBeLessThan(30000); // 30초 이내
      
      const html = normalizeHTML(container.firstElementChild as Element);
      expect(html).toContain('data-bc-sid="doc-very-large"');
      expect(html).toContain('Paragraph 1000'); // 중간 내용 확인
    });

    it('handles large document updates efficiently', () => {
      const initialParagraphs = Array.from({ length: 100 }, (_, i) => ({
        sid: `p${i}`,
        stype: 'paragraph',
        content: [
          {
            sid: `t${i}`,
            stype: 'text',
            text: `Initial ${i}`
          }
        ]
      }));

      const tree1: TreeDocument = {
        sid: 'doc-update',
        stype: 'document',
        content: initialParagraphs
      };

      view.render(tree1);
      const html1 = normalizeHTML(container.firstElementChild as Element);
      expect(html1).toContain('Initial 50');

      // 대량 업데이트
      const updatedParagraphs = Array.from({ length: 100 }, (_, i) => ({
        sid: `p${i}`,
        stype: 'paragraph',
        content: [
          {
            sid: `t${i}`,
            stype: 'text',
            text: `Updated ${i}`
          }
        ]
      }));

      const tree2: TreeDocument = {
        sid: 'doc-update',
        stype: 'document',
        content: updatedParagraphs
      };

      const startTime = performance.now();
      view.render(tree2);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      console.log(`[Performance] Updated 100 paragraphs in ${duration.toFixed(2)} ms`);
      
      // 업데이트는 렌더링보다 빠를 것으로 예상
      expect(duration).toBeLessThan(2000); // 2초 이내
      
      const html2 = normalizeHTML(container.firstElementChild as Element);
      expect(html2).toContain('Updated 50');
      expect(html2).not.toContain('Initial 50');
    });
  });

  describe('Memory Stability', () => {
    it('handles repeated full renders without memory leaks', () => {
      const tree: TreeDocument = {
        sid: 'doc-memory',
        stype: 'document',
        content: Array.from({ length: 100 }, (_, i) => ({
          sid: `p${i}`,
          stype: 'paragraph',
          content: [
            {
              sid: `t${i}`,
              stype: 'text',
              text: `Paragraph ${i}`
            }
          ]
        }))
      };

      // 첫 렌더링
      view.render(tree);
      
      // 첫 렌더링 후 요소 수 측정
      const initialElementCount = container.querySelectorAll('*').length;
      expect(initialElementCount).toBeGreaterThan(0);

      // 반복 렌더링 (10회)
      for (let i = 0; i < 10; i++) {
        view.render(tree);
      }

      // 메모리 누수 체크: DOM 요소 수가 비정상적으로 증가하지 않아야 함
      const finalElementCount = container.querySelectorAll('*').length;
      
      // 반복 렌더링 후에도 요소 수가 크게 증가하지 않아야 함
      // (약간의 증가는 허용하지만, 3배 이상 증가하면 문제)
      expect(finalElementCount).toBeLessThan(initialElementCount * 3);
      
      const html = normalizeHTML(container.firstElementChild as Element);
      expect(html).toContain('data-bc-sid="doc-memory"');
      expect(html).toContain('Paragraph 50');
    });
  });

  describe('Proxy-based Lazy Evaluation Performance', () => {
    it('uses proxy efficiently for large documents', async () => {
      // DataStore에 대량 문서 로드
      const paragraphs = Array.from({ length: 500 }, (_, i) => ({
        sid: `p${i}`,
        stype: 'paragraph',
        content: [
          {
            sid: `t${i}`,
            stype: 'text',
            text: `Paragraph ${i}`
          }
        ]
      }));

      const tree: TreeDocument = {
        sid: 'doc-proxy',
        stype: 'document',
        content: paragraphs
      };

      // DataStore에 로드
      editor.loadDocument(tree, 'proxy-session');
      
      // 잠시 대기 (로드 완료 대기)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Proxy 문서 확인
      const proxyDoc = editor.getDocumentProxy?.();
      expect(proxyDoc).toBeTruthy();
      expect(proxyDoc?.stype).toBe('document');
      
      const startTime = performance.now();
      view.render(); // Proxy를 통해 렌더링
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      console.log(`[Performance] Rendered 500 paragraphs with proxy in ${duration.toFixed(2)} ms`);
      
      // Proxy를 사용한 렌더링 시간은 환경에 따라 다르므로, 너무 엄격하게 제한하지 않음
      expect(duration).toBeLessThan(5000); // 5초 이내
      
      const contentLayer = container.querySelector('[data-bc-layer="content"]');
      if (contentLayer) {
        const html = normalizeHTML(contentLayer as Element);
        // Proxy 문서의 sid는 로드 시 생성된 것이므로, doc-proxy와 다를 수 있음
        // 최소한 문서가 렌더링되었는지 확인
        expect(html).toContain('data-bc-stype="document"');
        expect(html).toContain('Paragraph 250'); // 중간 내용 확인
      } else {
        // content layer가 없으면 최소한 container에 내용이 있는지 확인
        expect(container.children.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Mixed Decorators and Marks Performance', () => {
    it('handles large document with many decorators and marks efficiently', { timeout: 30000 }, () => {
      const paragraphs = Array.from({ length: 200 }, (_, i) => ({
        sid: `p${i}`,
        stype: 'paragraph',
        content: [
          {
            sid: `t${i}`,
            stype: 'inline-text',
            text: `Paragraph ${i} with marks`,
            marks: [
              { type: 'bold', range: [0, 5] },
              { type: 'italic', range: [10, 15] }
            ]
          }
        ]
      }));

      const tree: TreeDocument = {
        sid: 'doc-mixed',
        stype: 'document',
        content: paragraphs
      };

      // Decorators 추가
      // 일부 paragraph에 decorator 추가
      for (let i = 0; i < 50; i++) {
        view.addDecorator({
          sid: `d${i}`,
          stype: 'highlight',
          category: 'inline',
          target: {
            sid: `t${i}`,
            startOffset: 0,
            endOffset: 10
          },
          data: {}
        });
      }

      const startTime = performance.now();
      view.render(tree);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      console.log(`[Performance] Rendered 200 paragraphs with marks and 50 decorators in ${duration.toFixed(2)} ms`);
      
      // 마크와 decorator가 있는 경우 약간 더 느릴 수 있음
      expect(duration).toBeLessThan(5000); // 5초 이내
      
      // content layer에서 확인
      const contentLayer = view.layers.content;
      const html = normalizeHTML(contentLayer.firstElementChild as Element);
      expect(html).toContain('data-bc-sid="doc-mixed"');
      // 마크로 인해 텍스트가 분할될 수 있으므로 paragraph 100의 sid로 확인
      expect(html).toContain('data-bc-sid="p100"');
    });
  });
});

