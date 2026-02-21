let injected = false;

export function injectEditorStyles(): void {
  if (injected) return;
  if (typeof document === 'undefined') return;
  injected = true;

  const style = document.createElement('style');
  style.setAttribute('data-barocss-editor-styles', '');
  style.textContent = EDITOR_CSS;
  document.head.appendChild(style);
}

const EDITOR_CSS = /* css */ `
/* === Block Types === */
.task-item {
  list-style: none;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 0;
}
.task-item input[type="checkbox"] {
  margin-top: 4px;
  width: 16px;
  height: 16px;
  accent-color: #3b82f6;
  cursor: pointer;
  flex-shrink: 0;
}
.task-item[data-checked="true"] .task-content {
  text-decoration: line-through;
  color: #94a3b8;
}

.callout {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  margin: 12px 0;
}
.callout-info { border-left: 4px solid #3b82f6; background: #eff6ff; }
.callout-warning { border-left: 4px solid #f59e0b; background: #fffbeb; }
.callout-error { border-left: 4px solid #ef4444; background: #fef2f2; }
.callout-success { border-left: 4px solid #22c55e; background: #f0fdf4; }
.callout-note { border-left: 4px solid #8b5cf6; background: #f5f3ff; }
.callout-tip { border-left: 4px solid #06b6d4; background: #ecfeff; }
.callout-title {
  font-weight: 600;
  margin-bottom: 4px;
  font-size: 14px;
}
.callout-body {
  font-size: 14px;
  line-height: 1.6;
}

.math-block {
  text-align: center;
  padding: 16px 8px;
  margin: 12px 0;
  background: #fafafa;
  border-radius: 6px;
  border: 1px solid #f0f0f0;
  min-height: 32px;
  overflow-x: auto;
}
.math-inline {
  display: inline;
  padding: 0 2px;
}

.comment-thread {
  background: #fffde7;
  border-left: 3px solid #ffc107;
  padding: 8px 12px;
  margin: 8px 0;
  border-radius: 0 6px 6px 0;
  font-size: 13px;
}

.code-block {
  background: #1e293b;
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
  overflow-x: auto;
}
.code-block .code-content {
  color: #e2e8f0;
  font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
  white-space: pre;
}

.horizontal-rule {
  border: none;
  border-top: 1px solid #e2e8f0;
  margin: 24px 0;
  height: 0;
}

.block-quote {
  border-left: 3px solid #cbd5e1;
  padding-left: 16px;
  margin: 12px 0;
  color: #475569;
  font-style: italic;
}

/* === Table === */
.table {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
  font-size: 14px;
}
.table th, .table td {
  border: 1px solid #e2e8f0;
  padding: 8px 12px;
  text-align: left;
  vertical-align: top;
}
.table th {
  background: #f8fafc;
  font-weight: 600;
}

/* === UX Layer: Find & Replace highlights === */
.bc-find-highlight {
  background: #fef08a;
  border-radius: 2px;
}
.bc-find-current {
  background: #fb923c;
  color: white;
  border-radius: 2px;
}

/* === UX Layer: Drag & Drop === */
.bc-drag-handle {
  position: absolute;
  left: -28px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: grab;
  color: #94a3b8;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s;
}
[data-bc-sid]:hover > .bc-drag-handle,
.bc-drag-handle:hover {
  opacity: 1;
  color: #64748b;
  background: #f1f5f9;
}
.bc-drag-placeholder {
  height: 2px;
  background: #3b82f6;
  border-radius: 1px;
  margin: 2px 0;
}

/* === KaTeX Overrides === */
.math-block .katex-display {
  margin: 0;
}
.math-inline .katex {
  font-size: 1em;
}
`;
