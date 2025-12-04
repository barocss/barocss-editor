export * from '@barocss/renderer-dom';

export * from './types';
export { EditorViewDOM } from './editor-view-dom';
export { InputHandlerImpl as InputHandler } from './event-handlers/input-handler';
export { DOMSelectionHandlerImpl as DOMSelectionHandler } from './event-handlers/selection-handler';
export { MutationObserverManagerImpl as MutationObserverManager } from './mutation-observer/mutation-observer-manager';
export { analyzeTextChanges } from '@barocss/text-analyzer';

// Decorator 시스템 export
export * from './decorator';