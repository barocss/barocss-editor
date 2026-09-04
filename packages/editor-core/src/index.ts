export * from './types';
export { Editor, CommandChain } from './editor';
export { CommandManager, InsertTextCommand, InsertNodeCommand, DeleteNodeCommand, SetSelectionCommand } from './commands';
export * from './keybinding';
export { evaluateWhenExpression } from './when-expression';
export { insideLockedRegion, type Lock } from './locked-region';
export * from './context/default-context';
// Extension interface is exported from types.ts
// Extension implementations are provided by @barocss/extensions package
export { SelectionManager } from './selection-manager';
export { HistoryManager } from './history-manager';
export {
  getLocalizedMessage,
  registerLocaleMessages,
  setDefaultLocale,
  getDefaultLocale,
  hasLocaleMessages,
  loadLocaleMessages,
  initializeI18n,
} from './i18n';

export {
  readSelectionSummary,
  markState,
  markAttribute,
  type SelectionSummary,
  type MarkState
} from './selection-summary';

/**
 * "Tell me when something could change what I would answer."
 *
 * Which events mean that is the editor's own knowledge, not a panel's — see the
 * file for the bug six panels produced by each guessing at it.
 */
export { watchAnswers, watchContent } from './watch';
