import { defineParser, defineConverter } from '../api';

/**
 * Register default HTML conversion rules
 * Conversion rules for basic node types like paragraph, heading, bold, italic
 */
export function registerDefaultHTMLRules(): void {
  // === Parser Rules (HTML → Model) ===
  
  // Paragraph
  defineParser('paragraph', 'html', {
    parseDOM: [{ tag: 'p' }]
  });
  
  // Heading
  defineParser('heading', 'html', {
    parseDOM: [
      { tag: 'h1', getAttrs: () => ({ level: 1 }) },
      { tag: 'h2', getAttrs: () => ({ level: 2 }) },
      { tag: 'h3', getAttrs: () => ({ level: 3 }) },
      { tag: 'h4', getAttrs: () => ({ level: 4 }) },
      { tag: 'h5', getAttrs: () => ({ level: 5 }) },
      { tag: 'h6', getAttrs: () => ({ level: 6 }) }
    ]
  });
  
  // Inline Text
  defineParser('inline-text', 'html', {
    parseDOM: [
      { tag: 'span' }
    ],
    parseText: (text: string) => {
      if (!text.trim()) return null;
      return {
        stype: 'inline-text',
        text: text
      };
    }
  });

  // Link
  defineParser('link', 'html', {
    parseDOM: [
      {
        tag: 'a',
        getAttrs: (node) => {
          const href = node.getAttribute('href');
          if (!href) return null;
          const title = node.getAttribute('title') || undefined;
          const target = node.getAttribute('target') || undefined;
          const rel = node.getAttribute('rel') || undefined;
          return { href, title, target, rel };
        },
        priority: 100
      }
    ]
  });
  
  // Bold mark (from <strong> or <b> tags)
  defineParser('inline-text', 'html', {
    parseDOM: [
      { 
        tag: 'strong',
        getAttrs: () => ({ markType: 'bold' })
      },
      { 
        tag: 'b',
        getAttrs: () => ({ markType: 'bold' })
      }
    ],
    priority: 100
  });
  
  // Italic mark (from <em> or <i> tags)
  defineParser('inline-text', 'html', {
    parseDOM: [
      { 
        tag: 'em',
        getAttrs: () => ({ markType: 'italic' })
      },
      { 
        tag: 'i',
        getAttrs: () => ({ markType: 'italic' })
      }
    ],
    priority: 100
  });
  
  // List (ul / ol)
  defineParser('list', 'html', {
    parseDOM: [
      {
        tag: 'ul',
        getAttrs: () => ({ ordered: false })
      },
      {
        tag: 'ol',
        getAttrs: () => ({ ordered: true })
      }
    ]
  });

  // List Item
  defineParser('list_item', 'html', {
    parseDOM: [{ tag: 'li' }]
  });

  // Table
  defineParser('table', 'html', {
    parseDOM: [{ tag: 'table' }]
  });

  // Table Row
  defineParser('table_row', 'html', {
    parseDOM: [{ tag: 'tr' }]
  });

  // Table Cell (common for td/th)
  defineParser('table_cell', 'html', {
    parseDOM: [
      {
        tag: 'td'
      },
      {
        tag: 'th',
        getAttrs: () => ({ header: true })
      }
    ]
  });

  // Image
  defineParser('image', 'html', {
    parseDOM: [
      {
        tag: 'img',
        getAttrs: (node) => {
          const src = node.getAttribute('src');
          if (!src) return null;
          const alt = node.getAttribute('alt') || undefined;
          const title = node.getAttribute('title') || undefined;
          return { src, alt, title };
        }
      }
    ]
  });

  // === Converter Rules (Model → HTML) ===
  
  // Paragraph
  defineConverter('paragraph', 'html', {
    convert: (node) => {
      // Content conversion is handled recursively inside HTMLConverter
      // Here, only return placeholder (actual conversion performed in HTMLConverter._convertContentToHTML)
      return '<p>PLACEHOLDER_CONTENT</p>';
    }
  });
  
  // Heading
  defineConverter('heading', 'html', {
    convert: (node) => {
      const level = node.attributes?.level || 1;
      // Content conversion is handled recursively inside HTMLConverter
      return `<h${level}>PLACEHOLDER_CONTENT</h${level}>`;
    }
  });
  
  // Inline Text
  defineConverter('inline-text', 'html', {
    convert: (node) => {
      const text = node.text || '';
      const escaped = escapeHTML(text);
      
      // Process marks (bold, italic, etc.)
      let result = escaped;
      if (node.marks && node.marks.length > 0) {
        for (const mark of node.marks) {
          if (mark.stype === 'bold') {
            result = `<strong>${result}</strong>`;
          } else if (mark.stype === 'italic') {
            result = `<em>${result}</em>`;
          }
        }
      }
      
      return result;
    }
  });

  // List
  defineConverter('list', 'html', {
    convert: (node) => {
      const ordered = node.attributes?.ordered === true;
      const tag = ordered ? 'ol' : 'ul';
      return `<${tag}>PLACEHOLDER_CONTENT</${tag}>`;
    }
  });

  // List Item
  defineConverter('list_item', 'html', {
    convert: () => {
      return '<li>PLACEHOLDER_CONTENT</li>';
    }
  });

  // Table
  defineConverter('table', 'html', {
    convert: () => {
      return '<table>PLACEHOLDER_CONTENT</table>';
    }
  });

  // Table Row
  defineConverter('table_row', 'html', {
    convert: () => {
      return '<tr>PLACEHOLDER_CONTENT</tr>';
    }
  });

  // Table Cell
  defineConverter('table_cell', 'html', {
    convert: (node) => {
      const isHeader = node.attributes?.header === true;
      const tag = isHeader ? 'th' : 'td';
      return `<${tag}>PLACEHOLDER_CONTENT</${tag}>`;
    }
  });

  // Image
  defineConverter('image', 'html', {
    convert: (node) => {
      const attrs = node.attributes || {};
      const src = attrs.src || '';
      const alt = attrs.alt || '';
      const title = attrs.title || '';

      const escapedSrc = escapeHTML(String(src));
      const escapedAlt = escapeHTML(String(alt));
      const escapedTitle = title ? escapeHTML(String(title)) : '';

      const titleAttr = escapedTitle ? ` title="${escapedTitle}"` : '';
      return `<img src="${escapedSrc}" alt="${escapedAlt}"${titleAttr} />`;
    }
  });

  // Link
  defineConverter('link', 'html', {
    convert: (node) => {
      const attrs = node.attributes || {};
      const href = attrs.href || '';
      const title = attrs.title || '';
      const target = attrs.target || '';
      const rel = attrs.rel || '';

      const escapedHref = escapeHTML(String(href));
      const escapedTitle = title ? escapeHTML(String(title)) : '';
      const escapedTarget = target ? escapeHTML(String(target)) : '';
      const escapedRel = rel ? escapeHTML(String(rel)) : '';

      const titleAttr = escapedTitle ? ` title="${escapedTitle}"` : '';
      const targetAttr = escapedTarget ? ` target="${escapedTarget}"` : '';
      const relAttr = escapedRel ? ` rel="${escapedRel}"` : '';

      return `<a href="${escapedHref}"${titleAttr}${targetAttr}${relAttr}>PLACEHOLDER_CONTENT</a>`;
    }
  });
}

/**
 * Converts node content to HTML string
 * 
 * ⚠️ Warning: This function is only used during default rule registration.
 * Actual conversion is performed through registry in HTMLConverter.convert().
 */
function convertContentToHTML(content: (any | string)[]): string {
  const parts: string[] = [];
  
  for (const item of content) {
    if (typeof item === 'string') {
      parts.push(escapeHTML(item));
    } else if (item && typeof item === 'object' && 'stype' in item) {
      // Simple recursive conversion (for default rules)
      if (item.text !== undefined) {
        parts.push(escapeHTML(item.text));
      } else if (item.content) {
        parts.push(convertContentToHTML(item.content));
      }
    }
  }
  
  return parts.join('');
}

/**
 * HTML 이스케이프
 */
function escapeHTML(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

