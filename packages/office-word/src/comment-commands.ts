/**
 * Word's own comment commands.
 *
 * The shared kit's `insertComment` puts the thread in the flow right after the
 * block, applies no anchoring mark, and records no author. In this schema a
 * thread is a resource and the anchor is a `commentRef` mark, so all three are
 * wrong here: the comment would print with the document, nothing would tie it to
 * the text, and nobody would know who wrote it. Registered after the kit, so
 * these replace it.
 *
 * Who is commenting is the host's to say, the same way the instant a date field
 * shows is: an editor that read a name from somewhere would be guessing, and two
 * people in the same document are not the same person.
 */
import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { childOfType, childrenOf, type DocumentAccess, type DocumentNode } from '@barocss/office-text';
import { commentThreads, freeThreadId, commentIdentityInUse } from './comments';

export interface InsertWordCommentPayload {
  selection?: ModelSelection;
  text?: string;
  /** A caller-owned durable identity; legacy menus may still allocate comment-N. */
  id?: string;
  /** Supplements the native and host authority checks through the complete commit. */
  canApply?: () => boolean;
}

export interface CommentAuthor {
  name: string;
  /** The date recorded on what they write, as the document stores it. */
  date: () => string;
}

/** One comment or reply, as the document stores it. */
function entryNode(author: CommentAuthor, text: string): DocumentNode {
  return {
    stype: 'paragraph',
    attributes: { author: author.name, date: author.date() },
    content: [{ stype: 'inline-text', text }]
  };
}

export class WordCommentExtension implements Extension {
  name = 'wordComments';
  // After the shared kit, so these replace its comment command rather than
  // sitting beside it.
  priority = 40;

  constructor(private readonly _author: CommentAuthor) {}

  onCreate(editor: Editor): void {
    editor.registerCommand({
      name: 'insertComment',
      execute: async (ed: Editor, payload?: InsertWordCommentPayload) =>
        await this._insert(ed, payload?.selection ?? ed.selection, payload?.text ?? '', payload),
      // A comment is about something, so there has to be something selected.
      canExecute: (ed: Editor, payload?: InsertWordCommentPayload) => {
        const selection = payload?.selection ?? ed.selection;
        return ed.isEditable && payload?.canApply?.() !== false && !!selection && selection.type === 'range' && !selection.collapsed;
      }
    });

    editor.registerCommand({
      name: 'replyToComment',
      execute: async (ed: Editor, payload?: { id?: string; text?: string }) =>
        await this._reply(ed, payload?.id, payload?.text ?? ''),
      canExecute: (ed: Editor, payload?: { id?: string }) => !!this._thread(ed, payload?.id)
    });

    /**
     * Change what an entry says.
     *
     * The text, not the author or the date: those record who wrote it and when,
     * and a comment that quietly changes attribution is worse than one that
     * cannot be corrected at all.
     */
    editor.registerCommand({
      name: 'editComment',
      execute: async (ed: Editor, payload?: { entrySid?: string; text?: string }) =>
        await this._edit(ed, payload?.entrySid, payload?.text ?? ''),
      canExecute: (ed: Editor, payload?: { entrySid?: string }) =>
        !!this._entryText(ed, payload?.entrySid)
    });

    editor.registerCommand({
      name: 'resolveComment',
      execute: async (ed: Editor, payload?: { id?: string; resolved?: boolean }) =>
        await this._resolve(ed, payload?.id, payload?.resolved !== false),
      canExecute: (ed: Editor, payload?: { id?: string }) => !!this._thread(ed, payload?.id)
    });

    editor.registerCommand({
      name: 'deleteComment',
      execute: async (ed: Editor, payload?: { id?: string }) => await this._delete(ed, payload?.id),
      canExecute: (ed: Editor, payload?: { id?: string }) => !!this._thread(ed, payload?.id)
    });
  }

  private _doc(editor: Editor): DocumentAccess {
    const store: any = editor.dataStore;
    return { getNode: (id: string) => store?.getNode?.(id), rootId: editor?.getRootId() ?? '' };
  }

  private _thread(editor: Editor, id: string | undefined) {
    if (!id) return undefined;
    return commentThreads(this._doc(editor)).find((thread) => thread.id === id);
  }

  /**
   * The run an entry's words are in.
   *
   * An entry is a block, so what it says lives in the text node inside it —
   * which is what has to be rewritten when somebody corrects themselves.
   */
  private _entryText(editor: Editor, entrySid: string | undefined): DocumentNode | undefined {
    if (!entrySid) return undefined;
    const doc = this._doc(editor);
    const entry = doc.getNode(entrySid);
    return childrenOf(doc, entry).find((child) => typeof child.text === 'string');
  }

  private async _edit(
    editor: Editor,
    entrySid: string | undefined,
    text: string
  ): Promise<boolean> {
    const run = this._entryText(editor, entrySid);
    if (!run?.sid) return false;

    const result = await transaction(editor, [
      { type: 'setText', payload: { nodeId: run.sid, text } }
    ] as never).commit();
    return result.success;
  }

  /**
   * Anchor a comment to the selection.
   *
   * One transaction for the mark and the thread: a mark pointing at a thread
   * that does not exist is a comment nobody can read, and a thread nothing
   * points at is a comment nobody can find. Neither half is worth having on its
   * own, so neither can be undone on its own.
   */
  private async _insert(
    editor: Editor,
    selection: ModelSelection | null | undefined,
    text: string,
    payload?: InsertWordCommentPayload
  ): Promise<boolean> {
    if (!editor.isEditable || payload?.canApply?.() === false || !selection || selection.type !== 'range' || selection.collapsed) return false;
    if (payload?.id !== undefined && (typeof payload.id !== 'string' || !payload.id.trim() || payload.id.length > 200)) return false;

    const canApply = payload?.canApply;
    const doc = this._doc(editor);
    const resources = childOfType(doc, doc.getNode(doc.rootId), 'resources');
    if (!resources?.sid) return false;

    const id = payload?.id ?? freeThreadId(doc);
    if (commentIdentityInUse(doc, id)) return false;
    const store = editor.dataStore, rootId = editor.getRootId(), epoch = store.getDocumentEpoch(), session = store.getSessionId();
    const root = rootId ? store.getNodes().get(rootId) : undefined;
    const beforeSelection = JSON.stringify(editor.selection), version = store.getVersion();
    const captured = structuredClone(selection);
    let retired = false;
    const retire = () => { retired = true; };
    const selectionChanged = () => { if (JSON.stringify(editor.selection) !== beforeSelection) retired = true; };
    editor.on('editor:content.change', retire); editor.on('editor:editable.change', retire);
    editor.on('editor:selection.model', selectionChanged); editor.on('editor:selection.change', selectionChanged);
    const validateIntent = () => {
      if (retired || !editor.isEditable || canApply?.() === false || editor.getRootId() !== rootId ||
        store.getDocumentEpoch() !== epoch || store.getSessionId() !== session || store.getNodes().get(rootId!) !== root ||
        store.getVersion() !== version || JSON.stringify(editor.selection) !== beforeSelection ||
        commentIdentityInUse({ rootId: rootId!, getNode: sid => store.getNodes().get(sid) }, id))
        return 'The comment target is no longer current';
    };
    try {
      const result = await transaction(
        editor,
        [
          {
            type: 'applyMark',
            payload: {
              range: {
                startNodeId: selection.startNodeId,
                startOffset: selection.startOffset,
                endNodeId: selection.endNodeId,
                endOffset: selection.endOffset
              },
              markType: 'commentRef',
              attrs: { id }
            }
          },
          {
            type: 'addChild',
            payload: {
              parentId: resources.sid,
              child: {
                stype: 'commentThread',
                attributes: { id, resolved: false },
                content: [entryNode(this._author, text)]
              }
            }
          },
          { type: 'setSelection', payload: { anchor: { nodeId: captured.startNodeId, offset: captured.startOffset },
            head: { nodeId: captured.endNodeId, offset: captured.endOffset } } }
        ] as never, { validateIntent, applySelectionToView: false }
      ).commit();

      return result.success;
    } finally {
      editor.off('editor:content.change', retire); editor.off('editor:editable.change', retire);
      editor.off('editor:selection.model', selectionChanged); editor.off('editor:selection.change', selectionChanged);
    }
  }

  private async _reply(editor: Editor, id: string | undefined, text: string): Promise<boolean> {
    const thread = this._thread(editor, id);
    if (!thread) return false;

    const result = await transaction(editor, [
      {
        type: 'addChild',
        payload: { parentId: thread.sid, child: entryNode(this._author, text) }
      }
    ] as never).commit();
    return result.success;
  }

  private async _resolve(
    editor: Editor,
    id: string | undefined,
    resolved: boolean
  ): Promise<boolean> {
    const thread = this._thread(editor, id);
    if (!thread) return false;

    const result = await transaction(editor, [
      { type: 'setAttrs', payload: { nodeId: thread.sid, attrs: { resolved } } }
    ] as never).commit();
    return result.success;
  }

  /**
   * Remove a comment, and the mark that pointed at it.
   *
   * Both, because leaving the mark would leave text highlighted as commented
   * with nothing to show when it is clicked.
   */
  private async _delete(editor: Editor, id: string | undefined): Promise<boolean> {
    const thread = this._thread(editor, id);
    if (!thread) return false;

    const operations: unknown[] = [];
    if (thread.anchor) {
      operations.push({
        type: 'removeMark',
        payload: {
          nodeId: thread.anchor.sid,
          markType: 'commentRef',
          range: [thread.anchor.start, thread.anchor.end]
        }
      });
    }

    const doc = this._doc(editor);
    const resources = childOfType(doc, doc.getNode(doc.rootId), 'resources');
    if (!resources?.sid) return false;
    operations.push({
      type: 'removeChild',
      payload: { parentId: resources.sid, childId: thread.sid }
    });

    const result = await transaction(editor, operations as never).commit();
    return result.success;
  }
}

export function createWordComments(author: CommentAuthor): WordCommentExtension {
  return new WordCommentExtension(author);
}
