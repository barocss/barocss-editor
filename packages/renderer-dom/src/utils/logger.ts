/**
 * The logger now lives in @barocss/shared, so that packages which do not depend
 * on a renderer — editor-core above all, whose `emit` is the hottest path in the
 * editor — can use the same categories and the same off-by-default behaviour.
 *
 * Re-exported here because this was its public home.
 */
export {
  logger,
  testLogger,
  LogCategory,
  setCategoryEnabled,
  isCategoryEnabled,
  enableAllCategories,
  disableAllCategories,
  type LogCategoryType
} from '@barocss/shared';
