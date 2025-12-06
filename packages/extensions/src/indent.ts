import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control, indentNode, outdentNode, indentText, outdentText } from '@barocss/model';

export interface IndentExtensionOptions {
  enabled?: boolean;
}

/**
 * Indent Extension - Extension that provides structural/text indentation/outdentation functionality
 * 
 * Main features:
 * - indentNode: Indent block node by one level (move to last child of previous sibling)
 * - outdentNode: Outdent block node by one level (move under parent's parent)
 * - indentText: Add indentation string before each line in text range
 * - outdentText: Remove indentation string from before each line in text range
 * - Tab/Shift+Tab keybinding support
 * - Process multiple nodes simultaneously on Range Selection
 * - Process selected node on Node Selection
 */
export class IndentExtension implements Extension {
  name = 'indent';
  priority = 100;
  
  private _options: IndentExtensionOptions;

  constructor(options: IndentExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // 1. indentNode command
    editor.registerCommand({
      name: 'indentNode',
      execute: async (editor: any, payload?: { nodeId?: string }) => {
        return await this._executeIndentNode(editor, payload?.nodeId);
      },
      canExecute: (editor: any, payload?: any) => {
        const nodeId = payload?.nodeId || this._getTargetNodeId(editor);
        if (!nodeId) return false;
        const dataStore = (editor as any).dataStore;
        if (!dataStore) return false;
        return dataStore.isIndentableNode(nodeId);
      }
    });

    // 2. outdentNode command
    editor.registerCommand({
      name: 'outdentNode',
      execute: async (editor: any, payload?: { nodeId?: string }) => {
        return await this._executeOutdentNode(editor, payload?.nodeId);
      },
      canExecute: (editor: any, payload?: any) => {
        const nodeId = payload?.nodeId || this._getTargetNodeId(editor);
        if (!nodeId) return false;
        const dataStore = (editor as any).dataStore;
        if (!dataStore) return false;
        // Check if outdent is possible: verify indentable + parent exists
        if (!dataStore.isIndentableNode(nodeId)) return false;
        const node = dataStore.getNode(nodeId);
        if (!node || !node.parentId) return false;
        return true;
      }
    });

    // 3. indentText command (indent text range)
    editor.registerCommand({
      name: 'indentText',
      execute: async (editor: any, payload?: { selection?: ModelSelection; indent?: string }) => {
        const selection = payload?.selection || (editor as any).selection;
        if (!selection || selection.type !== 'range') {
          console.warn('[IndentExtension] indentText: No valid range selection');
          return false;
        }
        return await this._executeIndentText(editor, selection, payload?.indent);
      },
      canExecute: (editor: any, payload?: any) => {
        const selection = payload?.selection || (editor as any).selection;
        return selection != null && selection.type === 'range';
      }
    });

    // 4. outdentText command (outdent text range)
    editor.registerCommand({
      name: 'outdentText',
      execute: async (editor: any, payload?: { selection?: ModelSelection; indent?: string }) => {
        const selection = payload?.selection || (editor as any).selection;
        if (!selection || selection.type !== 'range') {
          console.warn('[IndentExtension] outdentText: No valid range selection');
          return false;
        }
        return await this._executeOutdentText(editor, selection, payload?.indent);
      },
      canExecute: (editor: any, payload?: any) => {
        const selection = payload?.selection || (editor as any).selection;
        return selection != null && selection.type === 'range';
      }
    });
  }

  onDestroy(_editor: Editor): void {
    // Cleanup
  }

  /**
   * Get target node ID for indent/outdent from current selection
   * - Node Selection: selected node
   * - Range Selection: parent block node of startNodeId
   * - Multi Node Selection: first node
   */
  private _getTargetNodeId(editor: Editor): string | null {
    const selection = (editor as any).selection;
    if (!selection) return null;

    const dataStore = (editor as any).dataStore;
    if (!dataStore) return null;

    // Node Selection
    if (selection.type === 'node') {
      return selection.nodeId;
    }

    // Multi Node Selection
    if (selection.type === 'multi-node' && selection.nodeIds && selection.nodeIds.length > 0) {
      return selection.nodeIds[0];
    }

    // Range Selection: find parent block node of startNodeId
    if (selection.type === 'range') {
      const startNode = dataStore.getNode(selection.startNodeId);
      if (!startNode) return null;

      // If startNode is a block, use it as is
      const schema = dataStore.getActiveSchema();
      if (schema) {
        const nodeType = schema.getNodeType(startNode.stype);
        if (nodeType?.group === 'block' && dataStore.isIndentableNode(startNode.sid!)) {
          return startNode.sid!;
        }
      }

      // Find parent block node of startNode
      let current = startNode;
      while (current && current.parentId) {
        const parent = dataStore.getNode(current.parentId);
        if (!parent) break;

        const parentType = schema?.getNodeType(parent.stype);
        if (parentType?.group === 'block' && dataStore.isIndentableNode(parent.sid!)) {
          return parent.sid!;
        }

        current = parent;
      }
    }

    return null;
  }

  /**
   * Execute indentNode
   * 
   * @param editor Editor instance
   * @param nodeId Node ID to indent (extracted from selection if not provided)
   * @returns Success status
   */
  private async _executeIndentNode(editor: Editor, nodeId?: string): Promise<boolean> {
    const targetNodeId = nodeId || this._getTargetNodeId(editor);
    if (!targetNodeId) {
      console.warn('[IndentExtension] indentNode: No target node found');
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[IndentExtension] dataStore not found');
      return false;
    }

    if (!dataStore.isIndentableNode(targetNodeId)) {
      console.warn('[IndentExtension] indentNode: Node is not indentable', targetNodeId);
      return false;
    }

    const operations = this._buildIndentNodeOperations(targetNodeId);
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * Execute outdentNode
   * 
   * @param editor Editor instance
   * @param nodeId Node ID to outdent (extracted from selection if not provided)
   * @returns Success status
   */
  private async _executeOutdentNode(editor: Editor, nodeId?: string): Promise<boolean> {
    const targetNodeId = nodeId || this._getTargetNodeId(editor);
    if (!targetNodeId) {
      console.warn('[IndentExtension] outdentNode: No target node found');
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[IndentExtension] dataStore not found');
      return false;
    }

    if (!dataStore.isIndentableNode(targetNodeId)) {
      console.warn('[IndentExtension] outdentNode: Node is not indentable', targetNodeId);
      return false;
    }

    const node = dataStore.getNode(targetNodeId);
    if (!node || !node.parentId) {
      console.warn('[IndentExtension] outdentNode: Node has no parent', targetNodeId);
      return false;
    }

    const operations = this._buildOutdentNodeOperations(targetNodeId);
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * Build indentNode operations
   */
  private _buildIndentNodeOperations(nodeId: string): any[] {
    return [
      ...control(nodeId, [
        indentNode()
      ])
    ];
  }

  /**
   * Build outdentNode operations
   */
  private _buildOutdentNodeOperations(nodeId: string): any[] {
    return [
      ...control(nodeId, [
        outdentNode()
      ])
    ];
  }

  /**
   * Execute indentText (indent text range)
   * 
   * @param editor Editor instance
   * @param selection Text range selection
   * @param indentStr Indentation string (default: '  ')
   * @returns Success status
   */
  private async _executeIndentText(editor: Editor, selection: ModelSelection, indentStr?: string): Promise<boolean> {
    if (selection.type !== 'range') {
      return false;
    }

    const operations = this._buildIndentTextOperations(selection, indentStr);
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * Execute outdentText (outdent text range)
   * 
   * @param editor Editor instance
   * @param selection Text range selection
   * @param indentStr Indentation string to remove (default: '  ')
   * @returns Success status
   */
  private async _executeOutdentText(editor: Editor, selection: ModelSelection, indentStr?: string): Promise<boolean> {
    if (selection.type !== 'range') {
      return false;
    }

    const operations = this._buildOutdentTextOperations(selection, indentStr);
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * Build indentText operations
   */
  private _buildIndentTextOperations(selection: ModelSelection, indentStr?: string): any[] {
    if (selection.startNodeId === selection.endNodeId) {
      // Single node range
      return [
        ...control(selection.startNodeId, [
          indentText(selection.startOffset, selection.endOffset, indentStr)
        ])
      ];
    } else {
      // Cross-node range
      return [
        indentText(
          selection.startNodeId,
          selection.startOffset,
          selection.endNodeId,
          selection.endOffset,
          indentStr
        )
      ];
    }
  }

  /**
   * Build outdentText operations
   */
  private _buildOutdentTextOperations(selection: ModelSelection, indentStr?: string): any[] {
    if (selection.startNodeId === selection.endNodeId) {
      // Single node range
      return [
        ...control(selection.startNodeId, [
          outdentText(selection.startOffset, selection.endOffset, indentStr)
        ])
      ];
    } else {
      // Cross-node range
      return [
        outdentText(
          selection.startNodeId,
          selection.startOffset,
          selection.endNodeId,
          selection.endOffset,
          indentStr
        )
      ];
    }
  }
}

