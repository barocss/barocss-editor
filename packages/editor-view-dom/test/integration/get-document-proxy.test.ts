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

    // main.ts와 동일한 schema 생성
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

    // 기본 노드 정의
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
    // main.ts와 동일한 초기화 순서
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

    // loadDocument 호출
    editor.loadDocument(initialTree, 'decorator-test');

    // _rootId가 설정되었는지 확인
    const rootId = (editor as any).getRootId();
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

    // dataStore에 rootNode가 있는지 확인
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

    // getDocumentProxy()가 null이 아닌지 확인
    const proxy = editor.getDocumentProxy?.();
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

    // tree 없이 render() 호출 (main.ts와 동일)
    view.render();

    // content layer에 내용이 렌더링되었는지 확인
    expect(view.layers.content).toBeDefined();
    expect(view.layers.content.innerHTML).toContain('Hello World');
  });

  it('should handle null getDocumentProxy gracefully', () => {
    // schema 없이 DataStore 생성 (잘못된 케이스)
    dataStore = new DataStore();
    editor = new Editor({ editable: true, dataStore });

    // loadDocument 없이 EditorViewDOM 생성
    view = new EditorViewDOM(editor, {
      container,
      registry: getGlobalRegistry()
    });

    // render() 호출 시 getDocumentProxy()가 null을 반환할 수 있음
    view.render();

    // null이어도 에러가 발생하지 않아야 함
    expect(view.layers.content).toBeDefined();
  });

  it('should fail when dataStore is missing schema', () => {
    // schema 없이 DataStore 생성
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

    // schema 없이 loadDocument 호출
    editor.loadDocument(initialTree, 'decorator-test');

    // getDocumentProxy()가 null을 반환할 수 있음
    const proxy = editor.getDocumentProxy?.();
    // schema가 없어도 노드는 로드되므로 null이 아닐 수 있음
    // 하지만 실제 동작을 확인해야 함
    console.log('Proxy without schema:', proxy);
  });

  it('should reproduce main.ts scenario exactly', () => {
    // main.ts와 정확히 동일한 순서로 재현
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

    // main.ts와 동일: tree 없이 render() 호출
    view.render();

    // 디버깅 정보 출력
    const rootId = (editor as any).getRootId();
    const rootNode = dataStore.getRootNode();
    const proxy = editor.getDocumentProxy?.();

    console.log('Debug info:', {
      rootId,
      rootNodeSid: rootNode?.sid,
      proxySid: proxy?.sid,
      hasDataStore: !!editor.dataStore,
      hasSchema: !!schema,
      dataStoreRootNodeId: (dataStore as any).rootNodeId
    });

    // 검증
    expect(rootId).toBe('doc-1');
    expect(rootNode).toBeDefined();
    expect(rootNode?.sid).toBe('doc-1');
    expect(proxy).not.toBeNull();
    expect(proxy?.sid).toBe('doc-1');
  });
});

