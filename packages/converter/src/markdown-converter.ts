import type { INode } from '@barocss/datastore';
import type { Format } from './types';
import { GlobalConverterRegistry } from './registry';

const registry = GlobalConverterRegistry.getInstance();

/**
 * 간단한 Markdown 파서 (외부 라이브러리 없이 기본 구현)
 * 
 * ⚠️ 주의: 이는 기본 구현이며, 실제 프로덕션에서는 markdown-it 같은
 * 외부 라이브러리를 사용하는 것을 권장합니다.
 */
class SimpleMarkdownParser {
  /**
   * Markdown 문자열을 AST로 변환
   * 
   * 간단한 구현: heading, paragraph, bold, italic만 지원
   */
  parse(markdown: string): any[] {
    const lines = markdown.split('\n');
    const ast: any[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) {
        // 빈 줄은 무시
        continue;
      }
      
      // Heading 체크 (# ## ### 등)
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        ast.push({
          type: 'heading',
          level,
          text,
          children: this._parseInline(text)
        });
        continue;
      }
      
      // Paragraph
      ast.push({
        type: 'paragraph',
        text: line,
        children: this._parseInline(line)
      });
    }
    
    return ast;
  }
  
  /**
   * 인라인 텍스트 파싱 (bold, italic)
   */
  private _parseInline(text: string): any[] {
    const children: any[] = [];
    let currentIndex = 0;
    
    // **bold** 또는 *italic* 패턴 찾기
    const patterns = [
      { regex: /\*\*([^*]+)\*\*/g, type: 'bold' },
      { regex: /\*([^*]+)\*/g, type: 'italic' },
      { regex: /__([^_]+)__/g, type: 'bold' },
      { regex: /_([^_]+)_/g, type: 'italic' }
    ];
    
    const matches: Array<{ index: number; length: number; text: string; type: string }> = [];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        matches.push({
          index: match.index,
          length: match[0].length,
          text: match[1],
          type: pattern.type
        });
      }
    }
    
    // 인덱스 순으로 정렬
    matches.sort((a, b) => a.index - b.index);
    
    // 겹치는 매치 제거 (첫 번째 것만 유지)
    const filteredMatches: typeof matches = [];
    for (const match of matches) {
      const overlaps = filteredMatches.some(m => 
        (match.index >= m.index && match.index < m.index + m.length) ||
        (m.index >= match.index && m.index < match.index + match.length)
      );
      if (!overlaps) {
        filteredMatches.push(match);
      }
    }
    
    // 매치되지 않은 텍스트와 매치된 텍스트를 순서대로 처리
    let lastIndex = 0;
    for (const match of filteredMatches) {
      // 매치 전의 일반 텍스트
      if (match.index > lastIndex) {
        const plainText = text.substring(lastIndex, match.index);
        if (plainText) {
          children.push({
            type: 'text',
            text: plainText
          });
        }
      }
      
      // 매치된 텍스트 (bold 또는 italic)
      children.push({
        type: match.type,
        text: match.text
      });
      
      lastIndex = match.index + match.length;
    }
    
    // 마지막 매치 이후의 텍스트
    if (lastIndex < text.length) {
      const plainText = text.substring(lastIndex);
      if (plainText) {
        children.push({
          type: 'text',
          text: plainText
        });
      }
    }
    
    // 매치가 없으면 전체 텍스트 반환
    if (children.length === 0) {
      children.push({
        type: 'text',
        text: text
      });
    }
    
    return children;
  }
}

/**
 * Markdown 변환기
 * Markdown 문자열을 모델 노드로 파싱하고, 모델 노드를 Markdown 문자열로 변환합니다.
 */
export class MarkdownConverter {
  private parser: SimpleMarkdownParser;
  
  constructor() {
    this.parser = new SimpleMarkdownParser();
  }
  
  /**
   * Markdown 문자열을 모델 노드 배열로 파싱합니다.
   * 
   * @param markdown Markdown 문자열
   * @param format 형식 (기본값: 'markdown')
   * @returns 모델 노드 배열
   */
  parse(markdown: string, format: Format = 'markdown'): INode[] {
    if (format !== 'markdown' && format !== 'markdown-gfm') {
      throw new Error(
        `MarkdownConverter.parse() only supports 'markdown' or 'markdown-gfm' format, got '${format}'`
      );
    }
    
    // 전체 문서 파서 사용 (요청된 format 우선, 없으면 기본 'markdown' 사용)
    const documentParser =
      registry.getDocumentParser(format) || registry.getDocumentParser('markdown');
    if (documentParser) {
      // 외부 파서 사용
      const ast = documentParser.parse(markdown);
      return this._convertASTToNodes(ast);
    }
    
    // 기본 파서 사용
    const ast = this.parser.parse(markdown);
    return this._convertASTToNodes(ast);
  }
  
  /**
   * AST를 모델 노드로 변환
   */
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
  
  /**
   * 단일 AST 노드를 모델 노드로 변환
   */
  private _convertASTNode(astNode: any): INode | null {
    // AST 변환 규칙 조회
    const allRules = this._getAllASTConverterRules('markdown');
    
    for (const { stype, rules } of allRules) {
      for (const rule of rules) {
        const node = rule.convert(astNode, (child: any) => this._convertASTNode(child));
        if (node) {
          return node;
        }
      }
    }
    
    return null;
  }
  
  /**
   * 모든 AST 변환 규칙 조회
   */
  private _getAllASTConverterRules(format: Format): Array<{ stype: string; rules: any[] }> {
    const knownStypes = ['heading', 'paragraph', 'inline-text', 'list', 'image'];
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
   * 모델 노드 배열을 Markdown 문자열로 변환합니다.
   * 
   * @param nodes 모델 노드 배열
   * @param format 형식 (기본값: 'markdown')
   * @returns Markdown 문자열
   */
  convert(nodes: INode[], format: Format = 'markdown'): string {
    if (format !== 'markdown') {
      throw new Error(`MarkdownConverter.convert() only supports 'markdown' format, got '${format}'`);
    }
    
    const markdownParts: string[] = [];
    
    for (const node of nodes) {
      const markdown = this._convertNodeToMarkdown(node);
      if (markdown) {
        markdownParts.push(markdown);
      }
    }
    
    return markdownParts.join('\n\n');
  }
  
  /**
   * 모델 노드를 Markdown 문자열로 변환
   */
  private _convertNodeToMarkdown(node: INode): string {
    const stype = node.stype;
    
    // 변환 규칙 조회
    const rules = registry.getConverterRules(stype, 'markdown');
    
    if (rules.length > 0) {
      // 첫 번째 규칙 사용 (우선순위가 가장 높은 것)
      const rule = rules[0];
      const result = rule.convert(node);
      if (typeof result === 'string') {
        return result;
      }
    }
    
    // 기본 변환 (규칙이 없는 경우)
    return this._defaultNodeToMarkdown(node);
  }
  
  /**
   * 기본 Node → Markdown 변환 (규칙이 없는 경우)
   */
  private _defaultNodeToMarkdown(node: INode): string {
    if (node.text !== undefined) {
      return node.text;
    }
    
    const content = this._convertContentToMarkdown(node.content);
    return content;
  }
  
  /**
   * 노드 content를 Markdown 문자열로 변환 (재귀적)
   */
  private _convertContentToMarkdown(content: (INode | string)[] | undefined): string {
    if (!content || !Array.isArray(content)) {
      return '';
    }
    
    const parts: string[] = [];
    
    for (const item of content) {
      if (typeof item === 'string') {
        parts.push(item);
      } else {
        parts.push(this._convertNodeToMarkdown(item));
      }
    }
    
    return parts.join('');
  }
}

