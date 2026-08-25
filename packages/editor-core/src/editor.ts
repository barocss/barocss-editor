import { Transaction, TransactionManager, type TransactionOperation, type TransactionResult, type TransactionOptions } from '@barocss/model';
import {
  createSchema,
  describeFindings,
  getMinimalSchemaDefinition,
  validateTree,
  type TreeFinding
} from '@barocss/schema';
import {
  DocumentState,
  SelectionState,
  EditorOptions,
  Extension,
  Command,
  EditorEventType,
  ModelSelection,
  EditorSelectionModelPayload,
  withLiveNodes
} from './types';
import { DataStoreLoader, DataStoreExporter, DataStore, INode } from '@barocss/datastore';
import { SelectionManager } from './selection-manager';
import { HistoryManager } from './history-manager';
import { KeybindingRegistryImpl, type KeybindingRegistry, type ContextProvider } from './keybinding';
import { DEFAULT_KEYBINDINGS } from './keybinding/default-keybindings';
import { DEFAULT_CONTEXT_INITIAL_VALUES } from './context/default-context';
import { logger, LogCategory, isCategoryEnabled } from '@barocss/shared';
import { readSelectionSummary, type SelectionSummary } from './selection-summary';
import { IS_MAC, IS_LINUX, IS_WINDOWS } from '@barocss/shared';
function isModelSelection(selection: unknown): selection is ModelSelection {
  if (!selection || typeof selection !== 'object') return false;
  const value = selection as Record<string, any>;
  const type = value.type;
  return (
    (type === 'range' || type === 'node' || type === 'cell' || type === 'table') &&
    typeof value.startNodeId === 'string' &&
    typeof value.endNodeId === 'string' &&
    Number.isInteger(value.startOffset) &&
    Number.isInteger(value.endOffset)
  );
}

function isSelectionTargetAlive(dataStore: DataStore, selection: ModelSelection): boolean {
  const startNode = dataStore.getNode(selection.startNodeId);
  const endNode = dataStore.getNode(selection.endNodeId);
  if (!startNode || !endNode) return false;

  if (selection.startOffset < 0 || selection.endOffset < 0) return false;
  if (typeof startNode.text === 'string' && selection.startOffset > startNode.text.length) return false;
  if (typeof endNode.text === 'string' && selection.endOffset > endNode.text.length) return false;

  return true;
}

function parseModelSelectionPayload(selection: unknown): {
  modelSelection: SelectionState | ModelSelection | null;
  applySelectionToView: boolean;
  source?: string;
} {
  const raw: any = selection as any;

  if (!raw || typeof raw !== 'object') {
    return {
      modelSelection: raw,
      applySelectionToView: true
    };
  }

  const hasSelectionField =
    Object.prototype.hasOwnProperty.call(raw, 'selection');

  if (!hasSelectionField) {
    return {
      modelSelection: raw as any,
      applySelectionToView: raw.source !== 'remote',
      source: raw.source
    };
  }

  return {
    modelSelection: raw.selection,
    applySelectionToView: raw.source === 'remote'
      ? false
      : raw.applySelectionToView !== false,
    source: raw.source
  };
}

export class Editor implements ContextProvider {
  private _document: any;
  private _dataStore: any; // Temporarily using any for DataStore type
  private _transactionManager: TransactionManager;
  private _selectionManager: SelectionManager;
  private _historyManager: HistoryManager;
  private _rootId?: string;
  private _extensions: Map<string, Extension> = new Map();
  private _commands: Map<string, Command> = new Map();
  private _eventListeners: Map<string, Set<Function>> = new Map();
  private _isFocused: boolean = false;
  private _isEditable: boolean = true;
  private _history: any[] = [];
  private _historyIndex: number = -1;
  private _keybindingRegistry: KeybindingRegistry;
  private _context: Record<string, unknown> = {};

  constructor(options: EditorOptions = {}) {
    this._dataStore = options.dataStore || new DataStore();
    this._ensureSchema(options);
    this._document = options.content ? this._convertFromDocumentState(options.content) : this._createEmptyDocument();
    this._syncToDataStoreFromDocumentState(
      options.content || this._document,
      this._document
    );
    this._historyManager = new HistoryManager(options.history);
    this._transactionManager = new TransactionManager(this);
    this._selectionManager = new SelectionManager({ 
      dataStore: this._dataStore
    });
    this._isEditable = options.editable !== false;
    this._keybindingRegistry = new KeybindingRegistryImpl();
    this._keybindingRegistry.setContextProvider(this);
    
    // Initialize context before extension initialization
    // These values are assumed to always exist in extension's onCreate
    this._context = { ...DEFAULT_CONTEXT_INITIAL_VALUES };
    this._updateBuiltinContext();
    
    this._registerCoreCommands();
    this._registerDefaultKeybindings();
    this._addToHistory(this._document);
    
    if (options.extensions) {
      options.extensions.forEach(ext => this.use(ext));
    }
    
    this._setupModelEventHandling();
    this._setupSelectionEventHandling();
    this._setupSelectionErrorHandling();
  }

  private _registerCoreCommands(): void {
    // setContext command (VS Code style)
    this.registerCommand({
      name: 'setContext',
      execute: (editor: Editor, payload?: { key: string; value: unknown }) => {
        if (!payload || !payload.key) {
          console.warn('[Editor] setContext: key is required');
          return false;
        }
        (editor as any).setContext(payload.key, payload.value);
        return true;
      },
      canExecute: () => true
    });

    // focus command (used by command chain for chaining API compatibility)
    this.registerCommand({
      name: 'focus',
      execute: () => true,
      canExecute: () => true
    });

    // insertText command (used by CommandChain)
    this.registerCommand({
      name: 'insertText',
      execute: async (editor: Editor, payload?: { text: string; selection?: ModelSelection }) => {
        const selection = payload?.selection || editor.selection;
        if (!selection || selection.type !== 'range' || !payload?.text) {
          return false;
        }

        if (!editor.canExecuteCommand('replaceText')) {
          return false;
        }

        return editor.executeCommand('replaceText', {
          range: selection,
          text: payload.text
        });
      },
      canExecute: (editor: Editor, payload?: { text?: string; selection?: ModelSelection }) => {
        const selection = payload?.selection || editor.selection;
        return !!selection && selection.type === 'range' && !!payload?.text;
      }
    });

    // deleteSelection command (used by CommandChain)
    this.registerCommand({
      name: 'deleteSelection',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || editor.selection;
        if (!selection || selection.type !== 'range' || selection.collapsed) {
          return false;
        }

        if (!editor.canExecuteCommand('backspace')) {
          return false;
        }

        return editor.executeCommand('backspace', { selection });
      },
      canExecute: (_editor: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || _editor.selection;
        return !!selection && selection.type === 'range' && !selection.collapsed;
      }
    });

    // history commands (mapped to editor history APIs)
    this.registerCommand({
      name: 'historyUndo',
      execute: (editor: Editor) => {
        return editor.undo();
      },
      canExecute: (editor: Editor) => editor.canUndo()
    });

    this.registerCommand({
      name: 'historyRedo',
      execute: (editor: Editor) => {
        return editor.redo();
      },
      canExecute: (editor: Editor) => editor.canRedo()
    });

    // command aliases matching model/legacy naming
    this.registerCommand({
      name: 'undo',
      execute: (editor: Editor) => {
        return editor.undo();
      },
      canExecute: (editor: Editor) => editor.canUndo()
    });

    this.registerCommand({
      name: 'redo',
      execute: (editor: Editor) => {
        return editor.redo();
      },
      canExecute: (editor: Editor) => editor.canRedo()
    });

    // selection mutation commands for programmatic selection control
    this.registerCommand({
      name: 'setRange',
      execute: (editor: Editor, payload?: any) => {
        editor.setRange(payload);
        return true;
      },
      canExecute: () => true
    });

    this.registerCommand({
      name: 'setNode',
      execute: (editor: Editor, payload?: any) => {
        editor.setNode(payload);
        return true;
      },
      canExecute: () => true
    });

    this.registerCommand({
      name: 'setAbsolutePos',
      execute: (editor: Editor, payload?: any) => {
        editor.setAbsolutePos(payload);
        return true;
      },
      canExecute: () => true
    });

    this.registerCommand({
      name: 'clearSelection',
      execute: (editor: Editor) => {
        editor.clearSelection();
        return true;
      },
      canExecute: () => true
    });

    this.registerCommand({
      name: 'find',
      execute: () => true,
      canExecute: () => true
    });

    this.registerCommand({
      name: 'findAndReplace',
      execute: () => true,
      canExecute: () => true
    });
  }

  private _registerDefaultKeybindings(): void {
    // Automatically set source to 'core' when registering core keybindings
    this._keybindingRegistry.setCurrentSource('core');
    DEFAULT_KEYBINDINGS.forEach((binding) => {
      this.keybindings.register(binding);
    });
    this._keybindingRegistry.setCurrentSource(null);
  }

  /**
   * The document as it is now.
   *
   * Read from the store rather than from `_document`. `_document` is a snapshot
   * taken at load and refreshed only by setContent, loadTree, undo and redo — a
   * transaction writes the store and leaves it behind, so after any edit at all
   * it described a document that no longer existed. Measured in the browser:
   * type four characters, and `editor.document` did not contain them while the
   * store and `exportDocument()` both did. Nothing rendered from it, which is
   * the only reason this was not visible; every listener handed it a `content`
   * was being handed the document as it looked when the page opened.
   *
   * `_convertNode` resolves child ids through the store as it walks, so seeding
   * it with the root's current children is enough to make the whole tree live.
   * The snapshot is still what history holds, and is kept for that.
   */
  get document(): DocumentState {
    const root = this._rootId ? this._dataStore?.getNode?.(this._rootId) : null;
    const source = root
      ? { ...this._document, content: (root as any).content ?? [] }
      : this._document;
    return this._convertToDocumentState(source);
  }

  get selection(): ModelSelection | null {
    return this._selectionManager.getCurrentSelection() || null;
  }

  get dataStore(): DataStore {
    return this._dataStore as DataStore;
  }

  /**
   * What the selection currently is: which marks apply, what kind of block it
   * is in, and what the blocks agree on.
   *
   * Read afresh rather than cached. It is cheap — it walks only the text the
   * selection covers — and a cached answer is one that can be wrong after an
   * edit, which for a toolbar means a button showing the wrong state and one
   * click undoing formatting the user could still see.
   */
  getSelectionSummary(): SelectionSummary {
    return readSelectionSummary(this._dataStore as DataStore, this.selection);
  }

  get transactionManager(): TransactionManager {
    return this._transactionManager;
  }

  get isFocused(): boolean {
    return this._isFocused;
  }

  get isEditable(): boolean {
    return this._isEditable;
  }

  get keybindings(): KeybindingRegistry {
    return this._keybindingRegistry;
  }

  get selectionManager(): SelectionManager {
    return this._selectionManager;
  }

  getRootId(): string | undefined {
    return (this as any)._rootId;
  }

  setRange(rangeSelection: any): void {
    this.updateSelection(rangeSelection);
  }

  // -------- Load/Export helpers (DX-oriented, keep responsibilities thin) --------
  /**
   * Load a document, and say so if it is not one the schema accepts.
   *
   * Every *operation* validates what it writes, so a document built by editing is
   * checked at every step. A document handed to this went in exactly as written
   * and nothing looked at it — which is a gap in the shape of a fixture, because
   * a product's own sample documents are the only ones that arrive this way.
   *
   * It cost four rounds of debugging once: a deck's sample table had its rows
   * directly under `bTable`, where the schema says `bTableBody+`. It drew
   * perfectly, because renderers walk whatever they are given, and every table
   * operation refused it — reporting `cell not found in table`, which is a fact
   * about a grid builder rather than about the document, four levels from the
   * fault.
   *
   * **Reported, not refused.** A document that disagrees with the schema in one
   * corner still opens: a reader with a file that will not open and no way to see
   * why is worse off than one whose file opens with a warning. Refusing is also
   * the wrong default for a product that imports other people's documents, which
   * is most of them.
   */
  loadDocument(treeDocument: any, sessionId: string = 'editor-session'): void {
    const loader = new DataStoreLoader(this._dataStore, sessionId);
    const rootId = loader.loadDocument(treeDocument);
    this._rootId = rootId;
    const exporter = new DataStoreExporter(this._dataStore);
    const tree = exporter.exportToTree(rootId);
    this._document = this._convertToDocumentState(tree);
    this._addToHistory(this._document);

    this._reportDocumentFaults(treeDocument);
    this.emit('editor:content.change', { content: this.document, transaction: null, rootId });
  }

  /**
   * What was wrong with the document this editor was last given.
   *
   * Empty for a document the schema accepts. Kept rather than only emitted, so a
   * test or a host can ask after the fact — an event is gone by the time anything
   * thinks to look.
   */
  get documentFaults(): TreeFinding[] {
    return this._documentFaults;
  }

  private _documentFaults: TreeFinding[] = [];

  private _reportDocumentFaults(treeDocument: any): void {
    // The schema lives on the store, which is where every operation reads it.
    const schema: any = this._dataStore?.getActiveSchema?.();
    if (!schema || typeof schema.hasNodeType !== 'function') return;

    try {
      this._documentFaults = validateTree(schema, treeDocument);
    } catch {
      // A validator that throws must not stop a document opening.
      this._documentFaults = [];
      return;
    }
    if (this._documentFaults.length === 0) return;

    // One message with all of them: a fixture with three faults should take one
    // run to fix rather than three.
    console.warn(
      `[editor] the document does not match the schema:\n${describeFindings(this._documentFaults)}`
    );
    this.emit('editor:document.invalid', { findings: this._documentFaults } as never);
  }

  exportDocument(rootId?: string): any | null {
    const effectiveRootId = rootId ?? this._rootId;
    const exporter = new DataStoreExporter(this._dataStore);
    const tree = exporter.exportToTree(effectiveRootId);
    // exportToTree() returns the actual root node as-is (INode format: stype, sid)
    return tree;
  }

  /**
   * Returns document as Proxy (lazy evaluation)
   * 
   * When content array contains IDs, converts to actual nodes only on access for memory efficiency
   * 
   * @param rootId - Root node ID (uses default root if not provided)
   * @returns Proxy-wrapped INode (ModelData compatible)
   */
  getDocumentProxy(rootId?: string): any | null {
    const effectiveRootId = rootId ?? this._rootId;
    const exporter = new DataStoreExporter(this._dataStore);
    const proxy = exporter.toProxy(effectiveRootId);
    return proxy;
  }

  /**
   * Select whole nodes.
   *
   * Takes one or many. `ModelSelection` has carried `nodeIds` and
   * `selectedNodeIds()` since selections that are *sets* were first described —
   * "three shapes on a board or two cells in different rows: those are a set,
   * and a set with holes in it cannot be described by its endpoints" — and this,
   * the only way in, dropped the field and kept a single id. So a set could be
   * described and not made, which a slide editor is the first thing to need: the
   * whole point of selecting three shapes is to move them together.
   *
   * A single node still produces a selection with one entry in `nodeIds`, so a
   * caller never has to ask which shape of selection it was given.
   */
  setNode(nodeSelection: any): void {
    if (!nodeSelection) {
      this.updateSelection(null);
      return;
    }

    const many: unknown = nodeSelection.nodeIds;
    const ids = Array.isArray(many)
      ? many.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [nodeSelection.nodeId ?? nodeSelection.startNodeId].filter(
          (id): id is string => typeof id === 'string' && id.length > 0
        );

    if (ids.length === 0) {
      this.updateSelection(null);
      return;
    }

    this.updateSelection({
      // The caller may say `cell` or `table`; `node` is what a shape is.
      type: nodeSelection.type === 'cell' || nodeSelection.type === 'table' ? nodeSelection.type : 'node',
      nodeIds: ids,
      startNodeId: ids[0],
      startOffset: 0,
      endNodeId: ids[ids.length - 1],
      endOffset: 0,
      collapsed: false,
      direction: 'none'
    });
  }

  setAbsolutePos(absoluteSelection: any): void {
    this.updateSelection(absoluteSelection);
  }

  private _setupSelectionErrorHandling(): void {
    // this._selectionManager.setErrorHandler((error: any) => {
    //   this.emit('error:selection', { error });
    // });
  }

  clearSelection(): void {
    this._selectionManager.clearSelection();
  }

  isSelectionInContentEditable(): boolean {
    return this._selectionManager.isSelectionInContentEditable();
  }

  chain(): CommandChain {
    return new CommandChain(this);
  }

  /**
   * The name of every command registered, in registration order.
   *
   * For asking questions *about* the editor rather than of it — which commands
   * exist, whether a product's own list of them is complete. The conformance
   * harness is the caller: a command named `insert…` that a product has not
   * accounted for is a command no check covers, and finding that out needed a
   * way in that was not reaching for a private field.
   */
  commandNames(): string[] {
    return [...this._commands.keys()];
  }

  async executeCommand(command: string, payload?: any): Promise<boolean> {
    const commandDef = this._commands.get(command);
    if (!commandDef) {
      console.warn(`Command ${command} not found`);
      return false;
    }

    try {
      if (commandDef.canExecute && !commandDef.canExecute(this, payload)) {
        return false;
      }

      // Emit before event
      this.emit('editor:command.before', { command, payload });
      
      // Call before hook (Command 내부 메서드)
      commandDef.before?.(this, payload);
      
      // Execute command
      const result = await commandDef.execute(this, payload);
      
      // Call after hook (Command 내부 메서드)
      commandDef.after?.(this, payload);
      
      // Emit after event
      this.emit('editor:command.after', { command, payload, success: result });
      
      // Emit execute event
      this.emit('editor:command.execute', { command, payload, success: result });
      return result;
    } catch (error) {
      console.error(`Error executing command ${command}:`, error);
      this.emit('error:command', { command, payload, error });
      return false;
    }
  }

  /**
   * Whether a command could run right now, and running it.
   *
   * The pair exists because almost every editing command declares
   * `canExecute: payload => !!payload.selection`, so asking without one gets a
   * flat no. A toolbar that asked directly would show every button disabled;
   * the key map had exactly this bug, and shortcuts silently did nothing.
   *
   * So the current selection is filled in, and a caller passes only what is
   * particular to the command.
   */
  canRun(command: string, payload?: Record<string, unknown>): boolean {
    return this.canExecuteCommand(command, this._withSelection(payload));
  }

  run(command: string, payload?: Record<string, unknown>): Promise<boolean> {
    return this.executeCommand(command, this._withSelection(payload));
  }

  /**
   * The payload a command gets, with the selection filled in — but only while
   * the selection still points at nodes that exist.
   *
   * An undo removes the nodes its inverse operations delete, and nothing puts
   * the selection back on something live: it goes on pointing at a node that is
   * gone. `editor:content.change` is emitted from inside the transaction, so a
   * toolbar refreshing on that event asks its questions in exactly that window.
   * Handing it the dead selection is how a query about a button ends up walking
   * a tree the node was removed from.
   */
  private _withSelection(payload?: Record<string, unknown>): Record<string, unknown> {
    const selection = this.selection;
    const live = selection && this._selectionIsLive(selection) ? selection : null;
    return { ...(live ? { selection: live } : {}), ...(payload ?? {}) };
  }

  /** Whether both ends of a selection still name nodes in the store. */
  private _selectionIsLive(selection: ModelSelection): boolean {
    const store: any = this._dataStore;
    if (!store?.getNode) return true;
    for (const sid of [selection.startNodeId, selection.endNodeId]) {
      if (sid && !store.getNode(sid)) return false;
    }
    return true;
  }

  /**
   * Whether a command could run right now.
   *
   * A question with two possible answers, so it answers one of them. A
   * predicate that throws is a bug in that command, and it used to become a
   * blank page: the toolbar asks this for every control on every change, from
   * inside a React render, where an exception unmounts the whole tree. One
   * broken command disabling its own button is the proportionate outcome.
   */
  canExecuteCommand(command: string, payload?: any): boolean {
    const commandDef = this._commands.get(command);
    if (!commandDef) return false;
    if (!commandDef.canExecute) return true;
    try {
      return commandDef.canExecute(this, payload);
    } catch (error) {
      // Warned rather than swallowed: a command whose predicate throws is
      // broken, and a silent false would hide that for as long as it lasted.
      console.warn(`[Editor] canExecute("${command}") threw; treating as not runnable.`, error);
      return false;
    }
  }

  setContent(content: DocumentState): void {
    // Before hooks: Allow extensions to intercept and modify content
    let finalContent = content;
    const extensions = this.getSortedExtensions();
    
    for (const ext of extensions) {
      if (ext.onBeforeContentChange) {
        const result = ext.onBeforeContentChange(this, finalContent);
        
        // Check if cancelled
        if (result === null) {
          console.warn(`Content change cancelled by extension: ${ext.name}`);
          return;
        }
        
        // Use modified content if provided
        if (result) {
          finalContent = result;
        }
      }
    }
    
    const internalDocument = this._convertFromDocumentState(finalContent);
    this._document = internalDocument;
    this._syncToDataStoreFromDocumentState(finalContent, internalDocument);
    this._addToHistory(this._document);
    this.emit('editor:content.change', { content: finalContent, transaction: null });
    
    // After hooks
    extensions.forEach(ext => {
      ext.onContentChange?.(this, finalContent);
    });
  }

  updateSelection(selection: SelectionState | any): void {
    const parsedSelection = parseModelSelectionPayload(selection);
    let finalSelection: any = parsedSelection.modelSelection;
    const applySelectionToView = parsedSelection.applySelectionToView;
    const selectionSource = parsedSelection.source;
    const oldSelection = this.selection;

    if (!finalSelection) {
      this._selectionManager.clearSelection();
      this._updateBuiltinContext();
      this.emit('editor:selection.change', { selection: finalSelection, oldSelection });
      return;
    }

    /*
     * A **set** loses its dead members rather than the whole selection.
     *
     * The check below asks about the endpoints, which is the whole of a range and half a story for
     * a set: the node that was deleted is usually neither end, so three selected shapes stayed
     * three after one of them was gone. `withLiveNodes` takes the missing ones out and moves the
     * endpoints onto the survivors; it answers `null` when nothing is left, and the clear below
     * then does what it always did.
     */
    if (isModelSelection(finalSelection)) {
      finalSelection = withLiveNodes((id: string) => this._dataStore.getNode(id), finalSelection);
      if (!finalSelection) {
        this._selectionManager.clearSelection();
        this._updateBuiltinContext();
        return;
      }
    }

    if (isModelSelection(finalSelection) && !isSelectionTargetAlive(this._dataStore, finalSelection)) {
      if (process.env.EDITOR_SELECTION_DEBUG === '1') {
        console.warn('[selection-debug] updateSelection skipped due dead selection', {
          selection: finalSelection,
          startNode: this._dataStore.getNode(finalSelection.startNodeId),
          endNode: this._dataStore.getNode(finalSelection.endNodeId)
        });
      }
      this._selectionManager.clearSelection();
      this._updateBuiltinContext();
      return;
    }

    // Before hooks: Allow extensions to intercept and modify selection
    let nextSelection = finalSelection;
    const extensions = this.getSortedExtensions();
    
    for (const ext of extensions) {
      if (ext.onBeforeSelectionChange) {
        const result = ext.onBeforeSelectionChange(this, nextSelection);
        
        // Check if cancelled
        if (result === null) {
          console.warn(`Selection change cancelled by extension: ${ext.name}`);
          return;
        }
        
        // Use modified selection if provided
        if (result) {
          nextSelection = result;
        }
      }
    }
    
    // ModelSelection format (range/node/cell/table)
    if (isModelSelection(nextSelection)) {
      this._selectionManager.setSelection(nextSelection);
      this._updateBuiltinContext();

      // View restores DOM selection after render()
      const emitValue = applySelectionToView
        ? nextSelection
        : {
            selection: nextSelection,
            applySelectionToView,
            source: selectionSource
          } as EditorSelectionModelPayload;
      this.emit('editor:selection.model', emitValue);

      // After hooks
      extensions.forEach(ext => {
        ext.onSelectionChange?.(this, nextSelection);
      });
      return;
    }
    
    // SelectionState format (range/caret fallback)
    this._updateBuiltinContext();
    this._selectionManager.clearSelection();
    this.emit('editor:selection.change', { selection: nextSelection, oldSelection });
    
    // After hooks
    extensions.forEach(ext => {
      ext.onSelectionChange?.(this, nextSelection);
    });
  }

  setContentEditableElement(element: HTMLElement): void {
    this._selectionManager.setContentEditableElement(element);
  }

  setEditable(editable: boolean): void {
    this._isEditable = editable;
    this._updateBuiltinContext();
    this.emit('editor:editable.change', { editable });
  }

  setContext(key: string, value: unknown): void {
    const oldValue = this._context[key];
    
    // Remove context key if null or undefined
    if (value === null || value === undefined) {
      delete this._context[key];
    } else {
      this._context[key] = value;
    }
    
    // Emit context change events
    // 1. General event: subscribe to all context changes
    this.emit('editor:context.change', { key, value, oldValue });
    
    // 2. Key-specific event: subscribe to specific keys only
    this.emit(`editor:context.change:${key}`, { key, value, oldValue });
    
    // Context changes trigger event-based reactions
    // e.g., keybinding enable/disable, UI updates
    // Note: When clauses are re-evaluated on resolve() call, not automatically
  }

  /**
   * Convenience method to subscribe to changes of a specific context key
   * 
   * @example
   * ```typescript
   * editor.onContextChange('myExtension.showMyCommand', ({ value, oldValue }) => {
   *   console.log('myExtension.showMyCommand changed:', value);
   * });
   * ```
   */
  onContextChange(
    key: string,
    callback: (data: { key: string; value: unknown; oldValue: unknown }) => void
  ): () => void {
    const eventName = `editor:context.change:${key}`;
    this.on(eventName, callback);
    
    // Return unsubscribe function
    return () => {
      this.off(eventName, callback);
    };
  }

  /**
   * Get context
   * 
   * @param key - Context key to query (optional). Returns full context if not provided
   * @returns Value for the key if provided, otherwise full context object
   * 
   * @example
   * ```typescript
   * // Get full context
   * const context = editor.getContext();
   * 
   * // Get specific key (convenience method)
   * const isFocused = editor.getContext('editorFocus');
   * ```
   */
  getContext(): Record<string, unknown>;
  getContext(key: string): unknown;
  getContext(key?: string): Record<string, unknown> | unknown {
    this._updateBuiltinContext(); // Always update to latest state
    
    if (key !== undefined) {
      return this._context[key];
    }
    
    return { ...this._context };
  }

  private _updateBuiltinContext(): void {
    // Auto-update built-in context keys
    this._context.editorFocus = this._isFocused;
    this._context.editorEditable = this._isEditable;
    // Platform context (fixed values)
    this._context.isMac = IS_MAC;
    this._context.isLinux = IS_LINUX;
    this._context.isWindows = IS_WINDOWS;
    
    const selection = this._selectionManager.getCurrentSelection();
    if (!selection || !isModelSelection(selection)) {
      this._selectionManager.clearSelection();
      this._context.selectionEmpty = true;
      this._context.selectionType = null;
      this._context.selectionDirection = null;
      this._context.canIndent = false;
      this._context.canIndentText = false;
    } else if (!isSelectionTargetAlive(this._dataStore, selection)) {
      this._selectionManager.clearSelection();
      this._context.selectionEmpty = true;
      this._context.selectionType = null;
      this._context.selectionDirection = null;
      this._context.canIndent = false;
      this._context.canIndentText = false;
    } else {
      this._context.selectionEmpty = selection.collapsed === true;
      this._context.selectionType = selection.type;
      this._context.selectionDirection = selection.direction;
      
      // canIndent: check if selected node is indentable (structural indentation)
      const targetNodeId = this._getIndentableTargetNodeId(selection);
      this._context.canIndent = targetNodeId !== null && 
                                this._dataStore.isIndentableNode(targetNodeId);
      
      // canIndentText: check if range selection and text node (text indentation)
      if (selection.type === 'range') {
        const startNode = this._dataStore.getNode(selection.startNodeId);
        this._context.canIndentText = startNode !== null && 
                                     typeof startNode.text === 'string';
      } else {
        this._context.canIndentText = false;
      }
    }

    this._context.historyCanUndo = this._historyManager.canUndo();
    this._context.historyCanRedo = this._historyManager.canRedo();
  }

  /**
   * Get indent/outdent target node ID from current selection
   * - Node Selection: use startNodeId
   * - Range Selection: parent block node of startNodeId
   */
  private _getIndentableTargetNodeId(selection: ModelSelection): string | null {
    if (selection.type === 'node') {
      return selection.startNodeId;
    }

    if (selection.type === 'range') {
      const startNode = this._dataStore.getNode(selection.startNodeId);
      if (!startNode) return null;

      const schema = this._dataStore.getActiveSchema();
      
      // Use startNode if it's a block
      if (schema) {
        const nodeType = schema.getNodeType(startNode.stype);
        if (nodeType?.group === 'block' && this._dataStore.isIndentableNode(startNode.sid!)) {
          return startNode.sid!;
        }
      }

      // Find parent block node of startNode (cycle-safe walk: a corrupt
      // self-referencing parentId would otherwise freeze the whole page)
      const block: INode | undefined = this._dataStore.findAncestor(
        startNode.sid!,
        (n: INode) =>
          schema?.getNodeType(n.stype)?.group === 'block' &&
          this._dataStore.isIndentableNode(n.sid!)
      );
      if (block?.sid) return block.sid;
    }

    // cell, table types are not indentable
    return null;
  }

  on(event: EditorEventType, callback: Function): void {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set());
    }
    this._eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function): void {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  emit(event: string, data?: any): void {
    const listeners = this._eventListeners.get(event);

    // Guarded rather than merely quiet. This is the hottest path in the editor —
    // typing a single character emits tens of events — and the log line built an
    // object and read `Object.keys(data)` for every one of them, in production,
    // unconditionally.
    if (isCategoryEnabled(LogCategory.EDITOR)) {
      logger.debug(LogCategory.EDITOR, `emit: ${event}`, {
        listenersCount: listeners?.size ?? 0,
        dataKeys: data ? Object.keys(data) : []
      });
    }

    if (!listeners) return;
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  use(extension: Extension): void {
    if (this._extensions.has(extension.name)) {
      console.warn(`Extension ${extension.name} is already installed`);
      return;
    }

    try {
      extension.onBeforeCreate?.(this);
      
      if (extension.commands) {
        extension.commands.forEach(command => {
          this._commands.set(command.name, command);
        });
      }
      
      this._extensions.set(extension.name, extension);

      /**
       * Whatever this extension brings a way to draw.
       *
       * Before the extension's commands, so that an extension which offers to
       * insert a node has already said what one looks like by the time anything
       * can make one. An extension is expected to register only what is not
       * registered — a product's own renderer wins, and the default is a floor
       * rather than a policy.
       *
       * This exists because an extension used to register only commands, so a
       * product could load one, offer the command, and have no renderer for what
       * it made: measured in a shipped product, ten node types were reachable
       * and drew nothing at all, with the reader's text in the model and
       * invisible on the page.
       */
      try {
        extension.defaultRenderers?.();
      } catch (error) {
        console.error(`Error registering default renderers for ${extension.name}:`, error);
      }

      // Set source to 'extension' before extension registration
      this._keybindingRegistry.setCurrentSource('extension');
      extension.onCreate?.(this);
      // Reset source after extension registration
      this._keybindingRegistry.setCurrentSource(null);
      
      this.emit('extension:add', { extension });
    } catch (error) {
      console.error(`Error installing extension ${extension.name}:`, error);
      // Reset source even on error
      this._keybindingRegistry.setCurrentSource(null);
      throw error;
    }
  }

  unuse(extension: Extension): void {
    if (!this._extensions.has(extension.name)) {
      console.warn(`Extension ${extension.name} is not installed`);
      return;
    }

    try {
      extension.onDestroy?.(this);
      
      if (extension.commands) {
        extension.commands.forEach(command => {
          this._commands.delete(command.name);
        });
      }
      
      this._extensions.delete(extension.name);
      this.emit('extension:remove', { extension });
    } catch (error) {
      console.error(`Error removing extension ${extension.name}:`, error);
      throw error;
    }
  }

  /**
   * Get extensions sorted by priority (lower values execute first)
   */
  getSortedExtensions(): Extension[] {
    return Array.from(this._extensions.values()).sort((a, b) => {
      const priorityA = a.priority ?? 100;
      const priorityB = b.priority ?? 100;
      return priorityA - priorityB;
    });
  }

  registerCommand(command: Command): void {
    this._commands.set(command.name, command);
  }

  undo(): Promise<boolean> {
    try {
      if (this._historyIndex > 0) {
        this._historyIndex--;
        this._document = this._history[this._historyIndex];
        this.emit('editor:history.undo', { document: this._document });
        this.emit('editor:history.change', { 
          canUndo: this.canUndo(), 
          canRedo: this.canRedo() 
        });
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    } catch (error) {
      console.error('Undo failed:', error);
      return Promise.resolve(false);
    }
  }

  redo(): Promise<boolean> {
    try {
      if (this._historyIndex < this._history.length - 1) {
        this._historyIndex++;
        this._document = this._history[this._historyIndex];
        this.emit('editor:history.redo', { document: this._document });
        this.emit('editor:history.change', { 
          canUndo: this.canUndo(), 
          canRedo: this.canRedo() 
        });
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    } catch (error) {
      console.error('Redo failed:', error);
      return Promise.resolve(false);
    }
  }

  canUndo(): boolean {
    return this._historyIndex > 0;
  }

  canRedo(): boolean {
    return this._historyIndex < this._history.length - 1;
  }

  async executeTransaction(transaction: Transaction | any): Promise<TransactionResult> {
    const operations = (transaction as any)?.operations;
    if (!Array.isArray(operations)) {
      return {
        success: false,
        errors: ['Unsupported transaction format.'],
        data: undefined,
        transactionId: (transaction as any)?.sid,
        operations: [],
        selectionBefore: this._selectionManager.getCurrentSelection() || null,
        selectionAfter: this._selectionManager.getCurrentSelection() || null
      };
    }

    try {
      const result = await this._transactionManager.execute(operations as (TransactionOperation | any)[], transaction?.options);
      this.emit('transactionExecuted', { transaction: result } as any);
      return result;
    } catch (error) {
      console.error('Transaction execution failed:', error);
      this.emit('transactionError', { transaction, error } as any);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        data: undefined,
        transactionId: undefined,
        operations,
        selectionBefore: this._selectionManager.getCurrentSelection() || null,
        selectionAfter: this._selectionManager.getCurrentSelection() || null
      };
    }
  }

  private _setupModelEventHandling(): void {
    // TransactionManager event subscription (temporarily disabled)
    // this._transactionManager.on('transaction_commit', (event) => {
    //   this.emit('contentChange', {
    //     content: this.document,
    //     transaction: event.transaction
    //   });
    // });

    // this._transactionManager.on('transaction_start', (event) => {
    //   this.emit('transactionStart', { transaction: event.transaction });
    // });

    // this._transactionManager.on('transaction_rollback', (event) => {
    //   this.emit('transactionRollback', { transaction: event.transaction });
    // });

    // DataStore event subscription (commented out for type safety)
    // this._dataStore.on('node_created', (event: any) => {
    //   this.emit('nodeCreate', { node: event.node, position: event.position });
    // });

    // this._dataStore.on('node_updated', (event: any) => {
    //   this.emit('nodeUpdate', { node: event.node, oldNode: event.oldNode });
    // });

    // this._dataStore.on('node_deleted', (event: any) => {
    //   this.emit('nodeDelete', { node: event.node, position: event.position });
    // });
  }

  private _createEmptyDocument(): any {
    return {
      id: `doc-${Date.now()}`,
      type: 'document',
      content: [],
      metadata: {
        title: 'Untitled Document',
        author: 'Unknown',
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      schema: this._getDocumentSchemaMetadata(),
      version: 1
    };
  }

  private _convertToDocumentState(document: any): DocumentState {
    return {
      type: 'document',
      content: (document.content || [])
        .map((node: any) => this._convertNode(node))
        .filter(Boolean),
      version: document.version,
      createdAt: document.metadata?.createdAt || new Date(),
      updatedAt: document.metadata?.updatedAt || new Date()
    };
  }

  private _convertFromDocumentState(state: DocumentState): any {
    const rootId = this._generateNodeId('doc');
    return {
      id: rootId,
      type: 'document',
      content: state.content.map(node => this._convertFromNode(node)),
      metadata: {
        title: 'Document',
        author: 'Unknown',
        version: '1.0.0',
        createdAt: state.createdAt,
        updatedAt: state.updatedAt
      },
      schema: this._getDocumentSchemaMetadata(),
      version: state.version
    };
  }

  private _ensureSchema(options: EditorOptions): void {
    if (options.schema) {
      this._dataStore.setActiveSchema(options.schema);
      return;
    }

    if ((options.model as any)?.schema) {
      this._dataStore.setActiveSchema((options.model as any).schema);
      return;
    }

    if (!this._dataStore.getActiveSchema()) {
      this._dataStore.setActiveSchema(
        createSchema('default-editor', getMinimalSchemaDefinition())
      );
    }
  }

  private _getDocumentSchemaMetadata(): any {
    const schema = this._dataStore.getActiveSchema();
    if (schema) {
      return {
        name: schema.name,
        ...(schema.definition || {})
      };
    }

    return {
      name: 'default-editor',
      ...getMinimalSchemaDefinition()
    };
  }

  private _convertNode(node: INode): any {
    if (!node) {
      return null;
    }

    if (typeof node === 'string') {
      const datastoreNode = this._dataStore?.getNode?.(node);
      if (datastoreNode) {
        return this._convertNode(datastoreNode);
      }
      return {
        id: node,
        type: 'text',
        text: node
      };
    }

    if (typeof node !== 'object') {
      return null;
    }

    const source = node as any;

    const convertedNode = {
      id: source.sid || source.id || this._generateNodeId('node'),
      type: source.type || source.stype || 'unknown',
      attributes: source.attributes || {},
      text: source.text,
      content: Array.isArray(source.content)
        ? source.content.map((child: any) => this._convertNode(child)).filter(Boolean)
        : undefined,
      marks: Array.isArray(source.marks)
        ? source.marks.map((mark: any) => ({
            type: mark?.stype || mark?.type,
            attributes: mark?.attrs || mark?.attributes,
            range: mark?.range
          }))
        : undefined
    };

    return convertedNode;
  }

  private _convertFromNode(node: any): INode {
    if (!node) {
      return {
        sid: this._generateNodeId('node'),
        stype: 'unknown',
        attributes: {}
      } as INode;
    }

    if (typeof node === 'string') {
      const datastoreNode = this._dataStore?.getNode?.(node);
      if (datastoreNode) {
        return this._convertFromNode(datastoreNode);
      }

      return {
        sid: node,
        stype: 'text',
        text: '',
        attributes: {}
      } as INode;
    }

    if (typeof node !== 'object') {
      return {
        sid: this._generateNodeId('node'),
        stype: 'unknown',
        attributes: {}
      } as INode;
    }

    const source = node as any;
    const convertedNode: INode = {
      sid: source.id || source.sid || this._generateNodeId('node'),
      stype: source.type || source.stype || 'unknown',
      attributes: source.attributes || {},
      text: source.text,
      marks: Array.isArray(source.marks)
        ? source.marks.map((mark: any) => ({
            stype: mark?.type || mark?.stype,
            attrs: mark?.attributes || mark?.attrs,
            range: mark?.range
          }))
        : undefined,
      content: Array.isArray(source.content)
        ? source.content
            .map((child: any) => {
              if (typeof child === 'string') {
                const childNode = this._dataStore?.getNode?.(child);
                return childNode ? this._convertFromNode(childNode) : {
                  sid: child,
                  stype: 'text',
                  text: '',
                  attributes: {}
                } as INode;
              }

              return this._convertFromNode(child);
            })
        : undefined
      };

    return convertedNode;
  }

  private _generateNodeId(prefix: string = 'node'): string {
    return this._dataStore && (this._dataStore as any).generateId
      ? (this._dataStore as any).generateId()
      : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private _syncToDataStoreFromDocumentState(finalContent: DocumentState, internalDocument?: any): void {
    const targetDocument: any = internalDocument
      ? { ...internalDocument }
      : this._convertFromDocumentState(finalContent);

    if (!targetDocument?.content && !targetDocument.content?.length) {
      targetDocument.content = [];
    }

    targetDocument.sid = targetDocument.id || this._generateNodeId('doc');
    delete targetDocument.id;

    // Normalize children into objects to match DataStore import expectations.
    if (Array.isArray(targetDocument.content)) {
      targetDocument.content = targetDocument.content.map((node: any) => ({
        ...node,
        sid: node?.sid || node?.id || this._generateNodeId('node')
      }));
    }

    if (this._dataStore?.clear) {
      this._dataStore.clear();
    }
    const result = this._dataStore?.saveDocumentInternal?.(targetDocument);
    const rootNode = this._dataStore?.getRootNode?.();
    if (result?.valid === false) {
      console.warn('[Editor] Failed to sync content to datastore:', result.errors);
    }
    if (rootNode?.sid) {
      this._rootId = rootNode.sid;
    } else if (targetDocument?.sid) {
      this._rootId = targetDocument.sid;
    }
  }

  private _addToHistory(document: any): void {
    // Remove history after current index when new changes occur
    this._history = this._history.slice(0, this._historyIndex + 1);
    
    this._history.push({ ...document });
    this._historyIndex++;
    
    // Limit history size (max 100)
    if (this._history.length > 100) {
      this._history.shift();
      this._historyIndex--;
    }
  }

  private _setupSelectionEventHandling(): void {
    // Track focus from the view's focus/blur events.
    //
    // Without this `_isFocused` stays false forever, so the `editorFocus`
    // context is never true — and every one of the default keybindings is
    // gated on `editorFocus`, so none of them resolve. Bold, headings, lists
    // and undo all silently did nothing when driven from the keyboard.
    this.on('editor:selection.focus', () => {
      this._isFocused = true;
      this._updateBuiltinContext();
    });
    this.on('editor:selection.blur', () => {
      this._isFocused = false;
      this._updateBuiltinContext();
      // A blur ends the current typing burst, so undo stops here.
      this._historyManager.closeGroup();
    });
  }

  destroy(): void {
    this._selectionManager.clearSelection();
    this._selectionManager.destroy();

    this._extensions.forEach(extension => {
      this.unuse(extension);
    });

    this._eventListeners.clear();

    this._commands.clear();
    this._extensions.clear();

    this.emit('editor:destroy', { editor: this });
  }
}

export class CommandChain {
  private editor: Editor;
  private commands: Array<{ command: string; payload?: any }> = [];

  constructor(editor: Editor) {
    this.editor = editor;
  }

  insertText(text: string): CommandChain {
    this.commands.push({ command: 'insertText', payload: text });
    return this;
  }

  deleteSelection(): CommandChain {
    this.commands.push({ command: 'deleteSelection' });
    return this;
  }

  toggleBold(): CommandChain {
    this.commands.push({ command: 'toggleBold' });
    return this;
  }

  toggleItalic(): CommandChain {
    this.commands.push({ command: 'toggleItalic' });
    return this;
  }

  toggleUnderline(): CommandChain {
    this.commands.push({ command: 'toggleUnderline' });
    return this;
  }

  toggleStrikeThrough(): CommandChain {
    this.commands.push({ command: 'toggleStrikeThrough' });
    return this;
  }

  setHeading(level: number): CommandChain {
    this.commands.push({ command: 'setHeading', payload: level });
    return this;
  }

  insertParagraph(): CommandChain {
    this.commands.push({ command: 'insertParagraph' });
    return this;
  }

  focus(): CommandChain {
    this.commands.push({ command: 'focus' });
    return this;
  }

  async run(): Promise<boolean> {
    let success = true;
    for (const { command, payload } of this.commands) {
      if (!(await this.editor.executeCommand(command, payload))) {
        success = false;
        break;
      }
    }
    return success;
  }

  canRun(): boolean {
    return this.commands.every(({ command, payload }) => 
      this.editor.canExecuteCommand(command, payload)
    );
  }
}

declare module './editor' {
  interface Editor {
    /**
     * Undo
     */
    undo(): Promise<boolean>;

    /**
     * Redo
     */
    redo(): Promise<boolean>;

    /**
     * Check if undo is possible
     */
    canUndo(): boolean;

    /**
     * Check if redo is possible
     */
    canRedo(): boolean;

    /**
     * Get history statistics
     */
    getHistoryStats(): any;

    /**
     * Clear history
     */
    clearHistory(): void;

    /**
     * Access HistoryManager instance (internal use)
     */
    get historyManager(): HistoryManager;

    /**
     * Execute transaction
     */
    transaction(operations: any[], options?: TransactionOptions): any;

    /**
     * Compress history
     */
    compressHistory(): void;

    /**
     * Resize history
     */
    resizeHistory(maxSize: number): void;

    /**
     * Get history memory usage
     */
    getHistoryMemoryUsage(): number;

    /**
     * Validate history state
     */
    validateHistory(): { isValid: boolean; errors: string[] };
  }
}

Editor.prototype.undo = async function(this: Editor): Promise<boolean> {
  const entry = this.historyManager.undo();
  if (!entry) return false;
  // Typing after an undo must start a fresh step, never merge into the one that
  // was just undone.
  this.historyManager.closeGroup();

  const metadata = entry.metadata;
  const hasSelectionMetadata = metadata && Object.prototype.hasOwnProperty.call(metadata, 'selectionBefore');
  const selectionToRestore = hasSelectionMetadata ? metadata.selectionBefore : undefined;

  try {
    this.transactionManager._isUndoRedoOperation = true;
    const result = await this.transactionManager.execute(entry.inverseOperations, {
      applySelectionToView: false
    });

    if (result.success && hasSelectionMetadata) {
      if (selectionToRestore === null) {
        this.updateSelection(null as any);
      } else if (selectionToRestore) {
        this.updateSelection(selectionToRestore);
      }
    }

    return result.success;
  } catch (error) {
    console.error('[Editor] undo failed:', error);
    return false;
  } finally {
    this.transactionManager._isUndoRedoOperation = false;
  }
};

Editor.prototype.redo = async function(this: Editor): Promise<boolean> {
  const entry = this.historyManager.redo();
  if (!entry) return false;
  this.historyManager.closeGroup();

  const metadata = entry.metadata;
  const hasSelectionMetadata = metadata && Object.prototype.hasOwnProperty.call(metadata, 'selectionAfter');
  const selectionToRestore = hasSelectionMetadata ? metadata.selectionAfter : undefined;

  try {
    this.transactionManager._isUndoRedoOperation = true;
    const result = await this.transactionManager.execute(entry.operations, {
      applySelectionToView: false
    });

    if (result.success && hasSelectionMetadata) {
      if (selectionToRestore === null) {
        this.updateSelection(null as any);
      } else if (selectionToRestore) {
        this.updateSelection(selectionToRestore);
      }
    }

    return result.success;
  } catch (error) {
    console.error('[Editor] redo failed:', error);
    return false;
  } finally {
    this.transactionManager._isUndoRedoOperation = false;
  }
};

Editor.prototype.canUndo = function(this: Editor): boolean {
  return this.historyManager.canUndo();
};

Editor.prototype.canRedo = function(this: Editor): boolean {
  return this.historyManager.canRedo();
};

Editor.prototype.getHistoryStats = function(this: Editor) {
  return this.historyManager.getStats();
};

Editor.prototype.clearHistory = function(this: Editor): void {
  this.historyManager.clear();
};

Object.defineProperty(Editor.prototype, 'historyManager', {
  get: function(this: Editor) {
    return (this as any)._historyManager;
  }
});

Editor.prototype.transaction = function(this: Editor, operations: any[], options?: TransactionOptions) {
  return {
    commit: async () => {
      return await this.transactionManager.execute(operations, options);
    }
  };
};

Editor.prototype.compressHistory = function(this: Editor): void {
  this.historyManager.compress();
};

Editor.prototype.resizeHistory = function(this: Editor, maxSize: number): void {
  this.historyManager.resize(maxSize);
};

Editor.prototype.getHistoryMemoryUsage = function(this: Editor): number {
  return this.historyManager.getMemoryUsage();
};

Editor.prototype.validateHistory = function(this: Editor): { isValid: boolean; errors: string[] } {
  return this.historyManager.validate();
};
