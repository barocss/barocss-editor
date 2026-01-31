import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control, transformNode, insertParagraph as insertParagraphOp } from '@barocss/model';

export interface ParagraphExtensionOptions {
  enabled?: boolean;
}

/**
 * ParagraphExtension
 *
 * - Handles Enter key (`insertParagraph` command).
 * - Actual model changes are performed using transaction + operations combination from @barocss/model.
 * - Instead of writing directly to DataStore, creates operation objects (deleteTextRange, splitTextNode, splitBlockNode, addChild, etc.)
 *   and executes them in a single transaction.
 */
export class ParagraphExtension implements Extension {
  name = 'paragraph';
  priority = 100;

  private _options: ParagraphExtensionOptions;

  constructor(options: ParagraphExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // Paragraph command
    (editor as any).registerCommand({
      name: 'setParagraph',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeSetParagraph(ed, payload?.selection);
      },
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        return !!payload?.selection;
      }
    });

    // Enter key: insertParagraph (Model-first, transaction-based)
    (editor as any).registerCommand({
      name: 'insertParagraph',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeInsertParagraph(ed, payload?.selection);
      },
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        return !!payload?.selection;
      }
    });

    // Keyboard shortcut registration is not yet directly handled by ParagraphExtension.
  }

  onDestroy(_editor: Editor): void {
    // Add cleanup work here if needed
  }

  /**
   * setParagraph execution
   * - Converts current block node to paragraph
   */
  private async _executeSetParagraph(
    editor: Editor,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[ParagraphExtension] dataStore not found');
      return false;
    }

    // Find current block node (parent block node of startNodeId)
    const targetNodeId = this._getTargetBlockNodeId(dataStore, selection);
    if (!targetNodeId) {
      console.warn('[ParagraphExtension] No target block node found');
      return false;
    }

    const targetNode = dataStore.getNode(targetNodeId);
    if (!targetNode) {
      return false;
    }

    // No-op if already paragraph
    if (targetNode.stype === 'paragraph') {
      return true;
    }

    // Use transformNode operation
    const ops = [
      ...control(targetNodeId, [
        transformNode('paragraph')
      ])
    ];

    const result = await transaction(editor, ops, { applySelectionToView: true }).commit();
    return result.success;
  }

  /**
   * insertParagraph execution
   * - Interprets selection, builds operation array, then executes via transaction.
   */
  private async _executeInsertParagraph(
    editor: Editor,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const ops = this._buildInsertParagraphOperations(editor, selection);
    if (!ops.length) {
      return false;
    }

    const result = await transaction(editor, ops, { applySelectionToView: true }).commit();
    return result.success;
  }

  /**
   * Finds target block node ID from selection
   * - Range Selection: parent block node of startNodeId
   */
  private _getTargetBlockNodeId(dataStore: any, selection: ModelSelection): string | null {
    if (selection.type !== 'range') {
      return null;
    }

    const startNode = dataStore.getNode(selection.startNodeId);
    if (!startNode) return null;

    const schema = dataStore.getActiveSchema();
    if (schema) {
      const nodeType = schema.getNodeType(startNode.stype);
      // Use startNode as is if it's a block
      if (nodeType?.group === 'block') {
        return startNode.sid!;
      }
    }

    // Find parent block node of startNode
    let current = startNode;
    while (current && current.parentId) {
      const parent = dataStore.getNode(current.parentId);
      if (!parent) break;

      const parentType = schema?.getNodeType(parent.stype);
      if (parentType?.group === 'block') {
        return parent.sid!;
      }

      current = parent;
    }

    return null;
  }

  /**
   * Builds operation sequence for insertParagraph.
   * insertParagraph is selection-based (reads context.selection.current in the transaction).
   * Collapsed: insertParagraph(). Range (same node): deleteTextRange then insertParagraph().
   */
  private _buildInsertParagraphOperations(
    editor: Editor,
    selection: ModelSelection
  ): any[] {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) return [];
    if (selection.type !== 'range') return [];

    const ops: any[] = [];
    if (!selection.collapsed && selection.startNodeId === selection.endNodeId) {
      const node = dataStore.getNode(selection.startNodeId);
      if (!node || typeof node.text !== 'string') return [];
      const text = node.text as string;
      const { startOffset, endOffset } = selection;
      if (
        typeof startOffset !== 'number' ||
        typeof endOffset !== 'number' ||
        startOffset < 0 ||
        endOffset > text.length ||
        startOffset >= endOffset
      ) {
        return [];
      }
      ops.push(
        ...control(selection.startNodeId, [
          { type: 'deleteTextRange', payload: { start: startOffset, end: endOffset } }
        ])
      );
    } else if (!selection.collapsed) {
      return [];
    }
    ops.push(insertParagraphOp('same'));
    return ops;
  }
}

// Convenience function
export function createParagraphExtension(options?: ParagraphExtensionOptions): ParagraphExtension {
  return new ParagraphExtension(options);
}


