import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { hasRange } from './guards';
import { transaction, addChild, applyMark } from '@barocss/model';

export class FootnoteExtension implements Extension {
  name = 'footnote';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertFootnote',
      execute: async (ed: Editor, payload?: { id?: string; text?: string; selection?: ModelSelection }) =>
        await insertNote(ed, 'footnote', payload),
      /**
       * A **range**, which the run has always required and this did not say.
       *
       * `canExecute: () => true` over an insert that needs somewhere to go: with a node held or
       * nothing selected the control lights up, the reader presses it, and the refusal goes to a
       * console nobody is watching — the class `guards.ts` names, and the one a **builder** meets
       * most, because a deck and a page builder spend their time with a box selected rather than a
       * caret.
       *
       * Invisible until the probe was given the two states a builder has: it had only ever put a
       * caret in a run, where every one of these works.
       */
      /*
       * An **id** as well as a range. A footnote's body lives in `resources` and the reference names
       * it; without one the run refuses, and the guard asked only about the range — so 각주 lit up
       * before a reader had one to insert.
       */
      canExecute: (ed: Editor, payload?: { id?: string; selection?: ModelSelection }) =>
        !!payload?.id && hasRange(ed, payload, 'something') && !!bodyHolder(ed)
    });

    (editor as any).registerCommand({
      name: 'insertFootnoteRef',
      execute: async (ed: Editor, payload?: { id?: string; selection?: ModelSelection }) => {
        if (!payload?.id) return false;
        const sel = payload?.selection || (ed as any).selection;
        if (!sel || sel.type !== 'range') return false;

        const op = applyMark(
          sel.startNodeId, sel.startOffset,
          sel.endNodeId, sel.endOffset,
          'footnoteRef', { id: payload.id }
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      /**
       * A **range**, which the run has always required and this did not say.
       *
       * `canExecute: () => true` over an insert that needs somewhere to go: with a node held or
       * nothing selected the control lights up, the reader presses it, and the refusal goes to a
       * console nobody is watching — the class `guards.ts` names, and the one a **builder** meets
       * most, because a deck and a page builder spend their time with a box selected rather than a
       * caret.
       *
       * Invisible until the probe was given the two states a builder has: it had only ever put a
       * caret in a run, where every one of these works.
       */
      /*
       * A range covering **something**, not just a range. A reference is a *mark*, and a mark over
       * zero characters is written nowhere — so over a caret this committed and drew nothing, the
       * loose half of a guard that had just been tightened about the id. The same sentence as
       * `font-size.ts`, for the same reason, three files later.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        hasRange(ed, payload, 'something')
    });
  }

  onDestroy(_editor: Editor): void {}
}

/**
 * Where a footnote's body goes: the document's `resources` if it has one, otherwise the root.
 *
 * Both answers are right, in different schemas, and that is why this is a lookup rather than a
 * constant. Office re-declares `footnoteDef` as a **resource**, reachable through `resources` and
 * nowhere else, so a body cannot sit between two paragraphs — which is what Word, the deck and a page
 * all use. The standard schema leaves it a plain block, and there a document with no `resources` node
 * at all is the normal case; demanding one there would grey 각주 for ever.
 *
 * Asked by the guard as well as by the run, so the two cannot come apart.
 */
function bodyHolder(editor: Editor): string | undefined {
  const store = editor.dataStore as
    | {
        getRootNodeId?: () => string;
        getNode: (id: string) => { sid?: string; stype?: string; content?: unknown[] } | undefined;
      }
    | undefined;
  if (!store) return undefined;

  /*
   * The **editor's** root, not a guess at its name. This asked the store for `getRootNodeId?.()` and
   * fell back to the literal `'document'`, which is not a sid — it is the *type* — so on any editor
   * whose store does not carry that method the lookup found nothing and 미주 greyed out everywhere.
   * `getRootId()` is what the rest of this repository asks, and it is on the editor for a reason.
   */
  const rootId = (editor as { getRootId?: () => string }).getRootId?.() ?? store.getRootNodeId?.();
  const root = rootId ? store.getNode(rootId) : undefined;
  if (!root) return undefined;

  for (const sid of (root.content ?? []) as unknown[]) {
    if (typeof sid !== 'string') continue;
    if (store.getNode(sid)?.stype === 'resources') return sid;
  }
  return root.sid ?? rootId;
}

/**
 * The endnote — the same pair of gestures, one node type down.
 *
 * ## Why it is here and why it was not
 *
 * `endnoteDef` has been in both schemas as long as `footnoteDef`, `office-text` already draws an
 * `endnoteRef` in superscript, and Word has bound ⌥⌘D to `insertEndnote` since its first key map —
 * naming a command **no product installed**. Found by asking whether every chord a product prints
 * names a command it registers: Word printed 72 and answered 68.
 *
 * The command did exist, in `doc-structure.ts`, and building this turned up what it was: an *empty*
 * `endnoteDef` put into the flow with **no reference pointing at it**. A body nothing refers to is
 * not a note; and the mark that would refer to it, `endnoteRef`, was never declared at all, so there
 * was no way to write one. Under the office schema it is worse than incomplete — `endnoteDef` is a
 * resource there and cannot sit in the flow, so every insert built a tree the validator refused.
 *
 * So this is the endnote's first working form, and `doc-structure.ts` no longer registers the name:
 * one name, one command.
 *
 * ## Why a separate extension rather than two more commands above
 *
 * A product chooses. Word has both notes; a deck and a page have neither, and a note at the end of a
 * *page* is not a thing. Installing them together would put 미주 on surfaces where it means nothing,
 * which is the decision `site-kit.ts` makes explicitly about Word's pagination.
 */
export class EndnoteExtension implements Extension {
  name = 'endnote';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as Editor & { registerCommand: (c: unknown) => void }).registerCommand({
      name: 'insertEndnote',
      execute: async (ed: Editor, payload?: { id?: string; text?: string; selection?: ModelSelection }) =>
        await insertNote(ed, 'endnote', payload),
      canExecute: (ed: Editor, payload?: { id?: string; selection?: ModelSelection }) =>
        !!payload?.id && hasRange(ed, payload, 'something') && !!bodyHolder(ed)
    });

    (editor as Editor & { registerCommand: (c: unknown) => void }).registerCommand({
      name: 'insertEndnoteRef',
      execute: async (ed: Editor, payload?: { id?: string; selection?: ModelSelection }) => {
        if (!payload?.id) return false;
        const sel = payload?.selection ?? (ed as { selection?: ModelSelection }).selection;
        if (!sel || sel.type !== 'range') return false;

        const op = applyMark(
          sel.startNodeId, sel.startOffset,
          sel.endNodeId, sel.endOffset,
          'endnoteRef', { id: payload.id }
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      canExecute: (ed: Editor, payload?: { id?: string; selection?: ModelSelection }) =>
        !!payload?.id && hasRange(ed, payload, 'something')
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createEndnoteExtension(): EndnoteExtension {
  return new EndnoteExtension();
}

/**
 * Insert a note: its body into the document's resources, a reference mark over the selected words.
 *
 * One function for both kinds, because they differ only in two node names — and the footnote's half
 * of it is where the fault that started all this lived, so the endnote inherits the fix rather than a
 * copy of the code.
 *
 * **Into `resources`**, which is the one place a body is allowed to be. It used to go to the document
 * root, and the office schema says `document` holds `docMeta? surface+ resources?` and re-declares
 * `footnoteDef` as a *resource* precisely so that a body cannot sit between two paragraphs. So every
 * insert built a tree the validator refused, the transaction rolled back, and 각주 did nothing — in
 * Word, in the deck and on a page, since the day it was written. Then one layer down, `footnoteDef`
 * held `block+` in office and `inline*` in the standard schema and this wrote the inline one, so no
 * footnote had ever been inserted in any product. The schema says `block+` in both places now, which
 * is what Word's own sample document had been writing all along.
 */
async function insertNote(
  ed: Editor,
  kind: 'footnote' | 'endnote',
  payload?: { id?: string; text?: string; selection?: ModelSelection }
): Promise<boolean> {
  if (!payload?.id) return false;
  const sel = payload?.selection ?? (ed as { selection?: ModelSelection }).selection;
  if (!sel || sel.type !== 'range') return false;

  const holder = bodyHolder(ed);
  if (!holder) return false;

  const body = {
    stype: kind === 'footnote' ? 'footnoteDef' : 'endnoteDef',
    attributes: { id: payload.id },
    // A body holds blocks — see `footnoteDef` in the schema. The text goes in a paragraph.
    content: [
      { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: payload?.text ?? '' }] }
    ]
  };

  const ops: unknown[] = [
    addChild(holder, body as never),
    applyMark(
      sel.startNodeId, sel.startOffset,
      sel.endNodeId, sel.endOffset,
      kind === 'footnote' ? 'footnoteRef' : 'endnoteRef',
      { id: payload.id }
    )
  ];

  const result = await transaction(ed, ops as never, { applySelectionToView: true }).commit();
  return result.success;
}

export function createFootnoteExtension(): FootnoteExtension {
  return new FootnoteExtension();
}
