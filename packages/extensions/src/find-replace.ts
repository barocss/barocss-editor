import { Editor, Extension } from '@barocss/editor-core';

export interface FindReplaceMatch {
  nodeId: string;
  offset: number;
  length: number;
  text: string;
}

export interface FindReplaceState {
  query: string;
  replacement: string;
  matches: FindReplaceMatch[];
  currentIndex: number;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

export interface FindReplaceExtensionOptions {
  enabled?: boolean;
}

export class FindReplaceExtension implements Extension {
  name = 'findReplace';
  priority = 30;

  private _options: FindReplaceExtensionOptions;
  private _state: FindReplaceState = {
    query: '',
    replacement: '',
    matches: [],
    currentIndex: -1,
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
  };
  private _panelEl: HTMLElement | null = null;

  constructor(options: FindReplaceExtensionOptions = {}) {
    this._options = { enabled: true, ...options };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    (editor as any).registerCommand({
      name: 'find',
      execute: async () => {
        this._showPanel(editor, false);
        return true;
      },
      canExecute: () => true
    });

    (editor as any).registerCommand({
      name: 'findAndReplace',
      execute: async () => {
        this._showPanel(editor, true);
        return true;
      },
      canExecute: () => true
    });

    (editor as any).registerCommand({
      name: 'findNext',
      execute: async () => {
        this._goToMatch(editor, 1);
        return true;
      },
      canExecute: () => this._state.matches.length > 0
    });

    (editor as any).registerCommand({
      name: 'findPrev',
      execute: async () => {
        this._goToMatch(editor, -1);
        return true;
      },
      canExecute: () => this._state.matches.length > 0
    });

    (editor as any).registerCommand({
      name: 'replaceOne',
      execute: async () => {
        return this._replaceCurrent(editor);
      },
      canExecute: () => this._state.currentIndex >= 0
    });

    (editor as any).registerCommand({
      name: 'replaceAll',
      execute: async () => {
        return this._replaceAll(editor);
      },
      canExecute: () => this._state.matches.length > 0
    });
  }

  onDestroy(_editor: Editor): void {
    this._hidePanel();
  }

  private _showPanel(editor: Editor, showReplace: boolean): void {
    if (this._panelEl) this._hidePanel();

    this._panelEl = document.createElement('div');
    this._panelEl.className = 'bc-find-replace-panel';
    this._panelEl.style.cssText = `
      position: fixed; top: 8px; right: 8px; z-index: 9999;
      background: white; border: 1px solid #e2e8f0; border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,.12); padding: 12px;
      font-family: system-ui, sans-serif; font-size: 13px; width: 340px;
    `;

    const findRow = this._createRow();
    const findInput = this._createInput('Find...', this._state.query);
    findInput.addEventListener('input', () => {
      this._state.query = findInput.value;
      this._performSearch(editor);
      this._updateStatus();
    });
    findRow.appendChild(findInput);

    const nextBtn = this._createButton('↓', 'Next');
    nextBtn.addEventListener('click', () => this._goToMatch(editor, 1));
    findRow.appendChild(nextBtn);

    const prevBtn = this._createButton('↑', 'Previous');
    prevBtn.addEventListener('click', () => this._goToMatch(editor, -1));
    findRow.appendChild(prevBtn);

    const closeBtn = this._createButton('×', 'Close');
    closeBtn.addEventListener('click', () => this._hidePanel());
    findRow.appendChild(closeBtn);

    this._panelEl.appendChild(findRow);

    if (showReplace) {
      const replaceRow = this._createRow();
      const replaceInput = this._createInput('Replace...', this._state.replacement);
      replaceInput.addEventListener('input', () => {
        this._state.replacement = replaceInput.value;
      });
      replaceRow.appendChild(replaceInput);

      const replaceBtn = this._createButton('→', 'Replace');
      replaceBtn.addEventListener('click', () => this._replaceCurrent(editor));
      replaceRow.appendChild(replaceBtn);

      const replaceAllBtn = this._createButton('⇉', 'Replace All');
      replaceAllBtn.addEventListener('click', () => this._replaceAll(editor));
      replaceRow.appendChild(replaceAllBtn);

      this._panelEl.appendChild(replaceRow);
    }

    const statusRow = document.createElement('div');
    statusRow.className = 'bc-find-status';
    statusRow.style.cssText = 'padding: 4px 0 0; color: #64748b; font-size: 12px;';
    statusRow.textContent = 'Type to search...';
    this._panelEl.appendChild(statusRow);

    document.body.appendChild(this._panelEl);
    findInput.focus();

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this._hidePanel();
        document.removeEventListener('keydown', keyHandler);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        this._goToMatch(editor, 1);
      } else if (e.key === 'Enter' && e.shiftKey) {
        this._goToMatch(editor, -1);
      }
    };
    this._panelEl.addEventListener('keydown', keyHandler);
  }

  private _hidePanel(): void {
    if (this._panelEl) {
      this._panelEl.remove();
      this._panelEl = null;
    }
    this._clearHighlights();
  }

  private _performSearch(editor: Editor): void {
    this._state.matches = [];
    this._state.currentIndex = -1;
    this._clearHighlights();

    if (!this._state.query) return;

    const dataStore = (editor as any).dataStore;
    if (!dataStore) return;

    const rootNode = dataStore.getRootNode();
    if (!rootNode) return;

    this._searchInNode(dataStore, rootNode);

    if (this._state.matches.length > 0) {
      this._state.currentIndex = 0;
      this._highlightMatches();
    }
  }

  private _searchInNode(dataStore: any, node: any): void {
    if (typeof node.text === 'string' && node.sid) {
      const text = this._state.caseSensitive ? node.text : node.text.toLowerCase();
      const query = this._state.caseSensitive ? this._state.query : this._state.query.toLowerCase();
      let pos = 0;
      while ((pos = text.indexOf(query, pos)) !== -1) {
        this._state.matches.push({
          nodeId: node.sid,
          offset: pos,
          length: this._state.query.length,
          text: node.text.substring(pos, pos + this._state.query.length)
        });
        pos += query.length;
      }
    }

    if (Array.isArray(node.content)) {
      for (const childId of node.content) {
        const child = typeof childId === 'string' ? dataStore.getNode(childId) : childId;
        if (child) this._searchInNode(dataStore, child);
      }
    }
  }

  private _goToMatch(_editor: Editor, direction: number): void {
    if (this._state.matches.length === 0) return;

    this._state.currentIndex =
      (this._state.currentIndex + direction + this._state.matches.length) % this._state.matches.length;

    this._highlightMatches();
    this._scrollToCurrentMatch();
    this._updateStatus();
  }

  private async _replaceCurrent(editor: Editor): Promise<boolean> {
    if (this._state.currentIndex < 0 || this._state.currentIndex >= this._state.matches.length) return false;

    const match = this._state.matches[this._state.currentIndex];
    const { transaction, replaceText } = await import('@barocss/model');
    const ops = [replaceText(match.nodeId, match.offset, match.offset + match.length, this._state.replacement)];
    const result = await transaction(editor, ops).commit();

    if (result.success) {
      this._performSearch(editor);
    }
    return result.success;
  }

  private async _replaceAll(editor: Editor): Promise<boolean> {
    if (this._state.matches.length === 0) return false;

    const { transaction, replaceText } = await import('@barocss/model');
    const reversed = [...this._state.matches].reverse();
    const ops = reversed.map(m =>
      replaceText(m.nodeId, m.offset, m.offset + m.length, this._state.replacement)
    );
    const result = await transaction(editor, ops).commit();

    if (result.success) {
      this._performSearch(editor);
    }
    return result.success;
  }

  private _highlightMatches(): void {
    this._clearHighlights();
    // Highlight logic deferred to DOM layer; placeholder for CSS class injection
  }

  private _clearHighlights(): void {
    document.querySelectorAll('.bc-find-highlight').forEach(el => {
      el.classList.remove('bc-find-highlight', 'bc-find-current');
    });
  }

  private _scrollToCurrentMatch(): void {
    if (this._state.currentIndex < 0) return;
    const match = this._state.matches[this._state.currentIndex];
    const el = document.querySelector(`[data-bc-sid="${match.nodeId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  private _updateStatus(): void {
    const statusEl = this._panelEl?.querySelector('.bc-find-status');
    if (!statusEl) return;
    if (this._state.matches.length === 0) {
      statusEl.textContent = this._state.query ? 'No results' : 'Type to search...';
    } else {
      statusEl.textContent = `${this._state.currentIndex + 1} of ${this._state.matches.length}`;
    }
  }

  private _createRow(): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 4px; margin-bottom: 6px; align-items: center;';
    return row;
  }

  private _createInput(placeholder: string, value: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = value;
    input.style.cssText = `
      flex: 1; padding: 4px 8px; border: 1px solid #e2e8f0; border-radius: 4px;
      font-size: 13px; outline: none; font-family: inherit;
    `;
    return input;
  }

  private _createButton(text: string, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.title = title;
    btn.style.cssText = `
      background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; cursor: pointer;
      padding: 4px 8px; font-size: 13px; color: #475569; min-width: 28px;
    `;
    return btn;
  }
}

export function createFindReplaceExtension(options?: FindReplaceExtensionOptions): FindReplaceExtension {
  return new FindReplaceExtension(options);
}
