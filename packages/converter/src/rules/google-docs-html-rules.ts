import { defineParser } from '../api';

/**
 * Register Google Docs HTML conversion rules
 *
 * Currently mainly uses default HTML rules,
 * and only supplements some Google Docs-specific heading/paragraph patterns.
 */
export function registerGoogleDocsHTMLRules(): void {
  // Google Docs mostly renders with <p> tags,
  // but sometimes expresses headings with data-*, class, style.
  //
  // Here, we consider cases with data-heading-level attribute as heading.

  defineParser('heading', 'html', {
    parseDOM: [
      {
        tag: 'p',
        getAttrs: (node) => {
          const levelAttr =
            node.getAttribute('data-heading-level') ||
            node.getAttribute('data-heading') ||
            undefined;
          if (!levelAttr) {
            return null;
          }
          const level = parseInt(levelAttr, 10);
          if (!Number.isFinite(level) || level <= 0) {
            return null;
          }
          return { level };
        },
        priority: 50
      }
    ]
  });

  // Other elements (div/span, etc.) are left to default HTML rules and fallback.
}


