import { describe, it, expect, beforeEach } from 'vitest';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { Editor } from '@barocss/editor-core';
import { DataStore } from '@barocss/datastore';
import { define, element, defineDecorator, getGlobalRegistry, slot, text, data } from '@barocss/dsl';
import type { ModelData } from '@barocss/dsl';
import { expectHTML } from '../utils/html';

describe('Inline Position Decorator (before/after)', () => {
  let view: EditorViewDOM;
  let editor: Editor;
  let registry: ReturnType<typeof getGlobalRegistry>;

  beforeEach(() => {
    registry = getGlobalRegistry();
    
    // 기본 노드 정의
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
    
    // Chip decorator 정의
    defineDecorator('chip', element('span', {
      className: 'chip',
      style: {
        display: 'inline-block',
        backgroundColor: '#e3f2fd',
        color: '#1976d2',
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: '500',
        margin: '0 2px'
      }
    }, [text('CHIP')]));
    
    const dataStore = new DataStore();
    editor = new Editor({ editable: true, dataStore });
    view = new EditorViewDOM(editor, { 
      container: document.createElement('div'),
      registry 
    });
  });

  it('inline decorator with position "before" should be inserted before text', async () => {
    const tree: ModelData = {
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
    
    // Chip decorator with position 'before' 추가
    view.addDecorator({
      sid: 'chip-before',
      stype: 'chip',
      category: 'inline',
      target: { sid: 't1', startOffset: 0, endOffset: 5 }, // "Hello"
      data: {},
      position: 'before'
    });
    
    view.render(tree, { sync: true });
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // Chip이 "Hello" 앞에 삽입되어야 함
    expectHTML(
      view.layers.content,
      `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
        <div class="document" data-bc-sid="doc1" data-bc-stype="document">
          <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
            <span class="text" data-bc-sid="t1" data-bc-stype="inline-text">
              <span class="chip" data-decorator="true" data-decorator-category="inline" data-decorator-position="before" data-decorator-sid="chip-before" data-decorator-stype="chip" data-skip-reconcile="true" style="display: inline-block; background-color: rgb(227, 242, 253); color: rgb(25, 118, 210); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; margin: 0px 2px;">CHIP</span>
              <span>Hello</span>
              <span>World</span>
            </span>
          </p>
        </div>
      </div>`,
      expect
    );
  });

  it('inline decorator with position "after" should be inserted after text', async () => {
    const tree: ModelData = {
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
    
    // Chip decorator with position 'after' 추가
    view.addDecorator({
      sid: 'chip-after',
      stype: 'chip',
      category: 'inline',
      target: { sid: 't1', startOffset: 6, endOffset: 11 }, // "World"
      data: {},
      position: 'after'
    });
    
    view.render(tree, { sync: true });
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // Chip이 "World" 뒤에 삽입되어야 함
    expectHTML(
      view.layers.content,
      `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
        <div class="document" data-bc-sid="doc1" data-bc-stype="document">
          <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
            <span class="text" data-bc-sid="t1" data-bc-stype="inline-text">
              <span>Hello</span>
              <span>World</span>
              <span class="chip" data-decorator="true" data-decorator-category="inline" data-decorator-position="after" data-decorator-sid="chip-after" data-decorator-stype="chip" data-skip-reconcile="true" style="display: inline-block; background-color: rgb(227, 242, 253); color: rgb(25, 118, 210); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; margin: 0px 2px;">CHIP</span>
            </span>
          </p>
        </div>
      </div>`,
      expect
    );
  });

  it('multiple inline decorators with before/after positions should work correctly', async () => {
    const tree: ModelData = {
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
    
    // 두 개의 chip decorator 추가
    view.addDecorator({
      sid: 'chip-before',
      stype: 'chip',
      category: 'inline',
      target: { sid: 't1', startOffset: 0, endOffset: 5 }, // "Hello"
      data: {},
      position: 'before'
    });
    
    view.addDecorator({
      sid: 'chip-after',
      stype: 'chip',
      category: 'inline',
      target: { sid: 't1', startOffset: 6, endOffset: 11 }, // "World"
      data: {},
      position: 'after'
    });
    
    view.render(tree, { sync: true });
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // 두 chip이 모두 올바른 위치에 삽입되어야 함
    expectHTML(
      view.layers.content,
      `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
        <div class="document" data-bc-sid="doc1" data-bc-stype="document">
          <p class="paragraph" data-bc-sid="p1" data-bc-stype="paragraph">
            <span class="text" data-bc-sid="t1" data-bc-stype="inline-text">
              <span class="chip" data-decorator="true" data-decorator-category="inline" data-decorator-position="before" data-decorator-sid="chip-before" data-decorator-stype="chip" data-skip-reconcile="true" style="display: inline-block; background-color: rgb(227, 242, 253); color: rgb(25, 118, 210); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; margin: 0px 2px;">CHIP</span>
              <span>Hello</span>
              <span></span>
              <span>World</span>
              <span class="chip" data-decorator="true" data-decorator-category="inline" data-decorator-position="after" data-decorator-sid="chip-after" data-decorator-stype="chip" data-skip-reconcile="true" style="display: inline-block; background-color: rgb(227, 242, 253); color: rgb(25, 118, 210); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; margin: 0px 2px;">CHIP</span>
            </span>
          </p>
        </div>
      </div>`,
      expect
    );
  });

  it('should handle text-14 scenario from main.ts (Inline before/after 테스트: Hello World)', async () => {
    // main.ts의 text-14와 동일한 시나리오
    const tree: ModelData = {
      sid: 'doc-1',
      stype: 'document',
      content: [
        {
          sid: 'p-6',
          stype: 'paragraph',
          content: [
            {
              sid: 'text-14',
              stype: 'inline-text',
              text: 'Inline before/after 테스트: Hello World'
            }
          ]
        }
      ]
    };
    
    // main.ts와 동일한 오프셋 계산 로직
    const findNodeBySid = (node: any, sid: string): any | null => {
      if (!node) return null;
      if (node.sid === sid) return node;
      const children = node.content || node.children || [];
      for (const ch of children) {
        const found = findNodeBySid(ch, sid);
        if (found) return found;
      }
      return null;
    };
    const t14Node = findNodeBySid(tree, 'text-14');
    const t14Text: string = (t14Node && typeof t14Node.text === 'string') ? t14Node.text : '';
    const helloStart = t14Text.indexOf('Hello');
    const worldStart = t14Text.indexOf('World');
    
    // main.ts와 동일한 decorator 추가
    if (helloStart >= 0) {
      view.addDecorator({
        sid: 'chip-before',
        stype: 'chip',
        category: 'inline',
        target: { sid: 'text-14', startOffset: helloStart, endOffset: helloStart + 'Hello'.length },
        data: {},
        position: 'before'
      });
    }
    
    if (worldStart >= 0) {
      view.addDecorator({
        sid: 'chip-after',
        stype: 'chip',
        category: 'inline',
        target: { sid: 'text-14', startOffset: worldStart, endOffset: worldStart + 'World'.length },
        data: {},
        position: 'after'
      });
    }
    
    view.render(tree, { sync: true });
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // "Hello" 앞에 chip-before, "World" 뒤에 chip-after가 있어야 함
    const contentHTML = view.layers.content.innerHTML;
    expect(contentHTML).toContain('data-decorator-sid="chip-before"');
    expect(contentHTML).toContain('data-decorator-sid="chip-after"');
    expect(contentHTML).toContain('Inline before/after 테스트:');
    expect(contentHTML).toContain('Hello');
    expect(contentHTML).toContain('World');
    
    // chip-before가 "Hello" 앞에 있는지 확인
    const text14Element = view.layers.content.querySelector('[data-bc-sid="text-14"]');
    expect(text14Element).toBeTruthy();
    if (text14Element) {
      const children = Array.from(text14Element.children);
      const helloIndex = children.findIndex(el => el.textContent?.includes('Hello'));
      const chipBeforeIndex = children.findIndex(el => el.getAttribute('data-decorator-sid') === 'chip-before');
      const chipAfterIndex = children.findIndex(el => el.getAttribute('data-decorator-sid') === 'chip-after');
      
      // chip-before는 "Hello"를 포함하는 요소보다 앞에 있어야 함
      if (helloIndex >= 0 && chipBeforeIndex >= 0) {
        expect(chipBeforeIndex).toBeLessThan(helloIndex);
      }
      
      // chip-after는 "World"를 포함하는 요소보다 뒤에 있어야 함
      const worldIndex = children.findIndex(el => el.textContent?.includes('World'));
      if (worldIndex >= 0 && chipAfterIndex >= 0) {
        expect(chipAfterIndex).toBeGreaterThan(worldIndex);
      }
    }
  });

  it('should handle multiple decorators on same text with different positions', async () => {
    const tree: ModelData = {
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
              text: 'First Second Third'
            }
          ]
        }
      ]
    };
    
    // "First" 앞에 chip
    view.addDecorator({
      sid: 'chip-first-before',
      stype: 'chip',
      category: 'inline',
      target: { sid: 't1', startOffset: 0, endOffset: 5 }, // "First"
      data: {},
      position: 'before'
    });
    
    // "Second" 뒤에 chip
    view.addDecorator({
      sid: 'chip-second-after',
      stype: 'chip',
      category: 'inline',
      target: { sid: 't1', startOffset: 6, endOffset: 12 }, // "Second"
      data: {},
      position: 'after'
    });
    
    // "Third" 앞에 chip
    view.addDecorator({
      sid: 'chip-third-before',
      stype: 'chip',
      category: 'inline',
      target: { sid: 't1', startOffset: 13, endOffset: 18 }, // "Third"
      data: {},
      position: 'before'
    });
    
    view.render(tree, { sync: true });
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    const contentHTML = view.layers.content.innerHTML;
    expect(contentHTML).toContain('data-decorator-sid="chip-first-before"');
    expect(contentHTML).toContain('data-decorator-sid="chip-second-after"');
    expect(contentHTML).toContain('data-decorator-sid="chip-third-before"');
  });

  it('should handle decorators on text with Korean characters', async () => {
    const tree: ModelData = {
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
              text: '안녕하세요 세계'
            }
          ]
        }
      ]
    };
    
    const text = '안녕하세요 세계';
    const helloStart = text.indexOf('안녕');
    const worldStart = text.indexOf('세계');
    
    if (helloStart >= 0) {
      view.addDecorator({
        sid: 'chip-before',
        stype: 'chip',
        category: 'inline',
        target: { sid: 't1', startOffset: helloStart, endOffset: helloStart + '안녕'.length },
        data: {},
        position: 'before'
      });
    }
    
    if (worldStart >= 0) {
      view.addDecorator({
        sid: 'chip-after',
        stype: 'chip',
        category: 'inline',
        target: { sid: 't1', startOffset: worldStart, endOffset: worldStart + '세계'.length },
        data: {},
        position: 'after'
      });
    }
    
    view.render(tree, { sync: true });
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    const contentHTML = view.layers.content.innerHTML;
    expect(contentHTML).toContain('data-decorator-sid="chip-before"');
    expect(contentHTML).toContain('data-decorator-sid="chip-after"');
    // 텍스트가 분리되어 렌더링될 수 있으므로 부분 문자열 확인
    expect(contentHTML).toContain('안녕');
    expect(contentHTML).toContain('하세요');
    expect(contentHTML).toContain('세계');
  });
});

