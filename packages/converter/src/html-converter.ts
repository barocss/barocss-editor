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
    
    return nodes.flatMap(node => this._normalizeInline(node));
  }
  
  /** Inline wrappers carry marks on their text leaves, never children inside a text node. */
  private _normalizeInline(node: INode): INode[] {
    const children = (node.content ?? []).flatMap(child => typeof child === 'string' ? [] : this._normalizeInline(child));
    if (node.stype === 'inline-text' && children.length) {
      const markType = node.attributes?.markType;
      const apply = (child: INode): INode => {
        if (typeof child.text === 'string' && typeof markType === 'string') {
          return { ...child, marks: [...(child.marks ?? []), { stype: markType, range: [0, child.text.length] }] };
        }
        return child.content ? { ...child, content: child.content.map(value => typeof value === 'string' ? value : apply(value)) } : child;
      };
      return children.map(apply);
    }
    return [{ ...node, ...(node.content ? { content: children } : {}) }];
  }

  /**
   * Converts DOM node to model node
   */
  private _parseDOMNode(node: Element | Text): INode | null {
    // Handle Text node
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent ?? '';
      if (!text) return null;
      if (!text.trim()) {
        const block = (sibling: Node | null) => sibling?.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6]|UL|OL|TABLE|PRE|BLOCKQUOTE)$/.test((sibling as Element).tagName);
        if (node.parentElement?.tagName === 'BODY' && (!node.previousSibling || !node.nextSibling) || block(node.previousSibling) || block(node.nextSibling)) return null;
        text = ' ';
      }
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
    const tag = element.tagName.toLowerCase();
    if (['script', 'style', 'meta', 'link'].includes(tag)) return null;
    if (tag === 'br') return { stype: 'hardBreak' };
    if (tag === 'span' && element.hasAttribute('data-note-page-reference') && element.getAttribute('data-page-id')) {
      return { stype: 'pageReference', attributes: { pageId: element.getAttribute('data-page-id')!,
        title: element.getAttribute('data-page-title') ?? element.textContent ?? '제목 없음' } };
    }
    if (tag === 'span' && element.hasAttribute('data-emoji')) return { stype: 'emoji', attributes: {
      ...(element.getAttribute('data-shortcode') ? { shortcode: element.getAttribute('data-shortcode')! } : {}),
      unicode: element.getAttribute('data-unicode') ?? element.textContent ?? ''
    } };
    const inlineMark = ({ u: 'underline', s: 'strikethrough', del: 'strikethrough', code: 'code', sub: 'subscript', sup: 'superscript' } as Record<string, string>)[tag];
    if (inlineMark) return this._convertElementToNode(element, 'inline-text', { getAttrs: () => ({ markType: inlineMark }) });
    if (tag === 'pre') {
      const code = element.querySelector('code');
      const language = element.getAttribute('data-language') ?? code?.className.match(/(?:^|\s)language-([\w+-]+)/)?.[1] ?? 'text';
      return { stype: 'codeBlock', attributes: { language }, content: [{ stype: 'inline-text', text: element.textContent ?? '' }] };
    }
    
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
      'blockQuote',
      'heading',
      'link',
      'emoji',
      'inline-text',
      'text',
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
    
    if (stype === 'emoji') return { stype, attributes };
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
        text: element.textContent || ''
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
    
    return htmlParts.join('');
  }
  
  /**
   * 모델 노드를 HTML 문자열로 변환
   */
  private _convertNodeToHTML(node: INode): string {
    const stype = node.stype;
    if (stype === 'hardBreak') return '<br>';
    if (stype === 'inline-image') return this._convertNodeToHTML({ ...node, stype: 'image' });
    if (typeof node.text === 'string' && node.marks?.length) {
      const length = node.text.length;
      const bounds = [...new Set([0, length, ...node.marks.flatMap(mark => mark.range ?? [0, length])])]
        .filter(value => value >= 0 && value <= length).sort((a, b) => a - b);
      const attr = (value: unknown) => this._escapeHTML(String(value ?? '')).replace(/"/g, '&quot;');
      return bounds.slice(0, -1).map((from, index) => {
        const to = bounds[index + 1];
        let html = this._escapeHTML(node.text!.slice(from, to));
        for (const mark of node.marks ?? []) {
          const [a, b] = mark.range ?? [0, length];
          if (a > from || b < to) continue;
          const tag = ({ bold: 'strong', italic: 'em', underline: 'u', strikethrough: 's', code: 'code', subscript: 'sub', superscript: 'sup' } as Record<string, string>)[mark.stype];
          if (tag) html = `<${tag}>${html}</${tag}>`;
          else if (mark.stype === 'link') html = `<a href="${attr(mark.attrs?.href)}"${mark.attrs?.title ? ` title="${attr(mark.attrs.title)}"` : ''}>${html}</a>`;
        }
        return html;
      }).join('');
    }
    
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

