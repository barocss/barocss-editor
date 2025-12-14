// Editor demo bundle for Docsify
// This file will be bundled into a single JS file that can be loaded in the browser

import { DataStore } from '@barocss/datastore';
import { Editor } from '@barocss/editor-core';
import { createCoreExtensions, createBasicExtensions } from '@barocss/extensions';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createSchema } from '@barocss/schema';
import { define, element, slot, data, attr, defineMark, getGlobalRegistry } from '@barocss/dsl';

// Simple schema for demo
function createDemoSchema() {
  return createSchema("demo", {
    topNode: "document",
    nodes: {
      document: { name: "document", group: "document", content: "block+" },
      heading: { name: "heading", group: "block", content: "inline*", attrs: { level: { type: "number", required: true } } },
      paragraph: { name: "paragraph", group: "block", content: "inline*" },
      'inline-text': { name: 'inline-text', group: 'inline' },
    },
    marks: {
      bold: { name: "bold", group: "text-style" },
      italic: { name: "italic", group: "text-style" },
    },
  });
}

// Simple initial content
function createInitialContent() {
  return {
    sid: 'doc-1',
    stype: 'document',
    content: [
      {
        sid: 'h-1',
        stype: 'heading',
        attributes: { level: 1 },
        content: [
          { sid: 'text-h1', stype: 'inline-text', text: 'Barocss Editor Demo' }
        ]
      },
      {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          { sid: 'text-1', stype: 'inline-text', text: 'This is a ' },
          { sid: 'text-bold', stype: 'inline-text', text: 'bold text', marks: [{ stype: 'bold', range: [0, 9] }] },
          { sid: 'text-2', stype: 'inline-text', text: ' and this is ' },
          { sid: 'text-italic', stype: 'inline-text', text: 'italic text', marks: [{ stype: 'italic', range: [0, 11] }] },
          { sid: 'text-3', stype: 'inline-text', text: '. Try editing this text!' }
        ]
      }
    ]
  } as any;
}

// Define templates
function setupTemplates() {
  const registry = getGlobalRegistry();
  
  define('document', element('div', { className: 'document' }, [slot('content')]));
  define('heading', element((model: any) => `h${model.attributes?.level || 1}`, { className: 'heading' }, [slot('content')]));
  define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
  define('inline-text', element('span', { className: 'text' }, [data('text', '')]));
  
  defineMark('bold', element('strong', { className: 'mark-bold' }, [data('text')]));
  defineMark('italic', element('em', { className: 'mark-italic' }, [data('text')]));
}

// Initialize editor in a container
export function initEditorDemo(container: HTMLElement) {
  try {
    // Clear container
    container.innerHTML = '';
    
    // Setup templates
    setupTemplates();
    
    // Create schema and dataStore
    const schema = createDemoSchema();
    const dataStore = new DataStore(undefined, schema);
    const initialTree = createInitialContent();
    
    // Create editor
    const coreExtensions = createCoreExtensions();
    const basicExtensions = createBasicExtensions();
    const editor = new Editor({
      editable: true,
      schema,
      dataStore,
      extensions: [...coreExtensions, ...basicExtensions]
    });
    
    editor.loadDocument(initialTree, 'demo');
    
    // Create view
    const view = new EditorViewDOM(editor, {
      container,
      registry: getGlobalRegistry()
    });
    
    view.render();
    
    return { editor, view };
  } catch (error) {
    console.error('Failed to initialize editor demo:', error);
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #ef4444; border: 1px dashed #fca5a5; border-radius: 4px;">
        <p><strong>Error loading editor</strong></p>
        <p style="font-size: 0.875rem; margin-top: 0.5rem;">${error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    `;
    return null;
  }
}

// Auto-initialize if window is available
if (typeof window !== 'undefined') {
  (window as any).initEditorDemo = initEditorDemo;
}
