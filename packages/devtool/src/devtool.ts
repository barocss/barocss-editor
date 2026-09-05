import { Editor, isModelSelection, type MaybeSelection } from '@barocss/editor-core';
import { DevtoolOptions, EventLog, ModelTreeNode, ExecutionFlow, TraceStartEvent, TraceEndEvent, TraceErrorEvent } from './types';
import { DevtoolUI } from './ui';
import { AutoTracer } from './auto-tracer';

/**
 * Barocss Editor Devtool
 * 
 * Provides development tools for visualizing editor structure and events
 */
export class Devtool {
  private editor: Editor;
  private ui: DevtoolUI;
  private eventLogs: EventLog[] = [];
  private maxEvents: number;
  private debug: boolean;
  /*
   * `editor:selection.change` 가 싣고 오는 것 — 그 payload 는 `MaybeSelection | null` 이다. `any` 였을
   * 때 `getSelectionInfo` 가 오지 않는 모양 둘을 읽고 있었고, 그 둘을 지운 뒤에도 `any` 로 두면 다음에
   * 같은 것이 다시 쓰인다.
   */
  private lastSelection: MaybeSelection | null = null;
  private autoTracer: AutoTracer;
  private traces: Map<string, ExecutionFlow> = new Map();
  private maxFlows: number = 100;

  constructor(options: DevtoolOptions) {
    console.log('[Devtool] constructor: START', { hasEditor: !!options.editor });
    this.editor = options.editor;
    this.maxEvents = options.maxEvents ?? 1000;
    this.debug = options.debug ?? true;
    
    // Initialize UI
    this.ui = new DevtoolUI({
      onEventFilter: (filter) => this.filterEvents(filter),
      onNodeSelect: (nodeId) => this.selectNode(nodeId),
      onClearLogs: () => this.clearLogs(),
      container: options.container,
    });

    // Setup event listeners
    console.log('[Devtool] constructor: calling setupEventListeners');
    this.setupEventListeners();

    // Initialize AutoTracer
    this.autoTracer = new AutoTracer(this.editor, {
      enabled: options.enableAutoTracing !== false
    });

    // Enable AutoTracer
    if (options.enableAutoTracing !== false) {
      this.autoTracer.enable();
    }

    // Setup Trace event listeners
    this.setupTraceListeners();

    // Initial render
    this.refreshModelTree();

    // Listen for manual refresh requests
    window.addEventListener('devtool:refresh-tree', () => {
      this.refreshModelTree();
    });
    console.log('[Devtool] constructor: DONE');
  }

  /**
   * Setup event listeners for all editor events
   */
  private setupEventListeners(): void {
    // Patch emit first (always needed for model tree refresh)
    console.log('[Devtool] setupEventListeners: patching emit');
    this.patchEditorEmit();

    // Event logging temporarily disabled (focusing on Execution Flow)
    // if (!this.debug) {
    //   console.log('[Devtool] setupEventListeners: SKIP - debug is false');
    //   return;
    // }

    // Listen to all events using a catch-all approach
    // Event logging disabled (focusing on Execution Flow)
    /*
    const eventTypes = [
      'editor:content.change',
      'editor:node.create',
      'editor:node.update',
      'editor:node.delete',
      'editor:selection.change',
      'editor:selection.model',  // Model selection change event
      'editor:selection.dom.applied',  // DOM selection applied event
      'editor:selection.focus',
      'editor:selection.blur',
      'editor:command.execute',
      'editor:command.before',
      'editor:command.after',
      'editor:history.change',
      'editor:history.undo',
      'editor:history.redo',
      'editor:editable.change',
      'error:selection',
      'error:command',
      'error:extension',
      'extension:add',
      'extension:remove',
      'extension:enable',
      'extension:disable',
    ];

    eventTypes.forEach(eventType => {
      this.editor.on(eventType, (data: any) => {
        console.log('[Devtool] Event received:', eventType, data);
        this.logEvent(eventType, data);
        // Immediately refresh model tree when editor:content.change or selection change event occurs
        if (eventType === 'editor:content.change' || 
            eventType === 'editor:selection.change' ||
            eventType === 'editor:selection.model' ||
            eventType === 'editor:selection.dom.applied') {
          console.log('[Devtool] Content/Selection change detected, refreshing model tree...');
          // Store selection information from selection.change event
          if (eventType === 'editor:selection.change' && data?.selection) {
            this.lastSelection = data.selection;
          }
          
          // Add slight delay to refresh tree after model update completes
          setTimeout(() => {
            this.refreshModelTree();
          }, 10);
        }
      });
    });
    */
  }

  /**
   * Trace 이벤트 리스너 설정
   */
  private setupTraceListeners(): void {
    this.editor.on('editor:trace.start', (data: TraceStartEvent) => {
      this._handleTraceStart(data);
      this.ui.updateExecutionFlow(this._getCompletedFlows(50));
    });

    this.editor.on('editor:trace.end', (data: TraceEndEvent) => {
      this._handleTraceEnd(data);
      this.ui.updateExecutionFlow(this._getCompletedFlows(50));
    });

    this.editor.on('editor:trace.error', (data: TraceErrorEvent) => {
      this._handleTraceError(data);
      this.ui.updateExecutionFlow(this._getCompletedFlows(50));
    });
  }

  /**
   * Trace 시작 처리
   */
  private _handleTraceStart(data: TraceStartEvent): void {
    const flow = this._getOrCreateFlow(data.traceId);
    flow.spans.push({
      spanId: data.spanId,
      parentSpanId: data.parentSpanId,
      operationName: data.operationName,
      className: data.className,
      package: data.package,
      startTime: data.timestamp,
      input: data.input
    });
  }

  /**
   * Trace 종료 처리
   */
  private _handleTraceEnd(data: TraceEndEvent): void {
    const flow = this._getOrCreateFlow(data.traceId);
    const span = flow.spans.find(s => s.spanId === data.spanId);
    
    if (span) {
      span.endTime = data.timestamp;
      span.duration = data.duration;
      span.output = data.output;
    }

    // Check if flow is completed
    if (this._isCompleted(flow)) {
      flow.endTime = data.timestamp;
      flow.duration = data.timestamp - flow.startTime;
    }
  }

  /**
   * Trace 에러 처리
   */
  private _handleTraceError(data: TraceErrorEvent): void {
    const flow = this._getOrCreateFlow(data.traceId);
    const span = flow.spans.find(s => s.spanId === data.spanId);
    
    if (span) {
      span.endTime = data.timestamp;
      span.duration = data.duration;
      span.error = data.error as any;
    }
  }

  /**
   * Flow 가져오기 또는 생성
   */
  private _getOrCreateFlow(traceId: string): ExecutionFlow {
    if (!this.traces.has(traceId)) {
      this.traces.set(traceId, {
        traceId,
        spans: [],
        startTime: Date.now()
      });

      // Limit maximum count
      if (this.traces.size > this.maxFlows) {
        const oldest = Array.from(this.traces.entries())
          .sort((a, b) => a[1].startTime - b[1].startTime)[0];
        this.traces.delete(oldest[0]);
      }
    }
    return this.traces.get(traceId)!;
  }

  /**
   * 플로우 완료 여부 확인
   */
  private _isCompleted(flow: ExecutionFlow): boolean {
    return flow.spans.length > 0 && flow.spans.every(span => span.endTime !== undefined);
  }

  /**
   * 완료된 플로우 목록 가져오기
   */
  private _getCompletedFlows(limit: number = 50): ExecutionFlow[] {
    return Array.from(this.traces.values())
      .filter(flow => this._isCompleted(flow))
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
      .slice(0, limit);
  }

  /**
   * Patch editor.emit to catch all events
   * Note: This patches the emit method to intercept all events
   */
  private patchEditorEmit(): void {
    console.log('[Devtool] patchEditorEmit: START');
    // Store original emit if not already stored
    if (!(this.editor as any).__originalEmit) {
      (this.editor as any).__originalEmit = this.editor.emit.bind(this.editor);
      console.log('[Devtool] patchEditorEmit: stored original emit');
    }
    
    const originalEmit = (this.editor as any).__originalEmit;
    this.editor.emit = (event: string, data?: any) => {
      console.log('[Devtool] patched emit called:', event, { 
        isContentChange: event === 'editor:content.change',
        dataKeys: data ? Object.keys(data) : []
      });
      // Event logging disabled (focusing on Execution Flow)
      // this.logEvent(event, data);
      
      // Input debug records. `editor:input.debug` is where the input handler
      // reports them now; content.change is still accepted because other paths
      // (and older recordings) carry them there.
      if ((event === 'editor:input.debug' || event === 'editor:content.change') && data?.inputDebug) {
        console.log(`[Devtool] inputDebug detected in ${event}`, data.inputDebug);
        this.ui.updateLastInputDebug(data.inputDebug);
      }
      
      // editor:content.change 또는 selection 변경 이벤트 발생 시 즉시 모델 트리 갱신
      if (event === 'editor:content.change' || 
          event === 'editor:selection.change' ||
          event === 'editor:selection.model' ||
          event === 'editor:selection.dom.applied') {
        console.log('[Devtool] Content/Selection change detected in patched emit, refreshing model tree...');
        // selection.change 이벤트에서 selection 정보 저장
        if (event === 'editor:selection.change' && data?.selection) {
          this.lastSelection = data.selection;
        }
        
        // 약간의 지연을 두어 모델 업데이트가 완료된 후 트리 갱신
        setTimeout(() => {
          this.refreshModelTree();
        }, 10);
      }
      const result = originalEmit(event, data);
      console.log('[Devtool] patched emit: called originalEmit, result:', result);
      return result;
    };
    console.log('[Devtool] patchEditorEmit: DONE');
  }

  /**
   * Log an event
   */
  private logEvent(type: string, data: any): void {
    const category = this.getEventCategory(type);
    const log: EventLog = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type,
      data: this.sanitizeEventData(data),
      category,
    };

    this.eventLogs.unshift(log);
    if (this.eventLogs.length > this.maxEvents) {
      this.eventLogs = this.eventLogs.slice(0, this.maxEvents);
    }

    this.ui.updateEventLog(this.eventLogs);
  }

  /**
   * Get event category from event type
   */
  private getEventCategory(type: string): string {
    if (type.startsWith('editor:')) return 'editor';
    if (type.startsWith('error:')) return 'error';
    if (type.startsWith('extension:')) return 'extension';
    if (type.startsWith('plugin:')) return 'plugin';
    return 'custom';
  }

  /**
   * Sanitize event data to prevent circular references
   */
  private sanitizeEventData(data: any, depth = 0): any {
    if (depth > 3) return '[Max Depth]';
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;

    // Handle DOM nodes
    if (data instanceof Node) {
      return {
        nodeType: data.nodeType,
        nodeName: data.nodeName,
        textContent: data.textContent?.substring(0, 100),
      };
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.slice(0, 10).map(item => this.sanitizeEventData(item, depth + 1));
    }

    // Handle objects
    const sanitized: Record<string, any> = {};
    const keys = Object.keys(data).slice(0, 20); // Limit keys
    for (const key of keys) {
      try {
        sanitized[key] = this.sanitizeEventData(data[key], depth + 1);
      } catch (e) {
        sanitized[key] = '[Error serializing]';
      }
    }
    return sanitized;
  }

  /**
   * Build model tree from editor document
   */
  private buildModelTree(): ModelTreeNode | null {
    try {
      // Use getDocumentProxy to get the root document
      if (!this.editor.getDocumentProxy) {
        console.warn('[Devtool] getDocumentProxy is not available');
        return null;
      }

      const rootNode = this.editor.getDocumentProxy();
      if (!rootNode) {
        return null;
      }

      // Get current selection information
      // Try multiple ways to get selection
      let selection = (this.editor as any).selection;
      
      // First, try to use lastSelection from event (most reliable)
      if (this.lastSelection) {
        selection = this.lastSelection;
      }
      
      // Also try to get from selectionManager directly
      const selectionManager = (this.editor as any)._selectionManager;
      if (selectionManager) {
        const modelSelection = selectionManager.getCurrentSelection();
        if (modelSelection) {
          selection = modelSelection;
        }
      }
      
      // Also try to get from DOM selection and convert
      const domSelection = window.getSelection();
      if (domSelection && domSelection.rangeCount > 0 && (!selection || Object.keys(selection).length === 0)) {
        // Try to get selection from editorViewDOM
        const editorViewDOM = (this.editor as any)._viewDOM;
        if (editorViewDOM && editorViewDOM.convertDOMSelectionToModel) {
          try {
            const converted = editorViewDOM.convertDOMSelectionToModel(domSelection);
            if (converted && converted.type === 'range') {
              selection = converted;
            }
          } catch (e) {
            console.warn('[Devtool] Failed to convert DOM selection:', e);
          }
        }
      }
      
      const selectionInfo = this.getSelectionInfo(selection);

      return this.buildTreeNode(rootNode, selectionInfo);
    } catch (error) {
      console.error('[Devtool] Error building model tree:', error);
      return null;
    }
  }

  /**
   * 트리에 칠할 선택을 노드별 구간으로 편다.
   *
   * **여기 있던 분기 다섯 중 넷을 지웠다 — 둘은 오지 않는 모양이었고, 둘은 남은 하나의 사본이었다.**
   *
   * 이 함수에 들어오는 값의 출처는 `buildModelTree` 안에 네 곳뿐이고, 넷 다 `MaybeSelection` 이다:
   *
   * | 출처 | 무엇을 준다 |
   * |---|---|
   * | `editor.selection` | `ModelSelection \| null` (게터의 선언 그대로) |
   * | `lastSelection` ← `editor:selection.change` | payload 가 `MaybeSelection \| null` 로 좁혀져 있다 |
   * | `selectionManager.getCurrentSelection()` | `ModelSelection \| null` |
   * | `convertDOMSelectionToModel(domSelection)` | `MaybeSelection` — 게다가 `type === 'range'` 일 때만 쓴다 |
   *
   * 지운 넷:
   *
   * | 분기 | 적혀 있던 것 | 실제로 |
   * |---|---|---|
   * | `nodeId` + `from` + `to` | *"Handle SelectionState type"* | `SelectionState` 는 이제 없고, **있을 때도 아무것도 그것을 만들지 않았다** |
   * | `anchorNode` / `focusNode` | *"selection object from `editor:selection.change`"* | 그 이벤트는 DOM 노드를 실은 적이 없다. `MaybeSelection` 을 싣는다 |
   * | `type === 'range' && startNodeId && endNodeId` | | 아래 분기와 **같은 계산** |
   * | `startNodeId && endNodeId && typeof startOffset === 'number'` | | 같음 |
   *
   * 앞의 둘이 이 저장소가 되풀이해 만드는 결함이다 — **의도를 적은 타입이 배선되지 않은 채 남고,
   * 읽는 쪽이 그 의도를 향해 읽는다.** `packages/editor-core/src/types.ts` 의 `SelectionState`·
   * `ModelNodeSelection` 프로세가 같은 문장을 두 번 적어 두었고, 이것이 세 번째다. 특히
   * `anchorNode` 분기는 devtool 이 **뷰 층이 이미 한 일을 다시 했다**: `closest('[data-bc-sid]')` 로
   * DOM 에서 노드 id 를 찾는 것은 `fromDOMSelection` 이 하는 일이고, 그것을 지나 온 값이 여기 온다.
   *
   * 뒤의 둘은 사본이었다. 셋 다 `startNodeId`/`startOffset`/`endNodeId`/`endOffset` 을 같은 식으로
   * 폈고, 다른 것은 마지막 사본이 `Math.min`/`Math.max` 를 한 번 더 걸었다는 것뿐이다 —
   * `ModelSelection` 은 *"Always guarantees start ≤ end (normalized)"* 이므로 그 min/max 는 아무
   * 일도 하지 않거나, 하는 날엔 규약이 깨진 것을 **감춘다.** 그래서 남기지 않았다.
   *
   * **남긴 것 하나:** `nodeIds` 가 있는 선택(칸 여럿, 도형 여럿)은 여기서 첫·끝 노드만 칠해진다.
   * 구멍 있는 집합을 양 끝으로 그리는 것은 틀렸지만 그것은 이 함수가 죽어 있어서가 아니라 devtool 이
   * 아직 `selectedNodeIds()` 를 안 읽어서다 — `docs/BACKLOG.md` 에 열어 두었다.
   */
  private getSelectionInfo(selection: MaybeSelection | null | undefined): Map<string, { start: number; end: number }> {
    const selectionMap = new Map<string, { start: number; end: number }>();

    if (!selection || !isModelSelection(selection)) {
      return selectionMap;
    }

    const { startNodeId, endNodeId } = selection;
    const startOffset = selection.startOffset || 0;
    const endOffset = selection.endOffset || 0;

    if (startNodeId === endNodeId) {
      // 같은 노드 내 selection
      selectionMap.set(startNodeId, { start: startOffset, end: endOffset });
    } else {
      // 다른 노드에 걸친 selection
      selectionMap.set(startNodeId, { start: startOffset, end: Infinity }); // To end of node
      selectionMap.set(endNodeId, { start: 0, end: endOffset });
    }

    return selectionMap;
  }

  /**
   * Get decorators for a specific node
   */
  private getDecoratorsForNode(nodeId: string): Array<{ stype: string; range?: [number, number] }> {
    try {
      const editorViewDOM = (this.editor as any)._viewDOM;
      if (!editorViewDOM || !editorViewDOM.decoratorManager) {
        return [];
      }

      const decorators = editorViewDOM.decoratorManager.getAll({
        nodeId,
        category: 'inline',
        enabledOnly: true
      });

      return decorators.map((d: any) => {
        const target = d.target;
        if (target && 'sid' in target && target.sid === nodeId && 'startOffset' in target && 'endOffset' in target) {
          return {
            stype: d.stype,
            range: [target.startOffset, target.endOffset] as [number, number]
          };
        }
        return null;
      }).filter((d: any): d is { stype: string; range?: [number, number] } => d !== null);
    } catch (e) {
      console.warn('[Devtool] Error getting decorators for node:', e);
      return [];
    }
  }

  /**
   * Split text by marks and decorators for inline-text nodes
   */
  private splitTextByMarksAndDecorators(
    text: string, 
    marks: Array<{ type?: string; stype?: string; range?: [number, number] }>,
    decorators: Array<{ stype: string; range?: [number, number] }>
  ): Array<{ text: string; start: number; end: number; marks: string[]; decorators: string[] }> {
    const len = text.length;
    if (!text || len === 0) {
      return [{ text, start: 0, end: len, marks: [], decorators: [] }];
    }

    // Marks without range apply to entire text, so convert to [0, text.length]
    const normalizedMarks = (marks || []).map(mark => ({
      ...mark,
      range: mark.range || [0, len]
    }));

    // Collect boundaries from mark and decorator ranges
    const boundaries = new Set<number>();
    boundaries.add(0);
    boundaries.add(len);
    
    for (const mark of normalizedMarks) {
      const [start, end] = mark.range!;
      if (start >= 0 && start <= len) boundaries.add(start);
      if (end >= 0 && end <= len) boundaries.add(end);
    }

    for (const decorator of decorators || []) {
      if (!decorator.range) continue;
      const [start, end] = decorator.range;
      if (start >= 0 && start <= len) boundaries.add(start);
      if (end >= 0 && end <= len) boundaries.add(end);
    }

    const points = Array.from(boundaries.values()).sort((a, b) => a - b);
    const runs: Array<{ text: string; start: number; end: number; marks: string[]; decorators: string[] }> = [];

    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      if (end <= start) continue;

      const runText = text.slice(start, end);
      const runMarks: string[] = [];
      const runDecorators: string[] = [];

      // Find marks that apply to this run
      for (const mark of normalizedMarks) {
        const markType = mark.type || mark.stype;
        if (!markType) continue;

        const [markStart, markEnd] = mark.range!;
        // Mark overlaps with this run
        if (markStart < end && markEnd > start) {
          runMarks.push(markType);
        }
      }

      // Find decorators that apply to this run
      for (const decorator of decorators || []) {
        if (!decorator.range) continue;
        const [decoratorStart, decoratorEnd] = decorator.range;

        // Decorator overlaps with this run
        if (decoratorStart < end && decoratorEnd > start) {
          runDecorators.push(decorator.stype);
        }
      }

      runs.push({
        text: runText,
        start,
        end,
        marks: [...new Set(runMarks)], // Remove duplicates
        decorators: [...new Set(runDecorators)] // Remove duplicates
      });
    }

    return runs;
  }

  /**
   * Build a tree node from a model node
   * getDocumentProxy() returns nodes with content as actual node objects (not IDs)
   */
  private buildTreeNode(node: any, selectionInfo?: Map<string, { start: number; end: number }>): ModelTreeNode {
    const nodeId = node.sid || node.id || 'unknown';
    const nodeType = node.stype || node.type || 'unknown';
    const treeNode: ModelTreeNode = {
      id: nodeId,
      type: nodeType,
    };

    if (node.text) {
      treeNode.text = node.text;
      
      // Add selection information if this node has selection
      if (selectionInfo && selectionInfo.has(nodeId)) {
        const sel = selectionInfo.get(nodeId)!;
        treeNode.selection = {
          start: sel.start,
          end: sel.end
        };
      }

      // For inline-text nodes, always split text by marks and decorators (even if empty)
      // This ensures textRuns are always created for inline-text nodes
      if (nodeType === 'inline-text' && node.text) {
        // Use marks from node (getDocumentProxy already returns latest data)
        const marks = node.marks && Array.isArray(node.marks) 
          ? node.marks.map((mark: any) => ({
              type: mark.type || mark.stype,
              stype: mark.stype || mark.type,
              range: mark.range
            }))
          : [];
        
        const decorators = this.getDecoratorsForNode(nodeId);
        
        // Always create textRuns for inline-text nodes
        const runs = this.splitTextByMarksAndDecorators(node.text, marks, decorators);
        
        // Add selection information to each run if it overlaps
        if (treeNode.selection) {
          const { start: selStart, end: selEnd } = treeNode.selection;
          treeNode.textRuns = runs.map(run => {
            // Check if selection overlaps with this run
            if (selStart < run.end && selEnd > run.start) {
              // Calculate selection relative to this run
              const runSelStart = Math.max(0, selStart - run.start);
              const runSelEnd = Math.min(run.text.length, selEnd - run.start);
              return {
                ...run,
                selection: {
                  start: runSelStart,
                  end: runSelEnd
                }
              };
            }
            return run;
          });
        } else {
          treeNode.textRuns = runs;
        }
        
        // Clear text property when textRuns exist to avoid confusion
        // (renderTreeNode will use textRuns instead)
        delete treeNode.text;
      }
    }

    if (node.attributes) {
      treeNode.attributes = { ...node.attributes };
    }

    if (node.marks && Array.isArray(node.marks)) {
      treeNode.marks = node.marks.map((mark: any) => ({
        type: mark.type || mark.stype || 'unknown',
        range: mark.range,
      }));
    }

    // getDocumentProxy() returns content as actual node objects, not IDs
    if (node.content && Array.isArray(node.content)) {
      treeNode.children = node.content
        .map((child: any) => {
          try {
            // getDocumentProxy() already resolves content to node objects
            if (child && (child.sid || child.id)) {
              return this.buildTreeNode(child, selectionInfo);
            }
            return null;
          } catch (e) {
            console.warn('[Devtool] Error building child node:', e, child);
            return null;
          }
        })
        .filter((child: ModelTreeNode | null): child is ModelTreeNode => child !== null);
    }

    return treeNode;
  }

  /**
   * Refresh model tree display
   */
  private refreshModelTree(): void {
    console.log('[Devtool] refreshModelTree: CALLED');
    const tree = this.buildModelTree();
    this.ui.updateModelTree(tree);
  }


  /**
   * Filter events
   */
  private filterEvents(filter: string): void {
    const filtered = filter
      ? this.eventLogs.filter(log => 
          log.type.toLowerCase().includes(filter.toLowerCase()) ||
          log.category.toLowerCase().includes(filter.toLowerCase())
        )
      : this.eventLogs;
    this.ui.updateEventLog(filtered);
  }

  /**
   * Select a node in the model tree
   */
  private selectNode(nodeId: string): void {
    // Text-run (M/D/T) nodes are encoded as `${inlineTextId}:run-${start}-${end}`
    const runMatch = nodeId.match(/^(?<base>.+):run-(?<start>\d+)-(?<end>\d+)$/);
    if (runMatch?.groups?.base) {
      const inlineTextId = runMatch.groups.base;
      const start = parseInt(runMatch.groups.start, 10);
      const end = parseInt(runMatch.groups.end, 10);

      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        if (this.highlightInlineTextRange(inlineTextId, start, end)) {
          return;
        }
        this.selectTextRunRange(inlineTextId, start, end);
        return;
      }
    }

    this.highlightDomNode(nodeId);
  }

  private selectTextRunRange(nodeId: string, start: number, end: number): void {
    const editorViewDOM = (this.editor as any)._viewDOM;

    if (editorViewDOM?.convertModelSelectionToDOM) {
      try {
        editorViewDOM.convertModelSelectionToDOM({
          type: 'text',
          anchor: { nodeId, offset: start },
          focus: { nodeId, offset: end }
        });
      } catch (error) {
        console.warn('[Devtool] Failed to convert model selection to DOM:', error);
      }
    } else if (typeof (this.editor as any).setRange === 'function') {
      try {
        (this.editor as any).setRange({
          startNodeId: nodeId,
          startOffset: start,
          endNodeId: nodeId,
          endOffset: end
        });
      } catch (error) {
        console.warn('[Devtool] Failed to set range on editor:', error);
      }
    }

    this.highlightDomNode(nodeId);
  }

  private highlightInlineTextRange(nodeId: string, start: number, end: number): boolean {
    const container = document.querySelector(`[data-bc-sid="${nodeId}"]`);
    if (!container) {
      return false;
    }

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let cumulativeOffset = 0;
    let anchorNode: Text | null = null;
    let anchorOffset = 0;
    let focusNode: Text | null = null;
    let focusOffset = 0;
    let lastTextNode: Text | null = null;
    const clampedStart = Math.max(0, start);
    const clampedEnd = Math.max(clampedStart, end);

    let textNode = walker.nextNode() as Text | null;
    while (textNode) {
      const textLength = textNode.textContent?.length ?? 0;
      const nodeStart = cumulativeOffset;
      const nodeEnd = cumulativeOffset + textLength;

      if (!anchorNode && clampedStart <= nodeEnd) {
        anchorNode = textNode;
        anchorOffset = Math.max(0, Math.min(textLength, clampedStart - nodeStart));
      }

      if (!focusNode && clampedEnd <= nodeEnd) {
        focusNode = textNode;
        focusOffset = Math.max(0, Math.min(textLength, clampedEnd - nodeStart));
      }

      cumulativeOffset = nodeEnd;
      lastTextNode = textNode;

      if (anchorNode && focusNode) {
        break;
      }

      textNode = walker.nextNode() as Text | null;
    }

    if (!anchorNode && lastTextNode) {
      anchorNode = lastTextNode;
      anchorOffset = lastTextNode.textContent?.length ?? 0;
    }

    if (!focusNode && lastTextNode) {
      focusNode = lastTextNode;
      focusOffset = lastTextNode.textContent?.length ?? 0;
    }

    if (!anchorNode || !focusNode) {
      return false;
    }

    try {
      const selection = window.getSelection();
      if (!selection) {
        return false;
      }
      const range = document.createRange();
      range.setStart(anchorNode, Math.max(0, Math.min(anchorOffset, anchorNode.textContent?.length ?? 0)));
      range.setEnd(focusNode, Math.max(0, Math.min(focusOffset, focusNode.textContent?.length ?? 0)));

      selection.removeAllRanges();
      selection.addRange(range);

      (container as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    } catch (error) {
      console.warn('[Devtool] Failed to highlight inline-text range:', error);
      return false;
    }
  }

  private highlightDomNode(nodeId: string): void {
    const element = document.querySelector(`[data-bc-sid="${nodeId}"]`);
    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const originalOutline = (element as HTMLElement).style.outline;
    (element as HTMLElement).style.outline = '2px solid #4CAF50';
    setTimeout(() => {
      (element as HTMLElement).style.outline = originalOutline;
    }, 2000);
  }

  /**
   * Clear event logs
   */
  private clearLogs(): void {
    this.eventLogs = [];
    this.ui.updateEventLog([]);
  }

  /**
   * Destroy devtool and cleanup
   */
  destroy(): void {
    // Event listeners are automatically cleaned up when editor is destroyed
    this.ui.destroy();
  }
}

