import { Editor, Extension } from '@barocss/editor-core';

export interface ToolbarButton {
  id: string;
  label: string;
  icon: string;
  command: string;
  payload?: Record<string, any>;
  isActive?: (editor: Editor) => boolean;
}

export interface FloatingToolbarExtensionOptions {
  enabled?: boolean;
  buttons?: ToolbarButton[];
}

const DEFAULT_BUTTONS: ToolbarButton[] = [
  { id: 'bold', label: 'Bold', icon: 'B', command: 'toggleBold' },
  { id: 'italic', label: 'Italic', icon: 'I', command: 'toggleItalic' },
  { id: 'underline', label: 'Underline', icon: 'U', command: 'toggleUnderline' },
  { id: 'strikethrough', label: 'Strikethrough', icon: 'S', command: 'toggleStrikethrough' },
  { id: 'code', label: 'Code', icon: '<>', command: 'toggleCode' },
  { id: 'link', label: 'Link', icon: '🔗', command: 'toggleLink' },
];

export class FloatingToolbarExtension implements Extension {
  name = 'floatingToolbar';
  priority = 40;

  private _options: FloatingToolbarExtensionOptions;
  private _toolbarEl: HTMLElement | null = null;
  private _selectionHandler: (() => void) | null = null;

  constructor(options: FloatingToolbarExtensionOptions = {}) {
    this._options = {
      enabled: true,
      buttons: DEFAULT_BUTTONS,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    this._selectionHandler = () => {
      this._onSelectionChange(editor);
    };

    document.addEventListener('selectionchange', this._selectionHandler);

    editor.on('editor:selection.change', () => {
      requestAnimationFrame(() => this._onSelectionChange(editor));
    });
  }

  onDestroy(_editor: Editor): void {
    if (this._selectionHandler) {
      document.removeEventListener('selectionchange', this._selectionHandler);
      this._selectionHandler = null;
    }
    this._hideToolbar();
  }

  private _onSelectionChange(editor: Editor): void {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      this._hideToolbar();
      return;
    }

    const range = sel.getRangeAt(0);
    const text = range.toString().trim();
    if (!text) {
      this._hideToolbar();
      return;
    }

    this._showToolbar(editor, range);
  }

  private _showToolbar(editor: Editor, range: Range): void {
    if (!this._toolbarEl) {
      this._toolbarEl = document.createElement('div');
      this._toolbarEl.className = 'bc-floating-toolbar';
      this._toolbarEl.setAttribute('role', 'toolbar');
      this._toolbarEl.style.cssText = `
        position: absolute; z-index: 9998; background: #1e293b; border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,.2); padding: 4px; display: flex;
        gap: 2px; font-family: system-ui, sans-serif;
      `;
      document.body.appendChild(this._toolbarEl);
    }

    this._toolbarEl.innerHTML = '';
    const buttons = this._options.buttons || DEFAULT_BUTTONS;

    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = btn.label;
      button.style.cssText = `
        background: transparent; border: none; color: #e2e8f0; cursor: pointer;
        padding: 6px 8px; border-radius: 4px; font-size: 13px; font-weight: 600;
        min-width: 28px; display: flex; align-items: center; justify-content: center;
      `;
      button.textContent = btn.icon;

      button.addEventListener('mouseenter', () => {
        button.style.background = '#334155';
      });
      button.addEventListener('mouseleave', () => {
        button.style.background = 'transparent';
      });

      button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const selection = (editor as any).selection;
        editor.executeCommand(btn.command, { ...btn.payload, selection });
      });

      this._toolbarEl!.appendChild(button);
    });

    const rect = range.getBoundingClientRect();
    const toolbarWidth = buttons.length * 34;
    const left = Math.max(8, rect.left + rect.width / 2 - toolbarWidth / 2);
    this._toolbarEl.style.left = `${left}px`;
    this._toolbarEl.style.top = `${rect.top - 44}px`;
  }

  private _hideToolbar(): void {
    if (this._toolbarEl) {
      this._toolbarEl.remove();
      this._toolbarEl = null;
    }
  }
}

export function createFloatingToolbarExtension(options?: FloatingToolbarExtensionOptions): FloatingToolbarExtension {
  return new FloatingToolbarExtension(options);
}
