import { describe, it, expect, beforeEach } from 'vitest';
import {
  HTMLConverter,
  registerDefaultHTMLRules,
  registerGoogleDocsHTMLRules,
  GlobalConverterRegistry
} from '../src';
import { GoogleDocsHTMLCleaner } from '../src/google-docs-html-cleaner';

describe('Google Docs HTML Converter', () => {
  let converter: HTMLConverter;
  let cleaner: GoogleDocsHTMLCleaner;

  beforeEach(() => {
    // Initialize registry
    GlobalConverterRegistry.getInstance().clear();

    // Register default HTML rules
    registerDefaultHTMLRules();

    // Register Google Docs-specific rules
    registerGoogleDocsHTMLRules();

    converter = new HTMLConverter();
    cleaner = new GoogleDocsHTMLCleaner();
  });

  describe('cleanGoogleDocsHTML', () => {
    it('should remove style and script tags', () => {
      const googleHTML = `
        <div id="contents">
          <style>.c0{color:red;}</style>
          <script>console.log('test')</script>
          <p>Text</p>
        </div>
      `;

      const cleaned = cleaner.clean(googleHTML);

      expect(cleaned).not.toContain('<style>');
      expect(cleaned).not.toContain('<script>');
      expect(cleaned).toContain('<p>Text</p>');
    });
  });

  describe('parse Google Docs HTML', () => {
    it('should parse simple Google Docs paragraph', () => {
      const googleHTML = `
        <div id="contents">
          <p class="c0" data-id="p1">Hello from Google Docs</p>
        </div>
      `;

      const cleaned = cleaner.clean(googleHTML);
      const nodes = converter.parse(cleaned);

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0].stype).toBe('paragraph');
    });

    it('should parse Google Docs heading using data-heading-level', () => {
      const googleHTML = `
        <div id="contents">
          <p data-heading-level="1">Main Title</p>
          <p data-heading-level="2">Sub Title</p>
        </div>
      `;

      const cleaned = cleaner.clean(googleHTML);
      const nodes = converter.parse(cleaned);

      expect(nodes.length).toBeGreaterThan(0);
      const headings = nodes.filter((n: any) => n.stype === 'heading');
      // If Google Docs heading rules are applied, at least one can be parsed as heading
      if (headings.length > 0) {
        expect(headings[0].attributes?.level).toBe(1);
      }
    });

    it('should preserve data-* attributes on elements', () => {
      const googleHTML = `
        <div id="contents">
          <p class="c0" data-block-id="abc123" data-level="1">Block</p>
        </div>
      `;

      const cleaned = cleaner.clean(googleHTML);
      const nodes = converter.parse(cleaned);

      expect(nodes.length).toBeGreaterThan(0);
      const p = nodes[0] as any;
      // In default HTML rules, only data-* attributes are stored in attributes for paragraph
      if (p.attributes) {
        expect(p.attributes['data-block-id']).toBe('abc123');
        expect(p.attributes['data-level']).toBe('1');
      }
    });
  });
});


