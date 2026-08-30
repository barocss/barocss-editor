export * from '@barocss/renderer-dom';

export * from './types';
export { EditorViewDOM } from './editor-view-dom';
export { selectionRectIn } from './selection-rect';
export { insideLockedRegion } from './locked-region';
export { InputHandlerImpl as InputHandler } from './event-handlers/input-handler';
export { DOMSelectionHandlerImpl as DOMSelectionHandler } from './event-handlers/selection-handler';
export { MutationObserverManagerImpl as MutationObserverManager } from './mutation-observer/mutation-observer-manager';
export { analyzeTextChanges } from '@barocss/text-analyzer';

// Export Decorator system (explicit Decorator re-export overrides renderer-dom's Decorator)
export * from './decorator';
export type { Decorator } from './decorator';