/**
 * Layer별 렌더링 테스트
 * 
 * 최종 문서에 따른 layer별 DOMRenderer 구조 테스트
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { DataStore } from '@barocss/datastore';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { getGlobalRegistry, define, defineDecorator, element, slot, data } from '@barocss/dsl';
import { expectHTML } from '../utils/html';

describe('Layer별 렌더링', () => {
  let container: HTMLElement;
  let editor: Editor;
  let view: EditorViewDOM;
  let registry: ReturnType<typeof getGlobalRegistry>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    registry = getGlobalRegistry();
    
    // Define basic node types (using element(), registry not passed - automatically registered to globalRegistry)
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'inline-text' }, [data('text')]));
    
    // Define Decorator types (registry not passed)
    defineDecorator('cursor', element('div', {
      className: 'cursor',
      style: { position: 'absolute', width: '2px', height: '18px', background: 'blue' }
    }));
    
    defineDecorator('highlight', element('span', {
      className: 'highlight',
      style: { background: 'yellow' }
    }));
    
    editor = new Editor({ dataStore: new DataStore() });
    view = new EditorViewDOM(editor, { container, registry });
    
    // Register Decorator types
    view.defineDecoratorType('cursor', 'layer', {
      description: 'Cursor decorator'
    });
    
    view.defineDecoratorType('highlight', 'inline', {
      description: 'Highlight decorator'
    });
  });

  it('Content 레이어 먼저 렌더링되어야 함', async () => {
    // Create test data directly (remove dependency on editor.loadDocument())
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
    
    // Call render() directly to test content rendering
    view.render(tree);
    
    // Wait for requestAnimationFrame to complete (for decorator layer rendering, not needed in this test but for consistency)
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // Content should be rendered in Content layer
    expectHTML(
      view.layers.content,
      `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
  <div class="document" data-bc-sid="doc1" data-bc-stype="document">
    <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
      <span class="inline-text" data-bc-sid="t1" data-bc-stype="inline-text">Hello World</span>
    </p>
  </div>
</div>`,
      expect
    );
  });

  it('Layer decorator는 decorator 레이어에 렌더링되어야 함', async () => {
    // Create test data directly
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
              text: 'Hello'
            }
          ]
        }
      ]
    };
    
    // 1. Render Content first (needed for decorator position calculation)
    view.render(tree);
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 2. Add Layer decorator (addDecorator automatically calls render())
    view.addDecorator({
      sid: 'cursor-1',
      stype: 'cursor',
      category: 'layer',
      layerTarget: 'decorator',
      data: {
        position: { top: 10, left: 20, width: 2, height: 18 }
      }
    });
    
    // 3. Wait for requestAnimationFrame to complete (decorator layer rendering)
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 4. Cursor should be rendered in Decorator layer
    expectHTML(
      view.layers.decorator,
      `<div class="barocss-editor-decorators" data-bc-layer="decorator" style="position: absolute; top: 0px; left: 0px; right: 0px; bottom: 0px; pointer-events: none; z-index: 10;">
  <div 
    class="cursor" 
    data-bc-sid="cursor-1" 
    data-bc-stype="cursor" 
    data-decorator="true" 
    data-skip-reconcile="true" 
    style="position: absolute; width: 2px; height: 18px; background: blue;">
  </div>
</div>`,
      expect
    );
  });

  it('Inline decorator는 content 레이어에만 렌더링되어야 함', async () => {
    // Create test data directly
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
    
    // 1. Render Content first (needed because inline decorator is rendered in content layer)
    view.render(tree);
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 2. Add Inline decorator (addDecorator automatically calls render())
    view.addDecorator({
      sid: 'highlight-1',
      stype: 'highlight',
      category: 'inline',
      layerTarget: 'content',
      target: {
        sid: 't1',
        startOffset: 0,
        endOffset: 5
      },
      data: { color: 'yellow' }
    });
    
    // 3. Wait for requestAnimationFrame to complete (content layer re-rendering)
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 4. Highlight should be rendered in Content layer (inline decorator is rendered inside content layer)
    // Actual rendering structure: inline decorator is rendered directly inside content layer
    expectHTML(
      view.layers.content,
      `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
  <div class="document" data-bc-sid="doc1" data-bc-stype="document">
    <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
      <span class="inline-text" data-bc-sid="t1" data-bc-stype="inline-text">
        <span class="highlight" data-decorator="true" data-decorator-category="inline" data-decorator-sid="highlight-1" data-decorator-stype="highlight" data-skip-reconcile="true" style="background: yellow;"><span>Hello</span></span>
    <span>World</span>
      </span>
    </p>
  </div>
</div>`,
      expect
    );
    
    // 5. Inline decorator should not exist in other layers
    expectHTML(
      view.layers.decorator,
      `<div 
  class="barocss-editor-decorators" 
  data-bc-layer="decorator" 
  style="position: absolute; top: 0px; left: 0px; right: 0px; bottom: 0px; pointer-events: none; z-index: 10;">
</div>`,
      expect
    );
  });

  it('여러 레이어에 decorator가 동시에 렌더링되어야 함', async () => {
    // Create test data directly
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
    
    // 1. Render Content first
    view.render(tree);
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 2. Add decorators to multiple layers (addDecorator automatically calls render())
    view.addDecorator({
      sid: 'cursor-1',
      stype: 'cursor',
      category: 'layer',
      layerTarget: 'decorator',
      data: {
        position: { top: 10, left: 20, width: 2, height: 18 }
      }
    });
    
    view.addDecorator({
      sid: 'highlight-1',
      stype: 'highlight',
      category: 'inline',
      layerTarget: 'content',
      target: {
        sid: 't1',
        startOffset: 0,
        endOffset: 5
      },
      data: { color: 'yellow' }
    });
    
    // 3. Wait for requestAnimationFrame to complete (all layers rendering)
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 4. Inline decorator should be rendered in Content layer
    // Actual rendering structure: inline decorator is rendered directly inside content layer
    expectHTML(
      view.layers.content,
      `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
  <div class="document" data-bc-sid="doc1" data-bc-stype="document">
    <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
      <span class="inline-text" data-bc-sid="t1" data-bc-stype="inline-text">
        <span class="highlight" data-decorator="true" data-decorator-category="inline" data-decorator-sid="highlight-1" data-decorator-stype="highlight" data-skip-reconcile="true" style="background: yellow;"><span>Hello</span></span>
    <span>World</span>
      </span>
    </p>
  </div>
</div>`,
      expect
    );
    
    // 5. Layer decorator should be rendered in Decorator layer
    expectHTML(
      view.layers.decorator,
      `<div 
  class="barocss-editor-decorators" 
  data-bc-layer="decorator" 
  style="position: absolute; top: 0px; left: 0px; right: 0px; bottom: 0px; pointer-events: none; z-index: 10;">
  <div 
    class="cursor" 
    data-bc-sid="cursor-1" 
    data-bc-stype="cursor" 
    data-decorator="true" 
    data-skip-reconcile="true" 
    style="position: absolute; width: 2px; height: 18px; background: blue;">
  </div>
</div>`,
      expect
    );
  });
});

