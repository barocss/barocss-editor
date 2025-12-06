import type { INode } from '@barocss/datastore';
import type { Format, ParseDOMRule } from './types';
import { GlobalConverterRegistry } from './registry';

const registry = GlobalConverterRegistry.getInstance();

/**
 * HTML converter
 * Parses HTML strings to model nodes and converts model nodes to HTML strings.
 */
export class HTMLConverter {
  /**
   * Parses HTML string to model node array.
   * 
   * @param html HTML string
   * @param format Format (default: 'html')
   * @returns Model node array
   */
  parse(html: string, format: Format = 'html'): INode[] {
    if (format !== 'html') {
      throw new Error(`HTMLConverter.parse() only supports 'html' format, got '${format}'`);
    }
    
    // Parse HTML using DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Traverse and convert body's child elements
    const nodes: INode[] = [];
    const body = doc.body;
    
    if (!body) {
      return nodes;
    }
    
    // Convert body's direct child elements
    for (const child of Array.from(body.childNodes)) {
      const node = this._parseDOMNode(child as Element | Text);
      if (node) {
        nodes.push(node);
      }
    }
    
    return nodes;
  }
  
  /**
   * Converts DOM node to model node
   */
  private _parseDOMNode(node: Element | Text): INode | null {
    // Handle Text node
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (!text) return null;
      return {
        stype: 'inline-text',
        text: text
      };
    }
    
    // Handle Element node
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    
    const element = node as Element;
    const tagName = element.tagName.toLowerCase();
    
    // Check parser rules for all stypes
    // Try rules with higher priority first
    const allParserRules = this._getAllParserRules('html');
    
    for (const { stype, rules } of allParserRules) {
      for (const rule of rules) {
        if (!rule.parseDOM) continue;
        
        for (const domRule of rule.parseDOM) {
          if (this._matchesDOMRule(element, domRule)) {
            const node = this._convertElementToNode(element, stype, domRule);
            if (node) return node;
          }
        }
      }
    }
    
    // Default handling: convert unknown tags to paragraph (block) or inline-text (inline)
    return this._defaultElementToNode(element);
  }
  
  /**
   * Query all parser rules (grouped by stype)
   * 
   * Currently queries rules for known stypes.
   * Can be optimized later by adding getAllParserRules() method to registry.
   */
  private _getAllParserRules(format: Format): Array<{ stype: string; rules: any[] }> {
    const knownStypes = [
      'paragraph',
      'heading',
      'inline-text',
      'text',
      'link',
      'list',
      'list_item',
      'table',
      'table_row',
      'table_cell',
      'image'
    ];
    const result: Array<{ stype: string; rules: any[] }> = [];
    
    for (const stype of knownStypes) {
      const rules = registry.getParserRules(stype, format);
      if (rules.length > 0) {
        result.push({ stype, rules });
      }
    }
    
    return result;
  }
  
  /**
   * DOM 규칙 매칭 확인
   */
  private _matchesDOMRule(element: Element, rule: ParseDOMRule): boolean {
    if (rule.tag && element.tagName.toLowerCase() !== rule.tag.toLowerCase()) {
      return false;
    }
    
    if (rule.attrs) {
      for (const [key, value] of Object.entries(rule.attrs)) {
        const attrValue = element.getAttribute(key);
        if (value === null) {
          // Attribute should not exist
          if (attrValue !== null) return false;
        } else {
          // Attribute value must match
          if (attrValue !== value) return false;
        }
      }
    }
    
    if (rule.getAttrs) {
      const attrs = rule.getAttrs(element);
      if (attrs === null || attrs === false) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Converts Element to model node
   */
  private _convertElementToNode(
    element: Element,
    stype: string,
    domRule: ParseDOMRule
  ): INode | null {
    // Extract attributes
    let attributes: Record<string, any> | undefined;
    if (domRule.getAttrs) {
      const attrs = domRule.getAttrs(element);
      if (attrs && typeof attrs === 'object') {
        attributes = attrs;
      }
    } else {
      // Extract default attributes (data-* attributes, etc.)
      attributes = this._extractAttributes(element);
    }
    
    // Convert child nodes
    const content: INode[] = [];
    for (const child of Array.from(element.childNodes)) {
      // Treat tbody/thead/tfoot inside table as structural wrappers and parse children directly
      if (
        stype === 'table' &&
        child.nodeType === Node.ELEMENT_NODE &&
        ['tbody', 'thead', 'tfoot'].includes((child as Element).tagName.toLowerCase())
      ) {
        for (const grandChild of Array.from(child.childNodes)) {
          const gcNode = this._parseDOMNode(grandChild as Element | Text);
          if (gcNode) {
            content.push(gcNode);
          }
        }
        continue;
      }

      const childNode = this._parseDOMNode(child as Element | Text);
      if (childNode) {
        content.push(childNode);
      }
    }
    
    // Extract text (when no children)
    let text: string | undefined;
    if (content.length === 0) {
      text = element.textContent?.trim() || undefined;
    }
    
    return {
      stype,
      attributes,
      content: content.length > 0 ? content : undefined,
      text
    };
  }
  
  /**
   * Default Element → Node conversion (when no rules)
   */
  private _defaultElementToNode(element: Element): INode {
    // Check if block element
    const blockTags = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer', 'nav', 'aside'];
    const isBlock = blockTags.includes(element.tagName.toLowerCase());
    
    if (isBlock) {
      // Convert block element to paragraph
      const content: INode[] = [];
      for (const child of Array.from(element.childNodes)) {
        const childNode = this._parseDOMNode(child as Element | Text);
        if (childNode) {
          content.push(childNode);
        }
      }
      
      return {
        stype: 'paragraph',
        content: content.length > 0 ? content : undefined,
        text: content.length === 0 ? element.textContent?.trim() : undefined
      };
    } else {
      // Extract only text for inline elements
      return {
        stype: 'inline-text',
        text: element.textContent?.trim() || ''
      };
    }
  }
  
  /**
   * Extract Element attributes
   */
  private _extractAttributes(element: Element): Record<string, any> | undefined {
    const attrs: Record<string, any> = {};
    let hasAttrs = false;
    
    for (const attr of Array.from(element.attributes)) {
      // Extract only data-* attributes (ignore regular attributes)
      if (attr.name.startsWith('data-')) {
        // Preserve entire 'data-xxx' as key
        const key = attr.name;
        attrs[key] = attr.value;
        hasAttrs = true;
      }
    }
    
    return hasAttrs ? attrs : undefined;
  }
  
  /**
   * Converts model node array to HTML string.
   * 
   * @param nodes Model node array
   * @param format Format (default: 'html')
   * @returns HTML string
   */
  convert(nodes: INode[], format: Format = 'html'): string {
    if (format !== 'html') {
      throw new Error(`HTMLConverter.convert() only supports 'html' format, got '${format}'`);
    }
    
    const htmlParts: string[] = [];
    
    for (const node of nodes) {
      const html = this._convertNodeToHTML(node);
      if (html) {
        htmlParts.push(html);
      }
    }
    
    return htmlParts.join('\n');
  }
  
  /**
   * 모델 노드를 HTML 문자열로 변환
   */
  private _convertNodeToHTML(node: INode): string {
    const stype = node.stype;
    
    // Query conversion rules
    const rules = registry.getConverterRules(stype, 'html');
    
    if (rules.length > 0) {
      // Use first rule (highest priority)
      const rule = rules[0];
      let result = rule.convert(node);
      if (typeof result === 'string') {
        // Replace PLACEHOLDER_CONTENT with actual content
        if (result.includes('PLACEHOLDER_CONTENT')) {
          const content = this._convertContentToHTML(node.content);
          result = result.replace('PLACEHOLDER_CONTENT', content);
        }
        return result;
      }
    }
    
    // Default conversion (when no rule exists)
    return this._defaultNodeToHTML(node);
  }
  
  /**
   * 노드 content를 HTML 문자열로 변환 (재귀적)
   */
  private _convertContentToHTML(content: (INode | string)[] | undefined): string {
    if (!content || !Array.isArray(content)) {
      return '';
    }
    
    const parts: string[] = [];
    
    for (const item of content) {
      if (typeof item === 'string') {
        parts.push(this._escapeHTML(item));
      } else {
        parts.push(this._convertNodeToHTML(item));
      }
    }
    
    return parts.join('');
  }
  
  /**
   * 기본 Node → HTML 변환 (규칙이 없는 경우)
   */
  private _defaultNodeToHTML(node: INode): string {
    if (node.text !== undefined) {
      // Text node
      return this._escapeHTML(node.text);
    }
    
    // Convert child nodes
    const childrenHTML = this._convertContentToHTML(node.content);
    
    // Use default tag
    const tag = this._getDefaultTag(node.stype);
    return `<${tag}>${childrenHTML}</${tag}>`;
  }
  
  /**
   * stype에 따른 기본 HTML 태그 반환
   */
  private _getDefaultTag(stype: string): string {
    const tagMap: Record<string, string> = {
      'paragraph': 'p',
      'heading': 'h1',
      'inline-text': 'span',
      'text': 'span',
      'list': 'ul',
      'list_item': 'li',
      'table': 'table',
      'table_row': 'tr',
      'table_cell': 'td',
      'image': 'img',
      'link': 'a'
    };
    
    return tagMap[stype] || 'div';
  }
  
  /**
   * HTML 이스케이프
   */
  private _escapeHTML(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

