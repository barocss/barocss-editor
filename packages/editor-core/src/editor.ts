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
  private _dataStore: any; // DataStore 타입 임시로 any 사용
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
    this._dataStore = options.dataStore || new DataStore(); // DataStore 인스턴스
    this._document = options.content ? this._convertFromDocumentState(options.content) : this._createEmptyDocument();
    this._historyManager = new HistoryManager(options.history);
    this._transactionManager = new TransactionManager(this);
    this._selectionManager = new SelectionManager({ 
      dataStore: this._dataStore
    });
    this._isEditable = options.editable !== false;
    this._keybindingRegistry = new KeybindingRegistryImpl();
    this._keybindingRegistry.setContextProvider(this);
    
    // 초기 context 설정 (Extension 초기화 전에 기본값 설정)
    // 이 값들은 Extension의 onCreate에서 항상 존재한다고 가정할 수 있음
    this._context = { ...DEFAULT_CONTEXT_INITIAL_VALUES };
    this._updateBuiltinContext(); // 실제 상태로 업데이트
    
    // 기본 command 등록 (setContext)
    this._registerCoreCommands();
    
    // 기본 keybinding 등록 (자동으로 source: 'core')
    this._registerDefaultKeybindings();
    
    // 초기 문서를 히스토리에 추가
    this._addToHistory(this._document);
    
    // Extension 등록 (자동으로 source: 'extension')
    if (options.extensions) {
      options.extensions.forEach(ext => this.use(ext));
    }
    
    // Model 이벤트 구독
    this._setupModelEventHandling();
    
    // Selection 이벤트 구독
    this._setupSelectionEventHandling();
    
    // Selection 에러 처리 설정
    this._setupSelectionErrorHandling();
  }

  private _registerCoreCommands(): void {
    // setContext command (VS Code 스타일)
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
    // Core keybinding 등록 시 자동으로 'core'로 설정
    this._keybindingRegistry.setCurrentSource('core');
    DEFAULT_KEYBINDINGS.forEach((binding) => {
      this.keybindings.register(binding);
    });
    this._keybindingRegistry.setCurrentSource(null);
  }

  // 상태 접근
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

  // SelectionManager 메서드들을 Editor 레벨에서 직접 접근 가능하도록 위임
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
    // exportToTree()는 실제 루트 노드를 그대로 반환 (INode 형식: stype, sid)
    return tree;
  }

  /**
   * Proxy 기반으로 문서를 반환 (lazy evaluation)
   * 
   * content 배열이 ID 배열인 경우, 접근 시에만 실제 노드로 변환하여 메모리 효율적
   * 
   * @param rootId - 루트 노드 ID (없으면 기본 루트 사용)
   * @returns Proxy로 래핑된 INode (ModelData 호환)
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

  // Selection 에러는 이벤트로 처리 (임시 비활성화)
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

  // 명령어 실행
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

  // 상태 변경
  setContent(content: DocumentState): void {
    this._document = this._convertFromDocumentState(content);
    this.emit('editor:content.change', { content, transaction: null });
  }

  updateSelection(selection: SelectionState | any): void {
    // ModelSelection 형식인 경우 (type: 'range')
    if (selection && selection.type === 'range') {
      // ModelSelection을 SelectionManager에 저장
      this._selectionManager.setSelection(selection);
      
      // context 업데이트
      this._updateBuiltinContext();
      
      // editor:selection.model 이벤트 발생
      // View에서 render() 이후 DOM selection을 복원함
      this.emit('editor:selection.model', selection);
      return;
    }
    
    // SelectionState 형식인 경우 (기존 동작)
    // context 업데이트
    this._updateBuiltinContext();
    
    // 대신 이벤트를 발생시켜 상태 변경을 알림
    this.emit('editor:selection.change', { selection, oldSelection: this.selection });
  }

  // contentEditable 요소 설정 (editor-view-dom에서 호출)
  setContentEditableElement(element: HTMLElement): void {
    this._selectionManager.setContentEditableElement(element);
  }

  setEditable(editable: boolean): void {
    this._isEditable = editable;
    this._updateBuiltinContext();
    this.emit('editor:editable.change', { editable });
  }

  // Context 관리 (VS Code 스타일)
  setContext(key: string, value: unknown): void {
    const oldValue = this._context[key];
    
    // null 또는 undefined를 설정하면 context key를 제거
    if (value === null || value === undefined) {
      delete this._context[key];
    } else {
      this._context[key] = value;
    }
    
    // Context 변경 이벤트 발생
    // 1. 일반 이벤트: 모든 context 변경을 구독
    this.emit('editor:context.change', { key, value, oldValue });
    
    // 2. 특정 key에 대한 이벤트: 원하는 key만 구독 가능
    this.emit(`editor:context.change:${key}`, { key, value, oldValue });
    
    // Context 변경 시 관련된 모든 부분이 자동으로 반응하도록 이벤트 기반으로 동작
    // 예: keybinding 활성화/비활성화, UI 업데이트 등
    // 주의: When clause는 resolve() 호출 시점에 재평가되며, 자동으로 재평가되지 않습니다.
  }

  /**
   * 특정 context key의 변경만 구독하는 편의 메서드
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
    
    // unsubscribe 함수 반환
    return () => {
      this.off(eventName, callback);
    };
  }

  /**
   * Context 조회
   * 
   * @param key - 조회할 context key (선택). 제공되지 않으면 전체 context 반환
   * @returns key가 제공되면 해당 값, 아니면 전체 context 객체
   * 
   * @example
   * ```typescript
   * // 전체 context 조회
   * const context = editor.getContext();
   * 
   * // 특정 key 조회 (편의 메서드)
   * const isFocused = editor.getContext('editorFocus');
   * ```
   */
  getContext(): Record<string, unknown>;
  getContext(key: string): unknown;
  getContext(key?: string): Record<string, unknown> | unknown {
    this._updateBuiltinContext(); // 항상 최신 상태로 업데이트
    
    if (key !== undefined) {
      // 특정 key 조회
      return this._context[key];
    }
    
    // 전체 context 반환
    return { ...this._context };
  }

  private _updateBuiltinContext(): void {
    // 기본 context key 자동 업데이트
    this._context.editorFocus = this._isFocused;
    this._context.editorEditable = this._isEditable;
    // 플랫폼 context (고정 값)
    this._context.isMac = IS_MAC;
    this._context.isLinux = IS_LINUX;
    this._context.isWindows = IS_WINDOWS;
    
    const selection = this._selectionManager.getCurrentSelection();
    if (selection) {
      this._context.selectionEmpty = selection.collapsed === true;
      this._context.selectionType = selection.type;
      this._context.selectionDirection = selection.direction;
      
      // canIndent: 선택된 노드가 indentable한지 체크 (구조적 들여쓰기)
      const targetNodeId = this._getIndentableTargetNodeId(selection);
      this._context.canIndent = targetNodeId !== null && 
                                this._dataStore.isIndentableNode(targetNodeId);
      
      // canIndentText: Range selection이고 텍스트 노드인지 체크 (텍스트 들여쓰기)
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

    // History context
    this._context.historyCanUndo = this._historyManager.canUndo();
    this._context.historyCanRedo = this._historyManager.canRedo();
  }

  /**
   * 현재 selection에서 indent/outdent 대상 노드 ID를 가져옴
   * - Node Selection: startNodeId 사용
   * - Range Selection: startNodeId의 부모 블록 노드
   */
  private _getIndentableTargetNodeId(selection: ModelSelection): string | null {
    // Node Selection: startNodeId 사용
    if (selection.type === 'node') {
      return selection.startNodeId;
    }

    // Range Selection: startNodeId의 부모 블록 노드를 찾음
    if (selection.type === 'range') {
      const startNode = this._dataStore.getNode(selection.startNodeId);
      if (!startNode) return null;

      const schema = this._dataStore.getActiveSchema();
      
      // startNode가 블록이면 그대로 사용
      if (schema) {
        const nodeType = schema.getNodeType(startNode.stype);
        if (nodeType?.group === 'block' && this._dataStore.isIndentableNode(startNode.sid!)) {
          return startNode.sid!;
        }
      }

      // startNode의 부모 블록 노드를 찾음
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

    // cell, table 타입은 indentable하지 않음
    return null;
  }

  // 이벤트 관리
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

  // 확장 관리
  use(extension: Extension): void {
    if (this._extensions.has(extension.name)) {
      console.warn(`Extension ${extension.name} is already installed`);
      return;
    }

    try {
      extension.onBeforeCreate?.(this);
      
      // 확장의 명령어 등록
      if (extension.commands) {
        extension.commands.forEach(command => {
          this._commands.set(command.name, command);
        });
      }
      
      this._extensions.set(extension.name, extension);
      
      // Extension 등록 전에 현재 소스를 'extension'으로 설정
      this._keybindingRegistry.setCurrentSource('extension');
      extension.onCreate?.(this);
      // Extension 등록 후 소스 초기화
      this._keybindingRegistry.setCurrentSource(null);
      
      this.emit('extension:add', { extension });
    } catch (error) {
      console.error(`Error installing extension ${extension.name}:`, error);
      // 에러 발생 시에도 소스 초기화
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
      
      // 확장의 명령어 제거
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

  // 명령어 등록 (확장에서 사용)
  registerCommand(command: Command): void {
    this._commands.set(command.name, command);
  }

  // 히스토리
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

  // 트랜잭션 실행
  executeTransaction(transaction: Transaction): void {
    try {
      // TODO: 실제 트랜잭션 실행 로직 구현
      // this._transactionManager.commitTransaction(transaction);

      // Lightweight model mutation bridge for demo
      this._applyBasicTransaction(transaction as any);
      
      // 문서 변경 시 히스토리에 추가
      this._addToHistory(this._document);
      
      this.emit('transactionExecuted', { transaction });
      // 가시성 향상을 위한 임시 브리지: 콘텐츠 변경 이벤트도 발생
      this.emit('editor:content.change', { content: this.document, transaction });
      // 모델 selection이 트랜잭션에 포함된 경우 브리지 이벤트로 알림
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
      // parent 찾기: 없으면 루트를 parent로 사용
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
      
      // marks 업데이트 (제공된 경우)
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

  // Model 이벤트 처리 설정
  private _setupModelEventHandling(): void {
    // TransactionManager 이벤트 구독 (임시 비활성화)
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

    // DataStore 이벤트 구독 (타입 안전성을 위해 임시로 주석 처리)
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

  // 헬퍼 메서드들
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
      schema: {} as any, // TODO: 기본 스키마 설정
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
      schema: {} as any, // TODO: 기본 스키마 설정
      version: state.version
    };
  }

  private _convertNode(node: INode): any {
    // TODO: INode를 DocumentState Node로 변환
    return node;
  }

  private _convertFromNode(node: any): INode {
    // TODO: DocumentState Node를 INode로 변환
    return node;
  }

  private _addToHistory(document: any): void {
    // 현재 인덱스 이후의 히스토리 제거 (새로운 변경사항이 있을 때)
    this._history = this._history.slice(0, this._historyIndex + 1);
    
    // 새 문서를 히스토리에 추가
    this._history.push({ ...document });
    this._historyIndex++;
    
    // 히스토리 크기 제한 (최대 100개)
    if (this._history.length > 100) {
      this._history.shift();
      this._historyIndex--;
    }
  }

  // Selection 이벤트 처리 설정
  private _setupSelectionEventHandling(): void {
    // SelectionManager의 이벤트를 Editor 이벤트로 전달 (임시 비활성화)
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

  // 생명주기
  destroy(): void {
    // SelectionManager 정리
    this._selectionManager.clearSelection();
    this._selectionManager.destroy();

    // 모든 확장 제거
    this._extensions.forEach(extension => {
      this.unuse(extension);
    });

    // 이벤트 리스너 정리
    this._eventListeners.clear();

    // TODO: Model 정리
    // this._transactionManager.destroy?.();

    this.emit('editor:destroy', { editor: this });
  }
}

// 명령어 체이닝 클래스
export class CommandChain {
  private editor: Editor;
  private commands: Array<{ command: string; payload?: any }> = [];

  constructor(editor: Editor) {
    this.editor = editor;
  }

  // 명령어 추가
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

  // 실행
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

// History 관련 메서드들을 Editor 클래스에 추가
declare module './editor' {
  interface Editor {
    /**
     * 실행 취소
     */
    undo(): Promise<boolean>;

    /**
     * 다시 실행
     */
    redo(): Promise<boolean>;

    /**
     * 실행 취소 가능 여부
     */
    canUndo(): boolean;

    /**
     * 다시 실행 가능 여부
     */
    canRedo(): boolean;


    /**
     * 히스토리 통계 정보
     */
    getHistoryStats(): any;

    /**
     * 히스토리 초기화
     */
    clearHistory(): void;

    /**
     * HistoryManager 인스턴스 접근 (내부용)
     */
    get historyManager(): HistoryManager;

    /**
     * 트랜잭션 실행
     */
    transaction(operations: any[]): any;

    /**
     * 히스토리 압축
     */
    compressHistory(): void;

    /**
     * 히스토리 크기 조정
     */
    resizeHistory(maxSize: number): void;

    /**
     * 히스토리 메모리 사용량 확인
     */
    getHistoryMemoryUsage(): number;

    /**
     * 히스토리 상태 검증
     */
    validateHistory(): { isValid: boolean; errors: string[] };
  }
}

// History 관련 메서드 구현
Editor.prototype.undo = async function(): Promise<boolean> {
  const entry = this._historyManager.undo();
  if (!entry) return false;

  try {
    // undo/redo 플래그 설정
    this._transactionManager._isUndoRedoOperation = true;
    
    // 역함수 operations 실행
    const result = await this._transactionManager.execute(entry.inverseOperations);
    return result.success;
  } catch (error) {
    console.error('[Editor] undo failed:', error);
    return false;
  } finally {
    // 플래그 해제
    this._transactionManager._isUndoRedoOperation = false;
  }
};

Editor.prototype.redo = async function(): Promise<boolean> {
  const entry = this._historyManager.redo();
  if (!entry) return false;

  try {
    // undo/redo 플래그 설정
    this._transactionManager._isUndoRedoOperation = true;
    
    // 원래 operations 실행
    const result = await this._transactionManager.execute(entry.operations);
    return result.success;
  } catch (error) {
    console.error('[Editor] redo failed:', error);
    return false;
  } finally {
    // 플래그 해제
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
  // TransactionBuilder를 반환
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
