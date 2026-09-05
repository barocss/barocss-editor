export * from './types';
/**
 * **엔진이 이미 묶은 것.** 제품이 그것을 볼 수 있어야 다시 적지 않는다.
 *
 * 안 내보내고 있었고, 그래서 `office-word` 가 그 중 **열여덟을 다시 적었다** — 그리고 가드가 더
 * 약했다(`editorFocus && editorEditable` 대신 `editorFocus`). 아무도 비교할 수 없었기 때문이다.
 */
export { DEFAULT_KEYBINDINGS } from './keybinding/default-keybindings';
export { Editor, CommandChain } from './editor';
export { CommandManager, InsertTextCommand, InsertNodeCommand, DeleteNodeCommand } from './commands';
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
