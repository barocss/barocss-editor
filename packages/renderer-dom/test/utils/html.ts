export function normalizeHTML(htmlOrElement: string | Element): string {
  const doc = document.implementation.createHTMLDocument('norm');
  const container = doc.createElement('div');
  if (typeof htmlOrElement === 'string') {
    container.innerHTML = htmlOrElement;
  } else {
    // 실제 DOM을 정규화할 때도 HTML 파서를 사용하여 구조를 일관되게 유지
    // innerHTML을 사용하면 HTML 파서가 구조를 변경할 수 있으므로,
    // outerHTML을 사용하여 HTML 문자열로 변환한 후 파싱
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
      // style 속성의 경우 내부 속성 순서를 정렬
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
 * // DOM 직접 생성이 필요한 경우
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
  // 컨테이너의 전체 HTML을 정규화
  const actualHTML = normalizeHTML(container);
  
  // 예상 HTML을 정규화
  const tempDiv = document.createElement('div');
  if (typeof expectedHTML === 'string') {
    // HTML 문자열을 파싱할 때 HTML 파서가 구조를 변경할 수 있으므로,
    // 실제 DOM 구조를 그대로 유지하기 위해 직접 DOM을 생성
    // 하지만 사용자가 HTML 문자열 그대로를 비교하라고 했으므로,
    // HTML 파서가 파싱한 결과를 그대로 사용
    tempDiv.innerHTML = expectedHTML;
  } else {
    expectedHTML(tempDiv);
  }
  const normalizedExpected = normalizeHTML(tempDiv);
  
  // 비교
  expect(actualHTML).toBe(normalizedExpected);
}
