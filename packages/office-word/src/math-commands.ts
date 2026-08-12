/**
 * Writing an equation with the keyboard.
 *
 * Tab moves to the next slot, Shift+Tab to the previous, and at the end of the
 * equation Tab does what Tab does everywhere else. That last part is why this is
 * one command rather than a keybinding condition: the dispatcher runs the first
 * binding that matches and prevents the key regardless of whether the command
 * declined, so a Tab that is sometimes navigation and sometimes indentation has
 * to decide inside itself.
 *
 * Where the slots are is worked out in math-navigation, with a test per case.
 */
import { Editor, Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import type { DocumentAccess, DocumentNode } from './document-access';
import { caretRunOf, enclosingMath, nextSlot } from './math-navigation';

export class WordMathExtension implements Extension {
  name = 'wordMath';
  priority = 40;

  onCreate(editor: Editor): void {
    // `inEquation` is what scopes the Tab binding. Kept up to date here rather
    // than decided inside the command, so that outside an equation the key
    // resolves to whatever else claims it — cell navigation in a table, and
    // nothing at all in ordinary text, which is what Word's keymap says.
    const track = () => {
      const selection: any = (editor as any).selection;
      const inside =
        selection?.type === 'range' && !!enclosingMath(this._doc(editor), selection.startNodeId);
      (editor as any).setContext('inEquation', inside);
    };
    editor.on('editor:selection.model', track);
    editor.on('editor:selection.change', track);
    editor.on('editor:content.change', track);
    track();

    (editor as any).registerCommand({
      name: 'nextMathSlot',
      execute: async (ed: Editor) => await this._move(ed, 1),
      canExecute: () => true
    });

    (editor as any).registerCommand({
      name: 'previousMathSlot',
      execute: async (ed: Editor) => await this._move(ed, -1),
      canExecute: () => true
    });
  }

  private _doc(editor: Editor): DocumentAccess {
    const store: any = (editor as any).dataStore;
    return { getNode: (id: string) => store?.getNode?.(id), rootId: (editor as any).getRootId?.() };
  }

  /**
   * Move to the next slot, or hand the key back if there is nowhere to go.
   *
   * Returns false when this was not the caret's business, which is what tells
   * the keymap's fallback to run — and outside an equation that is every press.
   */
  private async _move(editor: Editor, step: 1 | -1): Promise<boolean> {
    const doc = this._doc(editor);
    const selection: any = (editor as any).selection;
    if (!selection || selection.type !== 'range') return false;

    const math = enclosingMath(doc, selection.startNodeId);
    if (!math) return false;

    const slot = nextSlot(doc, selection.startNodeId, step);
    // Out of slots: the author has finished with the equation, so Tab takes them
    // out of it rather than back to the numerator — a wrap would be a trap they
    // could only leave with the mouse.
    if (!slot?.sid) return this._leave(editor, math, step);

    const run = caretRunOf(doc, slot);
    const sid = run?.sid ?? (await this._fillEmptySlot(editor, slot));
    if (!sid) return false;

    const text = String(this._doc(editor).getNode(sid)?.text ?? '');
    (editor as any).updateSelection({
      type: 'range',
      startNodeId: sid,
      startOffset: 0,
      endNodeId: sid,
      // Word selects what is in the slot you land on, so typing replaces it —
      // which is what makes filling a structure in order feel like filling a
      // form rather than like editing.
      endOffset: text.length,
      collapsed: text.length === 0
    });

    return true;
  }

  /**
   * Give an empty slot something to put the caret in.
   *
   * A slot with nothing in it has no text node, and a caret needs one. Word's
   * empty slots are real places for the same reason.
   */
  private async _fillEmptySlot(editor: Editor, slot: DocumentNode): Promise<string | null> {
    const store: any = (editor as any).dataStore;
    if (!store?.createNodeWithChildren || !slot.sid) return null;

    const created = store.createNodeWithChildren({
      stype: 'mathRun',
      content: [{ stype: 'inline-text', text: '' }]
    });

    const result = await transaction(editor, [
      // `child`, which is what the operation reads. It was `node` and the
      // transaction threw the value away: the slot stayed empty, the caret had
      // nowhere to go, and Tab looked broken.
      { type: 'addChild', payload: { parentId: slot.sid, child: created } }
    ] as never).commit();
    if (!result.success) return null;

    return caretRunOf(this._doc(editor), this._doc(editor).getNode(slot.sid))?.sid ?? null;
  }

  /**
   * Step out of the equation, to the text on the far side of it.
   *
   * Only if there is somewhere to go: an equation at the very end of its
   * paragraph has nothing after it, and moving the caret to a place that does
   * not exist is worse than leaving it where it is.
   */
  private _leave(editor: Editor, math: DocumentNode, step: 1 | -1): boolean {
    const doc = this._doc(editor);
    const parent = math.parentId ? doc.getNode(math.parentId) : undefined;
    const siblings = (parent?.content ?? []).map((child: any) =>
      typeof child === 'string' ? doc.getNode(child) : child
    );

    const at = siblings.findIndex((each: any) => each?.sid === math.sid);
    const target = siblings[at + step];
    if (!target?.sid || typeof target.text !== 'string') return false;

    const offset = step === 1 ? 0 : target.text.length;
    (editor as any).updateSelection({
      type: 'range',
      startNodeId: target.sid,
      startOffset: offset,
      endNodeId: target.sid,
      endOffset: offset,
      collapsed: true
    });
    return true;
  }
}

export function createWordMath(): WordMathExtension {
  return new WordMathExtension();
}
