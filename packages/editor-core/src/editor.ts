import { Transaction, TransactionManager } from '@barocss/model';
import { DocumentState, SelectionState, EditorOptions, Extension, Command, EditorEventType, ModelSelection } from './types';
import { DataStoreLoader, DataStoreExporter, DataStore, INode } from '@barocss/datastore';
import { SelectionManager } from './selection-manager';
import { HistoryManager } from './history-manager';
import { KeybindingRegistryImpl, type KeybindingRegistry, type ContextProvider } from './keybinding';
import { DEFAULT_KEYBINDINGS } from './keybinding/default-keybindings';
import { DEFAULT_CONTEXT_INITIAL_VALUES } from './context/default-context';
import { IS_MAC, IS_LINUX, IS_WINDOWS } from '@barocss/shared';

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
    this._document = options.content ? this._convertFromDocumentState(options.content) : this._createEmptyDocument();
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
  }

  private _registerDefaultKeybindings(): void {
    // Automatically set source to 'core' when registering core keybindings
    this._keybindingRegistry.setCurrentSource('core');
    DEFAULT_KEYBINDINGS.forEach((binding) => {
      this.keybindings.register(binding);
    });
    this._keybindingRegistry.setCurrentSource(null);
  }

  get document(): DocumentState {
    return this._convertToDocumentState(this._document);
  }

  get selection(): ModelSelection | null {
    return this._selectionManager.getCurrentSelection() || null;
  }

  get dataStore(): DataStore {
    return this._dataStore as DataStore;
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
    this._selectionManager.setRange(rangeSelection);
  }

  // -------- Load/Export helpers (DX-oriented, keep responsibilities thin) --------
  loadDocument(treeDocument: any, sessionId: string = 'editor-session'): void {
    const loader = new DataStoreLoader(this._dataStore, sessionId);
    const rootId = loader.loadDocument(treeDocument);
    this._rootId = rootId;
    this.emit('editor:content.change', { content: this.document, transaction: null, rootId });
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

  setNode(nodeSelection: any): void {
    this._selectionManager.setNode(nodeSelection);
  }

  setAbsolutePos(absoluteSelection: any): void {
    this._selectionManager.setAbsolutePos(absoluteSelection);
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

      commandDef.before?.(this, payload);
      const result = await commandDef.execute(this, payload);
      commandDef.after?.(this, payload);

      this.emit('editor:command.execute', { command, payload, success: result });
      return result;
    } catch (error) {
      console.error(`Error executing command ${command}:`, error);
      this.emit('error:command', { command, payload, error });
      return false;
    }
  }

  canExecuteCommand(command: string, payload?: any): boolean {
    const commandDef = this._commands.get(command);
    if (!commandDef) return false;
    return commandDef.canExecute ? commandDef.canExecute(this, payload) : true;
  }

  setContent(content: DocumentState): void {
    this._document = this._convertFromDocumentState(content);
    this.emit('editor:content.change', { content, transaction: null });
  }

  updateSelection(selection: SelectionState | any): void {
    // ModelSelection format (type: 'range')
    if (selection && selection.type === 'range') {
      this._selectionManager.setSelection(selection);
      this._updateBuiltinContext();
      // View restores DOM selection after render()
      this.emit('editor:selection.model', selection);
      return;
    }
    
    // SelectionState format (legacy behavior)
    this._updateBuiltinContext();
    this.emit('editor:selection.change', { selection, oldSelection: this.selection });
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
    if (selection) {
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
    } else {
      this._context.selectionEmpty = true;
      this._context.selectionType = null;
      this._context.selectionDirection = null;
      this._context.canIndent = false;
      this._context.canIndentText = false;
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

      // Find parent block node of startNode
      let current = startNode;
      while (current && current.parentId) {
        const parent = this._dataStore.getNode(current.parentId);
        if (!parent) break;

        const parentType = schema?.getNodeType(parent.stype);
        if (parentType?.group === 'block' && this._dataStore.isIndentableNode(parent.sid!)) {
          return parent.sid!;
        }

        current = parent;
      }
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
    console.log('[Editor] emit:', event, { 
      hasListeners: this._eventListeners.has(event),
      listenersCount: this._eventListeners.get(event)?.size || 0,
      dataKeys: data ? Object.keys(data) : []
    });
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    } else {
      console.log('[Editor] emit: no listeners for', event);
    }
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
      console.error(`Error uninstalling extension ${extension.name}:`, error);
    }
  }

  registerCommand(command: Command): void {
    this._commands.set(command.name, command);
  }

  undo(): void {
    try {
      if (this._historyIndex > 0) {
        this._historyIndex--;
        this._document = this._history[this._historyIndex];
        this.emit('editor:history.undo', { document: this._document });
        this.emit('editor:history.change', { 
          canUndo: this.canUndo(), 
          canRedo: this.canRedo() 
        });
      }
    } catch (error) {
      console.error('Undo failed:', error);
    }
  }

  redo(): void {
    try {
      if (this._historyIndex < this._history.length - 1) {
        this._historyIndex++;
        this._document = this._history[this._historyIndex];
        this.emit('editor:history.redo', { document: this._document });
        this.emit('editor:history.change', { 
          canUndo: this.canUndo(), 
          canRedo: this.canRedo() 
        });
      }
    } catch (error) {
      console.error('Redo failed:', error);
    }
  }

  canUndo(): boolean {
    return this._historyIndex > 0;
  }

  canRedo(): boolean {
    return this._historyIndex < this._history.length - 1;
  }

  executeTransaction(transaction: Transaction): void {
    try {
      // TODO: Implement actual transaction execution logic
      // this._transactionManager.commitTransaction(transaction);

      // Lightweight model mutation bridge for demo
      this._applyBasicTransaction(transaction as any);
      
      this._addToHistory(this._document);
      
      this.emit('transactionExecuted', { transaction });
      // Temporary bridge: also emit content change event
      this.emit('editor:content.change', { content: this.document, transaction });
      // Bridge event if model selection is included in transaction
      const selAfter = (transaction as any)?.selectionAfter;
      if (selAfter) {
        this.emit('editor:selection.model', selAfter as any);
      }
    } catch (error) {
      console.error('Transaction execution failed:', error);
      this.emit('transactionError', { transaction, error });
    }
  }

  private _applyBasicTransaction(tx: any): void {
    if (!tx || !tx.type) return;
    const ds: any = this._dataStore;
    if (!ds || typeof ds.getNode !== 'function') return;
    const now = new Date();
    const genId = () => `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    if (tx.type === 'insert_paragraph_after') {
      const afterNodeId: string | undefined = tx.afterNodeId;
      const afterNode = afterNodeId ? ds.getNode(afterNodeId) : undefined;
      if (!afterNode) return;
      // Find parent: use root as parent if not found
      const parent = (afterNode.parentId ? ds.getNode(afterNode.parentId) : ds.getNode(this.getRootId?.() as any)) || ds.getRootNode?.();
      if (!parent) return;
      const newParaId = tx.newParagraphId || genId();
      const newTextId = tx.newTextId || genId();
      const newPara = {
        id: newParaId,
        type: 'paragraph',
        attributes: {},
        content: [newTextId],
        metadata: { createdAt: now, updatedAt: now },
        version: 1,
        parentId: parent.sid
      } as any;
      const newText = {
        id: newTextId,
        type: 'text',
        text: '',
        attributes: {},
        metadata: { createdAt: now, updatedAt: now },
        version: 1,
        parentId: newParaId
      } as any;
      ds.setNode(newPara);
      ds.setNode(newText);
      const content: string[] = Array.isArray(parent.content) ? [...parent.content] : [];
      const idx = content.indexOf(afterNodeId as string);
      const insertAt = idx >= 0 ? idx + 1 : content.length;
      content.splice(insertAt, 0, newParaId);
      ds.setNode({ ...parent, content });
      return;
    }

    if (tx.type === 'insert_paragraph_at_root') {
      const root = ds.getRootNode?.();
      if (!root) return;
      const newParaId = tx.newParagraphId || genId();
      const newTextId = tx.newTextId || genId();
      const newPara = {
        id: newParaId,
        type: 'paragraph',
        attributes: {},
        content: [newTextId],
        metadata: { createdAt: now, updatedAt: now },
        version: 1,
        parentId: root.sid
      } as any;
      const newText = {
        id: newTextId,
        type: 'text',
        text: '',
        attributes: {},
        metadata: { createdAt: now, updatedAt: now },
        version: 1,
        parentId: newParaId
      } as any;
      ds.setNode(newPara);
      ds.setNode(newText);
      const content: string[] = Array.isArray(root.content) ? [...root.content] : [];
      content.push(newParaId);
      ds.setNode({ ...root, content });
      return;
    }

    if (tx.type === 'text_replace') {
      const nodeId: string | undefined = tx.nodeId;
      const node = nodeId ? ds.getNode(nodeId) : undefined;
      if (!node || node.type !== 'text') return;
      const oldText: string = (node as any).text || '';
      const start: number = tx.start ?? 0;
      const end: number = tx.end ?? start;
      const insertText: string = tx.text ?? '';
      const newText = oldText.slice(0, start) + insertText + oldText.slice(end);
      
      // Update marks if provided
      const updatedNode: any = {
        ...node,
        text: newText,
        metadata: { ...(node as any).metadata, updatedAt: now }
      };
      
      if (tx.marks !== undefined) {
        updatedNode.marks = tx.marks;
      }
      
      ds.setNode(updatedNode);
      return;
    }

    if (tx.type === 'update') {
      const nodeId: string | undefined = tx.nodeId;
      const node = nodeId ? ds.getNode(nodeId) : undefined;
      if (!node) return;
      const updates: any = tx.updates || {};
      const updatedNode = {
        ...node,
        ...updates,
        metadata: { ...(node as any).metadata, updatedAt: now }
      };
      ds.setNode(updatedNode);
      return;
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
      schema: {} as any, // TODO: Set default schema
      version: 1
    };
  }

  private _convertToDocumentState(document: any): DocumentState {
    return {
      type: 'document',
      content: (document.content || []).map(node => this._convertNode(node)),
      version: document.version,
      createdAt: document.metadata?.createdAt || new Date(),
      updatedAt: document.metadata?.updatedAt || new Date()
    };
  }

  private _convertFromDocumentState(state: DocumentState): any {
    return {
      id: `doc-${Date.now()}`,
      type: 'document',
      content: state.content.map(node => this._convertFromNode(node)),
      metadata: {
        title: 'Document',
        author: 'Unknown',
        version: '1.0.0',
        createdAt: state.createdAt,
        updatedAt: state.updatedAt
      },
      schema: {} as any, // TODO: Set default schema
      version: state.version
    };
  }

  private _convertNode(node: INode): any {
    // TODO: Convert INode to DocumentState Node
    return node;
  }

  private _convertFromNode(node: any): INode {
    // TODO: Convert DocumentState Node to INode
    return node;
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
    // Forward SelectionManager events to Editor events (temporarily disabled)
    // this._selectionManager.on('selectionChange', (data: any) => {
    //   this.emit('editor:selection.change', data);
    // });

    // this._selectionManager.on('focus', (data: any) => {
    //   this._isFocused = true;
    //   this.emit('editor:selection.focus', data);
    // });

    // this._selectionManager.on('blur', (data: any) => {
    //   this._isFocused = false;
    //   this.emit('editor:selection.blur', data);
    // });
  }

  destroy(): void {
    this._selectionManager.clearSelection();
    this._selectionManager.destroy();

    this._extensions.forEach(extension => {
      this.unuse(extension);
    });

    this._eventListeners.clear();

    // TODO: Clean up Model
    // this._transactionManager.destroy?.();

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
    transaction(operations: any[]): any;

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

Editor.prototype.undo = async function(): Promise<boolean> {
  const entry = this._historyManager.undo();
  if (!entry) return false;

  try {
    // Set undo/redo flag
    this._transactionManager._isUndoRedoOperation = true;
    
    // Execute inverse operations
    const result = await this._transactionManager.execute(entry.inverseOperations);
    return result.success;
  } catch (error) {
    console.error('[Editor] undo failed:', error);
    return false;
  } finally {
    // Clear flag
    this._transactionManager._isUndoRedoOperation = false;
  }
};

Editor.prototype.redo = async function(): Promise<boolean> {
  const entry = this._historyManager.redo();
  if (!entry) return false;

  try {
    // Set undo/redo flag
    this._transactionManager._isUndoRedoOperation = true;
    
    // Execute original operations
    const result = await this._transactionManager.execute(entry.operations);
    return result.success;
  } catch (error) {
    console.error('[Editor] redo failed:', error);
    return false;
  } finally {
    // Clear flag
    this._transactionManager._isUndoRedoOperation = false;
  }
};

Editor.prototype.canUndo = function(): boolean {
  return this._historyManager.canUndo();
};

Editor.prototype.canRedo = function(): boolean {
  return this._historyManager.canRedo();
};


Editor.prototype.getHistoryStats = function() {
  return this._historyManager.getStats();
};

Editor.prototype.clearHistory = function(): void {
  this._historyManager.clear();
};

Object.defineProperty(Editor.prototype, 'historyManager', {
  get: function() {
    return this._historyManager;
  }
});

Editor.prototype.transaction = function(operations: any[]) {
  // Return TransactionBuilder
  return {
    commit: async () => {
      return await this._transactionManager.execute(operations);
    }
  };
};

Editor.prototype.compressHistory = function(): void {
  this._historyManager.compress();
};

Editor.prototype.resizeHistory = function(maxSize: number): void {
  this._historyManager.resize(maxSize);
};

Editor.prototype.getHistoryMemoryUsage = function(): number {
  return this._historyManager.getMemoryUsage();
};

Editor.prototype.validateHistory = function(): { isValid: boolean; errors: string[] } {
  return this._historyManager.validate();
};
