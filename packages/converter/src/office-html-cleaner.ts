/**
 * Microsoft Office HTML 정리 유틸리티
 * 
 * MS Word, PowerPoint, Excel 등에서 복사한 HTML은 특수한 포맷을 가지고 있습니다.
 * 이 클래스는 Office HTML을 정리하여 일반 HTML로 변환합니다.
 */
export class OfficeHTMLCleaner {
  /**
   * Office HTML을 정리합니다.
   * 
   * @param html Office에서 복사한 HTML 문자열
   * @returns 정리된 HTML 문자열
   */
  clean(html: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    if (!doc.body) {
      return html;
    }
    
    // Remove Office-specific elements and attributes
    this._removeOfficeAttributes(doc.body);
    this._removeOfficeStyles(doc.body);
    this._removeOfficeElements(doc.body);
    this._cleanOfficeTables(doc.body);
    this._normalizeOfficeFormatting(doc.body);
    
    return doc.body.innerHTML;
  }
  
  /**
   * Office 특수 속성 제거 (mso-*, o:*, v:* 등)
   */
  private _removeOfficeAttributes(element: Element): void {
    const officeAttrPrefixes = ['mso-', 'o:', 'v:', 'xml:', 'w:'];
    
    // Remove current element's attributes
    const attrsToRemove: string[] = [];
    for (const attr of Array.from(element.attributes)) {
      if (officeAttrPrefixes.some(prefix => attr.name.startsWith(prefix))) {
        attrsToRemove.push(attr.name);
      }
    }
    
    for (const attrName of attrsToRemove) {
      element.removeAttribute(attrName);
    }
    
    // Recursively process child elements
    for (const child of Array.from(element.children)) {
      this._removeOfficeAttributes(child);
    }
  }
  
  /**
   * Office 인라인 스타일 정리
   */
  private _removeOfficeStyles(element: Element): void {
    // Remove mso-* styles from style attribute
    const style = element.getAttribute('style');
    if (style) {
      // Remove mso-* styles
      const cleanedStyle = style
        .split(';')
        .filter(decl => {
          const trimmed = decl.trim();
          return !trimmed.startsWith('mso-') && 
                 !trimmed.startsWith('mso-') &&
                 trimmed.length > 0;
        })
        .join(';');
      
      if (cleanedStyle) {
        element.setAttribute('style', cleanedStyle);
      } else {
        element.removeAttribute('style');
      }
    }
    
    // Recursively process child elements
    for (const child of Array.from(element.children)) {
      this._removeOfficeStyles(child);
    }
  }
  
  /**
   * Office 특수 요소 제거 및 변환
   */
  private _removeOfficeElements(element: Element): void {
    // Convert o:p → p
    const oParagraphs = element.getElementsByTagName('o:p');
    for (let i = oParagraphs.length - 1; i >= 0; i--) {
      const el = oParagraphs[i];
      const p = document.createElement('p');
      
      // Copy attributes (excluding Office attributes)
      for (const attr of Array.from(el.attributes)) {
        if (!attr.name.startsWith('mso-') && 
            !attr.name.startsWith('o:') &&
            !attr.name.startsWith('xml:')) {
          p.setAttribute(attr.name, attr.value);
        }
      }
      
      // Copy content
      while (el.firstChild) {
        p.appendChild(el.firstChild);
      }
      
      el.parentNode?.replaceChild(p, el);
    }
    
    // Remove other Office elements
    const officeElements = [
      'o:smarttag',    // Office smart tag
      'v:shapetype',   // VML shape type
      'v:shape',       // VML shape
      'xml',           // XML namespace elements
      'w:worddocument' // Word document wrapper
    ];
    
    for (const tagName of officeElements) {
      const elements = element.getElementsByTagName(tagName);
      // Remove in reverse order (because of live NodeList)
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        // Move content to parent
        while (el.firstChild) {
          el.parentNode?.insertBefore(el.firstChild, el);
        }
        el.remove();
      }
    }
    
    // Recursively process child elements
    for (const child of Array.from(element.children)) {
      this._removeOfficeElements(child);
    }
  }
  
  /**
   * Office 테이블 정리
   * Office 테이블은 복잡한 구조를 가지고 있으므로 단순화
   */
  private _cleanOfficeTables(element: Element): void {
    const tables = element.getElementsByTagName('table');
    
    for (const table of Array.from(tables)) {
      // Remove Office table attributes
      const attrsToRemove = ['border', 'cellpadding', 'cellspacing', 'width', 'style'];
      for (const attr of attrsToRemove) {
        if (attr === 'style') {
          // Clean style instead of completely removing
          const style = table.getAttribute('style');
          if (style && style.includes('mso-')) {
            table.removeAttribute('style');
          }
        } else {
          table.removeAttribute(attr);
        }
      }
      
      // Clean table internal elements
      const cells = table.getElementsByTagName('td');
      for (const cell of Array.from(cells)) {
        // Remove unnecessary cell attributes
        cell.removeAttribute('width');
        cell.removeAttribute('height');
        const cellStyle = cell.getAttribute('style');
        if (cellStyle && cellStyle.includes('mso-')) {
          cell.removeAttribute('style');
        }
      }
    }
  }
  
  /**
   * Office 포맷팅을 일반 HTML로 정규화
   */
  private _normalizeOfficeFormatting(element: Element): void {
    // <b> → <strong>
    const boldElements = element.getElementsByTagName('b');
    for (let i = boldElements.length - 1; i >= 0; i--) {
      const el = boldElements[i];
      const strong = document.createElement('strong');
      while (el.firstChild) {
        strong.appendChild(el.firstChild);
      }
      el.parentNode?.replaceChild(strong, el);
    }
    
    // <i> → <em>
    const italicElements = element.getElementsByTagName('i');
    for (let i = italicElements.length - 1; i >= 0; i--) {
      const el = italicElements[i];
      const em = document.createElement('em');
      while (el.firstChild) {
        em.appendChild(el.firstChild);
      }
      el.parentNode?.replaceChild(em, el);
    }
    
    // Remove <u> (underline is generally not supported)
    const underlineElements = element.getElementsByTagName('u');
    for (let i = underlineElements.length - 1; i >= 0; i--) {
      const el = underlineElements[i];
      const span = document.createElement('span');
      while (el.firstChild) {
        span.appendChild(el.firstChild);
      }
      el.parentNode?.replaceChild(span, el);
    }
    
    // Remove <font> tags and keep only content
    const fontElements = element.getElementsByTagName('font');
    for (let i = fontElements.length - 1; i >= 0; i--) {
      const el = fontElements[i];
      const span = document.createElement('span');
      while (el.firstChild) {
        span.appendChild(el.firstChild);
      }
      el.parentNode?.replaceChild(span, el);
    }
  }
}

