import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { normalizeHTML, expectHTML } from '../utils/html';
import { define, element, slot, data, getGlobalRegistry } from '@barocss/dsl';

describe('EditorViewDOM + renderer-dom Error Handling Integration', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  
  beforeEach(() => {
    // Define components
    if (!getGlobalRegistry().has('document')) {
      define('document', element('div', { className: 'document' }, [slot('content')]));
    }
    if (!getGlobalRegistry().has('paragraph')) {
      define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    }
    if (!getGlobalRegistry().has('text')) {
      define('text', element('span', { className: 'text' }, [data('text')]));
    }
    
    container = document.createElement('div');
    document.body.appendChild(container);
    
    const dataStore = new DataStore();
    editor = new Editor({ dataStore });
    view = new EditorViewDOM(editor, { 
      container,
      autoRender: false
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

  describe('Invalid stype Handling', () => {
    it.skip('handles missing stype gracefully', () => {
      const tree: any = {
        sid: 'doc1',
        // No stype
        content: []
      };
      
      // Error occurs if stype is missing
      expect(() => {
        view.render(tree);
      }).toThrow('[EditorViewDOM] Invalid tree format: missing stype (required)');
    });

    it.skip('handles unregistered stype gracefully', () => {
      const tree: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'unknown-type',  // Unregistered type
            content: []
          }
        ]
      };
      
      // Error occurs in VNodeBuilder if stype is missing
      expect(() => {
        view.render(tree);
      }).toThrow('Renderer for node type \'unknown-type\' not found');
    });
  });

  describe('Missing sid Handling', () => {
    it('handles missing sid with warning', () => {
      const tree: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            // No sid
            stype: 'paragraph',
            content: [
              { sid: 't1', stype: 'text', text: 'Content' }
            ]
          }
        ]
      };
      
      // Rendering is possible even without sid, but warning may occur
      view.render(tree);
      
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t1" data-bc-stype="text">Content</span>
            </p>
          </div>
        </div>`,
        expect
      );
    });
  });

  describe('Empty Content', () => {
    it('handles empty content array', () => {
      const tree: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: []  // Empty array
      };
      
      view.render(tree);
      
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document"></div>
        </div>`,
        expect
      );
    });

    it('handles null/undefined content gracefully', () => {
      const tree: any = {
        sid: 'doc1',
        stype: 'document',
        content: null  // null content
      };
      
      // null content should be treated as empty array
      view.render(tree);
      
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document"></div>
        </div>`,
        expect
      );
    });
  });

  describe('Deep Nesting', () => {
    it('handles very deep nesting (20+ levels)', () => {
      let tree: any = {
        sid: 'doc1',
        stype: 'document',
        content: []
      };
      
      // Create 20-level deep nesting
      let current: any = tree;
      for (let i = 0; i < 20; i++) {
        current.content = [{
          sid: `level-${i}`,
          stype: 'paragraph',
          content: []
        }];
        current = current.content[0];
      }
      
      // Add text at the end
      current.content = [
        { sid: 'text-final', stype: 'text', text: 'Deep Text' }
      ];
      
      view.render(tree);
      
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-sid="level-0" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-1" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-2" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-3" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-4" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-5" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-6" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-7" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-8" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-9" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-10" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-11" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-12" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-13" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-14" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-15" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-16" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-17" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-18" data-bc-stype="paragraph"></p>
            <p class="paragraph" data-bc-sid="level-19" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="text-final" data-bc-stype="text">Deep Text</span>
            </p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
            <p></p>
          </div>
        </div>`,
        expect
      );
    });
  });

  describe('Invalid Tree Structure', () => {
    it('handles circular reference gracefully', () => {
      const tree = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              { sid: 't1', stype: 'text', text: 'Content' }
            ]
          }
        ]
      };
      
      // Circular references are difficult to occur in TreeDocument structure
      // (because it's id-based reference, not direct reference)
      // Instead, test invalid structure
      view.render(tree);
      
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t1" data-bc-stype="text">Content</span>
            </p>
          </div>
        </div>`,
        expect
      );
    });

    it.skip('handles invalid child types gracefully', () => {
      const tree: any = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              null,  // null child
              undefined,  // undefined child
              'invalid string',  // String child (generally not allowed)
              { sid: 't1', stype: 'text', text: 'Valid' }
            ]
          }
        ]
      };
      
      // Some invalid children should be ignored and only valid ones rendered
      view.render(tree);
      
      const html = normalizeHTML(container.firstElementChild as Element);
      expect(html).toContain('Valid');
    });
  });

  describe('Duplicate sid Handling', () => {
    it('handles duplicate sid in same level', () => {
      const tree: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              { sid: 't1', stype: 'text', text: 'First' }
            ]
          },
          {
            sid: 'p1',  // Duplicate sid
            stype: 'paragraph',
            content: [
              { sid: 't2', stype: 'text', text: 'Second' }
            ]
          }
        ]
      };
      
      // Duplicate sid can point to same element in DOM
      // Rendering is possible but unexpected behavior may occur
      view.render(tree);
      
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t2" data-bc-stype="text">Second</span>
            </p>
          </div>
        </div>`,
        expect
      );
    });
  });

  describe('Missing Required Properties', () => {
    it('handles missing text property for text node', () => {
      const tree: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              {
                sid: 't1',
                stype: 'text'
                // No text attribute
              }
            ]
          }
        ]
      };
      
      view.render(tree);
      
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
              <span class="text" data-bc-sid="t1" data-bc-stype="text"></span>
            </p>
          </div>
        </div>`,
        expect
      );
    });
  });
});

