import { Editor, Extension } from '@barocss/editor-core';
import { injectEditorStyles } from './styles';

export interface SlashMenuItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  command: string;
  payload?: Record<string, any>;
  group?: string;
}

export interface SlashCommandExtensionOptions {
  enabled?: boolean;
  trigger?: string;
  items?: SlashMenuItem[];
}

const DEFAULT_ITEMS: SlashMenuItem[] = [
  { id: 'paragraph', label: 'Paragraph', description: 'Plain text block', icon: '¶', command: 'setParagraph', group: 'basic' },
  { id: 'heading1', label: 'Heading 1', description: 'Large heading', icon: 'H1', command: 'setHeading', payload: { level: 1 }, group: 'basic' },
  { id: 'heading2', label: 'Heading 2', description: 'Medium heading', icon: 'H2', command: 'setHeading', payload: { level: 2 }, group: 'basic' },
  { id: 'heading3', label: 'Heading 3', description: 'Small heading', icon: 'H3', command: 'setHeading', payload: { level: 3 }, group: 'basic' },
  { id: 'bullet-list', label: 'Bullet List', description: 'Unordered list', icon: '•', command: 'toggleBulletList', group: 'lists' },
  { id: 'ordered-list', label: 'Ordered List', description: 'Numbered list', icon: '1.', command: 'toggleOrderedList', group: 'lists' },
  { id: 'checklist', label: 'Checklist', description: 'To-do checklist', icon: '☑', command: 'insertChecklist', group: 'lists' },
  { id: 'blockquote', label: 'Quote', description: 'Block quote', icon: '"', command: 'toggleBlockquote', group: 'blocks' },
  { id: 'code-block', label: 'Code Block', description: 'Code snippet', icon: '<>', command: 'insertCodeBlock', group: 'blocks' },
  { id: 'horizontal-rule', label: 'Divider', description: 'Horizontal line', icon: '—', command: 'insertHorizontalRule', group: 'blocks' },
  { id: 'table', label: 'Table', description: 'Insert table', icon: '⊞', command: 'insertTable', payload: { rows: 3, cols: 3 }, group: 'blocks' },
  { id: 'callout-info', label: 'Callout', description: 'Info callout box', icon: 'ℹ', command: 'insertCallout', payload: { type: 'info' }, group: 'blocks' },
  { id: 'callout-warning', label: 'Warning', description: 'Warning callout box', icon: '⚠', command: 'insertCallout', payload: { type: 'warning' }, group: 'blocks' },
  { id: 'math-block', label: 'Math', description: 'Math equation', icon: '∑', command: 'insertMathBlock', group: 'advanced' },
  { id: 'comment', label: 'Comment', description: 'Comment thread', icon: '💬', command: 'insertComment', group: 'advanced' },
];

export class SlashCommandExtension implements Extension {
  name = 'slashCommand';
  priority = 50;

  private _options: SlashCommandExtensionOptions;
  private _menuElement: HTMLElement | null = null;
  private _visible = false;
  private _selectedIndex = 0;
  private _filteredItems: SlashMenuItem[] = [];
  private _query = '';

  constructor(options: SlashCommandExtensionOptions = {}) {
    this._options = {
      enabled: true,
      trigger: '/',
      items: DEFAULT_ITEMS,
      ...options
    };
    this._filteredItems = this._options.items || DEFAULT_ITEMS;
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;
    injectEditorStyles();

    (editor as any).registerCommand({
      name: 'showSlashMenu',
      execute: async () => {
        this._showMenu(editor);
        return true;
      },
      canExecute: () => true
    });

    (editor as any).registerCommand({
      name: 'hideSlashMenu',
      execute: async () => {
        this._hideMenu();
        return true;
      },
      canExecute: () => this._visible
    });

    editor.on('editor:content.change', () => {
      if (this._visible) {
        this._updateFilter();
      }
    });
  }

  onDestroy(_editor: Editor): void {
    this._hideMenu();
  }

  private _showMenu(editor: Editor): void {
    if (this._menuElement) this._hideMenu();

    this._visible = true;
    this._selectedIndex = 0;
    this._query = '';
    this._filteredItems = this._options.items || DEFAULT_ITEMS;

    this._menuElement = document.createElement('div');
    this._menuElement.className = 'bc-slash-menu';
    this._menuElement.setAttribute('role', 'listbox');
    this._menuElement.style.cssText = `
      position: absolute; z-index: 9999; background: white; border: 1px solid #e2e8f0;
      border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,.12); padding: 4px;
      max-height: 320px; overflow-y: auto; width: 280px; font-family: system-ui, sans-serif;
    `;

    this._renderItems(editor);
    this._positionMenu();
    document.body.appendChild(this._menuElement);

    const keyHandler = (e: KeyboardEvent) => {
      if (!this._visible) {
        document.removeEventListener('keydown', keyHandler, true);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._selectedIndex = (this._selectedIndex + 1) % this._filteredItems.length;
        this._renderItems(editor);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._selectedIndex = (this._selectedIndex - 1 + this._filteredItems.length) % this._filteredItems.length;
        this._renderItems(editor);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this._executeItem(editor, this._filteredItems[this._selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this._hideMenu();
        document.removeEventListener('keydown', keyHandler, true);
      }
    };
    document.addEventListener('keydown', keyHandler, true);

    const clickOutside = (e: MouseEvent) => {
      if (this._menuElement && !this._menuElement.contains(e.target as Node)) {
        this._hideMenu();
        document.removeEventListener('click', clickOutside);
      }
    };
    setTimeout(() => document.addEventListener('click', clickOutside), 0);
  }

  private _hideMenu(): void {
    if (this._menuElement) {
      this._menuElement.remove();
      this._menuElement = null;
    }
    this._visible = false;
  }

  private _renderItems(editor: Editor): void {
    if (!this._menuElement) return;
    this._menuElement.innerHTML = '';

    if (this._filteredItems.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding: 8px 12px; color: #94a3b8; font-size: 13px;';
      empty.textContent = 'No results';
      this._menuElement.appendChild(empty);
      return;
    }

    this._filteredItems.forEach((item, index) => {
      const row = document.createElement('div');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === this._selectedIndex));
      row.style.cssText = `
        display: flex; align-items: center; gap: 10px; padding: 6px 10px;
        border-radius: 4px; cursor: pointer; font-size: 14px;
        ${index === this._selectedIndex ? 'background: #f1f5f9;' : ''}
      `;
      row.addEventListener('mouseenter', () => {
        this._selectedIndex = index;
        this._renderItems(editor);
      });
      row.addEventListener('click', () => this._executeItem(editor, item));

      const icon = document.createElement('span');
      icon.style.cssText = 'width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border-radius: 4px; font-size: 12px; color: #64748b; flex-shrink: 0;';
      icon.textContent = item.icon || '•';

      const textWrap = document.createElement('div');
      const label = document.createElement('div');
      label.style.cssText = 'font-weight: 500; color: #1e293b;';
      label.textContent = item.label;
      textWrap.appendChild(label);
      if (item.description) {
        const desc = document.createElement('div');
        desc.style.cssText = 'font-size: 12px; color: #94a3b8;';
        desc.textContent = item.description;
        textWrap.appendChild(desc);
      }

      row.appendChild(icon);
      row.appendChild(textWrap);
      this._menuElement!.appendChild(row);
    });
  }

  private _executeItem(editor: Editor, item: SlashMenuItem): void {
    this._hideMenu();
    const selection = (editor as any).selection;
    editor.executeCommand(item.command, { ...item.payload, selection });
  }

  private _updateFilter(): void {
    const allItems = this._options.items || DEFAULT_ITEMS;
    if (!this._query) {
      this._filteredItems = allItems;
    } else {
      const q = this._query.toLowerCase();
      this._filteredItems = allItems.filter(
        item => item.label.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)
      );
    }
    this._selectedIndex = 0;
  }

  private _positionMenu(): void {
    if (!this._menuElement) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    this._menuElement.style.left = `${rect.left}px`;
    this._menuElement.style.top = `${rect.bottom + 4}px`;
  }
}

export function createSlashCommandExtension(options?: SlashCommandExtensionOptions): SlashCommandExtension {
  return new SlashCommandExtension(options);
}
