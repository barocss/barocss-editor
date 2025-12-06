import { defineParser } from '../api';
import { OfficeHTMLCleaner } from '../office-html-cleaner';

const cleaner = new OfficeHTMLCleaner();

/**
 * Register Microsoft Office HTML conversion rules
 * 
 * Handles HTML copied from MS Word, PowerPoint, Excel, etc.
 */
export function registerOfficeHTMLRules(): void {
  // Office HTML uses general HTML parser rules,
  // but cleans Office-specific formats before parsing.
  
  // Paragraph (also handles Office's o:p tag)
  defineParser('paragraph', 'html', {
    parseDOM: [
      { tag: 'p' },
      { 
        tag: 'o:p',  // Office paragraph
        priority: 100
      },
      {
        tag: 'div',
        getAttrs: (node) => {
          // Convert Office's div to paragraph (under specific conditions)
          const style = node.getAttribute('style') || '';
          const className = node.getAttribute('class') || '';
          
          // Treat as paragraph if Office-specific class or style exists
          if (className.includes('Mso') || style.includes('mso-')) {
            return {};
          }
          return null; // No match
        },
        priority: 50
      }
    ]
  });
  
  // Heading (handle Office heading styles)
  defineParser('heading', 'html', {
    parseDOM: [
      { tag: 'h1', getAttrs: () => ({ level: 1 }) },
      { tag: 'h2', getAttrs: () => ({ level: 2 }) },
      { tag: 'h3', getAttrs: () => ({ level: 3 }) },
      { tag: 'h4', getAttrs: () => ({ level: 4 }) },
      { tag: 'h5', getAttrs: () => ({ level: 5 }) },
      { tag: 'h6', getAttrs: () => ({ level: 6 }) },
      {
        tag: 'p',
        getAttrs: (node) => {
          // Check Office heading styles
          const style = node.getAttribute('style') || '';
          const className = node.getAttribute('class') || '';
          
          // Check MsoHeading style
          if (className.includes('MsoHeading')) {
            // Extract level from class name (e.g., MsoHeading1 → level 1)
            const levelMatch = className.match(/MsoHeading(\d)/);
            if (levelMatch) {
              return { level: parseInt(levelMatch[1]) };
            }
          }
          
          // Also treat MsoTitle, MsoSubtitle as heading
          if (className === 'MsoTitle') {
            return { level: 1 };
          }
          if (className === 'MsoSubtitle') {
            return { level: 2 };
          }
          
          // Check heading level from style
          if (style.includes('mso-style-name')) {
            const nameMatch = style.match(/mso-style-name:\s*["']?Heading\s*(\d)/i);
            if (nameMatch) {
              return { level: parseInt(nameMatch[1]) };
            }
            // Also check Title, Subtitle styles
            if (style.match(/mso-style-name:\s*["']?Title/i)) {
              return { level: 1 };
            }
            if (style.match(/mso-style-name:\s*["']?Subtitle/i)) {
              return { level: 2 };
            }
          }
          
          return null; // No match
        },
        priority: 100
      }
    ]
  });
  
  // Inline Text (handle Office's span)
  defineParser('inline-text', 'html', {
    parseDOM: [
      { tag: 'span' },
      { tag: 'a' },
      {
        tag: 'span',
        getAttrs: (node) => {
          // Handle Office-specific span
          const style = node.getAttribute('style') || '';
          if (style.includes('mso-')) {
            return {}; // Also treat Office span as regular span
          }
          return null;
        },
        priority: 100
      }
    ]
  });
}

/**
 * Cleans Office HTML and converts to regular HTML
 * 
 * @param html HTML copied from Office
 * @returns Cleaned HTML
 */
export function cleanOfficeHTML(html: string): string {
  return cleaner.clean(html);
}

