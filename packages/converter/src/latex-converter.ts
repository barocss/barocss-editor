import type { INode } from '@barocss/datastore';
import type { Format } from './types';
import { GlobalConverterRegistry } from './registry';

const registry = GlobalConverterRegistry.getInstance();

/**
 * 간단한 LaTeX 파서 (fallback 용)
 *
 * \section{Title}
 * \subsection{Subtitle}
 * 빈 줄로 구분되는 일반 문단 정도만 지원합니다.
 */
class SimpleLatexParser {
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
        // 빈 줄이면 현재까지 누적된 문단을 flush
        flushParagraph();
        continue;
      }

      // \section{Title}
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

      // \subsection{Title}
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

      // 기타는 문단 버퍼에 누적
      buffer.push(line);
    }

    flushParagraph();
    return ast;
  }
}

/**
 * LaTeX 변환기
 * LaTeX 문자열을 모델 노드로 파싱하고, 모델 노드를 LaTeX 문자열로 변환합니다.
 */
export class LatexConverter {
  private parser: SimpleLatexParser;

  constructor() {
    this.parser = new SimpleLatexParser();
  }

  /**
   * LaTeX 문자열을 모델 노드 배열로 파싱합니다.
   */
  parse(latex: string, format: Format = 'latex'): INode[] {
    if (format !== 'latex') {
      throw new Error(`LatexConverter.parse() only supports 'latex' format, got '${format}'`);
    }

    const documentParser = registry.getDocumentParser('latex');
    const ast = documentParser ? documentParser.parse(latex) : this.parser.parse(latex);
    return this._convertASTToNodes(ast);
  }

  private _convertASTToNodes(ast: any[]): INode[] {
    const nodes: INode[] = [];

    for (const astNode of ast) {
      const node = this._convertASTNode(astNode);
      if (node) {
        nodes.push(node);
      }
    }

    return nodes;
  }

  private _convertASTNode(astNode: any): INode | null {
    const allRules = this._getAllASTConverterRules('latex');

    for (const { rules } of allRules) {
      for (const rule of rules) {
        const node = rule.convert(astNode, (child: any) => this._convertASTNode(child));
        if (node) {
          return node;
        }
      }
    }

    return null;
  }

  private _getAllASTConverterRules(format: Format): Array<{ stype: string; rules: any[] }> {
    const knownStypes = ['heading', 'paragraph'];
    const result: Array<{ stype: string; rules: any[] }> = [];

    for (const stype of knownStypes) {
      const rules = registry.getASTConverterRules(stype, format);
      if (rules.length > 0) {
        result.push({ stype, rules });
      }
    }

    return result;
  }

  /**
   * 모델 노드 배열을 LaTeX 문자열로 변환합니다.
   */
  convert(nodes: INode[], format: Format = 'latex'): string {
    if (format !== 'latex') {
      throw new Error(`LatexConverter.convert() only supports 'latex' format, got '${format}'`);
    }

    const parts: string[] = [];

    for (const node of nodes) {
      const latex = this._convertNodeToLatex(node);
      if (latex) {
        parts.push(latex);
      }
    }

    return parts.join('\n\n');
  }

  private _convertNodeToLatex(node: INode): string {
    const stype = node.stype;
    const rules = registry.getConverterRules(stype, 'latex');

    if (rules.length > 0) {
      const rule = rules[0];
      const result = rule.convert(node);
      if (typeof result === 'string') {
        return result;
      }
    }

    // 기본 변환: paragraph 텍스트만 출력
    if (node.text) {
      return node.text;
    }

    if (node.content && Array.isArray(node.content)) {
      return node.content
        .map((child: any) => (typeof child === 'string' ? child : child.text || ''))
        .join(' ');
    }

    return '';
  }
}


