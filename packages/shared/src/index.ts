/**
 * @barocss/shared
 * 
 * 공용 유틸리티 및 상수
 */

export { IS_MAC, IS_LINUX, IS_WINDOWS } from './platform';
export { getKeyString, isTypingKey } from './key-string';
export { normalizeKeyString, expandModKey } from './key-binding';

/**
 * **선택** — `selection.ts` 에 왜 여기인지가 적혀 있다. 요약하면: 두 뷰 층의 DOM↔모델 변환을 그 둘
 * 아래에 두려면 타입도 그 아래여야 하고, 그 변환이 쓰는 런 색인은 이미 이 패키지에 있다.
 */
/**
 * **문서의 길이 단위** — `twipToPx` 가 두 패키지에 있었고 **두 판이 다른 답을 냈다**(20만 중
 * 58,306개가 다른 CSS 문자열). `units.ts` 에 잰 표가 있다.
 */
export { PX_PER_TWIP, pxToTwip, sideways, twipToPt, twipToPx, type CssStyle } from './units';

/**
 * **자리** — DOM 의 한 점과 모델의 한 점을 맞바꾸는 규칙 한 벌. `docs/specs/text-position.md`.
 */
export {
  bestContainer,
  closestDataNode,
  collapseBoundaries,
  domPointFromModelOffset,
  firstTextNodeIn,
  holdsText,
  isTextContainer,
  offsetAtElementBoundary,
  offsetWithRuns,
  resolveBoundaries,
  runsIn,
  runsOf,
  selectionDirection,
  textContainerInside,
  type DOMPoint,
  type ModelPoint,
  type ResolvedBoundaries,
  type PositionContext
} from './text-position';

/**
 * **범위가 덮는 글자** — `collapsed` 가 답하지 못하는 마지막 한 칸(`selection-text.ts` 머리 주석).
 */
export {
  extractModelTextFromRange,
  selectsCharacters,
  type ModelTextReader
} from './selection-text';

export {
  createNodeSelection,
  fromDOMSelection,
  isCursor,
  isModelSelection,
  isNodeSelection,
  isRangeSelection,
  selectedNodeIds,
  withLiveNodes,
  type ModelSelection,
  type NoSelection,
  type MaybeSelection,
  type SelectionType
} from './selection';
export {
  dragGesture,
  type GestureMoved,
  type GestureHandlers,
  type GestureOptions
} from './gesture';
export { replacePlaceholders, normalizeLocale } from './i18n';

export * from './decorator';
export * from './text-run-index';
export { formatCounter, NumberFormat, type NumberFormatValue } from './number-format';

export {
  logger,
  testLogger,
  LogCategory,
  setCategoryEnabled,
  isCategoryEnabled,
  enableAllCategories,
  disableAllCategories,
  enableCategoriesFromStorage,
  DEBUG_STORAGE_KEY,
  type LogCategoryType
} from './logger';
export { __DEV__, __TEST__ } from './dev';

// `beforeinput` 의 inputType 어휘. 두 뷰가 각자 손으로 적어 두던 목록이다.
export * from './input-type';

// 문서를 파일로 — 봉투, 세션 이름 걷어내기, 넷 중 어느 것인지 말하는 거절.
export * from './document-file/document-file';

// 문서를 어디에 두는가 — IndexedDB 한 벌과 이름 짓기. 브라우저는 함수 안에서만 부른다.
export * from './document-library/document-library';
export * from './document-save/document-save';
export * from './document-save/document-session';
export * from './document-save/product-host';
export * from './document-save/product-archive';
export { FRAGMENT_CLIPBOARD_TYPE } from './clipboard';
