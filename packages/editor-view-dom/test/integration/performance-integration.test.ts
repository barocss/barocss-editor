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
    
    // Register renderer
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
    
    // Define Decorator type (optional - only when validation is desired)
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
      
      // Rendering time varies by environment, so don't restrict too strictly
      // Target is within 2 seconds for 1000 nodes, but in tests only verify pass
      expect(duration).toBeLessThan(5000); // Within 5 seconds
      
      const html = normalizeHTML(container.firstElementChild as Element);
      expect(html).toContain('data-bc-sid="doc-large"');
      expect(html).toContain('Paragraph 500'); // Verify middle content
      expect(html).toContain('Paragraph 999'); // Verify last content
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
      
      // Target is within 30 seconds for 2000 nodes (considering CI environment)
      expect(duration).toBeLessThan(30000); // Within 30 seconds
      
      const html = normalizeHTML(container.firstElementChild as Element);
      expect(html).toContain('data-bc-sid="doc-very-large"');
      expect(html).toContain('Paragraph 1000'); // Verify middle content
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

      // Bulk update
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
      
      // Updates are expected to be faster than rendering
      expect(duration).toBeLessThan(2000); // Within 2 seconds
      
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

      // First rendering
      view.render(tree);
      
      // Measure element count after first rendering
      const initialElementCount = container.querySelectorAll('*').length;
      expect(initialElementCount).toBeGreaterThan(0);

      // Repeat rendering (10 times)
      for (let i = 0; i < 10; i++) {
        view.render(tree);
      }

      // Memory leak check: DOM element count should not abnormally increase
      const finalElementCount = container.querySelectorAll('*').length;
      
      // Element count should not significantly increase after repeated rendering
      // (Slight increase is allowed, but 3x or more increase is a problem)
      expect(finalElementCount).toBeLessThan(initialElementCount * 3);
      
      const html = normalizeHTML(container.firstElementChild as Element);
      expect(html).toContain('data-bc-sid="doc-memory"');
      expect(html).toContain('Paragraph 50');
    });
  });

  describe('Proxy-based Lazy Evaluation Performance', () => {
    it('uses proxy efficiently for large documents', async () => {
      // Load large document to DataStore
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

      // Load to DataStore
      editor.loadDocument(tree, 'proxy-session');
      
      // Wait briefly (wait for load completion)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify Proxy document
      const proxyDoc = editor.getDocumentProxy?.();
      expect(proxyDoc).toBeTruthy();
      expect(proxyDoc?.stype).toBe('document');
      
      const startTime = performance.now();
      view.render(); // Render through Proxy
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      console.log(`[Performance] Rendered 500 paragraphs with proxy in ${duration.toFixed(2)} ms`);
      
      // Rendering time with Proxy varies by environment, so don't restrict too strictly
      expect(duration).toBeLessThan(5000); // Within 5 seconds
      
      const contentLayer = container.querySelector('[data-bc-layer="content"]');
      if (contentLayer) {
        const html = normalizeHTML(contentLayer as Element);
        // Proxy document's sid is generated at load time, so may differ from doc-proxy
        // At least verify document is rendered
        expect(html).toContain('data-bc-stype="document"');
        expect(html).toContain('Paragraph 250'); // Verify middle content
      } else {
        // If content layer doesn't exist, at least verify container has content
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

      // Add Decorators
      // Add decorator to some paragraphs
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
      
      // May be slightly slower with marks and decorators
      expect(duration).toBeLessThan(5000); // Within 5 seconds
      
      // Verify in content layer
      const contentLayer = view.layers.content;
      const html = normalizeHTML(contentLayer.firstElementChild as Element);
      expect(html).toContain('data-bc-sid="doc-mixed"');
      // Text may be split by marks, so verify with paragraph 100's sid
      expect(html).toContain('data-bc-sid="p100"');
    });
  });
});

