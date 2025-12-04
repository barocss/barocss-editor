import type { INode } from '@barocss/datastore';
import type { Format, ParseDOMRule } from './types';
import { GlobalConverterRegistry } from './registry';

const registry = GlobalConverterRegistry.getInstance();

/**
 * HTML 변환기
 * HTML 문자열을 모델 노드로 파싱하고, 모델 노드를 HTML 문자열로 변환합니다.
 */
export class HTMLConverter {
  /**
   * HTML 문자열을 모델 노드 배열로 파싱합니다.
   * 
   * @param html HTML 문자열
   * @param format 형식 (기본값: 'html')
   * @returns 모델 노드 배열
   */
  parse(html: string, format: Format = 'html'): INode[] {
    if (format !== 'html') {
      throw new Error(`HTMLConverter.parse() only supports 'html' format, got '${format}'`);
    }
    
    // DOMParser를 사용하여 HTML 파싱
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // body의 자식 요소들을 순회하며 변환
    const nodes: INode[] = [];
    const body = doc.body;
    
    if (!body) {
      return nodes;
    }
    
    // body의 직접 자식 요소들을 변환
    for (const child of Array.from(body.childNodes)) {
      const node = this._parseDOMNode(child as Element | Text);
      if (node) {
        nodes.push(node);
      }
    }
    
    return nodes;
  }
  
  /**
   * DOM 노드를 모델 노드로 변환
   */
  private _parseDOMNode(node: Element | Text): INode | null {
    // Text 노드 처리
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (!text) return null;
      return {
        stype: 'inline-text',
        text: text
      };
    }
    
    // Element 노드 처리
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    
    const element = node as Element;
    const tagName = element.tagName.toLowerCase();
    
    // 모든 stype에 대해 파서 규칙 확인
    // 우선순위가 높은 규칙부터 시도
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
    
    // 기본 처리: 알 수 없는 태그는 paragraph로 변환 (block) 또는 inline-text로 변환 (inline)
    return this._defaultElementToNode(element);
  }
  
  /**
   * 모든 파서 규칙 조회 (stype별로 그룹화)
   * 
   * 현재는 알려진 stype들에 대해 규칙을 조회합니다.
   * 나중에 registry에 getAllParserRules() 메서드를 추가하여 최적화 가능합니다.
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
          // 속성이 없어야 함
          if (attrValue !== null) return false;
        } else {
          // 속성 값이 일치해야 함
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
   * Element를 모델 노드로 변환
   */
  private _convertElementToNode(
    element: Element,
    stype: string,
    domRule: ParseDOMRule
  ): INode | null {
    // 속성 추출
    let attributes: Record<string, any> | undefined;
    if (domRule.getAttrs) {
      const attrs = domRule.getAttrs(element);
      if (attrs && typeof attrs === 'object') {
        attributes = attrs;
      }
    } else {
      // 기본 속성 추출 (data-* 속성 등)
      attributes = this._extractAttributes(element);
    }
    
    // 자식 노드 변환
    const content: INode[] = [];
    for (const child of Array.from(element.childNodes)) {
      // table 내부의 tbody/thead/tfoot는 구조 래퍼로 간주하고 자식들을 직접 파싱
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
    
    // 텍스트 추출 (자식이 없는 경우)
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
   * 기본 Element → Node 변환 (규칙이 없는 경우)
   */
  private _defaultElementToNode(element: Element): INode {
    // Block 요소인지 확인
    const blockTags = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer', 'nav', 'aside'];
    const isBlock = blockTags.includes(element.tagName.toLowerCase());
    
    if (isBlock) {
      // Block 요소는 paragraph로 변환
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
      // Inline 요소는 텍스트만 추출
      return {
        stype: 'inline-text',
        text: element.textContent?.trim() || ''
      };
    }
  }
  
  /**
   * Element의 속성 추출
   */
  private _extractAttributes(element: Element): Record<string, any> | undefined {
    const attrs: Record<string, any> = {};
    let hasAttrs = false;
    
    for (const attr of Array.from(element.attributes)) {
      // data-* 속성만 추출 (일반 속성은 무시)
      if (attr.name.startsWith('data-')) {
        // key는 'data-xxx' 전체를 그대로 보존
        const key = attr.name;
        attrs[key] = attr.value;
        hasAttrs = true;
      }
    }
    
    return hasAttrs ? attrs : undefined;
  }
  
  /**
   * 모델 노드 배열을 HTML 문자열로 변환합니다.
   * 
   * @param nodes 모델 노드 배열
   * @param format 형식 (기본값: 'html')
   * @returns HTML 문자열
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
    
    // 변환 규칙 조회
    const rules = registry.getConverterRules(stype, 'html');
    
    if (rules.length > 0) {
      // 첫 번째 규칙 사용 (우선순위가 가장 높은 것)
      const rule = rules[0];
      let result = rule.convert(node);
      if (typeof result === 'string') {
        // PLACEHOLDER_CONTENT를 실제 content로 교체
        if (result.includes('PLACEHOLDER_CONTENT')) {
          const content = this._convertContentToHTML(node.content);
          result = result.replace('PLACEHOLDER_CONTENT', content);
        }
        return result;
      }
    }
    
    // 기본 변환 (규칙이 없는 경우)
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
      // 텍스트 노드
      return this._escapeHTML(node.text);
    }
    
    // 자식 노드 변환
    const childrenHTML = this._convertContentToHTML(node.content);
    
    // 기본 태그 사용
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

