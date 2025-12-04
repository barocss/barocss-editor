import { defineParser } from '../api';

/**
 * Google Docs HTML 변환 규칙 등록
 *
 * 현재는 기본 HTML 규칙을 주로 사용하고,
 * Google Docs 특유의 heading/paragraph 패턴 일부만 보완합니다.
 */
export function registerGoogleDocsHTMLRules(): void {
  // Google Docs는 대부분 <p> 기반으로 렌더링되지만,
  // 경우에 따라 data-*, class, style로 heading을 표현하기도 합니다.
  //
  // 여기서는 data-heading-level 속성이 있는 경우를 heading으로 간주합니다.

  defineParser('heading', 'html', {
    parseDOM: [
      {
        tag: 'p',
        getAttrs: (node) => {
          const levelAttr =
            node.getAttribute('data-heading-level') ||
            node.getAttribute('data-heading') ||
            undefined;
          if (!levelAttr) {
            return null;
          }
          const level = parseInt(levelAttr, 10);
          if (!Number.isFinite(level) || level <= 0) {
            return null;
          }
          return { level };
        },
        priority: 50
      }
    ]
  });

  // 나머지 요소들(div/span 등)은 기본 HTML 규칙과 fallback에 맡깁니다.
}


