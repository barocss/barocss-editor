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
    if (!result.success) return false;

    /**
     * **And the caret goes beside it, not into it.**
     *
     * An emoji is an atom: the schema says it holds nothing and the element says
     * `contenteditable="false"`. Left to itself the browser put the caret *inside* the new node —
     * measured, at offset 0 of `🎉` — where a reader's next keystroke would have gone into a node
     * that cannot hold characters, and where the arrow keys could not get out again because the
     * element refuses to be edited.
     *
     * So the run says where the caret is, which is the same rule every other insert here follows: at
     * the start of the text that now **follows** the emoji, or — when it went in at the end of the
     * block — at the end of the run before it. Both are a caret in text, which is the only place a
     * caret belongs.
     */
    const holder = dataStore.getNode(blockId);
    const kids: string[] = Array.isArray(holder?.content) ? holder.content : [];
    const at = kids.findIndex((sid) => {
      const one = dataStore.getNode(sid);
      return one?.stype === 'emoji' && one?.attributes?.shortcode === attrs.shortcode
        && one?.attributes?.unicode === attrs.unicode;
    });
    const after = at >= 0 ? dataStore.getNode(kids[at + 1]) : undefined;
    const before = at > 0 ? dataStore.getNode(kids[at - 1]) : undefined;
    const land =
      typeof after?.text === 'string'
        ? { sid: after.sid as string, offset: 0 }
        : typeof before?.text === 'string'
          ? { sid: before.sid as string, offset: (before.text as string).length }
          : undefined;
    if (land) {
      const said = {
        type: 'range' as const,
        startNodeId: land.sid,
        startOffset: land.offset,
        endNodeId: land.sid,
        endOffset: land.offset,
        collapsed: true
      };
      /*
       * **The model and the DOM**, in that order. Setting the model alone leaves the browser's own
       * caret where it put it — inside the new atom — and the next thing to read the DOM writes that
       * back over the answer this just gave. Measured: the model said `site:15@21` and the caret was
       * at offset 0 of `🎉`.
       */
      editor.updateSelection(said);
      /*
       * The **view**, which is not a member of `Editor` — the engine does not know it has one, and
       * this is the one place that has to reach past the type. A caret set in the model alone is a
       * caret the browser has not been told about, and the next read writes the browser's answer back
       * over it.
       */
      (editor as unknown as {
        view?: { convertModelSelectionToDOM?: (one: unknown) => void };
      }).view?.convertModelSelectionToDOM?.(said);
    }
    return true;
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
