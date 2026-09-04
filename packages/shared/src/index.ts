/**
 * @barocss/shared
 * 
 * 공용 유틸리티 및 상수
 */

export { IS_MAC, IS_LINUX, IS_WINDOWS } from './platform';
export { getKeyString, isTypingKey } from './key-string';
export { normalizeKeyString, expandModKey } from './key-binding';
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
