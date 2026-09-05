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
export { PX_PER_TWIP, pxToTwip, twipToPt, twipToPx, type CssStyle } from './units';

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
