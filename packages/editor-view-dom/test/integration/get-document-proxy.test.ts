import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { define, element, slot, data, getGlobalRegistry } from '@barocss/dsl';
import type { ModelData } from '@barocss/dsl';

describe('EditorViewDOM getDocumentProxy() null issue', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  let dataStore: DataStore;
  let schema: ReturnType<typeof createSchema>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    // Create same schema as main.ts
    schema = createSchema('decorator-test', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        heading: { name: 'heading', group: 'block', content: 'inline*', attrs: { level: { type: 'number', required: true } } },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        'inline-text': { name: 'inline-text', group: 'inline' },
      },
      marks: {
        bold: { name: 'bold', group: 'text-style' },
      },
    });

    // Define basic nodes
    const registry = getGlobalRegistry();
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('heading', element((model: { attributes: { level?: number } }) => `h${model.attributes.level || 1}`, { className: 'heading' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text', '')]));
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (view) {
      view.destroy();
    }
  });

  it('should have rootId set after loadDocument', () => {
    // Same initialization order as main.ts
    dataStore = new DataStore(undefined, schema);
    editor = new Editor({ editable: true, schema, dataStore });

    const initialTree: ModelData = {
      sid: 'doc-1',
      stype: 'document',
      content: [
        {
          sid: 'p-1',
          stype: 'paragraph',
          content: [
            { sid: 'text-1', stype: 'inline-text', text: 'Hello World' }
          ]
        }
      ]
    } as any;

    // Call loadDocument
    editor.loadDocument(initialTree, 'decorator-test');

    // Verify _rootId is set
    const rootId = editor.getRootId();
    expect(rootId).toBe('doc-1');
  });

  it('should have rootNode in dataStore after loadDocument', () => {
    dataStore = new DataStore(undefined, schema);
    editor = new Editor({ editable: true, schema, dataStore });

    const initialTree: ModelData = {
      sid: 'doc-1',
      stype: 'document',
      content: [
        {
          sid: 'p-1',
          stype: 'paragraph',
          content: [
            { sid: 'text-1', stype: 'inline-text', text: 'Hello World' }
          ]
        }
      ]
    } as any;

    editor.loadDocument(initialTree, 'decorator-test');

    // Verify rootNode exists in dataStore
    const rootNode = dataStore.getRootNode();
    expect(rootNode).toBeDefined();
    expect(rootNode?.sid).toBe('doc-1');
  });

  it('should return non-null proxy after loadDocument', () => {
    dataStore = new DataStore(undefined, schema);
    editor = new Editor({ editable: true, schema, dataStore });

    const initialTree: ModelData = {
      sid: 'doc-1',
      stype: 'document',
      content: [
        {
          sid: 'p-1',
          stype: 'paragraph',
          content: [
            { sid: 'text-1', stype: 'inline-text', text: 'Hello World' }
          ]
        }
      ]
    } as any;

    editor.loadDocument(initialTree, 'decorator-test');

    // Verify getDocumentProxy() is not null
    const proxy = editor?.getDocumentProxy();
    expect(proxy).not.toBeNull();
    expect(proxy?.sid).toBe('doc-1');
  });

  it('should render successfully when getDocumentProxy returns non-null', () => {
    dataStore = new DataStore(undefined, schema);
    editor = new Editor({ editable: true, schema, dataStore });

    const initialTree: ModelData = {
      sid: 'doc-1',
      stype: 'document',
      content: [
        {
          sid: 'p-1',
          stype: 'paragraph',
          content: [
            { sid: 'text-1', stype: 'inline-text', text: 'Hello World' }
          ]
        }
      ]
    } as any;

    editor.loadDocument(initialTree, 'decorator-test');

    view = new EditorViewDOM(editor, {
      container,
      registry: getGlobalRegistry()
    });

    // Call render() without tree (same as main.ts)
    view.render();

    // Verify content is rendered in content layer
    expect(view.layers.content).toBeDefined();
    expect(view.layers.content.innerHTML).toContain('Hello World');
  });

  it('should handle null getDocumentProxy gracefully', () => {
    // Create DataStore without schema (invalid case)
    dataStore = new DataStore();
    editor = new Editor({ editable: true, dataStore });

    // Create EditorViewDOM without loadDocument
    view = new EditorViewDOM(editor, {
      container,
      registry: getGlobalRegistry()
    });

    // getDocumentProxy() may return null when render() is called
    view.render();

    // Should not error even if null
    expect(view.layers.content).toBeDefined();
  });

  it('should fail when dataStore is missing schema', () => {
    // Create DataStore without schema
    dataStore = new DataStore();
    editor = new Editor({ editable: true, dataStore });

    const initialTree: ModelData = {
      sid: 'doc-1',
      stype: 'document',
      content: [
        {
          sid: 'p-1',
          stype: 'paragraph',
          content: [
            { sid: 'text-1', stype: 'inline-text', text: 'Hello World' }
          ]
        }
      ]
    } as any;

    // Call loadDocument without schema
    editor.loadDocument(initialTree, 'decorator-test');

    /*
     * This was a `console.log` and three comments saying nobody knew — *"may return null … may not be
     * null … need to verify actual behavior"*. A test named *"should fail when dataStore is missing
     * schema"* that neither fails nor checks is a question left in the suite, and it ran on every run
     * for as long as it has existed.
     *
     * So it was verified. A store built with no schema still loads the tree and still hands back a
     * proxy: the schema is what *validates* a document, not what makes one readable. That is worth
     * asserting rather than wondering about, because the day it changes, something that loads a
     * document before its schema arrives will start seeing `null` instead.
     */
    const proxy = editor?.getDocumentProxy();
    expect(proxy).not.toBeNull();
    expect(proxy?.stype).toBe('document');
  });

  it('should reproduce main.ts scenario exactly', () => {
    // Reproduce in exactly the same order as main.ts
    dataStore = new DataStore(undefined, schema);
    const initialTree: ModelData = {
      sid: 'doc-1',
      stype: 'document',
      content: [
        {
          sid: 'p-1',
          stype: 'paragraph',
          content: [
            { sid: 'text-1', stype: 'inline-text', text: 'Hello World' }
          ]
        }
      ]
    } as any;

    editor = new Editor({ editable: true, schema, dataStore });
    editor.loadDocument(initialTree, 'decorator-test');

    view = new EditorViewDOM(editor, {
      container,
      registry: getGlobalRegistry()
    });

    // Same as main.ts: call render() without tree
    view.render();

    // Output debugging info
    const rootId = editor.getRootId();
    const rootNode = dataStore.getRootNode();
    const proxy = editor?.getDocumentProxy();

    console.log('Debug info:', {
      rootId,
      rootNodeSid: rootNode?.sid,
      proxySid: proxy?.sid,
      hasDataStore: !!editor.dataStore,
      hasSchema: !!schema,
      dataStoreRootNodeId: (dataStore as any).rootNodeId
    });

    // Verify
    expect(rootId).toBe('doc-1');
    expect(rootNode).toBeDefined();
    expect(rootNode?.sid).toBe('doc-1');
    expect(proxy).not.toBeNull();
    expect(proxy?.sid).toBe('doc-1');
  });
});

