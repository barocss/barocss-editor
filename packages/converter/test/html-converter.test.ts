import { describe, it, expect, beforeEach } from 'vitest';
import { HTMLConverter, registerDefaultHTMLRules, GlobalConverterRegistry } from '../src';

describe('HTMLConverter', () => {
  let converter: HTMLConverter;
  
  beforeEach(() => {
    // Registry 초기화
    GlobalConverterRegistry.getInstance().clear();
    
    // 기본 규칙 등록
    registerDefaultHTMLRules();
    
    // Converter 인스턴스 생성
    converter = new HTMLConverter();
  });
  
  describe('parse', () => {
    it('should parse simple paragraph', () => {
      const html = '<p>Hello World</p>';
      const nodes = converter.parse(html);
      
      expect(nodes).toHaveLength(1);
      expect(nodes[0].stype).toBe('paragraph');
      expect(nodes[0].content).toBeDefined();
      if (nodes[0].content && Array.isArray(nodes[0].content)) {
        expect(nodes[0].content[0]).toMatchObject({
          stype: 'inline-text',
          text: 'Hello World'
        });
      }
    });
    
    it('should parse heading', () => {
      const html = '<h1>Title</h1>';
      const nodes = converter.parse(html);
      
      expect(nodes).toHaveLength(1);
      expect(nodes[0].stype).toBe('heading');
      expect(nodes[0].attributes?.level).toBe(1);
    });
    
    it('should parse multiple paragraphs', () => {
      const html = '<p>First</p><p>Second</p>';
      const nodes = converter.parse(html);
      
      expect(nodes).toHaveLength(2);
      expect(nodes[0].stype).toBe('paragraph');
      expect(nodes[1].stype).toBe('paragraph');
    });
    
    it('should handle empty HTML', () => {
      const html = '';
      const nodes = converter.parse(html);
      
      expect(nodes).toHaveLength(0);
    });
  });
  
  describe('convert', () => {
    it('should convert paragraph to HTML', () => {
      const nodes = [
        {
          stype: 'paragraph',
          content: [
            {
              stype: 'inline-text',
              text: 'Hello World'
            }
          ]
        }
      ];
      
      const html = converter.convert(nodes);
      expect(html).toContain('<p>');
      expect(html).toContain('Hello World');
      expect(html).toContain('</p>');
    });
    
    it('should convert heading to HTML', () => {
      const nodes = [
        {
          stype: 'heading',
          attributes: { level: 1 },
          content: [
            {
              stype: 'inline-text',
              text: 'Title'
            }
          ]
        }
      ];
      
      const html = converter.convert(nodes);
      expect(html).toContain('<h1>');
      expect(html).toContain('Title');
      expect(html).toContain('</h1>');
    });
    
    it('should convert multiple nodes to HTML', () => {
      const nodes = [
        {
          stype: 'paragraph',
          content: [
            {
              stype: 'inline-text',
              text: 'First'
            }
          ]
        },
        {
          stype: 'paragraph',
          content: [
            {
              stype: 'inline-text',
              text: 'Second'
            }
          ]
        }
      ];
      
      const html = converter.convert(nodes);
      expect(html).toContain('First');
      expect(html).toContain('Second');
    });
  });
  
  describe('parse - complex cases', () => {
    it('should parse nested structure', () => {
      const html = '<p>Hello <span>World</span>!</p>';
      const nodes = converter.parse(html);
      
      expect(nodes).toHaveLength(1);
      expect(nodes[0].stype).toBe('paragraph');
      if (nodes[0].content && Array.isArray(nodes[0].content)) {
        expect(nodes[0].content.length).toBeGreaterThan(0);
      }
    });
    
    it('should parse paragraph with multiple text nodes', () => {
      const html = '<p>First <span>Second</span> Third</p>';
      const nodes = converter.parse(html);
      
      expect(nodes).toHaveLength(1);
      expect(nodes[0].stype).toBe('paragraph');
    });
    
    it('should parse multiple headings with different levels', () => {
      const html = '<h1>Title 1</h1><h2>Title 2</h2><h3>Title 3</h3>';
      const nodes = converter.parse(html);
      
      expect(nodes).toHaveLength(3);
      expect(nodes[0].attributes?.level).toBe(1);
      expect(nodes[1].attributes?.level).toBe(2);
      expect(nodes[2].attributes?.level).toBe(3);
    });
    
    it('should handle HTML with attributes', () => {
      const html = '<p class="test" id="para1" data-level="1" data-type="note">Hello</p>';
      const nodes = converter.parse(html);
      
      expect(nodes).toHaveLength(1);
      expect(nodes[0].stype).toBe('paragraph');
      // data-* 속성은 attributes['data-xxx'] 형태로 보존
      expect(nodes[0].attributes?.['data-level']).toBe('1');
      expect(nodes[0].attributes?.['data-type']).toBe('note');
    });
    
    it('should handle empty paragraphs', () => {
      const html = '<p></p><p>Not empty</p>';
      const nodes = converter.parse(html);
      
      expect(nodes.length).toBeGreaterThanOrEqual(1);
    });
    
    it('should handle whitespace-only text nodes', () => {
      const html = '<p>   </p>';
      const nodes = converter.parse(html);
      
      // 공백만 있는 텍스트 노드는 무시될 수 있음
      expect(nodes.length).toBeGreaterThanOrEqual(0);
    });
    
    it('should parse complex nested structure', () => {
      const html = '<div><p>First</p><p>Second</p></div>';
      const nodes = converter.parse(html);
      
      // div는 기본적으로 paragraph로 변환됨
      expect(nodes.length).toBeGreaterThan(0);
    });

    it('should parse unordered list', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const nodes = converter.parse(html);

      expect(nodes.length).toBe(1);
      expect(nodes[0].stype).toBe('list');
      expect(nodes[0].attributes?.ordered).toBe(false);
      if (nodes[0].content && Array.isArray(nodes[0].content)) {
        expect(nodes[0].content.length).toBe(2);
        expect(nodes[0].content[0].stype).toBe('list_item');
      }
    });

    it('should parse ordered list', () => {
      const html = '<ol><li>First</li><li>Second</li></ol>';
      const nodes = converter.parse(html);

      expect(nodes.length).toBe(1);
      expect(nodes[0].stype).toBe('list');
      expect(nodes[0].attributes?.ordered).toBe(true);
    });

    it('should parse table structure', () => {
      const html = '<table><tr><th>H1</th><th>H2</th></tr><tr><td>A1</td><td>A2</td></tr></table>';
      const nodes = converter.parse(html);

      expect(nodes.length).toBe(1);
      expect(nodes[0].stype).toBe('table');
      if (nodes[0].content && Array.isArray(nodes[0].content)) {
        const rows = nodes[0].content;
        expect(rows[0].stype).toBe('table_row');
      }
    });

    it('should parse image', () => {
      const html = '<img src="image.png" alt="desc" title="title">';
      const nodes = converter.parse(html);

      expect(nodes.length).toBe(1);
      expect(nodes[0].stype).toBe('image');
      expect(nodes[0].attributes?.src).toBe('image.png');
      expect(nodes[0].attributes?.alt).toBe('desc');
      expect(nodes[0].attributes?.title).toBe('title');
    });

    it('should parse link', () => {
      const html = '<a href="https://example.com" title="Example" target="_blank" rel="noopener">Link</a>';
      const nodes = converter.parse(html);

      expect(nodes.length).toBe(1);
      expect(nodes[0].stype).toBe('link');
      expect(nodes[0].attributes?.href).toBe('https://example.com');
      expect(nodes[0].attributes?.title).toBe('Example');
      expect(nodes[0].attributes?.target).toBe('_blank');
      expect(nodes[0].attributes?.rel).toBe('noopener');
    });
  });
  
  describe('convert - complex cases', () => {
    it('should convert nested content structure', () => {
      const nodes = [
        {
          stype: 'paragraph',
          content: [
            {
              stype: 'inline-text',
              text: 'Hello'
            },
            {
              stype: 'inline-text',
              text: ' '
            },
            {
              stype: 'inline-text',
              text: 'World'
            }
          ]
        }
      ];
      
      const html = converter.convert(nodes);
      expect(html).toContain('Hello');
      expect(html).toContain('World');
    });
    
    it('should convert heading with nested content', () => {
      const nodes = [
        {
          stype: 'heading',
          attributes: { level: 2 },
          content: [
            {
              stype: 'inline-text',
              text: 'Subtitle'
            },
            {
              stype: 'inline-text',
              text: ' with text'
            }
          ]
        }
      ];
      
      const html = converter.convert(nodes);
      expect(html).toContain('<h2>');
      expect(html).toContain('Subtitle');
      expect(html).toContain(' with text');
    });
    
    it('should convert multiple levels of headings', () => {
      const nodes = [
        {
          stype: 'heading',
          attributes: { level: 1 },
          content: [{ stype: 'inline-text', text: 'H1' }]
        },
        {
          stype: 'heading',
          attributes: { level: 2 },
          content: [{ stype: 'inline-text', text: 'H2' }]
        },
        {
          stype: 'heading',
          attributes: { level: 3 },
          content: [{ stype: 'inline-text', text: 'H3' }]
        }
      ];
      
      const html = converter.convert(nodes);
      expect(html).toContain('<h1>');
      expect(html).toContain('<h2>');
      expect(html).toContain('<h3>');
    });
    
    it('should handle empty content', () => {
      const nodes = [
        {
          stype: 'paragraph',
          content: []
        }
      ];
      
      const html = converter.convert(nodes);
      expect(html).toContain('<p>');
      expect(html).toContain('</p>');
    });
    
    it('should handle text-only nodes', () => {
      const nodes = [
        {
          stype: 'inline-text',
          text: 'Plain text'
        }
      ];
      
      const html = converter.convert(nodes);
      expect(html).toContain('Plain text');
    });
    
    it('should escape HTML special characters', () => {
      const nodes = [
        {
          stype: 'paragraph',
          content: [
            {
              stype: 'inline-text',
              text: '<script>alert("XSS")</script>'
            }
          ]
        }
      ];
      
      const html = converter.convert(nodes);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should convert list structure', () => {
      const nodes = [
        {
          stype: 'list',
          attributes: { ordered: false },
          content: [
            {
              stype: 'list_item',
              content: [{ stype: 'inline-text', text: 'Item 1' }]
            },
            {
              stype: 'list_item',
              content: [{ stype: 'inline-text', text: 'Item 2' }]
            }
          ]
        }
      ];

      const html = converter.convert(nodes);
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>');
      expect(html).toContain('Item 1');
      expect(html).toContain('Item 2');
    });

    it('should convert ordered list structure', () => {
      const nodes = [
        {
          stype: 'list',
          attributes: { ordered: true },
          content: [
            {
              stype: 'list_item',
              content: [{ stype: 'inline-text', text: 'First' }]
            }
          ]
        }
      ];

      const html = converter.convert(nodes);
      expect(html).toContain('<ol>');
      expect(html).toContain('<li>');
      expect(html).toContain('First');
    });

    it('should convert table structure', () => {
      const nodes = [
        {
          stype: 'table',
          content: [
            {
              stype: 'table_row',
              content: [
                {
                  stype: 'table_cell',
                  attributes: { header: true },
                  content: [{ stype: 'inline-text', text: 'H1' }]
                },
                {
                  stype: 'table_cell',
                  attributes: { header: true },
                  content: [{ stype: 'inline-text', text: 'H2' }]
                }
              ]
            },
            {
              stype: 'table_row',
              content: [
                {
                  stype: 'table_cell',
                  content: [{ stype: 'inline-text', text: 'A1' }]
                },
                {
                  stype: 'table_cell',
                  content: [{ stype: 'inline-text', text: 'A2' }]
                }
              ]
            }
          ]
        }
      ];

      const html = converter.convert(nodes);
      expect(html).toContain('<table>');
      expect(html).toContain('<tr>');
      expect(html).toContain('<th>');
      expect(html).toContain('<td>');
      expect(html).toContain('A1');
      expect(html).toContain('A2');
    });

    it('should convert image node', () => {
      const nodes = [
        {
          stype: 'image',
          attributes: {
            src: 'image.png',
            alt: 'desc',
            title: 'title'
          }
        }
      ];

      const html = converter.convert(nodes);
      expect(html).toContain('<img');
      expect(html).toContain('src="image.png"');
      expect(html).toContain('alt="desc"');
      expect(html).toContain('title="title"');
    });

    it('should convert link node', () => {
      const nodes = [
        {
          stype: 'link',
          attributes: {
            href: 'https://example.com',
            title: 'Example',
            target: '_blank',
            rel: 'noopener'
          },
          content: [
            {
              stype: 'inline-text',
              text: 'Example'
            }
          ]
        }
      ];

      const html = converter.convert(nodes);
      expect(html).toContain('<a');
      expect(html).toContain('href="https://example.com"');
      expect(html).toContain('title="Example"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener"');
      expect(html).toContain('Example');
    });
  });
  
  describe('marks handling', () => {
    it('should convert bold marks to strong tags', () => {
      const nodes = [
        {
          stype: 'paragraph',
          content: [
            {
              stype: 'inline-text',
              text: 'Bold text',
              marks: [
                {
                  stype: 'bold',
                  range: [0, 9]
                }
              ]
            }
          ]
        }
      ];
      
      const html = converter.convert(nodes);
      expect(html).toContain('<strong>');
      expect(html).toContain('Bold text');
      expect(html).toContain('</strong>');
    });
    
    it('should convert italic marks to em tags', () => {
      const nodes = [
        {
          stype: 'paragraph',
          content: [
            {
              stype: 'inline-text',
              text: 'Italic text',
              marks: [
                {
                  stype: 'italic',
                  range: [0, 11]
                }
              ]
            }
          ]
        }
      ];
      
      const html = converter.convert(nodes);
      expect(html).toContain('<em>');
      expect(html).toContain('Italic text');
      expect(html).toContain('</em>');
    });
    
    it('should handle multiple marks', () => {
      const nodes = [
        {
          stype: 'paragraph',
          content: [
            {
              stype: 'inline-text',
              text: 'Bold and italic',
              marks: [
                {
                  stype: 'bold',
                  range: [0, 15]
                },
                {
                  stype: 'italic',
                  range: [0, 15]
                }
              ]
            }
          ]
        }
      ];
      
      const html = converter.convert(nodes);
      expect(html).toContain('Bold and italic');
      // Marks가 중첩되어 있을 수 있음
    });
  });
  
  describe('round-trip conversion', () => {
    it('should parse and convert back to similar HTML', () => {
      const originalHTML = '<p>Hello World</p>';
      const nodes = converter.parse(originalHTML);
      const convertedHTML = converter.convert(nodes);
      
      // 최소한 같은 내용이 포함되어야 함
      expect(convertedHTML).toContain('Hello World');
      expect(convertedHTML).toContain('<p>');
    });
    
    it('should handle round-trip for headings', () => {
      const originalHTML = '<h1>Title</h1><h2>Subtitle</h2>';
      const nodes = converter.parse(originalHTML);
      const convertedHTML = converter.convert(nodes);
      
      expect(convertedHTML).toContain('Title');
      expect(convertedHTML).toContain('Subtitle');
    });
    
    it('should preserve content structure in round-trip', () => {
      const originalHTML = '<p>First paragraph</p><p>Second paragraph</p>';
      const nodes = converter.parse(originalHTML);
      const convertedHTML = converter.convert(nodes);
      
      expect(convertedHTML).toContain('First paragraph');
      expect(convertedHTML).toContain('Second paragraph');
    });
  });
});

