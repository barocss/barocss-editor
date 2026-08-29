import { findAncestorNode } from '@barocss/datastore';
import { hasRange } from './guards';
import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control, transformNode } from '@barocss/model';

export interface HeadingExtensionOptions {
  enabled?: boolean;
  levels?: number[];
  keyboardShortcuts?: Record<number, string>;
}

export class HeadingExtension implements Extension {
  name = 'heading';
  priority = 100;
  
  private _options: HeadingExtensionOptions;

  constructor(options: HeadingExtensionOptions = {}) {
    this._options = {
      enabled: true,
      levels: [1, 2, 3, 4, 5, 6],
      keyboardShortcuts: {
        1: 'Mod+Alt+1',
        2: 'Mod+Alt+2',
        3: 'Mod+Alt+3'
      },
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // Register commands for each heading level
    this._options.levels?.forEach(level => {
      (editor as any).registerCommand({
        name: `setHeading${level}`,
        /*
         * The **editor's** selection when the caller did not pass one, which is what every other
         * command in this package does and these did not. A command only usable by a caller that
         * threads its own selection is one a toolbar cannot call.
         */
        execute: async (ed: Editor, payload?: { selection?: ModelSelection }) =>
          await this._executeSetHeading(ed, level, selectionOf(ed, payload)),
        /**
         * The **editor's** selection when the caller did not pass one — which its `execute` has always
         * done and this had not.
         *
         * A guard that only reads `payload.selection` answers no to every caller that asks *can this
         * run right now* before deciding what to send, which is what a toolbar does on every render.
         * `Editor.canRun` fills the selection in and hides it; `canExecuteCommand` does not, and the
         * two are used side by side. Ten commands were in this state — the six `setHeading{n}`,
         * `setHeading`, `setParagraph` and `insertParagraph` — and the extensions' conformance run
         * counted every one of them as a command it *could not ask about*, which reads exactly like
         * ten commands nobody had got round to.
         */
        canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
          hasRange(ed, payload) && this._canSetHeading(ed, level) && !this._alreadyAt(ed, payload, level)
      });
    });

    // General heading setting command
    (editor as any).registerCommand({
      name: 'setHeading',
      execute: async (ed: Editor, payload?: { level?: number; selection?: ModelSelection }) => {
        const level = payload?.level;
        if (typeof level !== 'number') {
          return false;
        }
        return await this._executeSetHeading(ed, level, selectionOf(ed, payload));
      },
      // The editor's selection when none is passed — see the note on the numbered commands above.
      canExecute: (ed: Editor, payload?: { level?: number; selection?: ModelSelection }) =>
        typeof payload?.level === 'number' &&
        hasRange(ed, payload) &&
        this._canSetHeading(ed, payload.level) &&
        !this._alreadyAt(ed, payload, payload.level)
    });

    // Remove heading command
    (editor as any).registerCommand({
      name: 'removeHeading',
      execute: (ed: Editor) => {
        return this._removeHeading(ed);
      },
      canExecute: (_ed: Editor) => {
        return this._canRemoveHeading(_ed);
      }
    });

    // Register keyboard shortcuts
    if (this._options.keyboardShortcuts) {
      this._registerKeyboardShortcuts(editor);
    }
  }

  onDestroy(_editor: any): void {
    // Cleanup work
  }

  private async _executeSetHeading(
    editor: Editor,
    level: number,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[HeadingExtension] dataStore not found');
      return false;
    }

    // Find current block node (parent block node of startNodeId)
    const targetNodeId = this._getTargetBlockNodeId(dataStore, selection);
    if (!targetNodeId) {
      console.warn('[HeadingExtension] No target block node found');
      return false;
    }

    const targetNode = dataStore.getNode(targetNodeId);
    if (!targetNode) {
      return false;
    }

    // No-op if already same type
    if (targetNode.stype === 'heading' && targetNode.attributes?.level === level) {
      return true;
    }

    // Use transformNode operation
    const ops = [
      ...control(targetNodeId, [
        transformNode('heading', { level })
      ])
    ];

    const result = await transaction(editor, ops).commit();
    return result.success;
  }

  private _canSetHeading(_editor: Editor, level: number): boolean {
    return this._options.levels?.includes(level) || false;
  }

  /**
   * Whether the block is **already** that heading, which is a no-op and should not light a control.
   *
   * `_executeSetHeading` returns `true` in that case — defensible, because the state the reader asked
   * for is the state they have. What is not defensible is a control that says it can run: 제목 1 over
   * a heading 1 lit up, ran, reported success and changed nothing. A toolbar wants this as *active*
   * rather than *enabled*, which is the same answer said in the right place.
   */
  private _alreadyAt(editor: Editor, payload: { selection?: ModelSelection } | undefined, level: number): boolean {
    const selection = selectionOf(editor, payload);
    const store = (editor as { dataStore?: any }).dataStore;
    if (!selection || !store) return false;

    const targetNodeId = this._getTargetBlockNodeId(store, selection);
    const target = targetNodeId ? store.getNode(targetNodeId) : undefined;
    return target?.stype === 'heading' && target?.attributes?.level === level;
  }

  /**
   * **Is the caret in a heading** — the same question the execute asks, asked here too.
   *
   * It was `return true` with the comment *"conservative default: allow heading removal command when
   * called"*, and conservative is the wrong word for it: a menu entry called 제목 해제 lit up with the
   * caret in an ordinary paragraph, ran, declined, and said nothing. Found by this package's own
   * conformance run, which is the class `guards.ts` names — a `canExecute` looser than its `execute`.
   *
   * One lookup, used by both, so the two cannot come apart again.
   */
  private _canRemoveHeading(editor: any): boolean {
    return this._headingAt(editor) !== undefined;
  }

  /** The heading the caret is in, if it is in one. */
  private _headingAt(editor: any): string | undefined {
    const selection: ModelSelection | null = editor?.selection ?? null;
    if (!selection || selection.type !== 'range') return undefined;

    const dataStore = editor?.dataStore;
    if (!dataStore) return undefined;

    const targetNodeId = this._getTargetBlockNodeId(dataStore, selection);
    if (!targetNodeId) return undefined;
    return dataStore.getNode(targetNodeId)?.stype === 'heading' ? targetNodeId : undefined;
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

    // Find parent block node of startNode (cycle-safe walk)
    const block = findAncestorNode(
      (id: string) => dataStore.getNode(id),
      startNode.sid!,
      (n: any) => schema?.getNodeType(n.stype)?.group === 'block'
    );
    return block?.sid ?? null;
  }

  private async _removeHeading(editor: any): Promise<boolean> {
    const targetNodeId = this._headingAt(editor);
    if (!targetNodeId) return false;

    const ops = [
      ...control(targetNodeId, [
        transformNode('paragraph', {})
      ])
    ];

    const result = await transaction(editor, ops).commit();
    return result.success;
  }

  private _registerKeyboardShortcuts(_editor: Editor): void {
    // Keyboard shortcuts are handled by default keybindings, so do nothing here
    // Mod+Alt+1/2/3 are already registered in default keybindings
  }
}

// Convenience function
export function createHeadingExtension(options?: HeadingExtensionOptions): HeadingExtension {
  return new HeadingExtension(options);
}

/** The selection a command should act on: the one it was handed, or the editor's. */
function selectionOf(
  editor: Editor,
  payload: { selection?: ModelSelection } | undefined
): ModelSelection | undefined {
  return payload?.selection ?? (editor as { selection?: ModelSelection }).selection;
}
