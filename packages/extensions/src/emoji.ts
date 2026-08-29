import { Editor, Extension } from '@barocss/editor-core';
import { hasRange } from './guards';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction, control, splitTextNode, addChild } from '@barocss/model';

export interface EmojiExtensionOptions {
  enabled?: boolean;
}

export interface InsertEmojiPayload {
  /** Emoji shortcode (e.g. ":smile:") */
  shortcode?: string;
  /** Unicode character (e.g. "😀") */
  unicode?: string;
  selection?: ModelSelection;
}

/**
 * Emoji Extension – inserts the standard `emoji` node (inline atom) at the current selection.
 * Schema must include node type `emoji` with optional attrs shortcode, unicode.
 */
export class EmojiExtension implements Extension {
  name = 'emoji';
  priority = 150;

  private _options: EmojiExtensionOptions;

  constructor(options: EmojiExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options,
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    editor.registerCommand({
      name: 'insertEmoji',
      /*
       * The **editor's** selection when the caller did not pass one, which the run needs and did not
       * fall back to — so an emoji picker that sent only the emoji got a command that declined.
       */
      execute: async (ed: Editor, payload?: InsertEmojiPayload) => {
        const selection = payload?.selection ?? (ed as { selection?: ModelSelection }).selection;
        return await this._executeInsertEmoji(ed, { ...(payload as InsertEmojiPayload), selection });
      },
      /**
       * An emoji **and somewhere to put it** — the second half was missing.
       *
       * The guard asked only whether an emoji had been named; the run refuses without a range, and
       * says so to nobody. So a picker with nothing selected lit up, ran and did nothing, which is
       * the class `guards.ts` names. Found by the conformance run in this package's own tests.
       */
      canExecute: (ed: Editor, payload?: InsertEmojiPayload) =>
        !!payload && (payload.shortcode != null || payload.unicode != null) && hasRange(ed, payload),
    });
  }

  onDestroy(_editor: Editor): void {}

  private async _executeInsertEmoji(
    editor: Editor,
    payload?: InsertEmojiPayload
  ): Promise<boolean> {
    if (!payload?.selection || payload.selection.type !== 'range') return false;

    const dataStore = (editor as any).dataStore;
    if (!dataStore) return false;

    const schema = dataStore.getActiveSchema?.();
    if (schema && !schema.getNodeType('emoji')) return false;

    const selection = payload.selection;
    const startNode = dataStore.getNode(selection.startNodeId);
    if (!startNode) return false;

    const blockId = this._getBlockId(dataStore, schema, startNode);
    if (!blockId) return false;

    const block = dataStore.getNode(blockId);
    if (!block || !Array.isArray(block.content)) return false;

    const childIndex = block.content.indexOf(selection.startNodeId);
    if (childIndex === -1) return false;

    const attrs: Record<string, string> = {};
    if (payload.shortcode != null) attrs.shortcode = String(payload.shortcode);
    if (payload.unicode != null) attrs.unicode = String(payload.unicode);

    const emojiNode = {
      stype: 'emoji',
      attributes: attrs,
    };

    const startOffset = selection.startOffset ?? 0;
    const textLen =
      typeof startNode.text === 'string' ? startNode.text.length : 0;

    let ops: any[];

    if (startOffset === 0) {
      ops = [addChild(blockId, emojiNode, childIndex)];
    } else if (startOffset >= textLen) {
      ops = [addChild(blockId, emojiNode, childIndex + 1)];
    } else {
      ops = [
        ...control(selection.startNodeId, [splitTextNode(startOffset)]),
        addChild(blockId, emojiNode, childIndex + 1),
      ];
    }

    const result = await transaction(editor, ops, {
      applySelectionToView: true,
    }).commit();
    return result.success;
  }

  private _getBlockId(dataStore: any, schema: any, startNode: any): string | null {
    const nodeType = schema?.getNodeType(startNode.stype);
    if (nodeType?.group === 'block') return startNode.sid ?? null;

    let current: any = startNode;
    while (current?.parentId) {
      const parent = dataStore.getNode(current.parentId);
      if (!parent) break;
      const parentType = schema?.getNodeType(parent.stype);
      if (parentType?.group === 'block') return parent.sid ?? null;
      current = parent;
    }
    return null;
  }
}

export function createEmojiExtension(
  options?: EmojiExtensionOptions
): EmojiExtension {
  return new EmojiExtension(options);
}
