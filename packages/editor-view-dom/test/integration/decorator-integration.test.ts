/**
 * Decorator Integration 테스트
 * 
 * 현재 구조: EditorViewDOM을 통한 decorator 관리 및 렌더링
 * - DecoratorManager: 로컬 decorator CRUD
 * - renderer-dom을 통한 통합 렌더링
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { define, element, slot, data, getGlobalRegistry, defineDecorator } from '@barocss/dsl';
import { expectHTML } from '../utils/html';

describe('EditorViewDOM + renderer-dom Decorator Integration', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  let registry: ReturnType<typeof getGlobalRegistry>;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    // Register renderers (same pattern as renderer-dom test)
    registry = getGlobalRegistry();
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
    
    // Define decorator templates
    defineDecorator('highlight', element('span', {
      className: 'highlight-decorator',
      style: { backgroundColor: 'yellow' }
    }, [slot('text')]));
    
    defineDecorator('comment', element('span', {
      className: 'comment-decorator'
    }, [slot('text')]));
    
    defineDecorator('underline', element('span', {
      className: 'underline-decorator',
      style: { textDecoration: 'underline' }
    }, [slot('text')]));
    
    const dataStore = new DataStore();
    editor = new Editor({ dataStore });
    view = new EditorViewDOM(editor, { 
      container,
      autoRender: false,
      registry // Pass renderer registry
    });
    
    // Define decorator types (optional - only when validation is desired)
    view.defineDecoratorType('highlight', 'inline', {
      description: 'Highlight decorator',
      dataSchema: {
        color: { type: 'string', default: 'yellow' }
      }
    });
    view.defineDecoratorType('highlight', 'layer', {
      description: 'Highlight layer decorator',
      dataSchema: {
        color: { type: 'string', default: 'yellow' }
      }
    });
    view.defineDecoratorType('comment', 'layer', {
      description: 'Comment layer decorator',
      dataSchema: {
        text: { type: 'string', required: true }
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

  describe('DecoratorManager - 기본 기능', () => {
    it('should add and retrieve decorator', () => {
      const decorator = {
        sid: 'd1',
        stype: 'highlight',
        category: 'inline' as const,
        target: {
          sid: 't1',
          startOffset: 0,
          endOffset: 5
        },
        data: { color: 'yellow' }
      };
      
      view.addDecorator(decorator);
      
      const retrieved = view.decoratorManager.get('d1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.sid).toBe('d1');
      expect(retrieved?.stype).toBe('highlight');
    });

    it('should update decorator', () => {
      view.addDecorator({
        sid: 'd1',
        stype: 'highlight',
        category: 'inline',
        target: { sid: 't1', startOffset: 0, endOffset: 5 },
        data: { color: 'yellow' }
      });
      
      view.updateDecorator('d1', {
        data: { color: 'red' }
      });
      
      const updated = view.decoratorManager.get('d1');
      expect(updated?.data?.color).toBe('red');
    });

    it('should remove decorator', () => {
      view.addDecorator({
        sid: 'd1',
        stype: 'highlight',
        category: 'inline',
        target: { sid: 't1', startOffset: 0, endOffset: 5 },
        data: {}
      });
      
      expect(view.decoratorManager.has('d1')).toBe(true);
      
      view.removeDecorator('d1');
      
      expect(view.decoratorManager.has('d1')).toBe(false);
    });
  });

  describe('Decorator 렌더링 통합', () => {
    it('should collect decorators for rendering', () => {
      const tree = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              {
                sid: 't1',
                stype: 'inline-text',
                text: 'Hello World'
              }
            ]
          }
        ]
      };

      // Add decorator
      view.addDecorator({
        sid: 'd1',
        stype: 'highlight',
        category: 'inline',
        target: {
          sid: 't1',
          startOffset: 0,
          endOffset: 5
        },
        data: { color: 'yellow' }
      });

      // Verify decorator before calling render
      const decorators = view.decoratorManager.getAll();
      expect(decorators).toHaveLength(1);
      expect(decorators[0].sid).toBe('d1');

      // Call render
      view.render(tree);
      
      // Verify decorator is preserved after render
      const decoratorsAfter = view.decoratorManager.getAll();
      expect(decoratorsAfter).toHaveLength(1);
      
      // Verify full rendering result
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t1" data-bc-stype="inline-text">
                <span class="highlight-decorator" data-decorator="true" data-decorator-category="inline" data-decorator-sid="d1" data-decorator-stype="highlight" data-skip-reconcile="true" style="background-color: yellow;"><span>Hello</span></span>
            <span>World</span>
              </span>
            </p>
          </div>
        </div>`,
        expect
      );
    });

    it('should handle multiple decorators', () => {
      const tree = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              {
                sid: 't1',
                stype: 'inline-text',
                text: 'Hello World'
              }
            ]
          }
        ]
      };
      
      view.addDecorator({
        sid: 'd1',
        stype: 'highlight',
        category: 'inline',
        target: { sid: 't1', startOffset: 0, endOffset: 5 },
        data: {}
      });
      
      view.addDecorator({
        sid: 'd2',
        stype: 'underline',
        category: 'inline',
        target: { sid: 't1', startOffset: 2, endOffset: 7 },
        data: {}
      });

      const decorators = view.decoratorManager.getAll();
      expect(decorators).toHaveLength(2);
      
      // Verify rendering and full result
      view.render(tree);
      
      // Note: DecoratorRenderer handles separately, so actual structure may differ
      // Need to check actual result to write expectHTML
      const html = view.layers.content.innerHTML;
      expect(html).toContain('data-bc-sid="doc1"');
      expect(html).toContain('data-bc-sid="p1"');
      expect(html).toContain('data-bc-sid="t1"');
      expect(html).toContain('data-decorator-sid="d1"');
      expect(html).toContain('data-decorator-sid="d2"');
    });

    it('should query decorators by category', () => {
      view.addDecorator({
        sid: 'layer-1',
        stype: 'highlight',
        category: 'layer',
        target: { sid: 'p1' },
        data: {}
      });
      
      view.addDecorator({
        sid: 'inline-1',
        stype: 'highlight',
        category: 'inline',
        target: { sid: 't1', startOffset: 0, endOffset: 5 },
        data: {}
      });
      
      const layerDecorators = view.decoratorManager.getByCategory('layer');
      expect(layerDecorators).toHaveLength(1);
      
      const inlineDecorators = view.decoratorManager.getByCategory('inline');
      expect(inlineDecorators).toHaveLength(1);
    });
  });

  describe('RemoteDecoratorManager 통합', () => {
    it('should collect local and remote decorators', () => {
      // Local decorator
      view.addDecorator({
        sid: 'local-1',
        stype: 'highlight',
        category: 'inline',
        target: { sid: 't1', startOffset: 0, endOffset: 5 },
        data: {}
      });

      // Remote decorator
      view.remoteDecoratorManager.setRemoteDecorator(
        {
          sid: 'remote-1',
          stype: 'comment',
          category: 'layer',
          target: { sid: 'p1' },
          data: { text: 'Remote comment' }
        },
        { userId: 'user-1', sessionId: 'session-1' }
      );

      const local = view.decoratorManager.getAll();
      const remote = view.remoteDecoratorManager.getAll();
      
      expect(local).toHaveLength(1);
      expect(remote).toHaveLength(1);
    });
  });
});
