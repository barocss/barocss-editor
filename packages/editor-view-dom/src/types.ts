import { Editor } from '@barocss/editor-core';
import type { RendererRegistry, ModelData, RenderEnv } from '@barocss/dsl';
import type {
  DecoratorExportData,
  LoadDecoratorsPatternFunctions,
  DecoratorQueryOptions,
  DecoratorTypeSchema,
  Decorator,
  DecoratorGenerator,
} from '@barocss/shared';
// TreeDocument is removed - use ModelData (sid, stype) directly

export type { DecoratorExportData, LoadDecoratorsPatternFunctions };

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

/**
 * Something that measures a finished render and returns what it learned.
 *
 * The return value is merged into the render environment; returning nothing
 * means nothing changed. See EditorViewDOM.registerLayoutPass for the contract
 * a pass has to satisfy.
 */
export type LayoutPass = (view: any) => RenderEnv | void;

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
  /**
   * Host environment handed to every template this view renders.
   *
   * `editor` is added to it automatically, so a template can always reach the
   * editor it is being rendered by. Everything else is the product's: a Word
   * document's style and numbering resolvers, the page layout, a Slide's theme.
   *
   * Templates receive only the node they are drawing, which is not enough for a
   * node whose appearance depends on the document around it. Products solved
   * that with module-level state, which silently means one document per module —
   * two editors on a page read each other's. This scopes it to the view instead.
   */
  env?: RenderEnv;
  /**
   * The node this view draws, when it is **not the whole document**.
   *
   * A second view of one editor is an ordinary thing — the deck's presenter notes, a site builder's
   * three widths of one page — and until now the only way to say what it drew was to hand
   * `render(tree)` a tree of one's own. That has a consequence nothing wrote down: **`render` mutates
   * the tree it is given** (`_sanitizeTreeContent` assigns to `content`), so a caller tree must be
   * the caller's own. Passing the store's proxy wrote resolved nodes back into the document and
   * crashed the tab; passing a deep copy left the view holding a tree that could never change, so the
   * host had to re-render it on every keystroke — which replaces the DOM under a reader who is typing
   * in it, and loses the caret.
   *
   * Both are answered by saying it here instead. A view with a root asks the editor for *that*
   * subtree, live, on exactly the same path the main view uses — so it redraws itself on a content
   * change, keeps the caret, and the host does nothing.
   */
  rootId?: string;
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
  insertLineBreak(): void;
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
  getDecorators?(options?: DecoratorQueryOptions): (Decorator | DecoratorGenerator)[];
  updateDecorator?(id: string, updates: Partial<Decorator>): boolean;
  removeDecorator?(id: string): boolean;
  defineDecoratorType(type: string, category: 'layer' | 'inline' | 'block', schema: DecoratorTypeSchema): void;
  
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
