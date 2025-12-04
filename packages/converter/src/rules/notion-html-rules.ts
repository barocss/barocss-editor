import { defineParser } from '../api';

/**
 * Notion HTML 변환 규칙 등록
 *
 * Notion은 각 블록을 div/span과 data-*, class 조합으로 표현합니다.
 * 여기서는 최소한의 블록 타입만 잡아주고, 나머지는 기본 HTML 규칙에 맡깁니다.
 */
export function registerNotionHTMLRules(): void {
  // Paragraph 블록: data-block-id를 가진 div를 paragraph로 매핑
  defineParser('paragraph', 'html', {
    parseDOM: [
      {
        tag: 'div',
        getAttrs: (node) => {
          const blockId = node.getAttribute('data-block-id');
          if (!blockId) return null;
          // paragraph 여부는 class명 등으로 더 엄밀히 구분할 수 있지만
          // 여기서는 "블록 id가 있으면 paragraph" 정도로만 본다.
          // data-block-id는 _extractAttributes에서도 잡히므로 여기서는
          // 별도 attrs를 추가하지 않는다.
          return {};
        },
        priority: 10
      }
    ]
  });

  // Checkbox / task list 등은 추후 확장 포인트로 남겨둔다.
}


