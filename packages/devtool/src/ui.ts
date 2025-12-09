import { EventLog, ModelTreeNode, LastInputDebug, ExecutionFlow } from './types';

export interface DevtoolUIOptions {
  onEventFilter?: (filter: string) => void;
  onNodeSelect?: (nodeId: string) => void;
  onClearLogs?: () => void;
  /** Container element to mount the devtool. If not provided, mounts to document.body */
  container?: HTMLElement;
}

/**
 * Devtool UI Component
 * 
 * Creates a floating panel that displays:
 * - Model tree structure
 * - Event log with filtering
 * - Node selection and highlighting
 */
export class DevtoolUI {
  private container: HTMLElement;
  private options: DevtoolUIOptions;
  private isMinimized = false;
  private previousTree: ModelTreeNode | null = null;
  private nodeElementMap: Map<string, HTMLElement> = new Map();
  private lastInputDebug: LastInputDebug | null = null;
  private _currentFlows: ExecutionFlow[] | null = null;

  constructor(options: DevtoolUIOptions) {
    this.options = options;
    this.container = this.createContainer();
    this.attachStyles();
    const mountContainer = options.container || document.body;
    mountContainer.appendChild(this.container);
  }

  /**
   * Create the main devtool container
   */
  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'barocss-devtool';
    container.setAttribute('data-devtool', 'true'); // For filtering Selection events
    container.innerHTML = `
      <div class="devtool-tabs">
        <button class="devtool-tab" data-tab="tree">Model Tree</button>
        <button class="devtool-tab" data-tab="events">Events</button>
        <button class="devtool-tab active" data-tab="flow">Execution Flow</button>
      </div>
      <div class="devtool-content">
        <div class="devtool-panel" id="panel-tree">
          <div class="devtool-last-input" id="last-input-debug"></div>
          <div class="devtool-tree" id="tree-container"></div>
        </div>
        <div class="devtool-panel" id="panel-events">
          <div class="devtool-event-log" id="event-container"></div>
        </div>
        <div class="devtool-panel active" id="panel-flow">
          <div class="devtool-flow-list" id="flow-list"></div>
        </div>
      </div>
    `;

    // Setup event listeners
    this.setupEventListeners(container);

    return container;
  }

  /**
   * Setup event listeners for UI interactions
   */
  private setupEventListeners(container: HTMLElement): void {
    // Tab switching
    const tabs = container.querySelectorAll('.devtool-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const panels = container.querySelectorAll('.devtool-panel');
        panels.forEach(p => p.classList.remove('active'));
        const targetPanel = container.querySelector(`#panel-${tabName}`);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      });
    });

    // Execution Flow event delegation (register once on flowList)
    const flowList = container.querySelector('#flow-list');
    if (flowList) {
      // Copy button click event delegation
      flowList.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const copyBtn = target.closest('.flow-copy-btn') as HTMLElement;
        if (!copyBtn) return;
        
        e.stopPropagation();
        e.preventDefault();
        
        const action = copyBtn.getAttribute('data-action');
        const traceId = copyBtn.getAttribute('data-trace-id');
        if (!traceId || !action) return;
        
        // flows array needs to be stored to be accessible from updateExecutionFlow
        // Alternatively, find flow data from DOM or reference flows via closure
        // For now, use method of storing flows as instance variable
        const flow = this._currentFlows?.find(f => f.traceId === traceId);
        if (!flow) return;
        
        if (action === 'copy-trace') {
          this._copyTrace(flow);
        } else if (action === 'copy-prompt') {
          this._copyPrompt(flow);
        }
      });

      // Flow header click event delegation (expand/collapse)
      flowList.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // Ignore Copy button clicks
        if (target.closest('.flow-copy-btn')) {
          return;
        }
        
        const header = target.closest('.flow-header') as HTMLElement;
        if (!header) return;
        
        const traceId = header.getAttribute('data-trace-id');
        if (!traceId) return;
        
        const flowItem = header.closest('.flow-item') as HTMLElement;
        if (!flowItem) return;
        
        const flowSpans = flowItem.querySelector('.flow-spans') as HTMLElement;
        const expandIcon = header.querySelector('.flow-expand') as HTMLElement;
        
        if (flowSpans) {
          const isExpanded = flowSpans.style.display !== 'none';
          flowSpans.style.display = isExpanded ? 'none' : 'block';
          if (expandIcon) {
            expandIcon.textContent = isExpanded ? '▶' : '▼';
          }
        }
      });
    }
  }

  /**
   * Update model tree display with efficient diff algorithm
   */
  updateModelTree(tree: ModelTreeNode | null): void {
    const container = document.getElementById('tree-container');
    if (!container) return;

    if (!tree) {
      if (this.previousTree) {
        container.innerHTML = '<div class="devtool-empty">No model data available</div>';
        this.previousTree = null;
        this.nodeElementMap.clear();
      }
      return;
    }

    // Simple approach: compare tree structure, if different do full re-render
    // For now, use full re-render but keep the structure for future optimization
    const treeChanged = !this.previousTree || this.isTreeStructureChanged(this.previousTree, tree);
    
    if (treeChanged) {
      container.innerHTML = this.renderTreeNode(tree, 0);
      this.attachNodeEventHandlers(container);
      this.previousTree = this.deepCloneTree(tree);
      this.buildNodeElementMap(container);
    } else {
      // Only update changed node content, keep DOM structure
      if (this.previousTree) {
        this.updateTreeContent(container, this.previousTree, tree);
      }
      this.previousTree = this.deepCloneTree(tree);
    }

    // Auto-scroll to cursor/selection if it's not visible
    this.scrollToSelectionIfNeeded(container);
  }

  /**
   * Scroll to cursor/selection if it's not visible in the viewport
   */
  private scrollToSelectionIfNeeded(container?: HTMLElement): void {
    const treeContainer = container || document.getElementById('tree-container');
    if (!treeContainer) return;
    // Find the first element with cursor or selection
    const cursorElement = treeContainer.querySelector('.tree-cursor') as HTMLElement;
    const selectionElement = treeContainer.querySelector('.tree-selection') as HTMLElement;
    
    const targetElement = cursorElement || selectionElement;
    if (!targetElement) {
      return; // No cursor or selection found
    }

    // Find the parent tree-node element
    const treeNode = targetElement.closest('.tree-node') as HTMLElement;
    if (!treeNode) {
      return;
    }

    // Check if the element is visible in the viewport
    const containerRect = treeContainer.getBoundingClientRect();
    const elementRect = treeNode.getBoundingClientRect();

    const isVisible = 
      elementRect.top >= containerRect.top &&
      elementRect.bottom <= containerRect.bottom;

    // If not visible, scroll it into view
    if (!isVisible) {
      treeNode.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center',
        inline: 'nearest'
      });
    }
  }

  /**
   * Check if tree structure has changed (nodes added/removed/reordered)
   */
  private isTreeStructureChanged(oldTree: ModelTreeNode, newTree: ModelTreeNode): boolean {
    if (oldTree.id !== newTree.id) return true;
    
    // Check textRuns changes (count or structure)
    const oldTextRuns = oldTree.textRuns || [];
    const newTextRuns = newTree.textRuns || [];
    if (oldTextRuns.length !== newTextRuns.length) return true;
    for (let i = 0; i < oldTextRuns.length; i++) {
      if (oldTextRuns[i].start !== newTextRuns[i].start || 
          oldTextRuns[i].end !== newTextRuns[i].end) {
        return true;
      }
    }
    
    const oldChildren = oldTree.children || [];
    const newChildren = newTree.children || [];
    
    if (oldChildren.length !== newChildren.length) return true;
    
    for (let i = 0; i < oldChildren.length; i++) {
      if (oldChildren[i].id !== newChildren[i].id) return true;
      if (this.isTreeStructureChanged(oldChildren[i], newChildren[i])) return true;
    }
    
    return false;
  }

  /**
   * Update only node content without changing DOM structure
   */
  private updateTreeContent(container: HTMLElement, oldTree: ModelTreeNode, newTree: ModelTreeNode): void {
    const element = this.nodeElementMap.get(newTree.id);
    if (element && this.isNodeChanged(oldTree, newTree)) {
      // If textRuns changed, need to re-render the entire node subtree
      const oldTextRuns = oldTree.textRuns || [];
      const newTextRuns = newTree.textRuns || [];
      const textRunsChanged = JSON.stringify(oldTextRuns) !== JSON.stringify(newTextRuns);
      
      if (textRunsChanged && (oldTextRuns.length > 0 || newTextRuns.length > 0)) {
        // Re-render the entire node with its textRuns
        const parentElement = element.parentElement;
        if (parentElement) {
          const depth = parseInt(element.style.paddingLeft) / 10 || 0;
          const newHtml = this.renderTreeNode(newTree, depth);
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = newHtml;
          const newNodeElement = tempDiv.firstElementChild as HTMLElement;
          if (newNodeElement) {
            parentElement.replaceChild(newNodeElement, element);
            this.attachNodeEventHandlers(newNodeElement);
            this.buildNodeElementMap(container);
          }
        }
      } else {
      this.updateNodeContent(element, newTree);
      }
    }

    const oldChildren = oldTree.children || [];
    const newChildren = newTree.children || [];
    
    // Update children recursively
    for (let i = 0; i < Math.min(oldChildren.length, newChildren.length); i++) {
      if (oldChildren[i].id === newChildren[i].id) {
        const childElement = this.nodeElementMap.get(newChildren[i].id);
        if (childElement) {
          this.updateTreeContent(childElement.parentElement || container, oldChildren[i], newChildren[i]);
        }
      }
    }
  }


  /**
   * Check if node content has changed
   */
  private isNodeChanged(oldNode: ModelTreeNode, newNode: ModelTreeNode): boolean {
    return (
      oldNode.type !== newNode.type ||
      oldNode.text !== newNode.text ||
      JSON.stringify(oldNode.attributes) !== JSON.stringify(newNode.attributes) ||
      JSON.stringify(oldNode.marks) !== JSON.stringify(newNode.marks) ||
      JSON.stringify(oldNode.selection) !== JSON.stringify(newNode.selection) ||
      JSON.stringify(oldNode.textRuns) !== JSON.stringify(newNode.textRuns)
    );
  }

  /**
   * Update node content in DOM
   */
  private updateNodeContent(element: HTMLElement, node: ModelTreeNode): void {
    const typeEl = element.querySelector('.tree-type');
    const idEl = element.querySelector('.tree-id');
    const textEl = element.querySelector('.tree-text');
    const marksEl = element.querySelector('.tree-marks');

    if (typeEl) typeEl.textContent = node.type;
    if (idEl) idEl.textContent = node.id;
    
    if (node.text) {
      // Render text with selection cursor if available
      let textToRender = node.text;
      const maxLength = 100;
      const shouldTruncate = textToRender.length > maxLength;
      
      if (shouldTruncate) {
        textToRender = textToRender.substring(0, maxLength) + '...';
      }
      
      let textHtml = '';
      if (node.selection) {
        const { start, end } = node.selection;
        const textBefore = textToRender.substring(0, Math.min(start, textToRender.length));
        const textSelected = textToRender.substring(Math.min(start, textToRender.length), Math.min(end, textToRender.length));
        const textAfter = textToRender.substring(Math.min(end, textToRender.length));
        
        if (start === end) {
          // Collapsed selection (cursor)
          textHtml = `"${this.escapeHtml(textBefore)}<span class="tree-cursor">|</span>${this.escapeHtml(textAfter)}"`;
        } else {
          // Range selection
          textHtml = `"${this.escapeHtml(textBefore)}<span class="tree-selection">${this.escapeHtml(textSelected)}</span>${this.escapeHtml(textAfter)}"`;
        }
      } else {
        textHtml = `"${this.escapeHtml(textToRender)}"`;
      }
      
      if (textEl) {
        textEl.innerHTML = textHtml;
      } else {
        // Create text element if it doesn't exist
        const newTextEl = document.createElement('span');
        newTextEl.className = 'tree-text';
        newTextEl.innerHTML = textHtml;
        idEl?.insertAdjacentElement('afterend', newTextEl);
      }
    } else if (textEl) {
      textEl.remove();
    }

    if (node.marks && node.marks.length > 0) {
      const marksText = `[${node.marks.map(m => m.type).join(', ')}]`;
      if (marksEl) {
        marksEl.textContent = marksText;
      } else {
        const newMarksEl = document.createElement('span');
        newMarksEl.className = 'tree-marks';
        newMarksEl.textContent = marksText;
        element.appendChild(newMarksEl);
      }
    } else if (marksEl) {
      marksEl.remove();
    }
  }

  /**
   * Build map of node ID to DOM element
   */
  private buildNodeElementMap(container: HTMLElement): void {
    // Don't clear the map, just add new entries
    container.querySelectorAll('.tree-node').forEach(nodeEl => {
      const nodeId = (nodeEl as HTMLElement).getAttribute('data-node-id');
      if (nodeId) {
        this.nodeElementMap.set(nodeId, nodeEl as HTMLElement);
      }
    });
  }

  /**
   * Attach event handlers to node elements
   */
  private attachNodeEventHandlers(container: HTMLElement): void {
    container.querySelectorAll('.tree-node').forEach(nodeEl => {
      // Remove existing listeners by cloning
      const newNode = nodeEl.cloneNode(true) as HTMLElement;
      nodeEl.parentNode?.replaceChild(newNode, nodeEl);
      
      newNode.addEventListener('click', (e) => {
        e.stopPropagation();
        const nodeId = newNode.getAttribute('data-node-id');
        if (nodeId) {
          this.options.onNodeSelect?.(nodeId);
          // Highlight clicked node
          const treeContainer = document.getElementById('tree-container');
          treeContainer?.querySelectorAll('.tree-node').forEach(n => n.classList.remove('selected'));
          newNode.classList.add('selected');
        }
      });
    });
  }

  /**
   * Deep clone tree for comparison
   */
  private deepCloneTree(tree: ModelTreeNode): ModelTreeNode {
    return {
      id: tree.id,
      type: tree.type,
      text: tree.text,
      attributes: tree.attributes ? { ...tree.attributes } : undefined,
      marks: tree.marks ? tree.marks.map(m => ({ ...m })) : undefined,
      selection: tree.selection ? { ...tree.selection } : undefined,
      children: tree.children ? tree.children.map(c => this.deepCloneTree(c)) : undefined,
    };
  }

  /**
   * Render a tree node recursively
   */
  private renderTreeNode(node: ModelTreeNode, depth: number): string {
    const hasChildren = node.children && node.children.length > 0;
    const expandIcon = hasChildren ? '▼' : ' ';
    const nodeClass = hasChildren ? 'tree-node expandable' : 'tree-node';
    
    let html = `
      <div class="${nodeClass}" data-node-id="${node.id}" style="padding-left: ${depth * 10}px">
        <span class="tree-expand">${expandIcon}</span>
        <span class="tree-type">${node.type}</span>
        <span class="tree-id">${node.id}</span>
    `;

    // Only render text if textRuns are not present
    if (node.text && (!node.textRuns || node.textRuns.length === 0)) {
      // Render text with selection cursor if available
      let textToRender = node.text;
      const maxLength = 100; // Increase preview length to show more context
      const shouldTruncate = textToRender.length > maxLength;
      
      if (shouldTruncate) {
        textToRender = textToRender.substring(0, maxLength) + '...';
      }
      
      // Insert selection cursor if this node has selection
      if (node.selection) {
        const { start, end } = node.selection;
        console.log('[Devtool UI] Rendering node with selection:', {
          nodeId: node.id,
          textLength: textToRender.length,
          start,
          end,
          textPreview: textToRender.substring(0, 30)
        });
        const textBefore = textToRender.substring(0, Math.min(start, textToRender.length));
        const textSelected = textToRender.substring(Math.min(start, textToRender.length), Math.min(end, textToRender.length));
        const textAfter = textToRender.substring(Math.min(end, textToRender.length));
        
        if (start === end) {
          // Collapsed selection (cursor)
          html += `<span class="tree-text">"${this.escapeHtml(textBefore)}<span class="tree-cursor">|</span>${this.escapeHtml(textAfter)}"</span>`;
        } else {
          // Range selection
          html += `<span class="tree-text">"${this.escapeHtml(textBefore)}<span class="tree-selection">${this.escapeHtml(textSelected)}</span>${this.escapeHtml(textAfter)}"</span>`;
        }
      } else {
        html += `<span class="tree-text">"${this.escapeHtml(textToRender)}"</span>`;
      }
    }

    // Don't show marks on inline-text nodes (they're shown in textRuns)

    html += '</div>';

    // Render text runs as child nodes if they exist
    if (node.textRuns && node.textRuns.length > 0) {
      html += '<div class="tree-children">';
      for (const run of node.textRuns) {
        const runId = `${node.id}:run-${run.start}-${run.end}`;
        const runHasMarks = run.marks && run.marks.length > 0;
        const runHasDecorators = run.decorators && run.decorators.length > 0;
        
        // Determine run type: M, D, MD, or T (Text)
        let runType = 'T';
        if (runHasMarks && runHasDecorators) {
          runType = 'MD';
        } else if (runHasMarks) {
          runType = 'M';
        } else if (runHasDecorators) {
          runType = 'D';
        }
        
        let runHtml = `
          <div class="tree-node" data-node-id="${runId}" style="padding-left: ${(depth + 1) * 10}px">
            <span class="tree-expand"> </span>
            <span class="tree-type">${runType}</span>
            <span class="tree-id">[${run.start}-${run.end}]</span>
        `;
        
        // Render text with selection cursor
        const labels: string[] = [];
        if (runHasMarks) {
          labels.push(`marks: ${run.marks.join('+')}`);
        }
        if (runHasDecorators) {
          labels.push(`decorators: ${run.decorators.join('+')}`);
        }
        const title = labels.length > 0 ? labels.join(', ') : 'plain text';
        
        // Show actual text (truncated)
        let runText = run.text;
        const maxLength = 100;
        const shouldTruncate = runText.length > maxLength;
        if (shouldTruncate) {
          runText = runText.substring(0, maxLength) + '...';
        }
        
        // Insert selection cursor if this run has selection
        if (run.selection) {
          const { start, end } = run.selection;
          const textBefore = runText.substring(0, Math.min(start, runText.length));
          const textSelected = runText.substring(Math.min(start, runText.length), Math.min(end, runText.length));
          const textAfter = runText.substring(Math.min(end, runText.length));
          
          if (start === end) {
            // Collapsed selection (cursor)
            runHtml += `<span class="tree-text" title="${this.escapeHtml(title)}">"${this.escapeHtml(textBefore)}<span class="tree-cursor">|</span>${this.escapeHtml(textAfter)}"</span>`;
          } else {
            // Range selection
            runHtml += `<span class="tree-text" title="${this.escapeHtml(title)}">"${this.escapeHtml(textBefore)}<span class="tree-selection">${this.escapeHtml(textSelected)}</span>${this.escapeHtml(textAfter)}"</span>`;
          }
        } else {
          runHtml += `<span class="tree-text" title="${this.escapeHtml(title)}">"${this.escapeHtml(runText)}"</span>`;
        }
        
        if (runHasMarks) {
          runHtml += `<span class="tree-marks">[${run.marks.join(', ')}]</span>`;
        }
        if (runHasDecorators) {
          runHtml += `<span class="tree-decorators" style="color: #0066cc;">[${run.decorators.join(', ')}]</span>`;
    }

        runHtml += '</div>';
        html += runHtml;
      }
    html += '</div>';
    }

    if (hasChildren) {
      html += '<div class="tree-children">';
      for (const child of node.children!) {
        html += this.renderTreeNode(child, depth + 1);
      }
      html += '</div>';
    }

    return html;
  }

  /**
   * Update event log display
   */
  updateEventLog(events: EventLog[]): void {
    const container = document.getElementById('event-container');
    if (!container) return;

    if (events.length === 0) {
      container.innerHTML = '<div class="devtool-empty">No events logged</div>';
      return;
    }

    const html = events.map(event => this.renderEventLog(event)).join('');
    container.innerHTML = html;

    // Auto-scroll to top (newest events)
    container.scrollTop = 0;
  }

  /**
   * Render a single event log entry
   */
  private renderEventLog(event: EventLog): string {
    const time = new Date(event.timestamp).toLocaleTimeString();
    const categoryClass = `event-category-${event.category}`;
    
    // Safely stringify event data
    let dataPreview = '';
    try {
      if (event.data !== undefined && event.data !== null) {
        const stringified = JSON.stringify(event.data, null, 2);
        dataPreview = stringified.substring(0, 200);
      } else {
        dataPreview = String(event.data);
      }
    } catch (e) {
      dataPreview = '[Error serializing data]';
    }
    
    const isTruncated = dataPreview.length >= 200;
    
    return `
      <div class="devtool-event ${categoryClass}" data-event-id="${event.id}">
        <div class="event-header">
          <span class="event-time">${time}</span>
          <span class="event-type">${event.type}</span>
          <span class="event-category">${event.category}</span>
        </div>
        <div class="event-data">
          <pre>${this.escapeHtml(dataPreview)}${isTruncated ? '...' : ''}</pre>
        </div>
      </div>
    `;
  }

  /**
   * Filter tree nodes by search query
   */
  private filterTree(query: string): void {
    const nodes = document.querySelectorAll('.tree-node');
    nodes.forEach(node => {
      const nodeId = node.getAttribute('data-node-id') || '';
      const nodeType = node.querySelector('.tree-type')?.textContent || '';
      const nodeText = node.querySelector('.tree-text')?.textContent || '';
      
      const matches = 
        nodeId.toLowerCase().includes(query) ||
        nodeType.toLowerCase().includes(query) ||
        nodeText.toLowerCase().includes(query);
      
      (node as HTMLElement).style.display = matches || !query ? '' : 'none';
    });
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Attach CSS styles
   */
  private attachStyles(): void {
    if (document.getElementById('barocss-devtool-styles')) return;

    const style = document.createElement('style');
    style.id = 'barocss-devtool-styles';
    style.textContent = `
      #barocss-devtool {
        width: 100%;
        height: 100%;
        background: #fff;
        border-left: 1px solid #ddd;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .devtool-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: #f5f5f5;
        border-bottom: 1px solid #ddd;
      }

      .devtool-title {
        font-weight: 600;
        color: #333;
      }

      .devtool-controls {
        display: flex;
        gap: 4px;
      }

      .devtool-btn {
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        color: #666;
      }

      .devtool-btn:hover {
        background: #e0e0e0;
      }

      .devtool-tabs {
        display: flex;
        border-bottom: 1px solid #ddd;
        background: #fafafa;
      }

      .devtool-tab {
        flex: 1;
        margin: 0;
        padding: 8px 16px;
        border: none;
        border-radius: 0;
        background: transparent;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        font-size: 12px;
        color: #666;
      }

      .devtool-tab:hover {
        background: #f0f0f0;
      }

      .devtool-tab.active {
        color: #2196F3;
        border-bottom-color: #2196F3;
        font-weight: 600;
      }

      .devtool-content {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .devtool-panel {
        display: none;
        flex: 1;
        flex-direction: column;
        overflow: hidden;
        min-height: 0;
      }

      .devtool-panel.active {
        display: flex;
      }

      .devtool-panel-header {
        display: flex;
        gap: 8px;
        padding: 8px 12px;
        border-bottom: 1px solid #eee;
        background: #fafafa;
      }

      .devtool-search {
        flex: 1;
        padding: 4px 8px;
        border: 1px solid #ddd;
        font-size: 12px;
      }

      .devtool-btn-small {
        padding: 4px 12px;
        border: 1px solid #ddd;
        background: #fff;
        cursor: pointer;
        font-size: 12px;
      }

      .devtool-btn-small:hover {
        background: #f5f5f5;
      }

      .devtool-tree {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        font-family: 'Monaco', 'Menlo', monospace;
        font-size: 11px;
        line-height: 1.6;
      }

      .tree-node {
        padding: 2px 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .tree-node:hover {
        background: #f0f0f0;
      }

      .tree-node.selected {
        background: #e3f2fd;
        font-weight: 600;
      }

      .tree-expand {
        width: 12px;
        display: inline-block;
        color: #999;
      }

      .tree-type {
        color: #2196F3;
        font-weight: 600;
        white-space: nowrap;
      }

      .tree-id {
        color: #666;
        font-size: 10px;
        white-space: nowrap;
      }

      .tree-text {
        color: #333;
        font-style: italic;
      }

      .tree-cursor {
        color: #2196F3;
        font-weight: bold;
        background: #e3f2fd;
        padding: 0 1px;
        margin: 0 1px;
      }

      .tree-selection {
        background: #bbdefb;
        color: #1976d2;
        font-weight: 600;
        padding: 0 1px;
      }

      .tree-marks {
        color: #ff9800;
        font-size: 10px;
      }

      .tree-children {
        margin-left: 10px;
      }

      .devtool-event-log {
        flex: 1;
        overflow: auto;
        padding: 8px;
        min-height: 0;
      }

      .devtool-event {
        margin-bottom: 8px;
        padding: 8px;
        border: 1px solid #eee;
        background: #fafafa;
      }

      .event-header {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 4px;
      }

      .event-time {
        color: #999;
        font-size: 10px;
      }

      .event-type {
        font-weight: 600;
        color: #333;
      }

      .event-category {
        padding: 2px 6px;
        font-size: 10px;
        font-weight: 600;
      }

      .event-category-editor {
        background: #e3f2fd;
        color: #1976d2;
      }

      .event-category-error {
        background: #ffebee;
        color: #c62828;
      }

      .event-category-extension {
        background: #f3e5f5;
        color: #7b1fa2;
      }

      .event-category-plugin {
        background: #e8f5e9;
        color: #2e7d32;
      }

      .event-category-custom {
        background: #fff3e0;
        color: #e65100;
      }

      .event-data {
        margin-top: 4px;
        padding: 4px;
        background: #fff;
        max-height: 150px;
        overflow-y: auto;
      }

      .event-data pre {
        margin: 0;
        font-size: 10px;
        color: #666;
        white-space: pre-wrap;
        word-break: break-all;
      }

      .devtool-empty {
        padding: 32px;
        text-align: center;
        color: #999;
      }

      /* Execution Flow Styles */
      .devtool-flow-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        min-height: 0;
      }

      .flow-item {
        border: 1px solid #ddd;
        border-radius: 4px;
        margin-bottom: 8px;
        background: #fff;
      }

      .flow-item:hover {
        background: #f5f5f5;
      }

      .flow-item.flow-error {
        border-color: #f44336;
        border-width: 2px;
      }

      .flow-header {
        padding: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        user-select: none;
      }

      .flow-header:hover {
        background: #f0f0f0;
      }

      .flow-expand {
        font-size: 10px;
        color: #666;
        transition: transform 0.2s;
      }

      .flow-trace-id {
        font-family: monospace;
        font-size: 11px;
        color: #333;
        font-weight: 600;
      }

      .flow-duration {
        color: #666;
        font-size: 11px;
      }

      .flow-spans-count {
        color: #999;
        font-size: 11px;
        margin-left: auto;
      }

      .flow-spans {
        padding: 0 8px 8px 8px;
        border-top: 1px solid #eee;
      }

      .flow-span {
        padding: 6px 8px;
        margin: 4px 0;
        background: #fafafa;
        border-left: 3px solid #2196F3;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
      }

      .flow-span.span-error {
        border-left-color: #f44336;
        background: #fff5f5;
      }

      .flow-span.span-critical {
        border-left-color: #d32f2f;
        background: #ffebee;
      }

      .flow-span.span-warning {
        border-left-color: #ffa726;
        background: #fff3e0;
      }

      .flow-span.span-info {
        border-left-color: #29b6f6;
        background: #e1f5fe;
      }

      .span-anomaly-icon {
        margin-right: 4px;
        font-size: 14px;
      }

      .span-anomalies {
        margin-top: 8px;
        padding: 8px;
        background: #fafafa;
        border: 1px solid #eee;
        border-radius: 4px;
      }

      .anomaly-item {
        margin: 6px 0;
        padding: 6px;
        border-radius: 3px;
      }

      .anomaly-item.anomaly-critical {
        background: #ffebee;
        border-left: 3px solid #d32f2f;
      }

      .anomaly-item.anomaly-warning {
        background: #fff3e0;
        border-left: 3px solid #ffa726;
      }

      .anomaly-item.anomaly-info {
        background: #e1f5fe;
        border-left: 3px solid #29b6f6;
      }

      .anomaly-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
      }

      .anomaly-icon {
        font-size: 12px;
      }

      .anomaly-type {
        font-weight: 600;
        font-size: 11px;
        color: #666;
      }

      .anomaly-message {
        font-size: 11px;
        color: #333;
        margin-bottom: 4px;
      }

      .anomaly-details {
        font-size: 10px;
        color: #666;
        background: #fff;
        padding: 4px;
        border-radius: 2px;
        font-family: 'Courier New', monospace;
        white-space: pre-wrap;
        word-break: break-all;
      }

      .span-operation {
        font-weight: 600;
        color: #333;
        min-width: 150px;
      }

      .span-package {
        color: #666;
        font-size: 10px;
        font-family: monospace;
      }

      .span-class {
        color: #888;
        font-size: 10px;
        font-family: monospace;
        margin-left: 4px;
      }

      .span-duration {
        color: #999;
        font-size: 10px;
        margin-left: auto;
      }

      .span-error-message {
        color: #f44336;
        font-size: 10px;
        margin-top: 4px;
        padding-left: 20px;
      }

      .flow-copy-btn {
        background: transparent;
        border: 1px solid #ddd;
        border-radius: 3px;
        padding: 2px 6px;
        cursor: pointer;
        font-size: 12px;
        color: #666;
        margin-left: 4px;
        transition: all 0.2s;
      }

      .flow-copy-btn:hover {
        background: #f0f0f0;
        border-color: #2196F3;
        color: #2196F3;
      }

      .flow-copy-btn:active {
        background: #e0e0e0;
      }

      .flow-index {
        color: #999;
        font-size: 11px;
        margin-right: 6px;
        min-width: 24px;
        text-align: right;
        display: inline-block;
      }

      .flow-span-wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      .flow-span-header {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
      }

      .flow-span-details {
        margin-top: 4px;
        padding-left: 8px;
        font-size: 10px;
      }

      .span-data-block {
        margin-top: 4px;
      }

      .span-data-label {
        font-weight: 600;
        color: #555;
        margin-bottom: 2px;
        display: inline-block;
      }

      .span-data-content {
        font-family: monospace;
        background: rgba(0, 0, 0, 0.03);
        padding: 4px 6px;
        border-radius: 2px;
        white-space: pre-wrap;
        word-break: break-all;
        color: #444;
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid rgba(0, 0, 0, 0.05);
      }

    `;
    document.head.appendChild(style);
  }

  /**
   * Execution Flow 업데이트
   */
  updateExecutionFlow(flows: ExecutionFlow[]): void {
    const flowList = document.getElementById('flow-list');
    if (!flowList) return;

    // Store current flows (used in event delegation)
    this._currentFlows = flows;

    if (flows.length === 0) {
      flowList.innerHTML = '<div class="devtool-empty">No execution flows available</div>';
      return;
    }

    // Render flow list (initially show only traceId, expand spans on click)
    flowList.innerHTML = flows.map((flow, index) => {
      const hasError = flow.spans.some(span => span.error);
      const totalDuration = flow.duration || (flow.spans.reduce((sum, span) => sum + (span.duration || 0), 0));
      const traceId = flow.traceId;
      const flowIndex = flows.length - index;
      
      return `
        <div class="flow-item ${hasError ? 'flow-error' : ''}" data-trace-id="${traceId}">
          <div class="flow-header" data-trace-id="${traceId}">
            <span class="flow-expand">▶</span>
            ${hasError ? '<span style="color: #f44336; font-weight: bold; margin-right: 4px;">⚠</span>' : ''}
            <span class="flow-index">#${flowIndex}</span>
            <span class="flow-trace-id">${traceId.slice(0, 16)}...</span>
            <span class="flow-duration">${totalDuration.toFixed(2)}ms</span>
            <span class="flow-spans-count">${flow.spans.length} spans</span>
            <button class="flow-copy-btn" data-action="copy-trace" data-trace-id="${traceId}" title="Copy Trace">📋</button>
            <button class="flow-copy-btn" data-action="copy-prompt" data-trace-id="${traceId}" title="Copy Prompt">💬</button>
          </div>
          <div class="flow-spans" style="display: none;">
            ${flow.spans.map(span => {
              const spanError = span.error ? 'span-error' : '';
              const spanPackage = span.package || 'unknown';
              const spanClass = span.className || 'unknown';
              const indent = span.parentSpanId ? '20px' : '0px';
              
              // Anomaly icon and class
              const hasAnomalies = span.anomalies && span.anomalies.length > 0;
              const criticalAnomalies = span.anomalies?.filter(a => a.severity === 'critical') || [];
              const warningAnomalies = span.anomalies?.filter(a => a.severity === 'warning') || [];
              const infoAnomalies = span.anomalies?.filter(a => a.severity === 'info') || [];
              
              let anomalyIcon = '';
              let anomalyClass = '';
              if (criticalAnomalies.length > 0) {
                anomalyIcon = '🔴';
                anomalyClass = 'span-critical';
              } else if (warningAnomalies.length > 0) {
                anomalyIcon = '🟡';
                anomalyClass = 'span-warning';
              } else if (infoAnomalies.length > 0) {
                anomalyIcon = '🔵';
                anomalyClass = 'span-info';
              }
              
              // Render Input/Output data
              let detailsHtml = '';
              
              if (span.input) {
                const inputStr = JSON.stringify(span.input, null, 2);
                if (inputStr !== '{}' && inputStr !== '[]') {
                   detailsHtml += `
                    <div class="span-data-block">
                      <span class="span-data-label">Input:</span>
                      <div class="span-data-content">${this.escapeHtml(inputStr)}</div>
                    </div>`;
                }
              }
              
              if (span.output) {
                const outputStr = JSON.stringify(span.output, null, 2);
                if (outputStr !== '{}' && outputStr !== '[]' && outputStr !== 'undefined' && outputStr !== 'null') {
                   detailsHtml += `
                    <div class="span-data-block">
                      <span class="span-data-label">Output:</span>
                      <div class="span-data-content">${this.escapeHtml(outputStr)}</div>
                    </div>`;
                }
              }
              
              // Render anomalies
              if (hasAnomalies) {
                detailsHtml += `
                  <div class="span-anomalies">
                    <span class="span-data-label">⚠️ Anomalies:</span>
                    ${span.anomalies!.map(anomaly => `
                      <div class="anomaly-item anomaly-${anomaly.severity}">
                        <div class="anomaly-header">
                          <span class="anomaly-icon">${anomaly.severity === 'critical' ? '🔴' : anomaly.severity === 'warning' ? '🟡' : '🔵'}</span>
                          <span class="anomaly-type">${anomaly.type}</span>
                        </div>
                        <div class="anomaly-message">${this.escapeHtml(anomaly.message)}</div>
                        ${anomaly.details ? `<div class="anomaly-details">${this.escapeHtml(JSON.stringify(anomaly.details, null, 2))}</div>` : ''}
                      </div>
                    `).join('')}
                  </div>`;
              }

              return `
                <div class="flow-span ${spanError} ${anomalyClass}" data-span-id="${span.spanId}" style="padding-left: ${indent};">
                  <div class="flow-span-wrapper">
                    <div class="flow-span-header">
                      ${anomalyIcon ? `<span class="span-anomaly-icon">${anomalyIcon}</span>` : ''}
                      <span class="span-operation">${span.operationName}</span>
                      <span class="span-class" title="${spanPackage}">${spanClass}</span>
                      <span class="span-duration">${(span.duration || 0).toFixed(2)}ms</span>
                    </div>
                    ${span.error ? `<div class="span-error-message">${this.escapeHtml(span.error.message || 'Unknown error')}</div>` : ''}
                    ${detailsHtml ? `<div class="flow-span-details">${detailsHtml}</div>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Event listeners are registered only once on flowList in setupEventListeners
    // (using event delegation pattern)
  }

  /**
   * Trace 데이터를 복사
   */
  private _copyTrace(flow: ExecutionFlow): void {
    const traceData = {
      traceId: flow.traceId,
      startTime: new Date(flow.startTime).toISOString(),
      endTime: flow.endTime ? new Date(flow.endTime).toISOString() : undefined,
      duration: flow.duration,
      command: flow.command,
      transaction: flow.transaction,
      operations: flow.operations,
      spans: flow.spans.map(span => ({
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        operationName: span.operationName,
        className: span.className,
        package: span.package,
        startTime: new Date(span.startTime).toISOString(),
        endTime: span.endTime ? new Date(span.endTime).toISOString() : undefined,
        duration: span.duration,
        input: span.input,
        output: span.output,
        error: span.error ? {
          message: span.error.message,
          stack: span.error.stack,
          name: span.error.name
        } : undefined,
        tags: span.tags
      }))
    };
    
    const text = this.safeStringify(traceData);
    this._copyToClipboard(text);
  }

  /**
   * Prompt 형태로 복사 (ChatGPT 등에 붙여넣기용)
   */
  private _copyPrompt(flow: ExecutionFlow): void {
    const hasError = flow.spans.some(span => span.error);
    const errorSpans = flow.spans.filter(span => span.error);
    
    let prompt = `# Execution Flow Analysis\n\n`;
    prompt += `**Trace ID:** ${flow.traceId}\n`;
    prompt += `**Duration:** ${(flow.duration || 0).toFixed(2)}ms\n`;
    prompt += `**Start Time:** ${new Date(flow.startTime).toISOString()}\n`;
    if (flow.endTime) {
      prompt += `**End Time:** ${new Date(flow.endTime).toISOString()}\n`;
    }
    prompt += `**Total Spans:** ${flow.spans.length}\n`;
    if (hasError) {
      prompt += `**Status:** ⚠️ Error (${errorSpans.length} span(s) failed)\n`;
    } else {
      prompt += `**Status:** ✅ Success\n`;
    }
    prompt += `\n`;
    
    if (flow.command) {
      prompt += `## Command\n`;
      prompt += `- **Name:** ${flow.command.name}\n`;
      prompt += `- **Success:** ${flow.command.success ? '✅' : '❌'}\n`;
      if (flow.command.payload) {
        prompt += `- **Payload:**\n\`\`\`json\n${this.safeStringify(flow.command.payload)}\n\`\`\`\n`;
      }
      prompt += `\n`;
    }
    
    if (flow.transaction) {
      prompt += `## Transaction\n`;
      prompt += `- **Transaction ID:** ${flow.transaction.transactionId}\n`;
      prompt += `- **Operations:** ${flow.transaction.operations.length}\n`;
      if (flow.transaction.selectionBefore) {
        prompt += `- **Selection Before:** ${this.safeStringify(flow.transaction.selectionBefore)}\n`;
      }
      if (flow.transaction.selectionAfter) {
        prompt += `- **Selection After:** ${this.safeStringify(flow.transaction.selectionAfter)}\n`;
      }
      prompt += `\n`;
    }
    
    prompt += `## Execution Spans\n\n`;
    flow.spans.forEach((span, index) => {
      const indent = span.parentSpanId ? '  ' : '';
      prompt += `${indent}${index + 1}. **${span.operationName}**\n`;
      if (span.className) {
        prompt += `${indent}   - Class: ${span.className}\n`;
      }
      if (span.package) {
        prompt += `${indent}   - Package: ${span.package}\n`;
      }
      prompt += `${indent}   - Duration: ${(span.duration || 0).toFixed(2)}ms\n`;
      if (span.error) {
        prompt += `${indent}   - ❌ Error: ${span.error.message}\n`;
        if (span.error.stack) {
          prompt += `${indent}   - Stack:\n\`\`\`\n${span.error.stack}\n\`\`\`\n`;
        }
      }
      if (span.input) {
        prompt += `${indent}   - Input:\n\`\`\`json\n${this.safeStringify(span.input)}\n\`\`\`\n`;
      }
      if (span.output) {
        prompt += `${indent}   - Output:\n\`\`\`json\n${this.safeStringify(span.output)}\n\`\`\`\n`;
      }
      prompt += `\n`;
    });
    
    if (hasError) {
      prompt += `## Error Summary\n\n`;
      errorSpans.forEach((span, index) => {
        prompt += `${index + 1}. **${span.operationName}** (${span.package || 'unknown'})\n`;
        prompt += `   - Error: ${span.error!.message}\n`;
        if (span.error!.stack) {
          prompt += `   - Stack: ${span.error!.stack.split('\n')[0]}\n`;
        }
        prompt += `\n`;
      });
    }
    
    prompt += `---\n\n`;
    prompt += `Please analyze this execution flow and help me understand:\n`;
    prompt += `1. What operations were performed?\n`;
    prompt += `2. Were there any errors? If so, what caused them?\n`;
    prompt += `3. How can I optimize or fix any issues?\n`;
    
    this._copyToClipboard(prompt);
  }

  /**
   * 클립보드에 텍스트 복사
   */
  private _copyToClipboard(text: string): void {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        // Simple feedback (optional)
        const notification = document.createElement('div');
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: #4caf50;
          color: white;
          padding: 8px 16px;
          border-radius: 4px;
          font-size: 12px;
          z-index: 10000;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        `;
        notification.textContent = 'Copied to clipboard!';
        document.body.appendChild(notification);
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
      });
    } else {
      // Fallback: use textarea
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        const notification = document.createElement('div');
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: #4caf50;
          color: white;
          padding: 8px 16px;
          border-radius: 4px;
          font-size: 12px;
          z-index: 10000;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        `;
        notification.textContent = 'Copied to clipboard!';
        document.body.appendChild(notification);
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
      document.body.removeChild(textarea);
    }
  }

  /**
   * Update Last Input Debug display
   */
  updateLastInputDebug(debug: LastInputDebug): void {
    this.lastInputDebug = debug;
    const container = document.getElementById('last-input-debug');
    if (!container) return;

    const statusColor = debug.status === 'ok' ? '#4caf50' : debug.status === 'mismatch' ? '#f44336' : '#ff9800';
    const statusText = debug.status === 'ok' ? '✓' : debug.status === 'mismatch' ? '⚠' : '○';

    const hintInfo = debug.usedInputHint 
      ? `<span style="color: #2196f3;">Hint: ✓</span>` 
      : `<span style="color: #999;">Hint: ✗</span>`;

    const inputTypeText = debug.inputType ? ` <span style="color: #666;">(${debug.inputType})</span>` : '';

    let rangesText = '';
    if (debug.classifiedContentRange) {
      const cr = debug.classifiedContentRange;
      rangesText += `<div style="font-size: 10px; color: #666; margin-top: 4px;">
        Classified: [${cr.startNodeId}:${cr.startOffset}-${cr.endNodeId}:${cr.endOffset}]
      </div>`;
    }
    if (debug.appliedContentRange) {
      const ar = debug.appliedContentRange;
      rangesText += `<div style="font-size: 10px; color: #666;">
        Applied: [${ar.startNodeId}:${ar.startOffset}-${ar.endNodeId}:${ar.endOffset}]
      </div>`;
    }

    const notesText = debug.notes && debug.notes.length > 0
      ? `<div style="font-size: 10px; color: #f44336; margin-top: 4px;">${debug.notes.join(', ')}</div>`
      : '';

    container.innerHTML = `
      <div style="padding: 8px; background: #f5f5f5; border-bottom: 1px solid #ddd; font-size: 11px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span>
          <span style="font-weight: bold;">${debug.case}</span>
          ${inputTypeText}
          ${hintInfo}
        </div>
        ${rangesText}
        ${notesText}
      </div>
    `;
  }

  /**
   * Destroy the UI
   */
  destroy(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    const styles = document.getElementById('barocss-devtool-styles');
    if (styles) {
      styles.remove();
    }
  }

  /**
   * 안전하게 JSON stringify (순환 참조 처리)
   */
  private safeStringify(data: any): string {
    try {
      const cache = new Set();
      return JSON.stringify(data, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (cache.has(value)) {
            return '[Circular]';
          }
          cache.add(value);
        }
        // DOM Node handling
        if (typeof Node !== 'undefined' && value instanceof Node) {
          try {
            return `[DOM Node: ${value.nodeName}${value instanceof Element && value.id ? `#${value.id}` : ''}${value instanceof Element && value.className ? `.${value.className}` : ''}]`;
          } catch (e) {
            return '[DOM Node]';
          }
        }
        // Window handling
        if (typeof Window !== 'undefined' && value instanceof Window) {
          return '[Window]';
        }
        return value;
      }, 2);
    } catch (error) {
      return `[Error stringifying data: ${error}]`;
    }
  }
}

