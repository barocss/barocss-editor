import { defineParser } from '../api';

/**
 * Register Notion HTML conversion rules
 *
 * Notion expresses each block as a combination of div/span and data-*, class.
 * Here, we only catch minimal block types and leave the rest to default HTML rules.
 */
export function registerNotionHTMLRules(): void {
  // Paragraph block: map div with data-block-id to paragraph
  defineParser('paragraph', 'html', {
    parseDOM: [
      {
        tag: 'div',
        getAttrs: (node) => {
          const blockId = node.getAttribute('data-block-id');
          if (!blockId) return null;
          // Whether it's a paragraph can be more strictly distinguished by class names, etc.,
          // but here we only consider "if there's a block id, it's a paragraph".
          // data-block-id is also caught in _extractAttributes, so we don't add separate attrs here.
          return {};
        },
        priority: 10
      }
    ]
  });

  // Checkbox / task list, etc. are left as future extension points.
}


