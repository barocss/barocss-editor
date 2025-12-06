export * from './types';
export { Editor, CommandChain } from './editor';
export { CommandManager, InsertTextCommand, InsertNodeCommand, DeleteNodeCommand, SetSelectionCommand } from './commands';
export { PluginManager, AutoSavePlugin } from './plugins';
export * from './keybinding';
export { evaluateWhenExpression } from './when-expression';
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
