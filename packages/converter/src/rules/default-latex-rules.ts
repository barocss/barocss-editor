import { defineDocumentParser, defineASTConverter, defineConverter } from '../api';

/**
 * Register default LaTeX conversion rules
 *
 * Only handles \section, \subsection, and basic paragraphs.
 */
export function registerDefaultLatexRules(): void {
  // === Document Parser (LaTeX → AST) ===
  defineDocumentParser('latex', {
    parse(document: string): any[] {
      const lines = document.split('\n');
      const ast: any[] = [];

      let buffer: string[] = [];

      const flushParagraph = () => {
        if (buffer.length === 0) return;
        const text = buffer.join(' ').trim();
        if (text) {
          ast.push({
            type: 'paragraph',
            text
          });
        }
        buffer = [];
      };

      for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
          flushParagraph();
          continue;
        }

        const sectionMatch = line.match(/^\\section\{(.+)\}$/);
        if (sectionMatch) {
          flushParagraph();
          ast.push({
            type: 'heading',
            level: 1,
            text: sectionMatch[1]
          });
          continue;
        }

        const subSectionMatch = line.match(/^\\subsection\{(.+)\}$/);
        if (subSectionMatch) {
          flushParagraph();
          ast.push({
            type: 'heading',
            level: 2,
            text: subSectionMatch[1]
          });
          continue;
        }

        buffer.push(line);
      }

      flushParagraph();
      return ast;
    }
  });

  // === AST → Model conversion rules ===
  defineASTConverter('heading', 'latex', {
    convert(astNode: any): any | null {
      if (astNode.type === 'heading') {
        return {
          stype: 'heading',
          attributes: { level: astNode.level },
          content: [
            {
              stype: 'inline-text',
              text: astNode.text
            }
          ]
        };
      }
      return null;
    }
  });

  defineASTConverter('paragraph', 'latex', {
    convert(astNode: any): any | null {
      if (astNode.type === 'paragraph') {
        return {
          stype: 'paragraph',
          content: [
            {
              stype: 'inline-text',
              text: astNode.text
            }
          ]
        };
      }
      return null;
    }
  });

  // === Model → LaTeX Conversion Rules ===
  defineConverter('heading', 'latex', {
    convert: (node) => {
      const level = node.attributes?.level || 1;
      const text = (node.content && node.content[0] && (node.content[0] as any).text) || '';
      if (level === 1) {
        return `\\section{${text}}`;
      }
      if (level === 2) {
        return `\\subsection{${text}}`;
      }
      return `\\subsection{${text}}`;
    }
  });

  defineConverter('paragraph', 'latex', {
    convert: (node) => {
      if (node.content && Array.isArray(node.content)) {
        const text = (node.content[0] as any)?.text || '';
        return text;
      }
      return node.text || '';
    }
  });
}


