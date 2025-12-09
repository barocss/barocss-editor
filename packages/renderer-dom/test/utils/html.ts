export function normalizeHTML(htmlOrElement: string | Element): string {
  const doc = document.implementation.createHTMLDocument('norm');
  const container = doc.createElement('div');
  if (typeof htmlOrElement === 'string') {
    container.innerHTML = htmlOrElement;
  } else {
    // Use HTML parser when normalizing actual DOM to maintain consistent structure
    // Using innerHTML may cause HTML parser to change structure,
    // so use outerHTML to convert to HTML string first, then parse
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(htmlOrElement.cloneNode(true));
    container.innerHTML = tempDiv.innerHTML;
  }
  function serialize(node: Element | ChildNode): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || '').replace(/\s+/g, ' ').trim();
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const attrs: Array<[string, string]> = [];
    for (const { name, value } of Array.from(el.attributes)) {
      let normalizedValue = value;
      // For style attributes, sort internal property order
      if (name === 'style' && value) {
        const stylePairs = value.split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .map(s => {
            const colonIndex = s.indexOf(':');
            if (colonIndex === -1) return { prop: s, value: '' };
            const prop = s.substring(0, colonIndex).trim();
            const val = s.substring(colonIndex + 1).trim();
            return { prop, value: val };
          })
          .sort((a, b) => a.prop.localeCompare(b.prop))
          .map(({ prop, value: val }) => `${prop}: ${val}`)
          .join('; ');
        normalizedValue = stylePairs;
      }
      attrs.push([name, normalizedValue]);
    }
    attrs.sort((a, b) => a[0].localeCompare(b[0]));
    const attrStr = attrs
      .map(([k, v]) => (v === '' ? `${k}` : `${k}="${v}"`))
      .join(' ');
    const open = attrStr.length ? `<${tag} ${attrStr}>` : `<${tag}>`;
    const children = Array.from(el.childNodes)
      .map(serialize)
      .filter(Boolean)
      .join('');
    const content = children.length ? children : '';
    return `${open}${content}</${tag}>`;
  }
  const parts = Array.from(container.childNodes).map(serialize).filter(Boolean);
  return parts.join('').replace(/>\s+</g, '><').trim();
}

/**
 * 컨테이너의 전체 HTML과 예상 HTML을 비교하는 유틸리티 함수
 * 
 * @param container - 렌더링된 DOM 컨테이너
 * @param expectedHTML - 예상되는 HTML 문자열 (예: '<p>...</p>') 또는 DOM 요소 생성 함수
 * @param expect - vitest의 expect 함수
 * 
 * @example
 * ```ts
 * import { expect } from 'vitest';
 * renderer.render(container, model);
 * expectHTML(container, '<p class="paragraph"><span class="text">bold text</span></p>', expect);
 * 
 * // When direct DOM creation is needed
 * expectHTML(container, (div) => {
 *   const p = document.createElement('p');
 *   p.className = 'paragraph';
 *   div.appendChild(p);
 * }, expect);
 * ```
 */
export function expectHTML(
  container: HTMLElement, 
  expectedHTML: string | ((div: HTMLElement) => void), 
  expect: (actual: any) => { toBe: (expected: any) => void }
): void {
  // Normalize container's full HTML
  const actualHTML = normalizeHTML(container);
  
  // Normalize expected HTML
  const tempDiv = document.createElement('div');
  if (typeof expectedHTML === 'string') {
    // When parsing HTML strings, HTML parser may change structure,
    // so create DOM directly to preserve actual DOM structure
    // However, since user requested to compare HTML strings as-is,
    // use the result parsed by HTML parser as-is
    tempDiv.innerHTML = expectedHTML;
  } else {
    expectedHTML(tempDiv);
  }
  const normalizedExpected = normalizeHTML(tempDiv);
  
  // Compare
  expect(actualHTML).toBe(normalizedExpected);
}
