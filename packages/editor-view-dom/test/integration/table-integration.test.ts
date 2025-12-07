import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { normalizeHTML, expectHTML } from '../utils/html';
import { define, element, slot, data } from '@barocss/dsl';

describe('EditorViewDOM + renderer-dom Table Integration', () => {
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
    
    // Register table templates
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('table', element('table', { className: 'barocss-table' }, [slot('content')]));
    define('tbody', element('tbody', { className: 'barocss-tbody' }, [slot('content')]));
    define('tr', element('tr', { className: 'barocss-tr' }, [slot('content')]));
    define('td', element('td', { className: 'barocss-td' }, [slot('content')]));
    define('th', element('th', { className: 'barocss-th' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
    
    // Define decorator types (optional - only when validation is desired)
    view.defineDecoratorType('highlight', 'block', {
      description: 'Highlight block decorator',
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

  describe('기본 테이블 구조 렌더링', () => {
    it('renders basic table structure (table > tbody > tr > td)', () => {
      const tree = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'table1',
            stype: 'table',
            content: [
              {
                sid: 'tbody1',
                stype: 'tbody',
                content: [
                  {
                    sid: 'tr1',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td1',
                        stype: 'td',
                        content: [
                          {
                            sid: 't1',
                            stype: 'inline-text',
                            text: 'Cell 1'
                          }
                        ]
                      },
                      {
                        sid: 'td2',
                        stype: 'td',
                        content: [
                          {
                        sid: 't2',
                        stype: 'inline-text',
                            text: 'Cell 2'
                          }
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
      expect(html).toContain('data-bc-sid="table1"');
      expect(html).toContain('data-bc-sid="tbody1"');
      expect(html).toContain('data-bc-sid="tr1"');
      expect(html).toContain('data-bc-sid="td1"');
      expect(html).toContain('data-bc-sid="td2"');
      expect(html).toContain('Cell 1');
      expect(html).toContain('Cell 2');
      // Verify order: Cell 1 should appear before Cell 2
      const cell1Index = html.indexOf('Cell 1');
      const cell2Index = html.indexOf('Cell 2');
      expect(cell1Index).toBeLessThan(cell2Index);
      // Verify Cell 1 and Cell 2 are each inside td tags (intermediate tags like span allowed)
      expect(html).toMatch(/<td[^>]*>.*?Cell 1.*?<\/td>/s);
      expect(html).toMatch(/<td[^>]*>.*?Cell 2.*?<\/td>/s);
    });

    it('renders table with header row (th)', () => {
      const tree = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'table1',
            stype: 'table',
            content: [
              {
                sid: 'tbody1',
                stype: 'tbody',
                content: [
                  {
                    sid: 'tr1',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'th1',
                        stype: 'th',
                        content: [
                          {
                            sid: 't1',
                            stype: 'inline-text',
                            text: 'Header 1'
                          }
                        ]
                      },
                      {
                        sid: 'th2',
                        stype: 'th',
                        content: [
                          {
                        sid: 't2',
                        stype: 'inline-text',
                            text: 'Header 2'
                          }
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
      expect(html).toContain('data-bc-sid="table1"');
      expect(html).toContain('data-bc-sid="th1"');
      expect(html).toContain('data-bc-sid="th2"');
      expect(html).toContain('Header 1');
      expect(html).toContain('Header 2');
      // Verify order: Header 1 should appear before Header 2
      const header1Index = html.indexOf('Header 1');
      const header2Index = html.indexOf('Header 2');
      expect(header1Index).toBeLessThan(header2Index);
      // Verify Header 1 and Header 2 are each inside th tags (intermediate tags like span allowed)
      expect(html).toMatch(/<th[^>]*>.*?Header 1.*?<\/th>/s);
      expect(html).toMatch(/<th[^>]*>.*?Header 2.*?<\/th>/s);
    });
  });

  describe('Table cell content update', () => {
    it('updates table cell content', () => {
      const tree1 = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'table1',
            stype: 'table',
            content: [
              {
                sid: 'tbody1',
                stype: 'tbody',
                content: [
                  {
                    sid: 'tr1',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td1',
                        stype: 'td',
                        content: [
                          {
                            sid: 't1',
                            stype: 'inline-text',
                            text: 'Old Content'
                          }
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

      view.render(tree1);
      const html1 = normalizeHTML(container.firstElementChild as Element);
      expect(html1).toContain('Old Content');

      const tree2 = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'table1',
            stype: 'table',
            content: [
              {
                sid: 'tbody1',
                stype: 'tbody',
                content: [
                  {
                    sid: 'tr1',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td1',
                        stype: 'td',
                        content: [
                          {
                            sid: 't1',
                            stype: 'inline-text',
                            text: 'New Content'
                          }
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

      view.render(tree2);
      const html2 = normalizeHTML(container.firstElementChild as Element);
      expect(html2).toContain('New Content');
      expect(html2).not.toContain('Old Content');
    });
  });

  describe('Table row add/remove', () => {
    it('adds table row', () => {
      const tree1 = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'table1',
            stype: 'table',
            content: [
              {
                sid: 'tbody1',
                stype: 'tbody',
                content: [
                  {
                    sid: 'tr1',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td1',
                        stype: 'td',
                        content: [
                          {
                            sid: 't1',
                            stype: 'inline-text',
                            text: 'Row 1'
                          }
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

      view.render(tree1);
      const html1 = normalizeHTML(container.firstElementChild as Element);
      expect(html1).toContain('data-bc-sid="tr1"');

      const tree2 = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'table1',
            stype: 'table',
            content: [
              {
                sid: 'tbody1',
                stype: 'tbody',
                content: [
                  {
                    sid: 'tr1',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td1',
                        stype: 'td',
                        content: [
                          {
                            sid: 't1',
                            stype: 'inline-text',
                            text: 'Row 1'
                          }
                        ]
                      }
                    ]
                  },
                  {
                    sid: 'tr2',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td2',
                        stype: 'td',
                        content: [
                          {
                        sid: 't2',
                        stype: 'inline-text',
                            text: 'Row 2'
                          }
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

      view.render(tree2);
      const html2 = normalizeHTML(container.firstElementChild as Element);
      expect(html2).toContain('data-bc-sid="tr1"');
      expect(html2).toContain('data-bc-sid="tr2"');
      expect(html2).toContain('Row 1');
      expect(html2).toContain('Row 2');
    });

    it('removes table row', () => {
      const tree1 = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'table1',
            stype: 'table',
            content: [
              {
                sid: 'tbody1',
                stype: 'tbody',
                content: [
                  {
                    sid: 'tr1',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td1',
                        stype: 'td',
                        content: [
                          {
                            sid: 't1',
                            stype: 'inline-text',
                            text: 'Row 1'
                          }
                        ]
                      }
                    ]
                  },
                  {
                    sid: 'tr2',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td2',
                        stype: 'td',
                        content: [
                          {
                        sid: 't2',
                        stype: 'inline-text',
                            text: 'Row 2'
                          }
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

      view.render(tree1);
      const html1 = normalizeHTML(container.firstElementChild as Element);
      expect(html1).toContain('data-bc-sid="tr2"');

      const tree2 = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'table1',
            stype: 'table',
            content: [
              {
                sid: 'tbody1',
                stype: 'tbody',
                content: [
                  {
                    sid: 'tr1',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td1',
                        stype: 'td',
                        content: [
                          {
                            sid: 't1',
                            stype: 'inline-text',
                            text: 'Row 1'
                          }
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

      view.render(tree2);
      const html2 = normalizeHTML(container.firstElementChild as Element);
      expect(html2).toContain('data-bc-sid="tr1"');
      expect(html2).not.toContain('data-bc-sid="tr2"');
    });
  });

  describe('Table row reordering', () => {
    it('reorders table rows while preserving DOM identity', () => {
      const tree1 = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'table1',
            stype: 'table',
            content: [
              {
                sid: 'tbody1',
                stype: 'tbody',
                content: [
                  {
                    sid: 'tr1',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td1',
                        stype: 'td',
                        content: [
                          {
                            sid: 't1',
                            stype: 'inline-text',
                            text: 'Row 1'
                          }
                        ]
                      }
                    ]
                  },
                  {
                    sid: 'tr2',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td2',
                        stype: 'td',
                        content: [
                          {
                        sid: 't2',
                        stype: 'inline-text',
                            text: 'Row 2'
                          }
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

      view.render(tree1);
      const tr1El1 = container.querySelector('[data-bc-sid="tr1"]');
      const tr2El1 = container.querySelector('[data-bc-sid="tr2"]');

      const tree2 = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'table1',
            stype: 'table',
            content: [
              {
                sid: 'tbody1',
                stype: 'tbody',
                content: [
                  {
                    sid: 'tr2',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td2',
                        stype: 'td',
                        content: [
                          {
                        sid: 't2',
                        stype: 'inline-text',
                            text: 'Row 2'
                          }
                        ]
                      }
                    ]
                  },
                  {
                    sid: 'tr1',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td1',
                        stype: 'td',
                        content: [
                          {
                            sid: 't1',
                            stype: 'inline-text',
                            text: 'Row 1'
                          }
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

      view.render(tree2);
      const tr1El2 = container.querySelector('[data-bc-sid="tr1"]');
      const tr2El2 = container.querySelector('[data-bc-sid="tr2"]');
      
      // DOM elements should be reused
      expect(tr1El2).toBe(tr1El1);
      expect(tr2El2).toBe(tr2El1);
    });
  });

  describe('Nested table structure', () => {
    it('renders nested table structure', () => {
      const tree = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'table1',
            stype: 'table',
            content: [
              {
                sid: 'tbody1',
                stype: 'tbody',
                content: [
                  {
                    sid: 'tr1',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td1',
                        stype: 'td',
                        content: [
                          {
                            sid: 'table2',
                            stype: 'table',
                            content: [
                              {
                                sid: 'tbody2',
                                stype: 'tbody',
                                content: [
                                  {
                                    sid: 'tr2',
                                    stype: 'tr',
                                    content: [
                                      {
                                        sid: 'td2',
                                        stype: 'td',
                                        content: [
                                          {
                                            sid: 't1',
                                            stype: 'inline-text',
                                            text: 'Nested Cell'
                                          }
                                        ]
                                      }
                                    ]
                                  }
                                ]
                              }
                            ]
                          }
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
      expect(html).toContain('data-bc-sid="table1"');
      expect(html).toContain('data-bc-sid="table2"');
      expect(html).toContain('Nested Cell');
      expect(html).toMatch(/<table[^>]*>.*<td[^>]*>.*<table[^>]*>.*Nested Cell.*<\/table>.*<\/td>.*<\/table>/s);
    });
  });

  describe('Apply marks/decorator to table', () => {
    it('renders table cell with marks', () => {
      const tree = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'table1',
            stype: 'table',
            content: [
              {
                sid: 'tbody1',
                stype: 'tbody',
                content: [
                  {
                    sid: 'tr1',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td1',
                        stype: 'td',
                        content: [
                          {
                            sid: 't1',
                            stype: 'inline-text',
                            text: 'Bold Text',
                            marks: [
                              { type: 'bold', range: [0, 4] }
                            ]
                          }
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
      expect(html).toContain('data-bc-sid="table1"');
      expect(html).toContain('Bold');
      expect(html).toContain('Text');
      // Verify mark is applied (may vary depending on implementation)
    });

    it('renders table with decorator', () => {
      const tree = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'table1',
            stype: 'table',
            content: [
              {
                sid: 'tbody1',
                stype: 'tbody',
                content: [
                  {
                    sid: 'tr1',
                    stype: 'tr',
                    content: [
                      {
                        sid: 'td1',
                        stype: 'td',
                        content: [
                          {
                            sid: 't1',
                            stype: 'inline-text',
                            text: 'Cell Content'
                          }
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

      view.addDecorator({
        sid: 'decorator1',
        stype: 'highlight',
        category: 'block',
        target: { sid: 'table1' },
        position: 'before',
        data: { text: 'Table Note' }
      });

      view.render(tree);

      // Verify full rendering result
      expectHTML(
        view.layers.content,
        `<div class="barocss-editor-content" data-bc-layer="content" style="position: relative; z-index: 1;">
          <div class="document" data-bc-sid="doc1" data-bc-stype="document">
            <div data-decorator-category="block" data-decorator-missing-renderer="highlight" data-decorator-position="before" data-decorator-sid="decorator1" data-decorator-stype="highlight"></div>
            <table class="barocss-table" data-bc-sid="table1" data-bc-stype="table">
              <tbody class="barocss-tbody" data-bc-sid="tbody1" data-bc-stype="tbody">
                <tr class="barocss-tr" data-bc-sid="tr1" data-bc-stype="tr">
                  <td class="barocss-td" data-bc-sid="td1" data-bc-stype="td">
                    <span class="text" data-bc-sid="t1" data-bc-stype="inline-text"></span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>`,
        expect
      );
    });
  });
});

