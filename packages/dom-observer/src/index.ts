/**
 * @barocss/dom-observer
 * 
 * DOM mutation observer with text change detection and collaborative editing support
 * 
 * Features:
 * - DOM structure change detection (node addition/removal)
 * - Text content change detection
 * - Attribute change detection
 * - Filtering meaningful changes using data-bc-* attributes
 * - Event-driven architecture for flexible integration
 */

// Main classes
export { MutationObserverManagerImpl } from './mutation-observer-manager';

// Types
export type {
  MutationObserverManager,
  MutationObserverOptions,
  DOMStructureChangeEvent,
  NodeUpdateEvent,
  TextChangeEvent
} from './types';

// Re-export for convenience
export { MutationObserverManagerImpl as MutationObserver } from './mutation-observer-manager';
