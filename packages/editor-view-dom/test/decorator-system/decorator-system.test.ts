/**
 * Decorator 시스템 테스트
 * 
 * 현재 구조: EditorViewDOM을 통해 decorator 관리
 * - DecoratorManager: 로컬 decorator CRUD
 * - RemoteDecoratorManager: 원격 decorator 관리
 * - renderer-dom을 통한 통합 렌더링
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { DataStore } from '@barocss/datastore';

describe('DecoratorManager - 기본 CRUD', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    const dataStore = new DataStore();
    editor = new Editor({ dataStore });
    view = new EditorViewDOM(editor, { 
      container,
      autoRender: false
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
    view.defineDecoratorType('highlight', 'block', {
      description: 'Highlight block decorator',
      dataSchema: {
        color: { type: 'string', default: 'yellow' }
      }
    });
    view.defineDecoratorType('underline', 'inline', {
      description: 'Underline decorator',
      dataSchema: {}
    });
    view.defineDecoratorType('comment', 'layer', {
      description: 'Comment layer decorator',
      dataSchema: {
        text: { type: 'string', required: true }
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

  it('should add decorator', () => {
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
    expect(layerDecorators[0].sid).toBe('layer-1');
    
    const inlineDecorators = view.decoratorManager.getByCategory('inline');
    expect(inlineDecorators).toHaveLength(1);
    expect(inlineDecorators[0].sid).toBe('inline-1');
  });
});

describe('RemoteDecoratorManager', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    const dataStore = new DataStore();
    editor = new Editor({ dataStore });
    view = new EditorViewDOM(editor, { 
      container,
      autoRender: false
    });
    
    // Define decorator types (optional - only when validation is desired)
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

  it('should add remote decorator', () => {
    const decorator = {
      sid: 'remote-1',
      stype: 'comment',
      category: 'layer' as const,
      target: { sid: 'p1' },
      data: { text: 'Remote comment' }
    };
    
    view.remoteDecoratorManager.setRemoteDecorator(decorator, {
      userId: 'user-1',
      sessionId: 'session-1'
    });
    
    const all = view.remoteDecoratorManager.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].sid).toBe('remote-1');
  });

  it('should remove remote decorator by owner', () => {
    view.remoteDecoratorManager.setRemoteDecorator(
      {
        sid: 'remote-1',
        stype: 'comment',
        category: 'layer',
        target: { sid: 'p1' },
        data: {}
      },
      { userId: 'user-1', sessionId: 'session-1' }
    );
    
    view.remoteDecoratorManager.setRemoteDecorator(
      {
        sid: 'remote-2',
        stype: 'highlight',
        category: 'layer',
        target: { sid: 'p2' },
        data: {}
      },
      { userId: 'user-2', sessionId: 'session-2' }
    );
    
    expect(view.remoteDecoratorManager.getAll()).toHaveLength(2);
    
    // removeByOwner only accepts userId
    view.remoteDecoratorManager.removeByOwner('user-1');
    
    const remaining = view.remoteDecoratorManager.getAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].sid).toBe('remote-2');
  });
});

describe('DecoratorRegistry - Type validation', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    const dataStore = new DataStore();
    editor = new Editor({ dataStore });
    view = new EditorViewDOM(editor, { 
      container,
      autoRender: false
    });
    
    // Type definition (for validation testing)
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

  it('should validate decorator with defined types', () => {
    // If type is defined, validation is performed
    expect(() => {
      view.addDecorator({
        sid: 'd1',
        stype: 'highlight',
        category: 'inline',
        target: { sid: 't1', startOffset: 0, endOffset: 5 },
        data: {}  // color defaults to 'yellow'
      });
    }).not.toThrow();
    
    const decorator = view.decoratorManager.get('d1');
    expect(decorator?.data?.color).toBe('yellow');  // Verify default value applied
  });

  it('should allow decorator without type definition', () => {
    // Can be used even if type is not defined (optional type system)
    expect(() => {
      view.addDecorator({
        sid: 'd2',
        stype: 'unknown-type',  // Undefined type
        category: 'inline',
        target: { sid: 't1', startOffset: 0, endOffset: 5 },
        data: { custom: 'value' }
      });
    }).not.toThrow();
  });

  it('should register custom decorator type', () => {
    view.defineDecoratorType('custom-widget', 'inline', {
      description: 'Custom widget decorator',
      dataSchema: {
        text: { type: 'string', required: true }
      }
    });
    
    expect(() => {
      view.addDecorator({
        sid: 'd1',
        stype: 'custom-widget',
        category: 'inline',
        target: { sid: 't1', startOffset: 0, endOffset: 5 },
        data: { text: 'Custom widget' }
      });
    }).not.toThrow();
  });
});

