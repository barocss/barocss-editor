import { Editor, ModelSelection } from '@barocss/editor-core';
import type { ModelData, RenderEnv } from '@barocss/dsl';
import { IEditorViewDOM, EditorViewDOMOptions, LayerConfiguration, LayoutPass } from './types';
import { InputHandlerImpl } from './event-handlers/input-handler';
import { DOMSelectionHandlerImpl } from './event-handlers/selection-handler';
import { MutationObserverManagerImpl } from './mutation-observer/mutation-observer-manager';
import { DecoratorManager, RemoteDecoratorManager, PatternDecoratorConfigManager, DecoratorGeneratorManager, stripChromeElements, stripFiller } from '@barocss/shared';
import type { PatternDecoratorConfig, DecoratorGenerator } from '@barocss/shared';
import { DecoratorRegistry, DecoratorPrebuilder, type Decorator, type DecoratorQueryOptions, type DecoratorModel } from './decorator';
import { DOMRenderer, logger, LogCategory } from '@barocss/renderer-dom';
import { RendererRegistry } from '@barocss/dsl';
import type { DecoratorExportData, LoadDecoratorsPatternFunctions } from './types';
import { getKeyString, isTypingKey } from '@barocss/shared';

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
  /** Which composition is running, so an ending one cannot clear its successor. */
  private _compositionGeneration: number = 0;
  private _selectionChangeTimeout: number | null = null;
  private _isDragging: boolean = false;
  private _isRendering: boolean = false; // Rendering flag
  /**
   * How many renders are still settling.
   *
   * A count rather than a flag. Renders nest and queue — a layout pass renders
   * off the back of a render, a decorator change renders again — and each one
   * used to schedule its own reset. The first reset then fired while a later
   * render's mutations were still arriving, and the MutationObserver read a
   * render's own output as something the user had typed.
   */
  private _modelDrivenRenders = 0;
  /** A content change arrived mid-render and still has to be drawn. */
  private _renderMissedAChange = false;
  private _decoratorBatchDepth = 0;
  private _decoratorRenderPending = false;
  // Track nodes being edited (for skipNodes)
  private _editingNodes: Set<string> = new Set();
  private _inputEndDebounceTimer: number | null = null;
  private _pendingRenderTimer: number | null = null;
  // Internal renderer (renderer-dom wrapper)
  private _rendererRegistry?: RendererRegistry;
  private _domRenderer?: DOMRenderer; // For Content layer (existing)
  // DOMRenderer per layer (each with independent prevVNodeTree)
  /** Host environment handed to templates; see EditorViewDOMOptions.env. */
  private _env: RenderEnv = {};

  /** Passes that measure a finished render; see registerLayoutPass. */
  private _layoutPasses: LayoutPass[] = [];

  /** Guard so a pass's own re-render does not run the passes again. */
  private _runningLayoutPasses = false;



  private _decoratorRenderer?: DOMRenderer;    // For Decorator layer
  private _selectionRenderer?: DOMRenderer;    // For Selection layer
  private _contextRenderer?: DOMRenderer;     // For Context layer
  private _customRenderer?: DOMRenderer;       // For Custom layer
  private _boundHandleInput: ((event: InputEvent) => void) | null = null;
  private _boundHandleBeforeInput: ((event: InputEvent) => void) | null = null;
  private _boundHandleKeydown: ((event: KeyboardEvent) => void) | null = null;
  private _boundHandlePaste: ((event: ClipboardEvent) => void) | null = null;
  private _boundHandleCompositionStart: (() => void) | null = null;
  private _boundHandleCompositionEnd: (() => void) | null = null;
  private _boundHandleCopy: ((event: ClipboardEvent) => void) | null = null;
  private _boundHandleDrop: ((event: DragEvent) => void) | null = null;
  private _boundHandleSelectionChange: ((event?: Event) => void) | null = null;
  private _boundHandleMouseDown: ((event: MouseEvent) => void) | null = null;
  private _boundHandleMouseMove: ((event: MouseEvent) => void) | null = null;
  private _boundHandleMouseUp: ((event: MouseEvent) => void) | null = null;
  private _boundHandleFocus: ((event?: FocusEvent) => void) | null = null;
  private _boundHandleBlur: ((event?: FocusEvent) => void) | null = null;
  // Decorator Prebuilder (data transformation)
  private _decoratorPrebuilder?: DecoratorPrebuilder;
  private _hasRendered: boolean = false;
  // Store last rendered modelData (reused when only decorator is updated)
  private _lastRenderedModelData: ModelData | null = null;
  // Options for synchronous rendering in test environment
  private _renderOptions: { sync?: boolean } = {};

  private _resolveLayerTarget(decorator: Decorator): 'content' | 'decorator' | 'selection' | 'context' | 'custom' {
    if (decorator.layerTarget) {
      return decorator.layerTarget;
    }

    // Default target follows the same rule as DecoratorPrebuilder:
    // layer -> decorator, otherwise content
    if (decorator.category === 'layer') {
      return 'decorator';
    }
    return 'content';
  }

  private _filterDecoratorsForContentLayer(decorators: Decorator[]): Decorator[] {
    return decorators.filter((decorator) => this._resolveLayerTarget(decorator) === 'content');
  }

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
    logger.debug(LogCategory.DOM, 'setupEventListeners');
    // Input events
    this._boundHandleInput = this.handleInput.bind(this);
    this._boundHandleBeforeInput = this.handleBeforeInput.bind(this);
    this._boundHandleKeydown = this.handleKeydown.bind(this);
    this.contentEditableElement.addEventListener('input', this._boundHandleInput as EventListener);
    this.contentEditableElement.addEventListener('beforeinput', this._boundHandleBeforeInput);
    this.contentEditableElement.addEventListener('keydown', this._boundHandleKeydown);
    this._boundHandlePaste = this.handlePaste.bind(this);
    this._boundHandleDrop = this.handleDrop.bind(this);
    this.contentEditableElement.addEventListener('paste', this._boundHandlePaste);
    // Strip the caret filler out of anything leaving the editor. The zero-width
    // character is renderer bookkeeping, not content, and a native copy reads the
    // DOM directly — so without this it rides along into other applications.
    this._boundHandleCopy = this.handleCopy.bind(this);
    this.contentEditableElement.addEventListener('copy', this._boundHandleCopy);
    this.contentEditableElement.addEventListener('cut', this._boundHandleCopy);
    this.contentEditableElement.addEventListener('drop', this._boundHandleDrop);

    /**
     * Composed text is not read here. Whether a composition is open is.
     *
     * The text an IME produces is written by the MutationObserver, which diffs
     * the model against the DOM, so it arrives the same way whatever order a
     * given IME fires its events in — that is why composition events are not
     * used to read text, and that does not change. What these two listeners
     * carry is *state*: whether a composition is open. Five things turn on it —
     * whether keydown is handled, whether paste and drop are handled, whether a
     * content change is drawn, and whether the observer trusts its records
     * during a typing burst.
     *
     * That state used to be guessed from `beforeinput.isComposing` and from
     * keydown's keyCode 229, and the guess was wrong in both directions:
     *
     *   - keyCode 229 set it on a key the IME had merely taken. An IME that
     *     swallows a key and composes nothing — navigating a candidate list does
     *     precisely that — left it set with nothing to take it back.
     *   - No `beforeinput` and no `input` ever reports a composition as over: a
     *     commit's last event is an `input` with `isComposing: true`. Measured
     *     300ms after `compositionend`, with nothing pending, it was still set.
     *
     * And while it is set, `editor:content.change` is dropped without rendering
     * *and* without being remembered — so any change that is not typing (a
     * command, a comment, another author) is silently never drawn, and paste and
     * drop are ignored. Typing hid it, by clearing the flag through its own
     * `beforeinput` on the way in.
     *
     * `beforeinput.isComposing` still sets it, for an IME that fires no
     * composition events at all. These two only make the same state observed
     * rather than guessed: `compositionstart` is the earliest signal there is,
     * measured a millisecond ahead of the first composing `beforeinput` and both
     * of them ahead of anything the IME writes. Clearing is deferred a task
     * because a MutationObserver delivers its records in a microtask, so
     * whatever a commit wrote is imported while the flag is still set — which is
     * what keeps the observer from reading a commit's own records as a typing
     * burst's. Measured zero records arriving after `compositionend` in Chrome;
     * the deferral is for the IMEs that do.
     */
    this._boundHandleCompositionStart = () => {
      this._compositionGeneration += 1;
      this._isComposing = true;
    };
    this._boundHandleCompositionEnd = () => {
      /**
       * A composition ending is not the same as composing being over.
       *
       * Korean ends one composition and starts the next in the same
       * millisecond, every time a syllable is finished: 안 is committed and the
       * ㄴ that finished it opens the next composition, all inside one
       * keystroke. Clearing on the strength of the end alone therefore cleared a
       * flag that the composition *after* it had already set — measured by hand:
       * two renders inside every open composition, one per syllable boundary,
       * each one committing the syllable the IME was still holding and leaving
       * its jamo behind. 안녕하세요 came back as 안ㄴ녕ㅎ하세세요.
       *
       * So the end only clears what it ended. Anything started since has its own
       * claim, and outlives the timer this one scheduled.
       */
      const generation = this._compositionGeneration;
      setTimeout(() => {
        if (this._compositionGeneration !== generation) return;
        this._isComposing = false;
        // And settle what the composition was owed. Every change it made was
        // turned away from rendering because the IME had already drawn the text
        // — but line breaks, page breaks and everything else computed from the
        // document were left behind. One render brings all of it up to date.
        if (this._renderMissedAChange) {
          this._renderMissedAChange = false;
          this.render();
        }
      }, 0);
    };
    this.contentEditableElement.addEventListener('compositionstart', this._boundHandleCompositionStart);
    this.contentEditableElement.addEventListener('compositionend', this._boundHandleCompositionEnd);

    // Selection events
    this._boundHandleSelectionChange = this.handleSelectionChange.bind(this);
    document.addEventListener('selectionchange', this._boundHandleSelectionChange);
    
    // Event listeners for drag detection
    this._boundHandleMouseDown = this.handleMouseDown.bind(this);
    this._boundHandleMouseMove = this.handleMouseMove.bind(this);
    this._boundHandleMouseUp = this.handleMouseUp.bind(this);
    this.contentEditableElement.addEventListener('mousedown', this._boundHandleMouseDown);
    document.addEventListener('mousemove', this._boundHandleMouseMove);
    document.addEventListener('mouseup', this._boundHandleMouseUp);

    // Model selection → DOM selection bridge
    this.editor.on('editor:selection.model', (payload: any) => {
      const selectionEvent = this._parseModelSelectionEvent(payload);
      if (!selectionEvent.applySelectionToView) {
        return;
      }

      this._pendingModelSelection = selectionEvent.selection;
      
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
      // Ignore if rendering (prevent infinite loop) — but remember, or the
      // change is lost and nothing ever draws it. See the end of render().
      if (this._isRendering) {
        // Owed whether or not an IME is writing: if one is, the composition's
        // end pays it, and if not, the render in progress does.
        if (!e?.skipRender) this._renderMissedAChange = true;
        return;
      }
      
      // Skip rendering if skipRender: true
      // CharacterData changes detected by MutationObserver are during input, so
      // delay rendering to prevent race conditions with selection
      if (e?.skipRender) {
        return;
      }

      /**
       * Never render while the IME owns the caret — but do not forget either.
       *
       * The composed text is already in the DOM, because the browser put it
       * there, and the model was just synced from it; painting it again would
       * only make the IME commit the syllable it was still building and leave
       * the piece behind. So nothing is drawn here, and that much was right.
       *
       * What was missing is that everything computed *from* the text does need
       * drawing, and no one was going to ask. Line breaks, page breaks, repeated
       * table headers, the table of contents, the fields — all of them are
       * produced by a render, and a composition never triggers one. Measured by
       * hand: seventy-five characters of Korean went into the document, the page
       * showed them because the IME had written them itself, and the view
       * rendered *zero* times in eleven seconds. The paragraph had grown and
       * nothing downstream of it knew.
       *
       * So the change is owed rather than dropped, and paid once the composition
       * is genuinely over — which is where the flag is cleared, and is the same
       * "one more render settles all of it" bargain a change arriving mid-render
       * already makes.
       */
      if (this._isComposing) {
        if (!e?.skipRender) this._renderMissedAChange = true;
        return;
      }

      this.render();
      // Note: selection is automatically maintained by browser, so do not call applyModelSelectionWithRetry()
      // Browser selection should not be changed during user input
      // applyModelSelectionWithRetry() is only called in editor:selection.model event
    });

    // text_update event removed - always use full rendering via diff
    
    // Focus events
    this._boundHandleFocus = this.handleFocus.bind(this);
    this._boundHandleBlur = this.handleBlur.bind(this);
    this.contentEditableElement.addEventListener('focus', this._boundHandleFocus);
    this.contentEditableElement.addEventListener('blur', this._boundHandleBlur);
  }

  private setupKeymapHandlers(): void {
    // keymapManager-based shortcuts are no longer used.
    // All key inputs are handled through editor-core's keybinding system.
  }


  // DOM event handling
  handleInput(event: InputEvent): void {
    // Detect input start
    if (event.isComposing === false && this._isComposing) {
      this._isComposing = false;
    }
    this._onInputStart();
    this.inputHandler.handleInput(event);
  }

  handleBeforeInput(event: InputEvent): void {
    if (event.isComposing) {
      // Block IME updates outside editable inline text even when composition events are missing.
      if (!this.isSelectionInsideEditableText(window.getSelection() ?? undefined)) {
        event.preventDefault();
        return;
      }
    }

    // Track IME composition state using isComposing property of beforeinput event
    // Use beforeinput's isComposing instead of composition event listener
    if (event.isComposing !== undefined) {
      this._isComposing = event.isComposing;
    }

    this.inputHandler.handleBeforeInput(event);
  }

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

    /**
     * A key the IME has taken for itself. Refusing to act on it is the whole
     * job here, and that much is unconditional.
     *
     * What this used to also do was set the composition flag, on the guess that
     * a composition was starting. An IME may swallow a key and compose nothing —
     * navigating a candidate list does exactly that — and then no composition
     * ever begins, so nothing ever fires to take the guess back. Measured: the
     * flag was still set half a second later, and while it is set a content
     * change is dropped without rendering and without being remembered.
     *
     * Nothing needs the guess. `compositionstart` is the earliest signal there
     * is — measured a millisecond ahead of the first composing `beforeinput`,
     * and both of them ahead of anything the IME writes to the DOM.
     */
    if (event.keyCode === 229) {
      return;
    }

    // Do not handle structure changes/command shortcuts during IME composition
    // - Leave composition string modifications (Enter/Backspace, etc.) to IME/browser
    // - Model structure changes are only handled in MutationObserver/C1/C2/C3 path after compositionend
    if (this._isComposing) {
      return;
    }

    // Restrict character input to inline-text only. Block when selection is not in editable text.
    // Skip when keyCode 229 (IME may be handling). See docs/editable-regions-and-contenteditable-strategy.md §3.
    /**
     * A character is refused only when there is nowhere for it to go.
     *
     * The test is the DOM selection, which is momentarily wrong while a render
     * is replacing the text node under it — and a character refused here is
     * refused for good: `beforeinput` never fires, so nothing downstream can
     * put it right. On a slow machine that is how a burst lost letters at the
     * door. While characters are being typed one after another the input
     * handler knows the run they are going into, whatever the DOM says this
     * instant, so the key is let through and answered there.
     */
    const typingBurst = (this.inputHandler as any).isTypingBurst === true;
    if (isTypingKey(event) && event.keyCode !== 229 && !typingBurst && !this.isSelectionInsideEditableText()) {
      event.preventDefault();
      return;
    }

    const key = getKeyString(event);
    
    logger.debug(LogCategory.DOM, 'handleKeydown:', key);
    
    // Delegate all keys to editor-core keybinding system
    // Backspace, Delete are also handled through keybinding system
    // context is automatically managed inside Editor
    const resolved = this.editor.keybindings.resolve(key);
    if (resolved.length > 0) {
      const { command, args } = resolved[0];
      event.preventDefault();

      // The current selection has to travel with the command. Most editing
      // commands declare `canExecute: payload => !!payload.selection`, so
      // dispatching without one makes the shortcut resolve, swallow the key,
      // and then quietly decline to run — Enter, headings and lists all did
      // nothing while the browser was also prevented from doing it natively.
      let selection: ModelSelection | undefined;
      const domSelection = window.getSelection();
      if (domSelection && domSelection.rangeCount > 0) {
        try {
          const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
          if (modelSelection && modelSelection.type === 'range') {
            selection = modelSelection;
          }
        } catch {
          // ignore conversion errors; the command still gets whatever args it had
        }
      }

      void this.editor.executeCommand(command, {
        ...(args ?? {}),
        ...(selection ? { selection } : {})
      });
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

  /**
   * Rewrite the clipboard payload so that what the renderer owns never leaves the
   * editor.
   *
   * Two things qualify. The caret filler is a zero-width character the renderer
   * puts in empty blocks. Chrome is whole elements a template drew that are not
   * content — a Word page sheet, a ruler, a grid — which sit in the content tree
   * because that is where the geometry they align to lives, and which a reader
   * pasting into another document has no use for.
   *
   * Everything else is left to the browser: the selection, the HTML structure,
   * and the cut itself.
   */
  handleCopy(event: ClipboardEvent): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !event.clipboardData) return;

    const html = this.contentEditableElement.ownerDocument.createElement('div');
    html.appendChild(selection.getRangeAt(0).cloneContents());
    const original = html.innerHTML;
    stripChromeElements(html);

    const plain = stripFiller(selection.toString());
    const markup = stripFiller(html.innerHTML);
    if (plain === selection.toString() && markup === original) return;

    event.preventDefault();
    event.clipboardData.setData('text/plain', plain);
    event.clipboardData.setData('text/html', markup);
  }

  handlePaste(event: ClipboardEvent): void {
    if (this._isComposing) {
      return;
    }

    event.preventDefault();

    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const html = clipboardData.getData('text/html');
    const text = clipboardData.getData('text/plain');

    if (!html && !text) return;

    this.editor.executeCommand('paste', {
      clipboardHtml: html || undefined,
      clipboardText: text || undefined,
    });
  }

  handleDrop(event: DragEvent): void {
    if (this._isComposing) {
      return;
    }

    event.preventDefault();

    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;

    const html = dataTransfer.getData('text/html');
    const text = dataTransfer.getData('text/plain');

    if (!html && !text) return;

    this.editor.executeCommand('paste', {
      clipboardHtml: html || undefined,
      clipboardText: text || undefined,
    });
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
    // A pointer moves the caret, so nothing the input handler remembers about
    // where a burst of typing had reached is true any more.
    (this.inputHandler as any).caretMovedByUser?.();
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
  private _parseModelSelectionEvent(selectionEvent: any): { selection: any; applySelectionToView: boolean } {
    if (
      selectionEvent &&
      typeof selectionEvent === 'object' &&
      Object.prototype.hasOwnProperty.call(selectionEvent, 'selection')
    ) {
      return {
        selection: selectionEvent.selection,
        applySelectionToView:
          selectionEvent.source === 'remote'
            ? false
            : selectionEvent.applySelectionToView !== false
      };
    }

    return {
      selection: selectionEvent,
      applySelectionToView: selectionEvent?.source !== 'remote'
    };
  }

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

  insertLineBreak(): void {
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
    if (this._boundHandleInput) {
      this.contentEditableElement.removeEventListener('input', this._boundHandleInput as EventListener);
      this._boundHandleInput = null;
    }
    if (this._boundHandleBeforeInput) {
      this.contentEditableElement.removeEventListener('beforeinput', this._boundHandleBeforeInput);
      this._boundHandleBeforeInput = null;
    }
    if (this._boundHandleKeydown) {
      this.contentEditableElement.removeEventListener('keydown', this._boundHandleKeydown);
      this._boundHandleKeydown = null;
    }
    if (this._boundHandlePaste) {
      this.contentEditableElement.removeEventListener('paste', this._boundHandlePaste);
      this._boundHandlePaste = null;
    }
    if (this._boundHandleCompositionStart) {
      this.contentEditableElement.removeEventListener('compositionstart', this._boundHandleCompositionStart);
      this._boundHandleCompositionStart = null;
    }
    if (this._boundHandleCompositionEnd) {
      this.contentEditableElement.removeEventListener('compositionend', this._boundHandleCompositionEnd);
      this._boundHandleCompositionEnd = null;
    }
    if (this._boundHandleCopy) {
      this.contentEditableElement.removeEventListener('copy', this._boundHandleCopy);
      this.contentEditableElement.removeEventListener('cut', this._boundHandleCopy);
      this._boundHandleCopy = null;
    }
    if (this._boundHandleDrop) {
      this.contentEditableElement.removeEventListener('drop', this._boundHandleDrop);
      this._boundHandleDrop = null;
    }

    if (this._boundHandleSelectionChange) {
      document.removeEventListener('selectionchange', this._boundHandleSelectionChange);
      this._boundHandleSelectionChange = null;
    }
    
    // Remove drag detection event listeners
    if (this._boundHandleMouseDown) {
      this.contentEditableElement.removeEventListener('mousedown', this._boundHandleMouseDown);
      this._boundHandleMouseDown = null;
    }
    if (this._boundHandleMouseMove) {
      document.removeEventListener('mousemove', this._boundHandleMouseMove);
      this._boundHandleMouseMove = null;
    }
    if (this._boundHandleMouseUp) {
      document.removeEventListener('mouseup', this._boundHandleMouseUp);
      this._boundHandleMouseUp = null;
    }
    
    if (this._boundHandleFocus) {
      this.contentEditableElement.removeEventListener('focus', this._boundHandleFocus);
      this._boundHandleFocus = null;
    }
    if (this._boundHandleBlur) {
      this.contentEditableElement.removeEventListener('blur', this._boundHandleBlur);
      this._boundHandleBlur = null;
    }
    
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
    logger.debug(LogCategory.DOM, '_setupContentRenderer:start');
    
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
    //
    // `editor` is always in the environment: a template that needs the document
    // around the node it is drawing should not have to be handed the editor
    // separately by whoever set the view up.
    this._env = { ...(options.env ?? {}), editor: this.editor };

    this._domRenderer = new DOMRenderer(this._rendererRegistry, {
      enableSelectionPreservation: true,
      name: 'content',
      dataStore: this.editor.dataStore,
      env: this._env
    });
    
    // 4. Create DOMRenderer per layer (each with independent prevVNodeTree)
    this._decoratorRenderer = new DOMRenderer(this._rendererRegistry, { 
      name: 'decorator',
      dataStore: this.editor.dataStore,
      env: this._env
    });
    this._selectionRenderer = new DOMRenderer(this._rendererRegistry, { 
      name: 'selection',
      dataStore: this.editor.dataStore,
      env: this._env
    });
    this._contextRenderer = new DOMRenderer(this._rendererRegistry, { 
      name: 'context',
      dataStore: this.editor.dataStore,
      env: this._env
    });
    this._customRenderer = new DOMRenderer(this._rendererRegistry, { 
      name: 'custom',
      dataStore: this.editor.dataStore,
      env: this._env
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

  /**
   * Recursively sanitize content arrays: keep only valid child nodes (non-null, object, with stype).
   * Invalid entries (null, undefined, primitives) are removed so the renderer does not receive them.
   */
  private _sanitizeTreeContent(node: any): void {
    if (!node || typeof node !== 'object') return;
    const content = node.content;
    if (Array.isArray(content)) {
      node.content = content.filter(
        (c: any) => c != null && typeof c === 'object' && c.stype != null
      );
      for (const child of node.content) {
        this._sanitizeTreeContent(child);
      }
    }
  }

  /**
   * Recursively validate that every node in the tree has a registered renderer for its stype.
   * Throws if any node's stype is not found in the registry.
   */
  private _validateTreeStypes(node: any, registry: RendererRegistry): void {
    if (!node || typeof node !== 'object') return;
    const stype = node.stype;
    if (stype != null && stype !== '') {
      const def = registry.get(stype);
      if (!def) {
        throw new Error(`Renderer for node type '${stype}' not found`);
      }
    }
    const content = node.content;
    if (Array.isArray(content)) {
      for (const child of content) {
        this._validateTreeStypes(child, registry);
      }
    }
  }

  // External render API
  /**
   * Let go of one render's claim on the observer, once its DOM has landed.
   *
   * A whole event loop turn later, because that is when the mutations from it
   * are delivered.
   */
  private _releaseModelDrivenRender(): void {
    setTimeout(() => {
      this._modelDrivenRenders = Math.max(0, this._modelDrivenRenders - 1);
    }, 0);
  }

  /** Whether any render is still settling, so its mutations are not input. */
  get isModelDrivenChange(): boolean {
    return this._modelDrivenRenders > 0;
  }

  /** The environment templates are currently seeing. */
  getEnv(): RenderEnv {
    return this._env;
  }

  /**
   * Merge values into the environment templates see from the next render on.
   *
   * Not everything a template needs is known when the view is built. A page
   * layout is computed *from* a render — measure what was drawn, decide where
   * the breaks fall — so it can only be put in afterwards, before rendering
   * again. `editor` cannot be replaced: a template must always be able to reach
   * the editor that is rendering it.
   */
  setEnv(env: RenderEnv): void {
    this._env = { ...this._env, ...env, editor: this.editor };
    for (const renderer of [
      this._domRenderer,
      this._decoratorRenderer,
      this._selectionRenderer,
      this._contextRenderer,
      this._customRenderer
    ]) {
      renderer?.setEnv(this._env);
    }
  }

  /**
   * Run something after each render that needs to see what was rendered.
   *
   * Some layout can only be computed from a finished render. Pagination is the
   * clearest case: line breaking is the browser's answer to a width, and where
   * the pages break is a question about that answer, so there is nothing to
   * compute until something has been laid out. The same shape appears wherever
   * geometry decides the result — fitting text to a shape, routing a connector
   * between two boxes, sizing a column to its contents.
   *
   * A pass returns values to merge into the environment, and the view renders
   * once more so the templates can use them. Passes then run again on that
   * render, because some of them can only measure what a previous round drew —
   * footnotes are the case: nothing can measure a note body until one has been
   * put on the page.
   *
   * A pass that has nothing new to report returns nothing, and the loop stops
   * when every pass does. It is also bounded, so a pass that never settles costs
   * a few wasted renders rather than hanging the editor. Convergence is still
   * the pass's responsibility: what makes pagination settle is that it moves
   * blocks with a top margin, which cannot change where a line breaks.
   *
   * Returns a function that removes the pass.
   */
  registerLayoutPass(pass: LayoutPass): () => void {
    this._layoutPasses.push(pass);
    return () => {
      const index = this._layoutPasses.indexOf(pass);
      if (index >= 0) this._layoutPasses.splice(index, 1);
    };
  }

  /**
   * How many times passes may run for one render.
   *
   * Two rounds is what a pass that measures its own output needs — one to draw,
   * one to measure — and the third exists to let that settle. A pass still
   * hunting after that is not converging, and more rounds would only cost more
   * renders.
   */
  private static readonly MAX_LAYOUT_ROUNDS = 3;

  private _runLayoutPasses(): void {
    if (this._runningLayoutPasses || this._layoutPasses.length === 0) return;


    this._runningLayoutPasses = true;
    try {
      for (let round = 0; round < EditorViewDOM.MAX_LAYOUT_ROUNDS; round++) {
        let patch: RenderEnv | undefined;
        for (const pass of this._layoutPasses) {
          const result = pass(this);
          if (result) patch = { ...(patch ?? {}), ...result };
        }

        // Every pass reported nothing new: the DOM already reflects what they
        // would compute, and rendering again would produce the same thing.
        if (!patch) return;

        this.setEnv(patch);
        this.render();
      }
    } finally {
      this._runningLayoutPasses = false;
    }
  }

  render(tree?: ModelData | any, options?: { sync?: boolean }): void {
    if (!this._domRenderer) {
      console.warn('[EditorViewDOM] No DOM renderer available');
      return;
    }
    
    // Set rendering flag (prevent infinite loop)
    if (this._isRendering) {
      // ...and remember that this one was asked for, so it happens after the
      // one in progress. Returning without a note is how a keystroke's paint
      // went missing: the request arrived mid-render and nothing asked again.
      this._renderMissedAChange = true;
      logger.debug(LogCategory.DOM, 'render: deferred, one is already running');
      return;
    }
    logger.debug(LogCategory.DOM, 'render: start');
    this._isRendering = true;
    
    // Set Model-First change flag (for MutationObserver filtering)
    this._modelDrivenRenders++;
    let layersPending = false;
    
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
        const msg = '[EditorViewDOM] Invalid tree format: missing stype (required)';
        console.error(msg);
        throw new Error(msg);
      }
      if (!tree.sid) {
        const msg = '[EditorViewDOM] Invalid tree format: missing sid (required)';
        console.error(msg);
        throw new Error(msg);
      }
      if (this._rendererRegistry) {
        this._validateTreeStypes(tree, this._rendererRegistry);
      }
      this._sanitizeTreeContent(tree);
      // Use directly without conversion
      modelData = tree as ModelData;
    } else {
      // No tree passed: prefer last rendered tree (e.g. after addDecorator re-render) so we don't replace it with empty editor document
      try {
        if (this._lastRenderedModelData) {
          modelData = this._lastRenderedModelData;
        } else {
          const exported = this.editor.getDocumentProxy?.();
          if (exported) {
            modelData = exported as ModelData;
          }
        }
      } catch (error) {
        console.error('[EditorViewDOM] Error exporting document:', error);
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
    const contentLayerDecorators = this._filterDecoratorsForContentLayer(allDecorators);

    if (modelData) {
      try {
        this._domRenderer?.render(
          this.layers.content, 
          modelData, 
          contentLayerDecorators,
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
          contentLayerDecorators, 
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
    // DOM position calculation possible after Content rendering completes.
    // Run even when allDecorators is empty so that removed decorators are cleared from the layer.
    const dataForLayers = modelData || (this._hasRendered ? {} as ModelData : null);
    if (dataForLayers !== null) {
      const renderLayers = () => {
        this._renderLayers(allDecorators, dataForLayers);
      };

      // If sync option exists, execute synchronously (for test environment)
      if (options?.sync || this._renderOptions.sync) {
        renderLayers();
      } else {
        // Held open until the layers have been drawn. They are deferred to the
        // next frame, and a frame comes *after* a timeout — so releasing on a
        // timeout uncovered them, and the observer read a layer's own DOM as
        // something the user had typed. It only showed up once there were
        // decorators to draw.
        layersPending = true;
        requestAnimationFrame(() => {
          renderLayers();
          this._releaseModelDrivenRender();
        });
      }
    }
    } finally {
      // Clear flag after rendering completes
      this._isRendering = false;

      if (!layersPending) this._releaseModelDrivenRender();
    }

    /**
     * A change that arrived while this was drawing still has to be drawn.
     *
     * The content-change handler turns away anything that comes in mid-render,
     * to stop a render triggering itself. What it did not do was remember: a
     * keystroke committed while the page was being painted was dropped, and
     * since nothing else asks for a render, the page stayed as it was — for
     * good. Typed at an eighth speed the model held "abcdefghij" and the page
     * showed "abcd" fifteen seconds later, and one forced render brought it
     * back.
     *
     * Coalesced rather than queued: any number of changes during one render
     * need exactly one more render, because the next one draws the document as
     * it now stands.
     */
    if (this._renderMissedAChange && this._isComposing) {
      // Still owed, and it stays owed. A render under an open composition is
      // what strands a jamo; the composition's end pays this off instead.
      logger.debug(LogCategory.DOM, 'render: done, and one more is owed once the IME is finished');
    } else if (this._renderMissedAChange) {
      this._renderMissedAChange = false;
      logger.debug(LogCategory.DOM, 'render: done, and one more was asked for while it ran');
      requestAnimationFrame(() => this.render());
    } else {
      logger.debug(LogCategory.DOM, 'render: done');
    }

    // The content DOM is committed by now, so anything that has to measure the
    // result can do so — and re-render off the back of it. Not counted here:
    // each render a pass performs counts itself, and holding the count open
    // across the pass as well would keep it above zero permanently, which stops
    // the observer seeing anything the user does.
    this._runLayoutPasses();
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
      
      // 3. Render each layer (use renderChildren). When empty, clear the layer (reconciler may not remove all nodes).
      if (this._decoratorRenderer) {
        if (decoratorLayerModels.length === 0) {
          while (this.layers.decorator.firstChild) {
            this.layers.decorator.removeChild(this.layers.decorator.firstChild);
          }
        } else {
          this._decoratorRenderer.renderChildren(this.layers.decorator, decoratorLayerModels);
        }
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
  /**
   * Replace every decorator of one kind, in a single render.
   *
   * Adding decorators one at a time renders once per decorator, which is fine
   * for the one or two a comment or a caret needs and ruinous for a set: a
   * search that highlights forty matches rendered the document forty times to
   * put them there and forty more to take them away, and the page stopped
   * answering. Sets are the normal shape for this — search results, spelling,
   * the other people in a document — so replacing one is one operation.
   *
   * By stype rather than by a list of ids, because that is what a caller has:
   * it knows what it is drawing, not what it drew last time.
   */
  setDecorators(stype: string, decorators: Decorator[]): void {
    const existing = this.decoratorManager.getAll().filter((d) => d.stype === stype);
    const wanted = new Map(decorators.map((d) => [d.sid, d]));

    let changed = false;
    for (const decorator of existing) {
      if (wanted.has(decorator.sid)) continue;
      this.decoratorManager.remove(decorator.sid);
      changed = true;
    }
    for (const decorator of decorators) {
      this.decoratorManager.add({ ...decorator, decoratorType: 'target' } as Decorator);
      changed = true;
    }

    if (changed) this.render(undefined, this._renderOptions);
  }

  /**
   * Apply a group of decorator changes as a single render.
   *
   * Each add/remove renders the whole document on its own, which is right for
   * one decorator and wrong for a set of them. Pagination hands over every page
   * break at once: pressing Enter moved twenty-five of them and cost twenty-five
   * renders — 199ms and some 4,800 DOM mutations for one keystroke, measured.
   * Inside this call the renders are held and one is issued at the end.
   */
  batchDecorators(mutate: () => void): void {
    this._decoratorBatchDepth++;
    try {
      mutate();
    } finally {
      this._decoratorBatchDepth--;
    }

    if (this._decoratorBatchDepth === 0 && this._decoratorRenderPending) {
      this._decoratorRenderPending = false;
      this.render(undefined, this._renderOptions);
    }
  }

  /** Render for a decorator change, unless a batch is collecting them. */
  private _renderForDecoratorChange(): void {
    if (this._decoratorBatchDepth > 0) {
      this._decoratorRenderPending = true;
      return;
    }
    this.render(undefined, this._renderOptions);
  }

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
        () => this._renderForDecoratorChange() // Re-render on change detection (preserve options)
      );
      this._renderForDecoratorChange();
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
    this._renderForDecoratorChange();
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
      this._renderForDecoratorChange();
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
      this._renderForDecoratorChange();
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
    const config = configs.find(c => c.sid === id);
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
    const patternDecorators = patternConfigs.map(config => {
      const p = config.pattern;
      const serialized =
        typeof p === 'function'
          ? { source: '', flags: 'g' }
          : { source: p.source, flags: p.flags };
      return {
        sid: config.sid,
        stype: config.stype,
        category: config.category,
        pattern: serialized,
        priority: config.priority,
        enabled: config.enabled
      };
    });
    
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
  loadDecorators(data: DecoratorExportData, patternFunctions?: LoadDecoratorsPatternFunctions): void {
    // Remove all existing decorators
    this.decoratorManager.clear();
    this.patternDecoratorConfigManager.clear();
    this.decoratorGeneratorManager.clear();
    
    // Load regular decorators
    for (const decorator of data.targetDecorators) {
      this.decoratorManager.add({
        ...decorator,
        decoratorType: 'target',
        target: decorator.target as import('@barocss/shared').DecoratorTarget | undefined
      });
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
