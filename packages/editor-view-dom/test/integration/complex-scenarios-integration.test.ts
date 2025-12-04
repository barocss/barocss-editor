import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { normalizeHTML } from '../utils/html';
import { define, element, slot, when, each, data, getGlobalRegistry } from '@barocss/dsl';
import type { ComponentProps, ModelData } from '@barocss/dsl';

describe('EditorViewDOM + renderer-dom Complex Scenarios Integration', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  let registry: ReturnType<typeof getGlobalRegistry>;
  
  beforeEach(() => {
    registry = getGlobalRegistry();
    
    // 컴포넌트 정의
    if (!registry.has('document')) {
      define('document', element('div', { className: 'document' }, [slot('content')]));
    }
    if (!registry.has('list')) {
      define('list', element('ul', { className: 'list' }, [slot('content')]));
    }
    if (!registry.has('listItem')) {
      define('listItem', element('li', { className: 'list-item' }, [slot('content')]));
    }
    if (!registry.has('text')) {
      define('text', element('span', { className: 'text' }, [data('text')]));
    }
    
    container = document.createElement('div');
    document.body.appendChild(container);
    
    const dataStore = new DataStore();
    editor = new Editor({ dataStore });
    view = new EditorViewDOM(editor, { 
      container,
      autoRender: false,
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

  describe('List Operations', () => {
    it('dynamically adds list items', () => {
      const tree1: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'list1',
            stype: 'list',
            attributes: { type: 'ordered' },
            content: [
              {
                sid: 'li1',
                stype: 'listItem',
                content: [
                  { sid: 't1', stype: 'text', text: 'Item 1' }
                ]
              }
            ]
          }
        ]
      };

      view.render(tree1);
      const html1 = normalizeHTML(container.firstElementChild as Element);
      expect(html1).toContain('Item 1');

      // 아이템 추가
      const tree2: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'list1',
            stype: 'list',
            attributes: { type: 'ordered' },
            content: [
              {
                sid: 'li1',
                stype: 'listItem',
                content: [
                  { sid: 't1', stype: 'text', text: 'Item 1' }
                ]
              },
              {
                sid: 'li2',
                stype: 'listItem',
                content: [
                  { sid: 't2', stype: 'text', text: 'Item 2' }
                ]
              }
            ]
          }
        ]
      };

      view.render(tree2);
      const html2 = normalizeHTML(container.firstElementChild as Element);
      expect(html2).toContain('Item 1');
      expect(html2).toContain('Item 2');
    });

    it('removes list items', () => {
      const tree1: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'list1',
            stype: 'list',
            attributes: { type: 'ordered' },
            content: [
              {
                sid: 'li1',
                stype: 'listItem',
                content: [
                  { sid: 't1', stype: 'text', text: 'Item 1' }
                ]
              },
              {
                sid: 'li2',
                stype: 'listItem',
                content: [
                  { sid: 't2', stype: 'text', text: 'Item 2' }
                ]
              }
            ]
          }
        ]
      };

      view.render(tree1);
      const html1 = normalizeHTML(container.firstElementChild as Element);
      expect(html1).toContain('Item 2');

      // 아이템 제거
      const tree2: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'list1',
            stype: 'list',
            attributes: { type: 'ordered' },
            content: [
              {
                sid: 'li1',
                stype: 'listItem',
                content: [
                  { sid: 't1', stype: 'text', text: 'Item 1' }
                ]
              }
            ]
          }
        ]
      };

      view.render(tree2);
      const html2 = normalizeHTML(container.firstElementChild as Element);
      expect(html2).toContain('Item 1');
      expect(html2).not.toContain('Item 2');
    });

    it('reorders list items', () => {
      const tree1: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'list1',
            stype: 'list',
            attributes: { type: 'ordered' },
            content: [
              {
                sid: 'li1',
                stype: 'listItem',
                content: [
                  { sid: 't1', stype: 'text', text: 'Item 1' }
                ]
              },
              {
                sid: 'li2',
                stype: 'listItem',
                content: [
                  { sid: 't2', stype: 'text', text: 'Item 2' }
                ]
              }
            ]
          }
        ]
      };

      view.render(tree1);
      const li1El = container.querySelector('[data-bc-sid="li1"]');
      const li2El = container.querySelector('[data-bc-sid="li2"]');
      expect(li1El).toBeTruthy();
      expect(li2El).toBeTruthy();

      // 순서 변경
      const tree2: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'list1',
            stype: 'list',
            attributes: { type: 'ordered' },
            content: [
              {
                sid: 'li2',
                stype: 'listItem',
                content: [
                  { sid: 't2', stype: 'text', text: 'Item 2' }
                ]
              },
              {
                sid: 'li1',
                stype: 'listItem',
                content: [
                  { sid: 't1', stype: 'text', text: 'Item 1' }
                ]
              }
            ]
          }
        ]
      };

      view.render(tree2);
      const li1ElAfter = container.querySelector('[data-bc-sid="li1"]');
      const li2ElAfter = container.querySelector('[data-bc-sid="li2"]');

      // DOM 요소는 재사용되어야 함
      expect(li1ElAfter).toBe(li1El);
      expect(li2ElAfter).toBe(li2El);
    });
  });

  describe('Nested Lists', () => {
    it('renders nested list structure', () => {
      const tree: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'list1',
            stype: 'list',
            attributes: { type: 'ordered' },
            content: [
              {
                sid: 'li1',
                stype: 'listItem',
                content: [
                  { sid: 't1', stype: 'text', text: 'Level 1' },
                  {
                    sid: 'list2',
                    stype: 'list',
                    attributes: { type: 'bullet' },
                    content: [
                      {
                        sid: 'li2',
                        stype: 'listItem',
                        content: [
                          { sid: 't2', stype: 'text', text: 'Level 2' }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };

      view.render(tree);

      const html = normalizeHTML(container.firstElementChild as Element);
      expect(html).toContain('data-bc-sid="list1"');
      expect(html).toContain('data-bc-sid="list2"');
      expect(html).toContain('Level 1');
      expect(html).toContain('Level 2');
    });
  });

  describe('Dynamic Attributes and Styles', () => {
    it('updates element attributes dynamically', () => {
      define('dynamic-box', (_p: ComponentProps, m: ModelData) => {
        return element('div', {
          className: m.className as string,
          style: m.style as string
        }, [m.text ?? '']);
      });

      const tree1: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'box1',
            stype: 'dynamic-box',
            attributes: {
              className: 'box-a',
              style: 'color: red;',
              text: 'Content'
            }
          }
        ]
      };

      view.render(tree1);
      const boxEl1 = container.querySelector('[data-bc-sid="box1"]') as HTMLElement;
      expect(boxEl1).toBeTruthy();

      const tree2: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'box1',
            stype: 'dynamic-box',
            attributes: {
              className: 'box-b',
              style: 'color: blue;',
              text: 'Content'
            }
          }
        ]
      };

      view.render(tree2);
      const boxEl2 = container.querySelector('[data-bc-sid="box1"]') as HTMLElement;

      // DOM 요소는 재사용되어야 함
      expect(boxEl2).toBe(boxEl1);
    });
  });

  describe('Conditional Rendering', () => {
    it.skip('renders conditionally based on model data', () => {
      define('conditional-view', (_p: ComponentProps, m: ModelData) => {
        return element('div', { className: 'container' }, [
          when(
            () => (m as any).showHeader,
            element('h1', {}, [(m as any).title ?? ''])
          ),
          element('p', {}, [m.text ?? ''])
        ]);
      });

      const tree1: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'view1',
            stype: 'conditional-view',
            attributes: {
              showHeader: true,
              title: 'Title',
              text: 'Content'
            }
          }
        ]
      };

      view.render(tree1);
      const html1 = normalizeHTML(container.firstElementChild as Element);
      expect(html1).toContain('Title');
      expect(html1).toContain('Content');

      // Header 숨김
      const tree2: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'view1',
            stype: 'conditional-view',
            attributes: {
              showHeader: false,
              title: 'Title',
              text: 'Content'
            }
          }
        ]
      };

      view.render(tree2);
      const html2 = normalizeHTML(container.firstElementChild as Element);
      expect(html2).not.toContain('Title');
      expect(html2).toContain('Content');
    });
  });

  describe('Iterative Rendering', () => {
    it.skip('renders items using each', () => {
      define('item-list', (_p: ComponentProps, m: ModelData) => {
        return element('ul', { className: 'list' }, [
          each(
            'items',  // data에서 가져올 배열의 이름
            (item: any) => element('li', {}, [item.name || ''])  // 각 아이템을 렌더링하는 함수
          )
        ]);
      });

      const tree1: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'list1',
            stype: 'item-list',
            attributes: {
              items: [
                { name: 'Item A' },
                { name: 'Item B' }
              ]
            }
          }
        ]
      };

      view.render(tree1);
      const html1 = normalizeHTML(container.firstElementChild as Element);
      expect(html1).toContain('Item A');
      expect(html1).toContain('Item B');

      // 아이템 추가
      const tree2: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'list1',
            stype: 'item-list',
            attributes: {
              items: [
                { name: 'Item A' },
                { name: 'Item B' },
                { name: 'Item C' }
              ]
            }
          }
        ]
      };

      view.render(tree2);
      const html2 = normalizeHTML(container.firstElementChild as Element);
      expect(html2).toContain('Item A');
      expect(html2).toContain('Item B');
      expect(html2).toContain('Item C');
    });
  });
});

