import { Editor, ModelSelection, type ModelData } from '@barocss/editor-core';
import { IEditorViewDOM, EditorViewDOMOptions, LayerConfiguration } from './types';
import { InputHandlerImpl } from './event-handlers/input-handler';
import { DOMSelectionHandlerImpl } from './event-handlers/selection-handler';
import { MutationObserverManagerImpl } from './mutation-observer/mutation-observer-manager';
import { DecoratorRegistry, DecoratorManager, DecoratorPrebuilder, type Decorator, type DecoratorQueryOptions, type DecoratorModel } from './decorator/index.js';
import { RemoteDecoratorManager } from './decorator/remote-decorator-manager.js';
import { PatternDecoratorConfigManager, type PatternDecoratorConfig } from './decorator/pattern-decorator-config-manager.js';
import { DecoratorGeneratorManager, type DecoratorGenerator } from './decorator/decorator-generator.js';
import { DOMRenderer } from '@barocss/renderer-dom';
import { RendererRegistry } from '@barocss/dsl';
import type { DecoratorExportData } from './types';
import { getKeyString } from '@barocss/shared';

export class EditorViewDOM implements IEditorViewDOM {
  // Unique ID for instance tracking
  private readonly __instanceId: string;
  
  public readonly editor: Editor;
  public readonly container: HTMLElement;
  public readonly contentEditableElement: HTMLElement;
  public readonly decoratorRegistry: DecoratorRegistry;
  public readonly decoratorManager: DecoratorManager;
  public readonly remoteDecoratorManager: RemoteDecoratorManager;
  public readonly patternDecoratorConfigManager: PatternDecoratorConfigManager;
  public readonly decoratorGeneratorManager: DecoratorGeneratorManager;
  public readonly layers: {
    content: HTMLElement;
    decorator: HTMLElement;
    selection: HTMLElement;
    context: HTMLElement;
    custom: HTMLElement;
  } = {} as any; // Initialized in constructor

  private inputHandler: InputHandlerImpl;
  private selectionHandler: DOMSelectionHandlerImpl;
  private mutationObserverManager: MutationObserverManagerImpl;
  private _isComposing: boolean = false;
  private _selectionChangeTimeout: number | null = null;
  private _isDragging: boolean = false;
  private _isRendering: boolean = false; // Rendering flag
  private _isModelDrivenChange: boolean = false; // Model-First change flag
  // Track nodes being edited (for skipNodes)
  private _editingNodes: Set<string> = new Set();
  private _inputEndDebounceTimer: number | null = null;
  private _pendingRenderTimer: number | null = null;
  private _boundHandleCompositionStart: ((e: CompositionEvent) => void) | null = null;
  // Internal renderer (renderer-dom wrapper)
  private _rendererRegistry?: RendererRegistry;
  private _domRenderer?: DOMRenderer; // For Content layer (existing)
  // DOMRenderer per layer (each with independent prevVNodeTree)
  private _decoratorRenderer?: DOMRenderer;    // For Decorator layer
  private _selectionRenderer?: DOMRenderer;    // For Selection layer
  private _contextRenderer?: DOMRenderer;     // For Context layer
  private _customRenderer?: DOMRenderer;       // For Custom layer
  // Decorator Prebuilder (data transformation)
  private _decoratorPrebuilder?: DecoratorPrebuilder;
  private _hasRendered: boolean = false;
  // Store last rendered modelData (reused when only decorator is updated)
  private _lastRenderedModelData: ModelData | null = null;
  // Options for synchronous rendering in test environment
  private _renderOptions: { sync?: boolean } = {};

  constructor(editor: Editor, options: EditorViewDOMOptions) {
    // Generate unique ID
    this.__instanceId = `editorview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.editor = editor;
    
    // Set _viewDOM reference in Editor (for access from AutoTracer, etc.)
    (editor as any)._viewDOM = this;
    
    // Only support container-based API
    this.container = options.container;
    this.setupLayeredStructure(options.layers);
    
    // contentEditableElement always references layers.content
    this.contentEditableElement = this.layers.content;
    
    // Initialize Decorator system
    // decorators are managed independently from schema
    this.decoratorRegistry = new DecoratorRegistry();
    this.decoratorManager = new DecoratorManager(this.decoratorRegistry);
    this.remoteDecoratorManager = new RemoteDecoratorManager();
    
    // Initialize pattern-based Decorator configuration manager
    this.patternDecoratorConfigManager = new PatternDecoratorConfigManager();
    
    // Initialize Decorator Generator manager (function-based decorator)
    this.decoratorGeneratorManager = new DecoratorGeneratorManager();
    
    // Initialize handlers
    this.inputHandler = new InputHandlerImpl(editor, this);
    this.selectionHandler = new DOMSelectionHandlerImpl(editor);
    this.mutationObserverManager = new MutationObserverManagerImpl(editor, this.inputHandler);
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Setup MutationObserver
    this.mutationObserverManager.setup(this.contentEditableElement);
    

    // Inject/initialize renderer (option-based)
    this._setupContentRenderer(options);

    // Handle autoRender
    const autoRender = options.autoRender !== false;
    if (autoRender && options.initialTree && this._domRenderer) {
      this.render(options.initialTree as any);
    }
  }

  /**
   * New API: Create layered structure inside container
   */
  private setupLayeredStructure(layerConfig?: LayerConfiguration): void {
    const config = this.getDefaultLayerConfig(layerConfig);
    
    // Set container styles
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    
    // Layer 1: Content (contentEditable)
    const contentLayer = document.createElement('div');
    contentLayer.className = config.contentEditable?.className || 'barocss-editor-content';
    contentLayer.contentEditable = 'true';
    contentLayer.style.position = 'relative';
    contentLayer.style.zIndex = '1';
    contentLayer.setAttribute('data-bc-layer', 'content');
    this.applyAttributes(contentLayer, config.contentEditable?.attributes);
    
    // Layer 2: Decorator
    const decoratorLayer = document.createElement('div');
    decoratorLayer.className = config.decorator?.className || 'barocss-editor-decorators';
    decoratorLayer.style.position = 'absolute';
    decoratorLayer.style.top = '0';
    decoratorLayer.style.left = '0';
    decoratorLayer.style.right = '0';
    decoratorLayer.style.bottom = '0';
    decoratorLayer.style.pointerEvents = 'none';
    decoratorLayer.style.zIndex = '10';
    decoratorLayer.setAttribute('data-bc-layer', 'decorator');
    this.applyAttributes(decoratorLayer, config.decorator?.attributes);
    
    // Layer 3: Selection
    const selectionLayer = document.createElement('div');
    selectionLayer.className = config.selection?.className || 'barocss-editor-selection';
    selectionLayer.style.position = 'absolute';
    selectionLayer.style.top = '0';
    selectionLayer.style.left = '0';
    selectionLayer.style.right = '0';
    selectionLayer.style.bottom = '0';
    selectionLayer.style.pointerEvents = 'none';
    selectionLayer.style.zIndex = '100';
    selectionLayer.setAttribute('data-bc-layer', 'selection');
    this.applyAttributes(selectionLayer, config.selection?.attributes);
    
    // Layer 4: Context
    const contextLayer = document.createElement('div');
    contextLayer.className = config.context?.className || 'barocss-editor-context';
    contextLayer.style.position = 'absolute';
    contextLayer.style.top = '0';
    contextLayer.style.left = '0';
    contextLayer.style.right = '0';
    contextLayer.style.bottom = '0';
    contextLayer.style.pointerEvents = 'none';
    contextLayer.style.zIndex = '200';
    contextLayer.setAttribute('data-bc-layer', 'context');
    this.applyAttributes(contextLayer, config.context?.attributes);
    
    // Layer 5: Custom
    const customLayer = document.createElement('div');
    customLayer.className = config.custom?.className || 'barocss-editor-custom';
    customLayer.style.position = 'absolute';
    customLayer.style.top = '0';
    customLayer.style.left = '0';
    customLayer.style.right = '0';
    customLayer.style.bottom = '0';
    customLayer.style.pointerEvents = 'none';
    customLayer.style.zIndex = '1000';
    customLayer.setAttribute('data-bc-layer', 'custom');
    this.applyAttributes(customLayer, config.custom?.attributes);
    
    // Add layers to container (in z-index order)
    this.container.appendChild(contentLayer);
    this.container.appendChild(decoratorLayer);
    this.container.appendChild(selectionLayer);
    this.container.appendChild(contextLayer);
    this.container.appendChild(customLayer);
    
    // Set layers object
    this.layers.content = contentLayer;
    this.layers.decorator = decoratorLayer;
    this.layers.selection = selectionLayer;
    this.layers.context = contextLayer;
    this.layers.custom = customLayer;
  }
  
  
  /**
   * Get default layer configuration
   */
  private getDefaultLayerConfig(userConfig?: LayerConfiguration): Required<LayerConfiguration> {
    return {
      contentEditable: {
        className: 'barocss-editor-content',
        attributes: {},
        ...userConfig?.contentEditable
      },
      decorator: {
        className: 'barocss-editor-decorators',
        attributes: {},
        ...userConfig?.decorator
      },
      selection: {
        className: 'barocss-editor-selection',
        attributes: {},
        ...userConfig?.selection
      },
      context: {
        className: 'barocss-editor-context',
        attributes: {},
        ...userConfig?.context
      },
      custom: {
        className: 'barocss-editor-custom',
        attributes: {},
        ...userConfig?.custom
      }
    };
  }
  
  /**
   * Apply attributes to element
   */
  private applyAttributes(element: HTMLElement, attributes?: Record<string, string>): void {
    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }
  }

  private setupEventListeners(): void {
    console.log('[EditorViewDOM] setupEventListeners');
    // Input events
    this.contentEditableElement.addEventListener('input', this.handleInput.bind(this) as EventListener);
    this.contentEditableElement.addEventListener('beforeinput', this.handleBeforeInput.bind(this));
    this.contentEditableElement.addEventListener('keydown', this.handleKeydown.bind(this));
    this._boundHandleCompositionStart = this.handleCompositionStart.bind(this);
    this.contentEditableElement.addEventListener('compositionstart', this._boundHandleCompositionStart);
    this.contentEditableElement.addEventListener('paste', this.handlePaste.bind(this));
    this.contentEditableElement.addEventListener('drop', this.handleDrop.bind(this));
    
    // compositionstart: block IME when selection is not in inline-text (see handleCompositionStart)
    // IME state also tracked via beforeinput.isComposing; MutationObserver handles actual input

    // Selection events
    document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
    
    // Event listeners for drag detection
    this.contentEditableElement.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));

    // Model selection → DOM selection bridge
    this.editor.on('editor:selection.model', (sel: any) => {
      this._pendingModelSelection = sel;
      
      // Wait until rendering completes if rendering is in progress (applied in rendering completion callback)
      // Apply immediately if rendering is complete
      if (!this._isRendering) {
        this.applyModelSelectionWithRetry();
      }
    });

    // Handle blur request from Escape key
    this.editor.on('editor:blur.request', () => {
      this.blur();
    });

    // Render on content change
    // CharacterData changes detected by MutationObserver are handled with skipRender: true to
    // prevent race conditions between rendering during input and selection changes
    this.editor.on('editor:content.change', (e: any) => {
      // Ignore if rendering (prevent infinite loop)
      if (this._isRendering) {
        return;
      }
      
      // Skip rendering if skipRender: true
      // CharacterData changes detected by MutationObserver are during input, so
      // delay rendering to prevent race conditions with selection
      if (e?.skipRender) {
        return;
      }
      this.render();
      // Note: selection is automatically maintained by browser, so do not call applyModelSelectionWithRetry()
      // Browser selection should not be changed during user input
      // applyModelSelectionWithRetry() is only called in editor:selection.model event
    });

    // text_update event removed - always use full rendering via diff
    
    // Focus events
    this.contentEditableElement.addEventListener('focus', this.handleFocus.bind(this));
    this.contentEditableElement.addEventListener('blur', this.handleBlur.bind(this));
  }

  private setupKeymapHandlers(): void {
    // keymapManager-based shortcuts are no longer used.
    // All key inputs are handled through editor-core's keybinding system.
  }

  // DOM event handling
  handleInput(event: InputEvent): void {
    // Detect input start
    this._onInputStart();
    this.inputHandler.handleInput(event);
  }

  handleBeforeInput(event: InputEvent): void {
    // Track IME composition state using isComposing property of beforeinput event
    // Use beforeinput's isComposing instead of composition event listener
    if (event.isComposing !== undefined) {
      this._isComposing = event.isComposing;
    }
    
    this.inputHandler.handleBeforeInput(event);
  }

  /**
   * Block composition (IME) when selection is not inside inline-text.
   * Safari: blocking at compositionstart avoids Korean input attaching to wrong region.
   * See docs/editable-regions-and-contenteditable-strategy.md §3.4.
   */
  handleCompositionStart(event: CompositionEvent): void {
    if (!this.isSelectionInsideEditableText(window.getSelection() ?? undefined)) {
      event.preventDefault();
    }
  }

  // composition event handler: see setupEventListeners (handleCompositionStart)
  // Track IME composition state using isComposing property of beforeinput event
  // Actual processing is handled by MutationObserver

  /**
   * Returns true if the selection (or current DOM selection) is entirely inside
   * inline-text nodes. Used to restrict character input to editable text only.
   * See docs/editable-regions-and-contenteditable-strategy.md §3.
   */
  isSelectionInsideEditableText(domSelection?: Selection): boolean {
    const sel = domSelection ?? window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    if (!sel.anchorNode || !this.contentEditableElement.contains(sel.anchorNode)) return false;
    if (sel.focusNode && !this.contentEditableElement.contains(sel.focusNode)) return false;

    const dataStore = (this.editor as any).dataStore;
    if (!dataStore?.getNode) return false;

    const checkNode = (node: Node | null): boolean => {
      if (!node) return false;
      const el = node.nodeType === Node.TEXT_NODE ? (node.parentElement as Element | null) : (node as Element);
      if (!el) return false;
      const found = el.closest('[data-bc-sid]');
      if (!found) return false;
      const sid = found.getAttribute('data-bc-sid');
      if (!sid) return false;
      const modelNode = dataStore.getNode(sid);
      if (!modelNode) return false;
      const stype = (modelNode as { stype?: string }).stype ?? (modelNode as { type?: string }).type;
      return stype === 'inline-text';
    };

    return checkNode(sel.anchorNode) && checkNode(sel.focusNode ?? sel.anchorNode);
  }

  handleKeydown(event: KeyboardEvent): void {
    // Delegate to InputHandler first for future KeyBindingManager integration
    if ((this.inputHandler as any).handleKeyDown) {
      (this.inputHandler as any).handleKeyDown(event);
    }

    // Do not handle structure changes/command shortcuts during IME composition
    // - Leave composition string modifications (Enter/Backspace, etc.) to IME/browser
    // - Model structure changes are only handled in MutationObserver/C1/C2/C3 path after compositionend
    if (this._isComposing) {
      return;
    }

    // Restrict character input to inline-text only. Block when selection is not in editable text.
    // Skip when keyCode 229 (IME may be handling). See docs/editable-regions-and-contenteditable-strategy.md §3.
    const isCharacterKey = event.key.length === 1 && !['Enter', 'Tab', 'Escape'].includes(event.key) && !event.ctrlKey && !event.metaKey;
    if (isCharacterKey && event.keyCode !== 229 && !this.isSelectionInsideEditableText()) {
      event.preventDefault();
      return;
    }

    const key = getKeyString(event);
    
    console.log('[EditorViewDOM] handleKeydown:', key);
    
    // Delegate all keys to editor-core keybinding system
    // Backspace, Delete are also handled through keybinding system
    // context is automatically managed inside Editor
    const resolved = this.editor.keybindings.resolve(key);
    if (resolved.length > 0) {
      const { command, args } = resolved[0];
      event.preventDefault();
      // Command automatically reads editor.selection
      // Can override with args if needed
      void this.editor.executeCommand(command, args);
    }
  }

  /**
   * Backspace 키 처리 (Model-First)
   * 
   * 책임:
   * - DOM Selection 읽기 및 Model Selection 변환
   * - Backspace Command 호출 (모든 비즈니스 로직은 Command에서 처리)
   */
  private handleBackspaceKey(): void {
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) return;

    // Convert DOM Selection → Model Selection
    const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
    if (!modelSelection || modelSelection.type === 'none') {
      console.warn('[EditorViewDOM] handleBackspaceKey: Failed to convert DOM selection', { modelSelection });
      return;
    }

    // Call Backspace Command (all case branching and logic handled in Command)
    this.editor.executeCommand('backspace', { selection: modelSelection });
  }

  /**
   * Delete 키 처리 (Model-First)
   * 커서 오른쪽 글자 삭제 및 다음 편집 가능한 노드 기준 블록/노드 병합
   */
  private handleDeleteKey(): void {
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) return;

    // Convert DOM selection to Model selection
    const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
    if (!modelSelection || modelSelection.type === 'none') {
      console.warn('[EditorViewDOM] handleDeleteKey: Failed to convert DOM selection', { modelSelection });
      return;
    }
    
    // Call DeleteForward Command (all case branching and logic handled in Command)
    this.editor.executeCommand('deleteForward', { selection: modelSelection });
  }

  handlePaste(event: ClipboardEvent): void {
    // Do not intercept paste during IME composition
    // Leave paste within composition string to IME/browser
    if (this._isComposing) {
      return;
    }

    event.preventDefault();
    
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const text = clipboardData.getData('text/plain');
    if (text) {
      this.insertText(text);
    }
  }

  handleDrop(event: DragEvent): void {
    // Do not intercept drop during IME composition
    if (this._isComposing) {
      return;
    }

    event.preventDefault();
    
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;

    const text = dataTransfer.getData('text/plain');
    if (text) {
      this.insertText(text);
    }
  }

  handleSelectionChange(): void {
    // 1. Ignore if programmatic selection change
    if ((this.selectionHandler as any)._isProgrammaticChange) {
      return;
    }

    // 2. Ignore if focus is outside editor (fastest check)
    if (document.activeElement !== this.contentEditableElement) {
      return;
    }

    // 3. Check if selection exists
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode) {
      return;
    }

    // 4. Check if anchorNode is inside contentEditableElement
    const isInsideEditor = this.contentEditableElement.contains(selection.anchorNode);
    if (!isInsideEditor) {
      return;
    }

    // 5. Check Devtool area
    let node: Node | null = selection.anchorNode;
    while (node) {
      if (node instanceof Element && node.hasAttribute('data-devtool')) {
        return;
      }
      node = node.parentNode;
    }

    // 6. Cancel existing timer if present
    if (this._selectionChangeTimeout) {
      clearTimeout(this._selectionChangeTimeout);
    }

    // 7. Apply debouncing during drag or rapid consecutive selection changes
    const isRapidChange = this._isDragging;
    const debounceDelay = isRapidChange ? 100 : 16; // During drag: 100ms, normal: 16ms (60fps)

    this._selectionChangeTimeout = window.setTimeout(() => {
      this._processSelectionChange();
      this._selectionChangeTimeout = null;
    }, debounceDelay);
  }

  private _processSelectionChange(): void {
    try {
      const sel = window.getSelection();
      const anchorNode = sel?.anchorNode as Node | null;
      const focusNode = sel?.focusNode as Node | null;
      const anchorId = ((anchorNode?.nodeType === Node.ELEMENT_NODE ? (anchorNode as Element) : anchorNode?.parentElement)?.closest?.('[data-bc-sid]')?.getAttribute('data-bc-sid')) || null;
      const focusId = ((focusNode?.nodeType === Node.ELEMENT_NODE ? (focusNode as Element) : focusNode?.parentElement)?.closest?.('[data-bc-sid]')?.getAttribute('data-bc-sid')) || null;
      
      // Calculate selection direction
      let direction: 'forward' | 'backward' | 'unknown' = 'unknown';
      if (anchorId && focusId) {
        if (anchorId === focusId) {
          // Selection within same node
          direction = (sel?.anchorOffset || 0) <= (sel?.focusOffset || 0) ? 'forward' : 'backward';
        } else {
          // Selection across different nodes - determine by DOM order
          const anchorEl = anchorNode?.nodeType === Node.ELEMENT_NODE ? (anchorNode as Element) : anchorNode?.parentElement;
          const focusEl = focusNode?.nodeType === Node.ELEMENT_NODE ? (focusNode as Element) : focusNode?.parentElement;
          
          if (anchorEl && focusEl) {
            const anchorContainer = anchorEl.closest('[data-bc-sid]');
            const focusContainer = focusEl.closest('[data-bc-sid]');
            
            if (anchorContainer && focusContainer) {
              const position = anchorContainer.compareDocumentPosition(focusContainer);
              direction = (position & Node.DOCUMENT_POSITION_FOLLOWING) ? 'forward' : 'backward';
            }
          }
        }
      }
      
      const info = {
        anchorOffset: sel?.anchorOffset,
        focusOffset: sel?.focusOffset,
        anchorNodeType: anchorNode?.nodeType,
        focusNodeType: focusNode?.nodeType,
        anchorTextPreview: anchorNode?.nodeType === Node.TEXT_NODE ? (anchorNode as Text).data.slice(0, 16) : null,
        focusTextPreview: focusNode?.nodeType === Node.TEXT_NODE ? (focusNode as Text).data.slice(0, 16) : null,
        anchorId,
        focusId,
        direction,
        collapsed: sel?.isCollapsed || false,
        isDragging: this._isDragging
      };
      // Delegate to selectionHandler (prevent duplicate calls)
    } catch {}
    this.selectionHandler.handleSelectionChange();
  }

  private handleMouseDown(event: MouseEvent): void {
    // Check drag possibility on mouse down
    this._isDragging = false;
  }

  private handleMouseMove(event: MouseEvent): void {
    // Dragging if mouse is moving and button is pressed
    if (event.buttons > 0) {
      this._isDragging = true;
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    // End drag on mouse up
    if (this._isDragging) {
      this._isDragging = false;
      // Process selection immediately after drag ends
      if (this._selectionChangeTimeout) {
        clearTimeout(this._selectionChangeTimeout);
        this._selectionChangeTimeout = null;
      }
      this._processSelectionChange();
    }
  }

  private applyModelSelectionToDOM(sel: any): void {
    try {
      // Convert ModelSelection to format understood by SelectionHandler
      // sel is already in unified ModelSelection format (startNodeId/endNodeId)
      if (!sel || sel.type === 'none') {
        return;
      }
      
      // Use SelectionHandler to convert to accurate DOM selection
      // (includes handling text nodes split by mark/decorator)
      this.selectionHandler.convertModelSelectionToDOM(sel);
    } catch (e) {
      console.warn('[EditorViewDOM] applyModelSelectionToDOM:error', e);
    }
  }

  private findLeafTextNode(el: Element): Text | null {
    // First text node under el
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    return (walker.nextNode() as Text | null) || null;
  }

  private _pendingModelSelection: any | null = null;
  private _retryCount: number = 0;
  private applyModelSelectionWithRetry(): void {
    const sel = this._pendingModelSelection;
    if (!sel || sel.type === 'none') return;
    
    const found = sel.startNodeId && this.layers.content.querySelector(`[data-bc-sid="${sel.startNodeId}"]`)
      && sel.endNodeId && this.layers.content.querySelector(`[data-bc-sid="${sel.endNodeId}"]`);
    
    if (found) {
      this.applyModelSelectionToDOM(sel);
      this._pendingModelSelection = null;
      this._retryCount = 0;
      return;
    }
    if (this._retryCount > 10) {
      console.warn('[EditorViewDOM] selection retry exceeded', { sel });
      this._retryCount = 0;
      return;
    }
    this._retryCount++;
    requestAnimationFrame(() => this.applyModelSelectionWithRetry());
  }

  private handleFocus(): void {
    this.editor.emit('editor:selection.focus');
    // Try to reapply last model selection to DOM when focus returns
    try {
      const current = this.editor.selectionManager.getCurrentSelection();
      if (current) {
        this._pendingModelSelection = current;
        this.applyModelSelectionWithRetry();
      }
    } catch {}
  }

  private handleBlur(): void {
    // Detect input end when focus leaves
    this._onInputEnd();
    this.editor.emit('editor:selection.blur');
  }

  // Browser native commands → delegate to Model-first Commands
  insertParagraph(): void {
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      // Execute simple command if no selection (extension determines default position)
      this.editor.executeCommand('insertParagraph', {});
      return;
    }

    const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
    if (!modelSelection || modelSelection.type === 'none') {
      console.warn('[EditorViewDOM] insertParagraph: Failed to convert DOM selection', {
        modelSelection
      });
      this.editor.executeCommand('insertParagraph', {});
      return;
    }

    this.editor.executeCommand('insertParagraph', { selection: modelSelection });
  }

  insertText(text: string): void {
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      this.editor.executeCommand('insertText', { text });
      return;
    }

    const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
    if (!modelSelection || modelSelection.type === 'none') {
      console.warn('[EditorViewDOM] insertText: Failed to convert DOM selection', {
        modelSelection
      });
      this.editor.executeCommand('insertText', { text });
      return;
    }

    this.editor.executeCommand('insertText', { text, selection: modelSelection });
  }

  private insertLineBreak(): void {
    this.insertText('\n');
  }

  deleteSelection(): void {
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) return;

    const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
    if (!modelSelection || modelSelection.type === 'none') {
      console.warn('[EditorViewDOM] deleteSelection: Failed to convert DOM selection', {
        modelSelection
      });
      return;
    }

    this.editor.executeCommand('deleteSelection', { selection: modelSelection });
  }

  historyUndo(): void {
    this.editor.executeCommand('historyUndo', {});
  }

  historyRedo(): void {
    this.editor.executeCommand('historyRedo', {});
  }

  private selectAll(): void {
    this.editor.executeCommand('selectAll', {});
  }

  // Editing commands
  toggleBold(): void {
    this.editor.executeCommand('toggleBold');
  }

  toggleItalic(): void {
    this.editor.executeCommand('toggleItalic');
  }

  toggleUnderline(): void {
    this.editor.executeCommand('toggleUnderline');
  }

  toggleStrikeThrough(): void {
    this.editor.executeCommand('toggleStrikeThrough');
  }

  blur(): void {
    this.contentEditableElement.blur();
  }

  // Utility methods


  // Lifecycle
  destroy(): void {
    // Cleanup Decorator system
    this.decoratorManager.clear();
    this.decoratorManager.removeAllListeners();
    
    // Remove event listeners
    this.contentEditableElement.removeEventListener('input', this.handleInput.bind(this) as EventListener);
    this.contentEditableElement.removeEventListener('beforeinput', this.handleBeforeInput.bind(this));
    this.contentEditableElement.removeEventListener('keydown', this.handleKeydown.bind(this));
    if (this._boundHandleCompositionStart) {
      this.contentEditableElement.removeEventListener('compositionstart', this._boundHandleCompositionStart);
      this._boundHandleCompositionStart = null;
    }
    this.contentEditableElement.removeEventListener('paste', this.handlePaste.bind(this));
    this.contentEditableElement.removeEventListener('drop', this.handleDrop.bind(this));
    
    document.removeEventListener('selectionchange', this.handleSelectionChange.bind(this));
    
    // Remove drag detection event listeners
    this.contentEditableElement.removeEventListener('mousedown', this.handleMouseDown.bind(this));
    document.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    document.removeEventListener('mouseup', this.handleMouseUp.bind(this));
    
    this.contentEditableElement.removeEventListener('focus', this.handleFocus.bind(this));
    this.contentEditableElement.removeEventListener('blur', this.handleBlur.bind(this));
    
    // Disconnect MutationObserver
    this.mutationObserverManager.disconnect();
    
    // Cleanup layers
    this.cleanupLayers();
  }
  
  /**
   * Cleanup all layers
   */
  private cleanupLayers(): void {
    // Cleanup content of each layer
    Object.values(this.layers).forEach(layer => {
      if (layer && layer.parentNode) {
        // Cleanup inside layer
        layer.innerHTML = '';
        
        // Remove event listeners (if any)
        const clonedLayer = layer.cloneNode(false) as HTMLElement;
        layer.parentNode.replaceChild(clonedLayer, layer);
      }
    });
  }

  // ----- Renderer internal setup -----
  private _setupContentRenderer(options: EditorViewDOMOptions): void {
    console.log('[EditorViewDOM] _setupContentRenderer:start');
    
    // Do not recreate if already set (preserve prevVNodeTree)
    if (this._domRenderer) {
      return;
    }
    
    // 1. Use registry passed from outside (priority 1)
    if (options.registry) {
      this._rendererRegistry = options.registry;
    } else {
      // 2. Create new (allow global registry lookup)
      // global:false → lookup items not in local registry from global registry
      this._rendererRegistry = new RendererRegistry({ global: false });
    }
    
    // 3. Create DOMRenderer for Content layer (selection preservation enabled)
    // Templates must be defined externally (call define() in main.ts, etc.)
    this._domRenderer = new DOMRenderer(this._rendererRegistry, {
      enableSelectionPreservation: true,
      name: 'content',
      dataStore: this.editor.dataStore
    });
    
    // 4. Create DOMRenderer per layer (each with independent prevVNodeTree)
    this._decoratorRenderer = new DOMRenderer(this._rendererRegistry, { 
      name: 'decorator',
      dataStore: this.editor.dataStore
    });
    this._selectionRenderer = new DOMRenderer(this._rendererRegistry, { 
      name: 'selection',
      dataStore: this.editor.dataStore
    });
    this._contextRenderer = new DOMRenderer(this._rendererRegistry, { 
      name: 'context',
      dataStore: this.editor.dataStore
    });
    this._customRenderer = new DOMRenderer(this._rendererRegistry, { 
      name: 'custom',
      dataStore: this.editor.dataStore
    });
    
    // 5. Initialize Decorator Prebuilder (pass contentRenderer for ComponentManager access)
    if (this._domRenderer) {
      this._decoratorPrebuilder = new DecoratorPrebuilder(
        this._rendererRegistry!,
        this.layers.content,
        this._domRenderer
      );
    }
    
    // Apply pattern configurations to Content DOMRenderer
    this._applyPatternConfigsToRenderer();
  }
  
  /**
   * Apply pattern configurations to DOMRenderer
   * Only registers enabled patterns.
   */
  private _applyPatternConfigsToRenderer(): void {
    if (!this._domRenderer) return;
    
    const generator = this._domRenderer.getPatternDecoratorGenerator();
    
    // Remove all existing patterns
    const allConfigs = this.patternDecoratorConfigManager.getConfigs();
    for (const config of allConfigs) {
      generator.unregisterPattern(config.sid);
    }
    
    // Register only enabled patterns (default is true)
    const enabledConfigs = this.patternDecoratorConfigManager.getConfigs(true);
    for (const config of enabledConfigs) {
      generator.registerPattern({
        sid: config.sid,
        stype: config.stype,
        category: config.category,
        pattern: config.pattern,
        extractData: config.extractData,
        createDecorator: config.createDecorator,
        priority: config.priority
      });
    }
    
    // Pattern decorators are enabled by default
    generator.setEnabled(true);
  }
  
  convertModelSelectionToDOM(sel: ModelSelection): void {
    this.selectionHandler.convertModelSelectionToDOM(sel);
  }

  convertDOMSelectionToModel(sel: Selection): ModelSelection {
    return this.selectionHandler.convertDOMSelectionToModel(sel);
  }

  /**
   * Convert StaticRange (from InputEvent.getTargetRanges()) to ModelSelection.
   * Used for beforeinput + getTargetRanges() path to define input region before browser modifies DOM.
   */
  convertStaticRangeToModel(staticRange: StaticRange) {
    return this.selectionHandler.convertStaticRangeToModel(staticRange);
  }

  // External render API
  render(tree?: ModelData | any, options?: { sync?: boolean }): void {
    if (!this._domRenderer) {
      console.warn('[EditorViewDOM] No DOM renderer available');
      return;
    }
    
    // Set rendering flag (prevent infinite loop)
    if (this._isRendering) {
      return; // Ignore if already rendering
    }
    this._isRendering = true;
    
    // Set Model-First change flag (for MutationObserver filtering)
    this._isModelDrivenChange = true;
    
    try {
      // Save options (used in addDecorator, etc.)
      if (options) {
        this._renderOptions = { ...this._renderOptions, ...options };
      }
    
    // 1. Get document
    let modelData: ModelData | null = null;
    
    if (tree) {
      // Model passed from outside - already in ModelData format (uses sid, stype)
      if (!tree.stype) {
        console.error('[EditorViewDOM] Invalid tree format: missing stype (required)');
        return;
      }
      if (!tree.sid) {
        console.error('[EditorViewDOM] Invalid tree format: missing sid (required)');
        return;
      }
      // Use directly without conversion
      modelData = tree as ModelData;
    } else {
      // Get directly from editor - use getDocumentProxy() (lazy evaluation)
      try {
        const exported = this.editor.getDocumentProxy?.();
        if (exported) {
          // getDocumentProxy() returns INode already wrapped in Proxy (ModelData compatible)
          modelData = exported as ModelData;
        } else {
          // Reuse previously rendered modelData if no modelData (when only updating decorator)
          if (this._lastRenderedModelData) {
            modelData = this._lastRenderedModelData;
          } else {
            // Decorators can be rendered even without modelData
          }
        }
      } catch (error) {
        console.error('[EditorViewDOM] Error exporting document:', error);
        // Try to reuse previous modelData even if error occurs
        if (this._lastRenderedModelData) {
          modelData = this._lastRenderedModelData;
        }
      }
    }
    
    // 2. Get Decorators (EditorModel - local + remote)
    // Decorators can be rendered even without modelData
    // EditorModel is local-only, so get from decoratorManager, not dataStore
    let localDecorators: Decorator[] = [];
    try {
      const allLocalDecorators = this.decoratorManager.getAll();
      if (allLocalDecorators && allLocalDecorators.length > 0) {
        localDecorators = allLocalDecorators;
      }
    } catch (error) {
      console.error('[EditorViewDOM] Error getting local decorators:', error);
    }
    
    // Collect remote decorators (decorators from external users/AI in collaborative editing)
    let remoteDecorators: Decorator[] = [];
    try {
      remoteDecorators = this.remoteDecoratorManager.getAll();
    } catch (error) {
      console.error('[EditorViewDOM] Error getting remote decorators:', error);
    }
    
    // 3. Generate Generator-based decorators
    let generatorDecorators: Decorator[] = [];
    if (modelData) {
      try {
        generatorDecorators = this._generateGeneratorDecorators(modelData);
      } catch (error) {
        console.error('[EditorViewDOM] Error generating generator decorators:', error);
      }
    }
    
    // Integrate all decorators (local + remote + generator)
    const allDecorators = [...localDecorators, ...remoteDecorators, ...generatorDecorators] as Decorator[];
    
    // 4. Collect selection information (for Content layer rendering)
    const selection = window.getSelection();
    let selectionContext: { 
      textNode?: Text; 
      restoreSelection?: (textNode: Text, offset: number) => void;
      model?: { sid: string; modelOffset: number };
    } | undefined = undefined;
    
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const textNode = range.startContainer.nodeType === Node.TEXT_NODE 
        ? range.startContainer as Text 
        : null;
      const domOffset = range.startOffset;
      
      if (textNode && this.layers.content.contains(textNode)) {
        // Convert to Model selection to get sid and modelOffset
        try {
          const modelSel = this.selectionHandler.convertDOMSelectionToModel(selection);
          if (modelSel && modelSel.anchor) {
            selectionContext = {
              textNode,
              restoreSelection: (node: Text, offset: number) => {
                const range = document.createRange();
                range.setStart(node, offset);
                range.setEnd(node, offset);
                const sel = window.getSelection();
                if (sel) {
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
              },
              model: {
                sid: modelSel.anchor.nodeId || '',
                modelOffset: modelSel.anchor.offset || 0
              }
            };
          } else {
            // Pass only DOM-based if Model selection conversion fails
            selectionContext = {
              textNode,
              restoreSelection: (node: Text, offset: number) => {
                const range = document.createRange();
                range.setStart(node, offset);
                range.setEnd(node, offset);
                const sel = window.getSelection();
                if (sel) {
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
              }
            };
          }
        } catch (error) {
          // Ignore if selection conversion fails (optional feature)
          console.debug('[EditorViewDOM] Failed to convert selection for preservation:', error);
        }
      }
    }
    
    // 5. Render Content layer first (synchronous)
    // Render Content if modelData exists, otherwise render only decorators
    // Re-render content even when reusing _lastRenderedModelData (reflect decorator updates)
    if (modelData) {
      try {
        this._domRenderer?.render(
          this.layers.content, 
          modelData, 
          allDecorators, 
          undefined, 
          selectionContext,
          {
            onComplete: () => {
              // Apply pending selection after Reconcile completes
              if (this._pendingModelSelection) {
                // Apply in next frame (ensure DOM update completes)
                requestAnimationFrame(() => {
                  this.applyModelSelectionWithRetry();
                });
              }
            }
          }
        );
        this._hasRendered = true;
        // Store last rendered modelData (reuse when only decorator is updated)
        this._lastRenderedModelData = modelData;
      } catch (error) {
        console.error('[EditorViewDOM] Error rendering content:', error);
        // Try rendering decorator even if Content rendering fails
      }
    } else if (this._lastRenderedModelData && allDecorators.length > 0) {
      // If no modelData but decorator exists and previous rendered data exists, re-render content
      // (to reflect decorator updates in content layer)
      try {
        this._domRenderer?.render(
          this.layers.content, 
          this._lastRenderedModelData, 
          allDecorators, 
          undefined, 
          selectionContext,
          {
            onComplete: () => {
              // Apply pending selection after Reconcile completes
              if (this._pendingModelSelection) {
                // Apply in next frame (ensure DOM update completes)
                requestAnimationFrame(() => {
                  this.applyModelSelectionWithRetry();
                });
              }
            }
          }
        );
      } catch (error) {
        console.error('[EditorViewDOM] Error re-rendering content with decorators:', error);
      }
    }
    
    // 5. Render other layers after requestAnimationFrame
    // DOM position calculation possible after Content rendering completes
    // Decorator can be rendered even without modelData (use previously rendered DOM)
    if (allDecorators.length > 0) {
      const renderLayers = () => {
        // If no modelData, use previously rendered DOM for position calculation
        const dataForLayers = modelData || (this._hasRendered ? {} as ModelData : null);
        if (dataForLayers !== null) {
          this._renderLayers(allDecorators, dataForLayers);
        }
      };
      
      // If sync option exists, execute synchronously (for test environment)
      if (options?.sync || this._renderOptions.sync) {
        renderLayers();
      } else {
        requestAnimationFrame(renderLayers);
      }
    }
    } finally {
      // Clear flag after rendering completes
      this._isRendering = false;
      
      // Clear Model-First change flag (in next event loop)
      setTimeout(() => {
        this._isModelDrivenChange = false;
      }, 0);
    }
  }

  /**
   * Render by layer (excluding Content)
   */
  private _renderLayers(allDecorators: Decorator[], modelData: ModelData): void {
    if (!this._decoratorPrebuilder) {
      console.warn('[EditorViewDOM] DecoratorPrebuilder not initialized');
      return;
    }
    
    try {
      // 1. Convert all decorators to DecoratorModel using DecoratorPrebuilder
      const decoratorModels = this._decoratorPrebuilder.buildAll(allDecorators, modelData);
      
      // 2. Separate by layer
      const decoratorLayerModels: DecoratorModel[] = [];
      const selectionLayerModels: DecoratorModel[] = [];
      const contextLayerModels: DecoratorModel[] = [];
      const customLayerModels: DecoratorModel[] = [];
      
      for (const model of decoratorModels) {
        // Inline decorator should only be rendered in content layer
        // Do not include in other layers
        if (model.category === 'inline') {
          continue; // Inline decorator is only processed in content layer
        }
        
        const layerTarget = model.layerTarget || 'content';
        switch (layerTarget) {
          case 'decorator':
            decoratorLayerModels.push(model);
            break;
          case 'selection':
            selectionLayerModels.push(model);
            break;
          case 'context':
            contextLayerModels.push(model);
            break;
          case 'custom':
            customLayerModels.push(model);
            break;
          // 'content' is already rendered in Content layer
        }
      }
      
      // 3. Render each layer (use renderChildren)
      if (decoratorLayerModels.length > 0 && this._decoratorRenderer) {
        this._decoratorRenderer.renderChildren(this.layers.decorator, decoratorLayerModels);
      }
      
      if (selectionLayerModels.length > 0 && this._selectionRenderer) {
        this._selectionRenderer.renderChildren(this.layers.selection, selectionLayerModels);
      }
      
      if (contextLayerModels.length > 0 && this._contextRenderer) {
        this._contextRenderer.renderChildren(this.layers.context, contextLayerModels);
      }
      
      if (customLayerModels.length > 0 && this._customRenderer) {
        this._customRenderer.renderChildren(this.layers.custom, customLayerModels);
      }
    } catch (error) {
      console.error('[EditorViewDOM] Error rendering layers:', error);
    }
  }

  // Selection restore utility (usable from toolbar, etc.)
  restoreLastSelection(): void {
    try {
      // If DOM selection is empty, apply last model selection
      const sel = window.getSelection();
      const hasSelection = !!sel && sel.rangeCount > 0;
      if (!hasSelection) {
        const current = (this.editor as any).selection;
        if (current) {
          this._pendingModelSelection = current;
          this.applyModelSelectionWithRetry();
        }
      }
    } catch {}
  }

  /**
   * 패턴 설정 배열 설정
   * 
   * 패턴 설정을 배열로 관리합니다.
   * 
   * main.ts에서 사용:
   * ```typescript
   * view.setPatternDecoratorConfigs([
   *   {
   *     sid: 'hex-color',
   *     stype: 'color-picker',
   *     pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,
   *     extractData: (match) => ({ color: match[0] }),
   *     createDecorator: (nodeId, start, end, data) => ({
   *       sid: `pattern-hex-${nodeId}-${start}-${end}`,
   *       category: 'inline',
   *       target: { sid: nodeId, startOffset: start, endOffset: end },
   *       data: { color: data.color }
   *     }),
   *     priority: 10
   *   }
   * ]);
   * ```
   */
  setPatternDecoratorConfigs(configs: PatternDecoratorConfig[]): void {
    this.patternDecoratorConfigManager.setConfigs(configs);
    this._applyPatternConfigsToRenderer();
  }
  
  /**
   * 패턴 설정 추가
   */
  addPatternDecoratorConfig(config: PatternDecoratorConfig): void {
    this.patternDecoratorConfigManager.addConfig(config);
    this._applyPatternConfigsToRenderer();
  }
  
  /**
   * 패턴 기반 Decorator 등록 (편의 메서드)
   * 
   * EditorModel이 로컬 전용이므로 EditorViewDOM에서 직접 등록합니다.
   * 
   * main.ts에서 사용:
   * ```typescript
   * view.registerPatternDecorator({
   *   sid: 'hex-color',
   *   stype: 'color-picker',
   *   pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,
   *   extractData: (match) => ({ color: match[0] }),
   *   createDecorator: (nodeId, start, end, data) => ({
   *     sid: `pattern-hex-${nodeId}-${start}-${end}`,
   *     category: 'inline',
   *     target: { sid: nodeId, startOffset: start, endOffset: end },
   *     data: { color: data.color }
   *   }),
   *   priority: 10
   * });
   * ```
   */
  registerPatternDecorator(config: PatternDecoratorConfig): void {
    this.addPatternDecoratorConfig(config);
  }
  
  /**
   * 패턴 설정 제거
   */
  removePatternDecoratorConfig(sid: string): boolean {
    const removed = this.patternDecoratorConfigManager.removeConfig(sid);
    if (removed) {
      this._applyPatternConfigsToRenderer();
    }
    return removed;
  }
  
  /**
   * 패턴 기반 Decorator 제거 (편의 메서드)
   */
  unregisterPatternDecorator(sid: string): boolean {
    return this.removePatternDecoratorConfig(sid);
  }
  
  /**
   * 모든 패턴 설정 가져오기
   */
  getPatternDecoratorConfigs(): PatternDecoratorConfig[] {
    return this.patternDecoratorConfigManager.getConfigs();
  }
  
  /**
   * 패턴 설정 활성화/비활성화
   * 
   * @param id - 패턴 ID
   * @param enabled - 활성화 여부
   */
  setPatternDecoratorEnabled(id: string, enabled: boolean): boolean {
    const updated = this.patternDecoratorConfigManager.setConfigEnabled(id, enabled);
    if (updated) {
      this._applyPatternConfigsToRenderer();
    }
    return updated;
  }
  
  /**
   * 패턴 설정 활성화 여부 확인
   * 
   * @param sid - 패턴 SID
   * @returns 활성화 여부 (기본값: true)
   */
  isPatternDecoratorEnabled(sid: string): boolean {
    return this.patternDecoratorConfigManager.isConfigEnabled(sid);
  }

  // ----- Decorator management (EditorModel - local only) -----
  
  /**
   * Decorator 타입 정의 (선택적)
   * 
   * 타입을 정의하면 해당 타입의 decorator에 대해 검증과 기본값 적용이 수행됩니다.
   * 타입을 정의하지 않아도 decorator를 사용할 수 있습니다 (선택적 타입 시스템).
   * 
   * @example
   * ```typescript
   * // Type definition (optional)
   * view.defineDecoratorType('highlight', 'inline', {
   *   description: 'Highlight decorator',
   *   dataSchema: {
   *     color: { type: 'string', default: 'yellow' },
   *     opacity: { type: 'number', default: 0.3 }
   *   }
   * });
   * 
   * // Now highlight type is validated
   * view.addDecorator({
   *   sid: 'd1',
   *   stype: 'highlight',
   *   category: 'inline',
   *   target: { sid: 't1', startOffset: 0, endOffset: 5 },
   *   data: { color: 'red' }  // opacity applies default value 0.3
   * });
   * ```
   */
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
  ): void {
    if (category === 'layer') {
      this.decoratorRegistry.registerLayerType(type, schema);
    } else if (category === 'inline') {
      this.decoratorRegistry.registerInlineType(type, schema);
    } else if (category === 'block') {
      this.decoratorRegistry.registerBlockType(type, schema);
    }
  }
  
  /**
   * Decorator 추가 (EditorModel - 로컬 전용)
   * 
   * 일반 decorator와 패턴 decorator 설정 모두 지원합니다.
   * 
   * Usage in main.ts:
   * ```typescript
   * // Add general decorator
   * view.addDecorator({
   *   sid: 'comment-1',
   *   type: 'comment',
   *   category: 'inline',
   *   target: {
   *     sid: 'text-1',
   *     startOffset: 0,
   *     endOffset: 5
   *   },
   *   data: {
   *     author: 'user1',
   *     text: 'This is a comment'
   *   }
   * });
   * 
   * // Add pattern decorator configuration (unified format)
   * view.addDecorator({
   *   sid: 'hex-color',
   *   type: 'color-picker', // Actual decorator type
   *   category: 'inline',
   *   decoratorType: 'pattern', // Indicates pattern decorator
   *   target: { sid: '' }, // Pattern decorator has no target
   *   data: {
   *     pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,
   *     extractData: (match) => ({ color: match[0] }),
   *     createDecorator: (nodeId, start, end, data) => ({
   *       sid: `pattern-hex-${nodeId}-${start}-${end}`,
   *       target: { sid: nodeId, startOffset: start, endOffset: end },
   *       data: { color: data.color }
   *     }),
   *     priority: 10
   *   }
   * });
   * ```
   */
  addDecorator(decorator: Decorator | DecoratorGenerator): void {
    // Check decoratorType
    const decoratorType = 'decoratorType' in decorator 
      ? decorator.decoratorType 
      : ('generate' in decorator ? 'custom' : undefined);
    
    // custom (function-based) decorator
    if (decoratorType === 'custom' || 'generate' in decorator) {
      const generator = decorator as DecoratorGenerator;
      // Register onDidChange callback (re-render on change detection)
      this.decoratorGeneratorManager.registerGenerator(
        generator,
        () => this.render(undefined, this._renderOptions) // Re-render on change detection (preserve options)
      );
      this.render(undefined, this._renderOptions);
      return;
    }
    
    // pattern decorator
    const isPattern = decoratorType === 'pattern' || (decorator.data && 'pattern' in decorator.data);
    if (isPattern) {
      const patternConfig = this._convertDecoratorToPatternConfig(decorator as Decorator);
      if (patternConfig) {
        this.patternDecoratorConfigManager.addConfig(patternConfig);
        this._applyPatternConfigsToRenderer();
      }
      return;
    }
    
    // target (general) decorator
    const targetDecorator: Decorator = {
      ...(decorator as Decorator),
      decoratorType: decoratorType || 'target'
    };
    this.decoratorManager.add(targetDecorator);
    this.render(undefined, this._renderOptions);
  }
  
  /**
   * Decorator를 PatternDecoratorConfig로 변환
   */
  private _convertDecoratorToPatternConfig(decorator: Decorator): PatternDecoratorConfig | null {
    const data = decorator.data || {};
    
    if (!data.pattern || !data.extractData || !data.createDecorator) {
      return null;
    }
    
    return {
      sid: decorator.sid,
      stype: decorator.stype,
      category: decorator.category,
      pattern: data.pattern as RegExp | ((text: string) => Array<{
        match: string;
        index: number;
        groups?: RegExpMatchArray['groups'];
        [key: number]: string | undefined;
      }>),
      extractData: data.extractData as (match: RegExpMatchArray) => Record<string, any>,
      createDecorator: data.createDecorator as (
        nodeId: string,
        startOffset: number,
        endOffset: number,
        extractedData: Record<string, any>
      ) => {
        sid: string;
        target: {
          sid: string;
          startOffset: number;
          endOffset: number;
        };
        data?: Record<string, any>;
        category?: 'inline' | 'block' | 'layer';
        layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
      } | Array<{
        sid: string;
        target: {
          sid: string;
          startOffset: number;
          endOffset: number;
        };
        data?: Record<string, any>;
        category?: 'inline' | 'block' | 'layer';
        layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
      }>,
      priority: data.priority as number | undefined,
      enabled: decorator.enabled
    };
  }
  
  /**
   * PatternDecoratorConfig를 Decorator로 변환
   */
  private _convertPatternConfigToDecorator(config: PatternDecoratorConfig): Decorator {
    return {
      sid: config.sid,
      stype: config.stype,
      category: config.category,
      target: { sid: '' }, // Pattern decorator has no target (auto-generated from text)
      decoratorType: 'pattern', // Indicates pattern decorator
      data: {
        pattern: config.pattern,
        extractData: config.extractData,
        createDecorator: config.createDecorator,
        priority: config.priority
      },
      enabled: config.enabled
    };
  }
  
  /**
   * Remove decorator
   * 
   * Can remove general decorators, pattern decorator configurations, and custom decorators.
   */
  removeDecorator(id: string): boolean {
    // Attempt to remove custom decorator
    const customRemoved = this.decoratorGeneratorManager.unregisterGenerator(id);
    if (customRemoved) {
      this.render();
      return true;
    }
    
    // Attempt to remove pattern decorator configuration
    const patternRemoved = this.patternDecoratorConfigManager.removeConfig(id);
    if (patternRemoved) {
      this._applyPatternConfigsToRenderer();
      return true;
    }
    
    // Attempt to remove general decorator
    try {
      this.decoratorManager.remove(id);
      this.render();
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Update decorator
   * 
   * Only general decorators can be updated.
   */
  updateDecorator(id: string, updates: Partial<Decorator>): boolean {
    try {
      this.decoratorManager.update(id, updates);
      // Auto re-render on decorator update (preserve options)
      this.render(undefined, this._renderOptions);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Enable/disable decorator
   * 
   * Supports regular decorators, pattern decorator configs, and custom decorators.
   */
  setDecoratorEnabled(id: string, enabled: boolean): boolean {
    // Try to enable/disable custom decorator
    const customUpdated = this.decoratorGeneratorManager.setGeneratorEnabled(id, enabled);
    if (customUpdated) {
      this.render();
      return true;
    }
    
    // Try to enable/disable pattern decorator config
    const patternUpdated = this.patternDecoratorConfigManager.setConfigEnabled(id, enabled);
    if (patternUpdated) {
      this._applyPatternConfigsToRenderer();
      return true;
    }
    
    // Try to enable/disable regular decorator
    const updated = this.decoratorManager.setEnabled(id, enabled);
    if (updated) {
      this.render();
    }
    return updated;
  }
  
  /**
   * Check if decorator is enabled
   * 
   * Can check regular decorators, pattern decorator configs, and custom decorators.
   */
  isDecoratorEnabled(id: string): boolean {
    // Check custom decorator
    if (this.decoratorGeneratorManager.isGeneratorEnabled(id)) {
      return true;
    }
    
    // Check pattern decorator config
    if (this.patternDecoratorConfigManager.isConfigEnabled(id)) {
      return true;
    }
    
    // Check regular decorator
    return this.decoratorManager.isEnabled(id);
  }
  
  /**
   * Get all decorators
   * 
   * Returns regular decorators, pattern decorator configs, and custom decorators.
   * 
   * Note: Custom decorators are of type DecoratorGenerator, so the type is different.
   */
  getDecorators(options?: DecoratorQueryOptions): (Decorator | DecoratorGenerator)[] {
    const regularDecorators = this.decoratorManager.getAll(options);
    
    // Also convert pattern decorator configs to Decorator format and include
    const patternConfigs = this.patternDecoratorConfigManager.getConfigs(
      options?.enabledOnly !== false // Default is true
    );
    const patternDecorators = patternConfigs.map(config => 
      this._convertPatternConfigToDecorator(config)
    );
    
    // Include custom decorators
    const customDecorators = this.decoratorGeneratorManager.getAllGenerators(
      options?.enabledOnly !== false
    );
    
    return [...regularDecorators, ...patternDecorators, ...customDecorators];
  }
  
  /**
   * Get specific decorator
   * 
   * Can retrieve regular decorators, pattern decorator configs, and custom decorators.
   */
  getDecorator(id: string): Decorator | DecoratorGenerator | undefined {
    // Retrieve custom decorator
    const generator = this.decoratorGeneratorManager.getGenerator(id);
    if (generator) {
      return generator;
    }
    
    // Retrieve regular decorator
    const decorator = this.decoratorManager.get(id);
    if (decorator) {
      return decorator;
    }
    
    // Retrieve pattern decorator config
    const configs = this.patternDecoratorConfigManager.getConfigs();
    const config = configs.find(c => c.id === id);
    if (config) {
      return this._convertPatternConfigToDecorator(config);
    }
    
    return undefined;
  }
  
  /**
   * Export all decorators as JSON
   * 
   * Includes both regular decorators and pattern decorator configs.
   * Functions cannot be serialized, so pattern decorator functions are excluded.
   * 
   * Usage in main.ts:
   * ```typescript
   * const exportData = view.exportDecorators();
   * const json = JSON.stringify(exportData, null, 2);
   * localStorage.setItem('decorators', json);
   * ```
   */
  exportDecorators(): DecoratorExportData {
    // Regular decorators (target decorators)
    const targetDecorators = this.decoratorManager.getAll({ enabledOnly: false })
      .filter(d => d.decoratorType !== 'pattern')
      .map(d => {
        const { decoratorType, ...rest } = d;
        return rest; // Return as-is without conversion (includes stype)
      });
    
    // Pattern decorator configs (functions excluded)
    const patternConfigs = this.patternDecoratorConfigManager.getConfigs();
    const patternDecorators = patternConfigs.map(config => ({
      sid: config.sid,
      stype: config.stype,
      category: config.category,
      pattern: {
        source: config.pattern.source,
        flags: config.pattern.flags
      },
      priority: config.priority,
      enabled: config.enabled
    }));
    
    return {
      version: '1.0.0',
      targetDecorators,
      patternDecorators
    };
  }
  
  /**
   * Load decorators from JSON
   * 
   * Pattern decorator functions are found in the following order:
   * 1. Functions provided in patternFunctions parameter
   * 2. Functions registered in global pattern registry (modularized patterns)
   * 
   * Usage in main.ts:
   * ```typescript
   * // Method 1: Provide functions directly
   * const json = localStorage.getItem('decorators');
   * if (json) {
   *   const exportData = JSON.parse(json);
   *   view.loadDecorators(exportData, {
   *     'hex-color': {
   *       extractData: (match) => ({ color: match[0] }),
   *       createDecorator: (nodeId, start, end, data) => ({
   *         sid: `pattern-hex-${nodeId}-${start}-${end}`,
   *         target: { sid: nodeId, startOffset: start, endOffset: end },
   *         data: { color: data.color }
   *       })
   *     }
   *   });
   * }
   * 
   * // Method 2: Use modularized patterns
   * // Separate patterns into modules and reuse functions
   * import { hexColorPattern } from './patterns/hex-color';
   * 
   * const json = localStorage.getItem('decorators');
   * if (json) {
   *   const exportData = JSON.parse(json);
   *   view.loadDecorators(exportData, {
   *     'hex-color': {
   *       extractData: hexColorPattern.extractData,
   *       createDecorator: hexColorPattern.createDecorator
   *     }
   *   });
   * }
   * ```
   */
  loadDecorators(
    data: DecoratorExportData,
    patternFunctions?: Record<string, {
      extractData: (match: RegExpMatchArray) => Record<string, any>;
      createDecorator: (
        nodeId: string,
        startOffset: number,
        endOffset: number,
        extractedData: Record<string, any>
      ) => {
        sid: string;
        target: {
          sid: string;
          startOffset: number;
          endOffset: number;
        };
        data?: Record<string, any>;
      };
    }>
  ): void {
    // Remove all existing decorators
    this.decoratorManager.clear();
    this.patternDecoratorConfigManager.clear();
    this.decoratorGeneratorManager.clear();
    
    // Load regular decorators
    for (const decorator of data.targetDecorators) {
      this.decoratorManager.add({
        ...decorator,
        decoratorType: 'target'
      }); // Return as-is without conversion (includes stype)
    }
    
    // Load pattern decorator settings
    for (const patternData of data.patternDecorators) {
      // Find function in patternFunctions
      const functions = patternFunctions?.[patternData.sid];
      
      if (!functions) {
        console.warn(`[EditorViewDOM] Pattern decorator '${patternData.sid}' functions not provided. ` +
          `Please provide functions in patternFunctions parameter.`);
        continue;
      }
      
      // Reconstruct RegExp
      const pattern = new RegExp(patternData.pattern.source, patternData.pattern.flags);
      
      // Convert to decorator format and add
      this.addDecorator({
        sid: patternData.sid,
        stype: patternData.stype,
        category: patternData.category,
        decoratorType: 'pattern',
        target: { sid: '' },
        data: {
          pattern,
          extractData: functions.extractData,
          createDecorator: functions.createDecorator,
          priority: patternData.priority
        },
        enabled: patternData.enabled
      });
    }
    
    // Re-render
    this.render();
  }

  /**
   * Generate decorators based on generator (internal method)
   */
  private _generateGeneratorDecorators(model: ModelData): Decorator[] {
    const decorators: Decorator[] = [];
    
    // Recursively find all text nodes and run generator
    const traverse = (node: ModelData): void => {
      const text = node.text && typeof node.text === 'string' ? node.text : null;
      const generatorDecorators = this.decoratorGeneratorManager.generateDecorators(
        node,
        text,
        { documentModel: model }
      );
      decorators.push(...generatorDecorators);
      
      // Recursively process child nodes
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };
    
    traverse(model);
    return decorators;
  }

  /**
   * Extract sid of currently editing nodes based on Selection
   * Method for skipNodes functionality
   */
  private _getEditingNodeSids(): Set<string> {
    const sids = new Set<string>();
    const selection = window.getSelection();
    
    if (!selection || selection.rangeCount === 0) {
      return sids;
    }
    
    const range = selection.getRangeAt(0);
    
    // Extract sid from anchor/focus nodes
    const getSidFromNode = (node: Node): string | null => {
      let el: Element | null = null;
      if (node.nodeType === Node.TEXT_NODE) {
        el = node.parentElement;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        el = node as Element;
      }
      
      if (!el) return null;
      
      const foundEl = el.closest('[data-bc-sid]');
      return foundEl?.getAttribute('data-bc-sid') || null;
    };
    
    const startSid = getSidFromNode(range.startContainer);
    const endSid = getSidFromNode(range.endContainer);
    
    if (startSid) sids.add(startSid);
    if (endSid && endSid !== startSid) sids.add(endSid);
    
    return sids;
  }

  /**
   * Called at input start
   * Add currently editing nodes to editingNodes based on current Selection
   */
  private _onInputStart(): void {
    const sids = this._getEditingNodeSids();
    sids.forEach(sid => {
      this._editingNodes.add(sid);
    });
  }

  /**
   * Called at input end
   * Remove from editingNodes after debounce
   * 
   * Note: Does not re-render
   * - During input, browser directly updates DOM
   * - We only update model (skipRender: true)
   * - Re-rendering after input ends may conflict with selection
   */
  private _onInputEnd(): void {
    // debounce: wait for a certain time after input completes
    if (this._inputEndDebounceTimer) {
      clearTimeout(this._inputEndDebounceTimer);
    }
    
    this._inputEndDebounceTimer = window.setTimeout(() => {
      // Initialize editingNodes
      this._editingNodes.clear();
      
      this._inputEndDebounceTimer = null;
    }, 500); // 500ms debounce
  }
}


