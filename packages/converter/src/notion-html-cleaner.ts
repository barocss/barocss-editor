/**
 * Notion HTML 정리 유틸리티
 *
 * Notion 페이지에서 복사한 HTML은 data-*, class 기반 블록 메타와
 * wrapper div 등이 포함됩니다. 이 클래스는 최소한의 정리를 수행하여
 * HTMLConverter가 해석하기 쉬운 형태로 만듭니다.
 */
export class NotionHTMLCleaner {
  /**
   * Notion HTML을 정리합니다.
   *
   * @param html Notion에서 복사한 원본 HTML
   * @returns 정리된 HTML (body 내부 콘텐츠 기준)
   */
  clean(html: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    if (!doc.body) {
      return html;
    }

    // style / script 태그 제거
    this._removeElements(doc.body, ['style', 'script']);

    // Notion은 보통 최상위에 여러 div 블록이 있고,
    // 각 div가 하나의 블록을 나타냅니다.
    // 여기서는 wrapper 전체는 유지하되, 불필요한 style/class는 그대로 두고
    // 후속 파서 규칙에서 data-*, class를 활용하도록 둡니다.

    return doc.body.innerHTML;
  }

  private _removeElements(root: Element, tagNames: string[]): void {
    for (const tag of tagNames) {
      const elements = root.getElementsByTagName(tag);
      for (let i = elements.length - 1; i >= 0; i--) {
        elements[i].remove();
      }
    }
  }
}


