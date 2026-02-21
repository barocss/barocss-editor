import { Editor, Extension } from '@barocss/editor-core';
import { transaction, control } from '@barocss/model';

export interface DragDropExtensionOptions {
  enabled?: boolean;
  handleSelector?: string;
}

export class DragDropExtension implements Extension {
  name = 'dragDrop';
  priority = 60;

  private _options: DragDropExtensionOptions;
  private _dragState: { blockId: string; startY: number; element: HTMLElement } | null = null;
  private _placeholder: HTMLElement | null = null;
  private _dragOverlay: HTMLElement | null = null;

  constructor(options: DragDropExtensionOptions = {}) {
    this._options = {
      enabled: true,
      handleSelector: '[data-bc-stype]',
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    (editor as any).registerCommand({
      name: 'moveBlockToPosition',
      execute: async (ed: Editor, payload?: { blockId?: string; targetIndex?: number }) => {
        if (!payload?.blockId || payload.targetIndex == null) return false;
        return this._moveBlock(ed, payload.blockId, payload.targetIndex);
      },
      canExecute: (_ed: Editor, payload?: { blockId?: string }) => !!payload?.blockId
    });

    this._setupDragListeners(editor);
  }

  onDestroy(_editor: Editor): void {
    this._cleanupDrag();
  }

  private _setupDragListeners(editor: Editor): void {
    const container = this._getContentContainer();
    if (!container) return;

    container.addEventListener('mousedown', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const handle = target.closest('.bc-drag-handle');
      if (!handle) return;

      const block = handle.closest('[data-bc-sid]') as HTMLElement | null;
      if (!block) return;

      const blockId = block.getAttribute('data-bc-sid');
      if (!blockId) return;

      e.preventDefault();
      this._startDrag(editor, blockId, e.clientY, block);
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (this._dragState) {
        e.preventDefault();
        this._onDragMove(e.clientY);
      }
    });

    document.addEventListener('mouseup', () => {
      if (this._dragState) {
        this._endDrag(editor);
      }
    });
  }

  private _startDrag(_editor: Editor, blockId: string, startY: number, element: HTMLElement): void {
    this._dragState = { blockId, startY, element };

    element.style.opacity = '0.4';
    element.style.transition = 'none';

    this._placeholder = document.createElement('div');
    this._placeholder.className = 'bc-drag-placeholder';
    this._placeholder.style.cssText = `
      height: 2px; background: #3b82f6; border-radius: 1px;
      margin: 2px 0; transition: none;
    `;
  }

  private _onDragMove(clientY: number): void {
    if (!this._dragState || !this._placeholder) return;

    const container = this._getContentContainer();
    if (!container) return;

    const blocks = Array.from(container.querySelectorAll(':scope > [data-bc-sid]'));
    let insertBefore: Element | null = null;

    for (const block of blocks) {
      const rect = block.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        insertBefore = block;
        break;
      }
    }

    if (insertBefore) {
      container.insertBefore(this._placeholder, insertBefore);
    } else {
      container.appendChild(this._placeholder);
    }
  }

  private async _endDrag(editor: Editor): Promise<void> {
    if (!this._dragState) return;

    const { blockId, element } = this._dragState;
    element.style.opacity = '';
    element.style.transition = '';

    if (this._placeholder?.parentNode) {
      const container = this._placeholder.parentNode as HTMLElement;
      let targetIndex = 0;
      let count = 0;
      for (const child of Array.from(container.children)) {
        if (child === this._placeholder) {
          targetIndex = count;
          break;
        }
        if ((child as HTMLElement).hasAttribute?.('data-bc-sid')) {
          count++;
        }
      }

      await this._moveBlock(editor, blockId, targetIndex);
    }

    this._cleanupDrag();
  }

  private _cleanupDrag(): void {
    if (this._placeholder) {
      this._placeholder.remove();
      this._placeholder = null;
    }
    if (this._dragOverlay) {
      this._dragOverlay.remove();
      this._dragOverlay = null;
    }
    if (this._dragState) {
      this._dragState.element.style.opacity = '';
      this._dragState.element.style.transition = '';
      this._dragState = null;
    }
  }

  private async _moveBlock(editor: Editor, blockId: string, targetIndex: number): Promise<boolean> {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) return false;

    const node = dataStore.getNode(blockId);
    if (!node || !node.parentId) return false;

    const parent = dataStore.getNode(node.parentId);
    if (!parent || !Array.isArray(parent.content)) return false;

    const currentIndex = parent.content.indexOf(blockId);
    if (currentIndex === -1 || currentIndex === targetIndex) return false;

    const ops = [
      ...control(node.parentId, [
        { type: 'reorderChildren', payload: { childId: blockId, newIndex: targetIndex } } as any
      ])
    ];

    const result = await transaction(editor, ops).commit();
    return result.success;
  }

  private _getContentContainer(): HTMLElement | null {
    return document.querySelector('[data-bc-layer="content"]') ||
           document.querySelector('[data-testid="editor-content"]');
  }
}

export function createDragDropExtension(options?: DragDropExtensionOptions): DragDropExtension {
  return new DragDropExtension(options);
}
