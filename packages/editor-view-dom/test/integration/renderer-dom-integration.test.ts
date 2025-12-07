import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { normalizeHTML } from '../utils/html';
import { define, element, data, defineMark, getGlobalRegistry, slot } from '@barocss/dsl';

describe('EditorViewDOM + renderer-dom Integration', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  let registry: ReturnType<typeof getGlobalRegistry>;
  
  beforeEach(() => {
    registry = getGlobalRegistry();
    
    // Define components
    if (!registry.has('document')) {
      define('document', element('div', { className: 'document' }, [slot('content')]));
    }
    if (!registry.has('paragraph')) {
      define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    }
    if (!registry.has('heading')) {
      define('heading', element('h1', { className: 'heading' }, [slot('content')]));
    }
    if (!registry.has('text')) {
      define('text', element('span', { className: 'text' }, [data('text')]));
    }
    if (!registry.has('inline-text')) {
      define('inline-text', element('span', { className: 'text' }, [data('text')]));
    }
    
    // Define marks
    if (!registry.has('bold')) {
      defineMark('bold', element('strong', { className: 'mark-bold' }, [data('text')]));
    }
    
    container = document.createElement('div');
    document.body.appendChild(container);
    
    const dataStore = new DataStore();
    editor = new Editor({ dataStore });
    view = new EditorViewDOM(editor, { 
      container,
      autoRender: false, // Test with manual rendering
      registry
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
  
  it('renders simple paragraph', () => {
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
                stype: 'text',
              text: 'Hello World'
            }
          ]
        }
      ]
    };
    
    view.render(tree);
    
    const html = normalizeHTML(container.firstElementChild as Element);
    expect(html).toContain('data-bc-sid="doc1"');
    expect(html).toContain('data-bc-sid="p1"');
    expect(html).toContain('Hello World');
  });
  
  it('renders document with headings and paragraphs', () => {
    const tree: TreeDocument = {
      sid: 'doc1',
      stype: 'document',
      content: [
        {
          sid: 'h1',
          stype: 'heading',
          attributes: { level: 1 },
          content: [
            { sid: 't1', stype: 'text', text: 'Title' }
          ]
        },
        {
            sid: 'p1',
            stype: 'paragraph',
          content: [
            { sid: 't2', stype: 'text', text: 'Content' }
          ]
        }
      ]
    };
    
    view.render(tree);
    
    const html = normalizeHTML(container.firstElementChild as Element);
    expect(html).toContain('data-bc-sid="doc1"');
    expect(html).toContain('data-bc-sid="h1"');
    expect(html).toContain('data-bc-sid="p1"');
    expect(html).toContain('Title');
    expect(html).toContain('Content');
  });
  
  it('renders nested structure correctly', () => {
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
                stype: 'text',
              text: 'Hello '
            },
            {
              sid: 't2',
              stype: 'text',
              text: 'World'
            }
          ]
        }
      ]
    };
    
    view.render(tree);
    
    const html = normalizeHTML(container.firstElementChild as Element);
    expect(html).toContain('data-bc-sid="doc1"');
    expect(html).toContain('data-bc-sid="p1"');
    expect(html).toContain('Hello');
    expect(html).toContain('World');
  });
  
  it('renders text with marks', () => {
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
              stype: 'inline-text',
              text: 'Hello World',
              marks: [
                { type: 'bold', range: [0, 5] }
              ]
            }
          ]
        }
      ]
    };
    
    view.render(tree);
    
    const html = normalizeHTML(container.firstElementChild as Element);
    expect(html).toContain('data-bc-sid="doc1"');
    expect(html).toContain('data-bc-sid="p1"');
    // Verify text with marks applied
    expect(html).toContain('Hello');
  });
  
  it('updates content correctly', () => {
    const tree1: TreeDocument = {
      sid: 'doc1',
      stype: 'document',
      content: [
        {
            sid: 'p1',
            stype: 'paragraph',
          content: [
            { sid: 't1', stype: 'text', text: 'First' }
          ]
        }
      ]
    };
    
    view.render(tree1);
    
    const html1 = normalizeHTML(container.firstElementChild as Element);
    expect(html1).toContain('data-bc-sid="p1"');
    expect(html1).toContain('First');
    
    // Update
    const tree2: TreeDocument = {
      sid: 'doc1',
      stype: 'document',
      content: [
        {
            sid: 'p1',
            stype: 'paragraph',
          content: [
            { sid: 't1', stype: 'text', text: 'Second' }
          ]
        }
      ]
    };
    
    view.render(tree2);
    
    const html2 = normalizeHTML(container.firstElementChild as Element);
    expect(html2).toContain('data-bc-sid="p1"');
    expect(html2).toContain('Second');
    expect(html2).not.toContain('First');
  });
  
  it('preserves DOM element identity when sid is unchanged', () => {
    const tree1: TreeDocument = {
      sid: 'doc1',
      stype: 'document',
      content: [
        {
            sid: 'p1',
            stype: 'paragraph',
          content: [
            { sid: 't1', stype: 'text', text: 'First' }
          ]
        }
      ]
    };
    
    view.render(tree1);
    
    const element1 = container.querySelector('[data-bc-sid="p1"]');
    expect(element1).toBeTruthy();
    
    // Update with same sid
    const tree2: TreeDocument = {
      sid: 'doc1',
      stype: 'document',
      content: [
        {
            sid: 'p1',
            stype: 'paragraph',
          content: [
            { sid: 't1', stype: 'text', text: 'Second' }
          ]
        }
      ]
    };
    
    view.render(tree2);
    
    const element2 = container.querySelector('[data-bc-sid="p1"]');
    expect(element2).toBeTruthy();
    // Should be the same DOM element (reused based on sid)
    expect(element2).toBe(element1);
  });
  
  it('handles empty document', () => {
    const tree: TreeDocument = {
      sid: 'doc1',
      stype: 'document',
      content: []
    };
    
    view.render(tree);
    
    const html = normalizeHTML(container.firstElementChild as Element);
    expect(html).toContain('data-bc-sid="doc1"');
  });
  
  it('handles document without content property', () => {
    const tree: TreeDocument = {
      sid: 'doc1',
      stype: 'document'
    };
    
    view.render(tree);
    
    const html = normalizeHTML(container.firstElementChild as Element);
    expect(html).toContain('data-bc-sid="doc1"');
  });
});

