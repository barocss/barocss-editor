import { Editor } from '@barocss/editor-core';
import type { RendererRegistry, ModelData } from '@barocss/dsl';
// TreeDocument is removed - use ModelData (sid, stype) directly

export interface LayerConfiguration {
  contentEditable?: {
    className?: string;
    attributes?: Record<string, string>;
  };
  decorator?: {
    className?: string;
    attributes?: Record<string, string>;
  };
  selection?: {
    className?: string;
    attributes?: Record<string, string>;
  };
  context?: {
    className?: string;
    attributes?: Record<string, string>;
  };
  custom?: {
    className?: string;
    attributes?: Record<string, string>;
  };
}

export interface EditorViewDOMOptions {
  container: HTMLElement;
  layers?: LayerConfiguration;
  keymaps?: KeymapConfig[];
  inputHandlers?: InputHandlerConfig[];
  mutationObserver?: MutationObserverConfig;
  // Renderer injection/auto-rendering options
  registry?: RendererRegistry; // RendererRegistry
  initialTree?: ModelData | any;  // ModelData format (uses sid, stype)
  autoRender?: boolean;   // Default: true
}

export interface KeymapConfig {
  key: string;
  handler: () => void;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

export interface InputHandlerConfig {
  inputType: string;
  handler: (event: InputEvent) => void;
}

export interface MutationObserverConfig {
  childList?: boolean;
  subtree?: boolean;
  characterData?: boolean;
  attributes?: boolean;
  attributeFilter?: string[];
}

export interface IEditorViewDOM {
  readonly editor: Editor;
  readonly container: HTMLElement;
  readonly contentEditableElement: HTMLElement;
  readonly layers: {
    content: HTMLElement;
    decorator: HTMLElement;
    selection: HTMLElement;
    context: HTMLElement;
    custom: HTMLElement;
  };
  
  // DOM event handling
  handleInput(event: InputEvent): void;
  handleKeydown(event: KeyboardEvent): void;
  handlePaste(event: ClipboardEvent): void;
  handleDrop(event: DragEvent): void;
  handleSelectionChange(): void;
  
  // Selection conversion
  convertDOMSelectionToModel?(sel: Selection): any;
  convertStaticRangeToModel?(staticRange: StaticRange): { type: 'range'; startNodeId: string; startOffset: number; endNodeId: string; endOffset: number; direction?: 'forward' | 'backward' | 'none' } | null;
  convertModelSelectionToDOM?(sel: any): void;
  
  // Browser native commands (delegated to Model-first Commands)
  insertParagraph(): void;
  insertText(text: string): void;
  deleteSelection(): void;
  historyUndo(): void;
  historyRedo(): void;
  
  // Editing commands
  toggleBold(): void;
  toggleItalic(): void;
  toggleUnderline(): void;
  toggleStrikeThrough(): void;
  blur(): void;

  // Rendering API
  render(tree?: ModelData | any): void;        // ModelData format (uses sid, stype) or exported from editor
  
  // Decorator management API
  getDecorators?(options?: any): any[];        // Query decorator list
  
  // Decorator type definition (optional)
  defineDecoratorType(
    type: string,
    category: 'layer' | 'inline' | 'block',
    schema: {
      description?: string;
      dataSchema?: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
        required?: boolean;
        default?: any;
      }>;
    }
  ): void;
  
  // Lifecycle
  destroy(): void;
}

export interface InputHandler {
  handleInput(event: InputEvent): void;
  handleBeforeInput(event: InputEvent): void;
  handleKeyDown?(event: KeyboardEvent): void;
  handleDomMutations?(mutations: MutationRecord[]): void;
  handleTextContentChange?(oldValue: string | null, newValue: string | null, target: Node): void;
}

export interface DOMSelectionHandler {
  handleSelectionChange(): void;
  convertDOMSelectionToModel(selection: Selection): any;
  convertModelSelectionToDOM(modelSelection: any): void;
}

export interface PasteHandler {
  handlePaste(event: ClipboardEvent): void;
  handleDrop(event: DragEvent): void;
}

export interface MutationObserverManager {
  setup(contentEditableElement: HTMLElement): void;
  disconnect(): void;
  handleMutation(mutation: MutationRecord): void;
}

export interface TextChange {
  type: 'insert' | 'delete' | 'replace';
  start: number;        // Change start position (based on oldText)
  end: number;          // Change end position (based on oldText)
  text: string;         // Text to change (insert: text to insert, delete: '', replace: text to replace)
  confidence: number;   // Analysis confidence (0-1)
}

export interface TextChangeAnalysisOptions {
  oldText: string;
  newText: string;
  selectionOffset: number;  // User selection position
  selectionLength?: number; // Selected text length (0 means cursor)
  context?: {
    beforeText?: string;    // Leading context
    afterText?: string;     // Trailing context
  };
}

/**
 * Decorator Export/Import 타입
 */
export interface DecoratorExportData {
  version: string;
  targetDecorators: Array<{
    sid: string;
    stype: string;
    category: 'layer' | 'inline' | 'block';
    data?: Record<string, any>;
    target: any;
    enabled?: boolean;
  }>;
  patternDecorators: Array<{
    sid: string;  // Unified from id → sid
    stype: string;
    category: 'inline' | 'block' | 'layer';
    pattern: { source: string; flags: string }; // RegExp converted to string
    priority?: number;
    enabled?: boolean;
    // extractData and createDecorator are functions, so excluded
    // Functions provided in patternFunctions parameter are used on load
  }>;
}