import type { INode } from '@barocss/datastore';
import type { Format } from './types';
import { GlobalConverterRegistry } from './registry';

const registry = GlobalConverterRegistry.getInstance();

/**
 * Simple Markdown parser (basic implementation without external libraries)
 * 
 * ⚠️ Warning: This is a basic implementation. For production, it is recommended
 * to use external libraries like markdown-it.
 */
class SimpleMarkdownParser {
  /**
   * Converts Markdown string to AST
   * 
   * Simple implementation: only supports heading, paragraph, bold, italic
   */
  parse(markdown: string): any[] {
    const lines = markdown.split('\n');
    const ast: any[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) {
        // Ignore empty lines
        continue;
      }
      
      // Check heading (# ## ### etc.)
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
   * Parse inline text (bold, italic)
   */
  private _parseInline(text: string): any[] {
    const children: any[] = [];
    let currentIndex = 0;
    
    // Find **bold** or *italic* patterns
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
    
    // Sort by index
    matches.sort((a, b) => a.index - b.index);
    
    // Remove overlapping matches (keep only first one)
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
    
    // Process unmatched text and matched text in order
    let lastIndex = 0;
    for (const match of filteredMatches) {
      // Plain text before match
      if (match.index > lastIndex) {
        const plainText = text.substring(lastIndex, match.index);
        if (plainText) {
          children.push({
            type: 'text',
            text: plainText
          });
        }
      }
      
      // Matched text (bold or italic)
      children.push({
        type: match.type,
        text: match.text
      });
      
      lastIndex = match.index + match.length;
    }
    
    // Text after last match
    if (lastIndex < text.length) {
      const plainText = text.substring(lastIndex);
      if (plainText) {
        children.push({
          type: 'text',
          text: plainText
        });
      }
    }
    
    // Return full text if no matches
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
 * Markdown converter
 * Parses Markdown strings to model nodes and converts model nodes to Markdown strings.
 */
export class MarkdownConverter {
  private parser: SimpleMarkdownParser;
  
  constructor() {
    this.parser = new SimpleMarkdownParser();
  }
  
  /**
   * Parses Markdown string to model node array.
   * 
   * @param markdown Markdown string
   * @param format Format (default: 'markdown')
   * @returns Model node array
   */
  parse(markdown: string, format: Format = 'markdown'): INode[] {
    if (format !== 'markdown' && format !== 'markdown-gfm') {
      throw new Error(
        `MarkdownConverter.parse() only supports 'markdown' or 'markdown-gfm' format, got '${format}'`
      );
    }
    
    // Use full document parser (prefer requested format, fallback to default 'markdown')
    const documentParser =
      registry.getDocumentParser(format) || registry.getDocumentParser('markdown');
    if (documentParser) {
      // Use external parser
      const ast = documentParser.parse(markdown);
      return this._convertASTToNodes(ast);
    }
    
    // Use default parser
    const ast = this.parser.parse(markdown);
    return this._convertASTToNodes(ast);
  }
  
  /**
   * Converts AST to model nodes
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
   * Converts single AST node to model node
   */
  private _convertASTNode(astNode: any): INode | null {
    // Query AST conversion rules
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
   * Query all AST conversion rules
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
   * Converts model node array to Markdown string.
   * 
   * @param nodes Model node array
   * @param format Format (default: 'markdown')
   * @returns Markdown string
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
   * Converts model node to Markdown string
   */
  private _convertNodeToMarkdown(node: INode): string {
    const stype = node.stype;
    
    // Query conversion rules
    const rules = registry.getConverterRules(stype, 'markdown');
    
    if (rules.length > 0) {
      // Use first rule (highest priority)
      const rule = rules[0];
      const result = rule.convert(node);
      if (typeof result === 'string') {
        return result;
      }
    }
    
    // Default conversion (when no rules)
    return this._defaultNodeToMarkdown(node);
  }
  
  /**
   * Default Node → Markdown conversion (when no rules)
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

