import { Editor } from '@barocss/editor-core';
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
  private lastSelection: any = null; // 마지막 selection 정보 저장
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

    // AutoTracer 초기화
    this.autoTracer = new AutoTracer(this.editor, {
      enabled: options.enableAutoTracing !== false
    });

    // AutoTracer 활성화
    if (options.enableAutoTracing !== false) {
      this.autoTracer.enable();
    }

    // Trace 이벤트 리스너 설정
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

    // Event logging은 일시적으로 비활성화 (Execution Flow에 집중)
    // if (!this.debug) {
    //   console.log('[Devtool] setupEventListeners: SKIP - debug is false');
    //   return;
    // }

    // Listen to all events using a catch-all approach
    // Event logging 비활성화 (Execution Flow에 집중)
    /*
    const eventTypes = [
      'editor:content.change',
      'editor:node.create',
      'editor:node.update',
      'editor:node.delete',
      'editor:selection.change',
      'editor:selection.model',  // 모델 selection 변경 이벤트
      'editor:selection.dom.applied',  // DOM selection 적용 이벤트
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
        // editor:content.change 또는 selection 변경 이벤트 발생 시 즉시 모델 트리 갱신
        if (eventType === 'editor:content.change' || 
            eventType === 'editor:selection.change' ||
            eventType === 'editor:selection.model' ||
            eventType === 'editor:selection.dom.applied') {
          console.log('[Devtool] Content/Selection change detected, refreshing model tree...');
          // selection.change 이벤트에서 selection 정보 저장
          if (eventType === 'editor:selection.change' && data?.selection) {
            this.lastSelection = data.selection;
          }
          
          // 약간의 지연을 두어 모델 업데이트가 완료된 후 트리 갱신
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

    // 플로우 완료 확인
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

      // 최대 개수 제한
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
      // Event logging 비활성화 (Execution Flow에 집중)
      // this.logEvent(event, data);
      
      // editor:content.change에서 inputDebug 감지 및 UI 업데이트
      if (event === 'editor:content.change' && data?.inputDebug) {
        console.log('[Devtool] inputDebug detected in editor:content.change', data.inputDebug);
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
   * Get selection information for tree rendering
   */
  private getSelectionInfo(selection: any): Map<string, { start: number; end: number }> {
    const selectionMap = new Map<string, { start: number; end: number }>();
    
    if (!selection) {
      return selectionMap;
    }

    // SelectionState 타입 처리 (nodeId, from, to 사용)
    if (selection.nodeId && typeof selection.from === 'number' && typeof selection.to === 'number') {
      selectionMap.set(selection.nodeId, {
        start: selection.from,
        end: selection.to
      });
      return selectionMap;
    }

    // editor:selection.change 이벤트의 selection 객체 처리
    // anchorNode, focusNode를 사용하여 nodeId 찾기
    if (selection.anchorNode || selection.focusNode) {
      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      const anchorOffset = selection.anchorOffset || 0;
      const focusOffset = selection.focusOffset || 0;
      
      // anchorNode에서 nodeId 찾기
      let anchorNodeId: string | null = null;
      if (anchorNode) {
        const anchorEl = anchorNode.nodeType === Node.ELEMENT_NODE 
          ? (anchorNode as Element) 
          : anchorNode.parentElement;
        anchorNodeId = anchorEl?.closest?.('[data-bc-sid]')?.getAttribute('data-bc-sid') || null;
      }
      
      // focusNode에서 nodeId 찾기
      let focusNodeId: string | null = null;
      if (focusNode) {
        const focusEl = focusNode.nodeType === Node.ELEMENT_NODE 
          ? (focusNode as Element) 
          : focusNode.parentElement;
        focusNodeId = focusEl?.closest?.('[data-bc-sid]')?.getAttribute('data-bc-sid') || null;
      }
      
      if (anchorNodeId && focusNodeId) {
        if (anchorNodeId === focusNodeId) {
          // 같은 노드 내 selection
          const start = Math.min(anchorOffset, focusOffset);
          const end = Math.max(anchorOffset, focusOffset);
          selectionMap.set(anchorNodeId, {
            start,
            end
          });
        } else {
          // 다른 노드에 걸친 selection
          selectionMap.set(anchorNodeId, {
            start: anchorOffset,
            end: Infinity
          });
          selectionMap.set(focusNodeId, {
            start: 0,
            end: focusOffset
          });
        }
        return selectionMap;
      }
    }

    // ModelRangeSelection 타입 처리 (type === 'range')
    // 또는 convertDOMSelectionToModel 결과 (startNodeId, startOffset, endNodeId, endOffset)
    if (selection.type === 'range' && selection.startNodeId && selection.endNodeId) {
      const startNodeId = selection.startNodeId;
      const startOffset = selection.startOffset || 0;
      const endNodeId = selection.endNodeId;
      const endOffset = selection.endOffset || 0;

      if (startNodeId === endNodeId) {
        // 같은 노드 내 selection
        selectionMap.set(startNodeId, {
          start: startOffset,
          end: endOffset
        });
      } else {
        // 다른 노드에 걸친 selection
        selectionMap.set(startNodeId, {
          start: startOffset,
          end: Infinity // 노드 끝까지
        });
        selectionMap.set(endNodeId, {
          start: 0,
          end: endOffset
        });
      }
      return selectionMap;
    }

    // startNodeId/endNodeId만 있는 경우 (type이 없어도 처리)
    if (selection.startNodeId && selection.endNodeId && typeof selection.startOffset === 'number') {
      const startNodeId = selection.startNodeId;
      const startOffset = selection.startOffset || 0;
      const endNodeId = selection.endNodeId;
      const endOffset = selection.endOffset || 0;

      if (startNodeId === endNodeId) {
        selectionMap.set(startNodeId, {
          start: startOffset,
          end: endOffset
        });
      } else {
        selectionMap.set(startNodeId, {
          start: startOffset,
          end: Infinity
        });
        selectionMap.set(endNodeId, {
          start: 0,
          end: endOffset
        });
      }
      return selectionMap;
    }

    // ModelSelection 타입 처리 (startNodeId, startOffset, endNodeId, endOffset)
    if (selection.startNodeId && selection.endNodeId) {
      const startNodeId = selection.startNodeId;
      const startOffset = selection.startOffset || 0;
      const endNodeId = selection.endNodeId;
      const endOffset = selection.endOffset || 0;

      if (startNodeId === endNodeId) {
        // 같은 노드 내 selection
        const start = Math.min(startOffset, endOffset);
        const end = Math.max(startOffset, endOffset);
        selectionMap.set(startNodeId, {
          start,
          end
        });
      } else {
        // 다른 노드에 걸친 selection
        selectionMap.set(startNodeId, {
          start: startOffset,
          end: Infinity // 노드 끝까지
        });
        selectionMap.set(endNodeId, {
          start: 0,
          end: endOffset
        });
      }
      return selectionMap;
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

    // Range가 없는 mark는 전체 텍스트에 적용되므로 [0, text.length]로 변환
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

