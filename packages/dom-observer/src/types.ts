/**
 * DOM Observer Types
 * 
 * Type definitions related to DOM change detection
 */

/**
 * MutationObserver manager interface
 * 
 * @interface MutationObserverManager
 */
export interface MutationObserverManager {
  /** Setup MutationObserver */
  setup(contentEditableElement: HTMLElement): void;
  
  /** Disconnect MutationObserver */
  disconnect(): void;
  
  /** Handle individual mutation */
  handleMutation(mutation: MutationRecord): void;
}

/**
 * DOM structure change event data
 * 
 * @interface DOMStructureChangeEvent
 */
export interface DOMStructureChangeEvent {
  /** Change type */
  type: 'structure';
  
  /** Added nodes */
  addedNodes: Node[];
  
  /** Removed nodes */
  removedNodes: Node[];
  
  /** Target node where change occurred */
  target: Node;
}

/**
 * Node update event data
 * 
 * @interface NodeUpdateEvent
 */
export interface NodeUpdateEvent {
  /** Change type */
  type: 'attribute';
  
  /** Changed attribute name */
  attributeName: string;
  
  /** Previous value */
  oldValue: string | null;
  
  /** New value */
  newValue: string | null;
  
  /** Changed element */
  target: Element;
  
  /** Node ID */
  nodeId: string | null;
}

/**
 * Text change event data
 * 
 * @interface TextChangeEvent
 */
export interface TextChangeEvent {
  /** Previous text */
  oldText: string | null;
  
  /** New text */
  newText: string | null;
  
  /** Changed node */
  target: Node;
}

/**
 * MutationObserver options
 * 
 * @interface MutationObserverOptions
 */
export interface MutationObserverOptions {
  /** Detect child node changes */
  childList?: boolean;
  
  /** Detect subtree changes */
  subtree?: boolean;
  
  /** Detect text node changes */
  characterData?: boolean;
  
  /** Detect attribute changes */
  attributes?: boolean;
  
  /** Attribute filter to detect */
  attributeFilter?: string[];
  
  /** Store previous value */
  characterDataOldValue?: boolean;
  
  /** Store attribute previous value */
  attributeOldValue?: boolean;
}
