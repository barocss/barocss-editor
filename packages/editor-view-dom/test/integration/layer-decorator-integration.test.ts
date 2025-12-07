import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { expectHTML } from '../utils/html';
import { define, element, slot, data, getGlobalRegistry, defineDecorator } from '@barocss/dsl';

describe('EditorViewDOM + renderer-dom Layer Decorator Integration', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    // Register renderers
    const registry = getGlobalRegistry();
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
    
    defineDecorator('quote', element('div', {
      className: 'quote-decorator'
    }, [slot('content')]));
    
    const dataStore = new DataStore();
    editor = new Editor({ dataStore });
    view = new EditorViewDOM(editor, { 
      container,
      autoRender: false,
      registry
    });
    
    // Define decorator types (optional - only when validation is desired)
    view.defineDecoratorType('highlight', 'layer', {
      description: 'Highlight layer decorator',
      dataSchema: {
        color: { type: 'string', default: 'yellow' }
      }
    });
    view.defineDecoratorType('highlight', 'inline', {
      description: 'Highlight inline decorator',
      dataSchema: {
        color: { type: 'string', default: 'yellow' }
      }
    });
    view.defineDecoratorType('quote', 'block', {
      description: 'Quote block decorator',
      dataSchema: {}
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

  describe('Layer Decorator 기본 렌더링', () => {
    it('renders layer decorator in layers.decorator layer', () => {
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

      // Add layer decorator
      view.addDecorator({
        sid: 'layer1',
        stype: 'highlight',
        category: 'layer',
        target: {
          sid: 'p1'
        },
        data: {
          position: { top: '10px', left: '20px', width: '100px', height: '20px' },
          color: 'yellow'
        }
      });

      view.render(tree);

      // Verify full rendering result
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t1" data-bc-stype="inline-text">Hello World</span>
            </p>
            <span class="highlight-decorator" data-decorator="true" data-decorator-category="layer" data-decorator-position="after" data-decorator-sid="layer1" data-decorator-stype="highlight" data-skip-reconcile="true" style="background-color: yellow;"></span>
          </div>
        </div>`,
        expect
      );
    });

    it('renders multiple layer decorators simultaneously', () => {
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

      // Add multiple layer decorators
      view.addDecorator({
        sid: 'layer1',
        stype: 'highlight',
        category: 'layer',
        target: { sid: 'p1' },
        data: { color: 'yellow' }
      });
      
      view.addDecorator({
        sid: 'layer2',
        stype: 'comment',
        category: 'layer',
        target: { sid: 'p1' },
        data: { text: 'Comment' }
      });

      view.render(tree);

      // Verify full rendering result
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t1" data-bc-stype="inline-text">Hello World</span>
            </p>
            <span class="highlight-decorator" data-decorator="true" data-decorator-category="layer" data-decorator-position="after" data-decorator-sid="layer1" data-decorator-stype="highlight" data-skip-reconcile="true" style="background-color: yellow;"></span>
            <span class="comment-decorator" data-decorator="true" data-decorator-category="layer" data-decorator-position="after" data-decorator-sid="layer2" data-decorator-stype="comment" data-skip-reconcile="true">Comment</span>
          </div>
        </div>`,
        expect
      );
    });
  });

  describe('Layer Decorator 업데이트', () => {
    it('updates layer decorator position', () => {
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

      // Initial decorator
      view.addDecorator({
        sid: 'layer1',
        stype: 'highlight',
        category: 'layer',
        target: { sid: 'p1' },
        data: {
          position: { top: '10px', left: '20px' },
          color: 'yellow'
        }
      });

      view.render(tree);
      
      // Verify initial rendering result
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t1" data-bc-stype="inline-text">Hello World</span>
            </p>
            <span class="highlight-decorator" data-decorator="true" data-decorator-category="layer" data-decorator-position="after" data-decorator-sid="layer1" data-decorator-stype="highlight" data-skip-reconcile="true" style="background-color: yellow;"></span>
          </div>
        </div>`,
        expect
      );

      // Update position
      view.updateDecorator('layer1', {
        data: {
          position: { top: '20px', left: '30px' },
          color: 'yellow'
        }
      });

      view.render(tree);
      
      // Verify rendering result after update
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t1" data-bc-stype="inline-text">Hello WorldHello World</span>
            </p>
            <span class="highlight-decorator" data-decorator="true" data-decorator-category="layer" data-decorator-position="after" data-decorator-sid="layer1" data-decorator-stype="highlight" data-skip-reconcile="true" style="background-color: yellow;"></span>
          </div>
        </div>`,
        expect
      );
    });
  });

  describe('Layer Decorator 추가/제거', () => {
    it('adds layer decorator and renders it', () => {
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

      view.render(tree);
      
      // Verify initial rendering result
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t1" data-bc-stype="inline-text">Hello World</span>
            </p>
          </div>
        </div>`,
        expect
      );

      // Add layer decorator
      view.addDecorator({
        sid: 'layer1',
        stype: 'highlight',
        category: 'layer',
        target: { sid: 'p1' },
        data: { color: 'yellow' }
      });

      view.render(tree);
      
      // Verify rendering result after adding decorator
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t1" data-bc-stype="inline-text">Hello WorldHello World</span>
            </p>
            <span class="highlight-decorator" data-decorator="true" data-decorator-category="layer" data-decorator-position="after" data-decorator-sid="layer1" data-decorator-stype="highlight" data-skip-reconcile="true" style="background-color: yellow;"></span>
          </div>
        </div>`,
        expect
      );
    });

    it('removes layer decorator', () => {
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
        sid: 'layer1',
        stype: 'highlight',
        category: 'layer',
        target: { sid: 'p1' },
        data: { color: 'yellow' }
      });

      view.render(tree);
      
      // Verify initial rendering result
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t1" data-bc-stype="inline-text">Hello World</span>
            </p>
            <span class="highlight-decorator" data-decorator="true" data-decorator-category="layer" data-decorator-position="after" data-decorator-sid="layer1" data-decorator-stype="highlight" data-skip-reconcile="true" style="background-color: yellow;"></span>
          </div>
        </div>`,
        expect
      );

      // Remove layer decorator
      view.removeDecorator('layer1');

      view.render(tree);
      
      // Verify rendering result after removing decorator
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t1" data-bc-stype="inline-text">Hello WorldHello World</span>
            </p>
          </div>
        </div>`,
        expect
      );
    });
  });

  describe('Layer Decorator와 Inline/Block Decorator 혼합', () => {
    it('renders layer decorator with inline decorator', () => {
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

      // Layer decorator
      view.addDecorator({
        sid: 'layer1',
        stype: 'highlight',
        category: 'layer',
        target: { sid: 'p1' },
        data: { color: 'yellow' }
      });
      
      // Inline decorator
      view.addDecorator({
        sid: 'inline1',
        stype: 'highlight',
        category: 'inline',
        target: {
          sid: 't1',
          startOffset: 0,
          endOffset: 5
        },
        data: { color: 'blue' }
      });

      view.render(tree);

      // Verify full rendering result
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t1" data-bc-stype="inline-text">
                <span class="highlight-decorator" data-decorator="true" data-decorator-category="inline" data-decorator-sid="inline1" data-decorator-stype="highlight" data-skip-reconcile="true" style="background-color: yellow;"><span>Hello</span></span>
                <span>World</span>
              </span>
            </p>
            <span class="highlight-decorator" data-decorator="true" data-decorator-category="layer" data-decorator-position="after" data-decorator-sid="layer1" data-decorator-stype="highlight" data-skip-reconcile="true" style="background-color: yellow;"></span>
          </div>
        </div>`,
        expect
      );
    });

    it('renders layer decorator with block decorator', () => {
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

      // Layer decorator
      view.addDecorator({
        sid: 'layer1',
        stype: 'highlight',
        category: 'layer',
        target: { sid: 'p1' },
        data: { color: 'yellow' }
      });
      
      // Block decorator
      view.addDecorator({
        sid: 'block1',
        stype: 'quote',
        category: 'block',
        target: { sid: 'p1' },
        position: 'before',
        data: { text: 'Quote' }
      });

      view.render(tree);

      // Verify full rendering result
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <div class="quote-decorator" data-decorator="true" data-decorator-category="block" data-decorator-position="before" data-decorator-sid="block1" data-decorator-stype="quote" data-skip-reconcile="true"></div>
            <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t1" data-bc-stype="inline-text">Hello World</span>
            </p>
            <span class="highlight-decorator" data-decorator="true" data-decorator-category="layer" data-decorator-position="after" data-decorator-sid="layer1" data-decorator-stype="highlight" data-skip-reconcile="true" style="background-color: yellow;"></span>
          </div>
        </div>`,
        expect
      );
    });
  });
});

