/**
 * Google Docs HTML 정리 유틸리티
 *
 * Google Docs에서 복사한 HTML은 wrapper div, style/script 태그,
 * data-*, class 기반 메타 등이 섞여 있습니다.
 * 이 클래스는 불필요한 래퍼 및 태그를 제거하고, body 이하의
 * 실제 콘텐츠만 남겨서 HTMLConverter에 전달하기 위한 역할을 합니다.
 */
export class GoogleDocsHTMLCleaner {
  /**
   * Google Docs HTML을 정리합니다.
   *
   * @param html Google Docs에서 복사한 원본 HTML
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

    // Google Docs 특유의 wrapper div/section 등을 평탄화하려면
    // 여기서 class/id 패턴을 기준으로 언래핑할 수 있지만,
    // 현재는 최소한의 정리만 수행합니다.

    return doc.body.innerHTML;
  }

  /**
   * 지정된 태그 이름들을 모두 제거합니다.
   */
  private _removeElements(root: Element, tagNames: string[]): void {
    for (const tag of tagNames) {
      const elements = root.getElementsByTagName(tag);
      for (let i = elements.length - 1; i >= 0; i--) {
        elements[i].remove();
      }
    }
  }
}


