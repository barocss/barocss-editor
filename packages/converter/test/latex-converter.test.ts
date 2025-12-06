import { describe, it, expect, beforeEach } from 'vitest';
import {
  LatexConverter,
  registerDefaultLatexRules,
  GlobalConverterRegistry,
  defineDocumentParser
} from '../src';
import * as LatexUtensils from 'latex-utensils';

describe('LatexConverter', () => {
  let converter: LatexConverter;

  beforeEach(() => {
    GlobalConverterRegistry.getInstance().clear();
    registerDefaultLatexRules();
    converter = new LatexConverter();
  });

  describe('parse', () => {
    it('should parse section and paragraph', () => {
      const latex = `
\\section{Main Title}

This is the first paragraph.

This is the second line of the same paragraph.
`;

      const nodes = converter.parse(latex);

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0].stype).toBe('heading');
      expect(nodes[0].attributes?.level).toBe(1);

      const paragraphs = nodes.filter((n: any) => n.stype === 'paragraph');
      expect(paragraphs.length).toBeGreaterThanOrEqual(1);
    });

    it('should parse subsection', () => {
      const latex = `
\\subsection{Sub Title}

Paragraph text.
`;

      const nodes = converter.parse(latex);

      expect(nodes.length).toBeGreaterThan(0);
      const heading = nodes.find((n: any) => n.stype === 'heading');
      expect(heading).toBeDefined();
      if (heading) {
        expect(heading.attributes?.level).toBe(2);
      }
    });

    it('should use external latex document parser via defineDocumentParser', () => {
      // To simulate case using external parser,
      // initialize registry and register separate DocumentParser
      GlobalConverterRegistry.getInstance().clear();
      // Re-register default rules (heading/paragraph AST → Model, Converter)
      registerDefaultLatexRules();

      // Simulate simple external LaTeX parser
      // Actually can use external libraries like latex-utensils,
      // but here we only import and implement simple parser directly.
      // (LatexUtensils namespace is imported as example of external library usage)
      defineDocumentParser('latex', {
        parse(document: string): any[] {
          const lines = document.split('\n');
          const ast: any[] = [];
          let currentSection: any | null = null;

          for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;

            const sectionMatch = line.match(/^\\section\{(.+)\}$/);
            if (sectionMatch) {
              currentSection = {
                type: 'heading',
                level: 1,
                text: sectionMatch[1]
              };
              ast.push(currentSection);
              continue;
            }

            // Consider only first paragraph after section as paragraph
            if (currentSection) {
              ast.push({
                type: 'paragraph',
                text: line
              });
              currentSection = null;
              continue;
            }
          }

          return ast;
        }
      });

      const externalConverter = new LatexConverter();
      const latex = `
\\section{External Title}

External paragraph.
`;

      const nodes = externalConverter.parse(latex);
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0].stype).toBe('heading');
      expect(nodes[0].attributes?.level).toBe(1);
      expect(nodes.some((n: any) => n.stype === 'paragraph')).toBe(true);
    });
  });

  describe('convert', () => {
    it('should convert heading and paragraph to latex', () => {
      const nodes = [
        {
          stype: 'heading',
          attributes: { level: 1 },
          content: [
            {
              stype: 'inline-text',
              text: 'Main Title'
            }
          ]
        },
        {
          stype: 'paragraph',
          content: [
            {
              stype: 'inline-text',
              text: 'Paragraph text.'
            }
          ]
        }
      ] as any[];

      const latex = converter.convert(nodes);

      expect(latex).toContain('\\section{Main Title}');
      expect(latex).toContain('Paragraph text.');
    });

    it('should round-trip simple latex document', () => {
      const original = `
\\section{Title}

Hello LaTeX world.
`;

      const nodes = converter.parse(original);
      const latex = converter.convert(nodes);

      expect(latex).toContain('\\section{Title}');
      expect(latex).toContain('Hello LaTeX world.');
    });
  });
});


