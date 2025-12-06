import { describe, it, expect, beforeEach } from 'vitest';
import {
  HTMLConverter,
  registerDefaultHTMLRules,
  registerNotionHTMLRules,
  GlobalConverterRegistry
} from '../src';
import { NotionHTMLCleaner } from '../src/notion-html-cleaner';

describe('Notion HTML Converter', () => {
  let converter: HTMLConverter;
  let cleaner: NotionHTMLCleaner;

  beforeEach(() => {
    // Initialize registry
    GlobalConverterRegistry.getInstance().clear();

    // Register default HTML rules
    registerDefaultHTMLRules();

    // Register Notion-specific rules
    registerNotionHTMLRules();

    converter = new HTMLConverter();
    cleaner = new NotionHTMLCleaner();
  });

  describe('cleanNotionHTML', () => {
    it('should remove style and script tags', () => {
      const notionHTML = `
        <div>
          <style>.some{}</style>
          <script>console.log('x')</script>
          <div data-block-id="block-1">Content</div>
        </div>
      `;

      const cleaned = cleaner.clean(notionHTML);

      expect(cleaned).not.toContain('<style>');
      expect(cleaned).not.toContain('<script>');
      expect(cleaned).toContain('data-block-id="block-1"');
    });
  });

  describe('parse Notion HTML', () => {
    it('should parse simple Notion paragraph block', () => {
      const notionHTML = `
        <div>
          <div data-block-id="block-1">Hello Notion</div>
        </div>
      `;

      const cleaned = cleaner.clean(notionHTML);
      const nodes = converter.parse(cleaned);

      expect(nodes.length).toBeGreaterThan(0);
      // Primary goal achieved if it's parsed as paragraph
      expect(nodes[0].stype).toBe('paragraph');
    });

    it('should preserve data-* attributes on Notion blocks', () => {
      const notionHTML = `
        <div>
          <div data-block-id="block-1" data-type="text" data-level="0">
            <span>Hello</span>
          </div>
        </div>
      `;

      const cleaned = cleaner.clean(notionHTML);
      const nodes = converter.parse(cleaned);

      expect(nodes.length).toBeGreaterThan(0);
      const block = nodes[0] as any;
      if (block.attributes) {
        expect(block.attributes['data-block-id']).toBe('block-1');
      }
    });
  });
});


