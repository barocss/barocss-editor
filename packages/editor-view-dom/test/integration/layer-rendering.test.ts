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
    
    // 기본 노드 타입 정의 (element() 사용, registry는 전달하지 않음 - globalRegistry에 자동 등록)
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'inline-text' }, [data('text')]));
    
    // Decorator 타입 정의 (registry는 전달하지 않음)
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
    
    // Decorator 타입 등록
    view.defineDecoratorType('cursor', 'layer', {
      description: 'Cursor decorator'
    });
    
    view.defineDecoratorType('highlight', 'inline', {
      description: 'Highlight decorator'
    });
  });

  it('Content 레이어 먼저 렌더링되어야 함', async () => {
    // 테스트용 데이터 직접 생성 (editor.loadDocument() 의존성 제거)
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
    
    // render() 직접 호출하여 content 렌더링 테스트
    view.render(tree);
    
    // requestAnimationFrame 완료 대기 (decorator 레이어 렌더링용, 이 테스트에서는 필요 없지만 일관성을 위해)
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // Content 레이어에 내용이 렌더링되어야 함
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
    // 테스트용 데이터 직접 생성
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
    
    // 1. Content 먼저 렌더링 (decorator 위치 계산을 위해 필요)
    view.render(tree);
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 2. Layer decorator 추가 (addDecorator가 자동으로 render() 호출)
    view.addDecorator({
      sid: 'cursor-1',
      stype: 'cursor',
      category: 'layer',
      layerTarget: 'decorator',
      data: {
        position: { top: 10, left: 20, width: 2, height: 18 }
      }
    });
    
    // 3. requestAnimationFrame 완료 대기 (decorator 레이어 렌더링)
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 4. Decorator 레이어에 cursor가 렌더링되어야 함
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
    // 테스트용 데이터 직접 생성
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
    
    // 1. Content 먼저 렌더링 (inline decorator가 content 레이어에 렌더링되므로 필요)
    view.render(tree);
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 2. Inline decorator 추가 (addDecorator가 자동으로 render() 호출)
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
    
    // 3. requestAnimationFrame 완료 대기 (content 레이어 재렌더링)
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 4. Content 레이어에 highlight가 렌더링되어야 함 (inline decorator는 content 레이어 내부에 렌더링됨)
    // 실제 렌더링 구조: inline decorator는 content 레이어 내부에 직접 렌더링됨
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
    
    // 5. 다른 레이어에는 inline decorator가 없어야 함
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
    // 테스트용 데이터 직접 생성
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
    
    // 1. Content 먼저 렌더링
    view.render(tree);
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 2. 여러 레이어에 decorator 추가 (addDecorator가 자동으로 render() 호출)
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
    
    // 3. requestAnimationFrame 완료 대기 (모든 레이어 렌더링)
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 4. Content 레이어에 inline decorator가 렌더링되어야 함
    // 실제 렌더링 구조: inline decorator는 content 레이어 내부에 직접 렌더링됨
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
    
    // 5. Decorator 레이어에 layer decorator가 렌더링되어야 함
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

