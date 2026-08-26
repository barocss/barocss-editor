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
import type { DocumentAccess, DocumentNode } from '@barocss/office-text';
import { caretRunOf, enclosingMath, nextSlot } from './math-navigation';
import { buildUp, linearOf, type MathNode } from './math-buildup';

export class WordMathExtension implements Extension {
  name = 'wordMath';
  priority = 40;

  onCreate(editor: Editor): void {
    // `inEquation` is what scopes the Tab binding. Kept up to date here rather
    // than decided inside the command, so that outside an equation the key
    // resolves to whatever else claims it — cell navigation in a table, and
    // nothing at all in ordinary text, which is what Word's keymap says.
    const track = () => {
      const selection: any = editor.selection;
      const inside =
        selection?.type === 'range' && !!enclosingMath(this._doc(editor), selection.startNodeId);
      editor.setContext('inEquation', inside);
    };
    /**
     * Whether the text just before the caret is an equation waiting to be built.
     *
     * A context key rather than a decision inside the command, for the same
     * reason Tab's is: the dispatcher runs the first binding that matches and
     * prevents the key either way, so a Space bound unconditionally would be a
     * Space that never reaches the document.
     */
    const trackBuildUp = () => {
      editor.setContext('canBuildUpMath', !!this._pending(editor));
    };
    editor.on('editor:selection.model', trackBuildUp);
    editor.on('editor:content.change', trackBuildUp);
    trackBuildUp();

    editor.registerCommand({
      name: 'buildUpMath',
      execute: async (ed: Editor) => await this._buildUp(ed),
      canExecute: (ed: Editor) => !!this._pending(ed)
    });

    editor.on('editor:selection.model', track);
    editor.on('editor:selection.change', track);
    editor.on('editor:content.change', track);
    track();

    /**
     * Word's linear view, as a toggle.
     *
     * An equation has a two-dimensional form and a one-dimensional one, and an
     * author rewriting a whole formula would rather edit the line than click
     * through the slots. Going the other way is build-up, which is already a
     * command — so this is one button with two directions and no third state.
     */
    editor.registerCommand({
      name: 'toggleMathLinear',
      execute: async (ed: Editor) =>
        enclosingMath(this._doc(ed), (ed as any).selection?.startNodeId)
          ? await this._flatten(ed)
          : await this._buildUp(ed),
      canExecute: (ed: Editor) =>
        !!enclosingMath(this._doc(ed), (ed as any).selection?.startNodeId) || !!this._pending(ed)
    });

    editor.registerCommand({
      name: 'nextMathSlot',
      execute: async (ed: Editor) => await this._move(ed, 1),
      canExecute: () => true
    });

    editor.registerCommand({
      name: 'previousMathSlot',
      execute: async (ed: Editor) => await this._move(ed, -1),
      canExecute: () => true
    });
  }

  /**
   * The stretch of text before the caret that would become an equation.
   *
   * Back to the last space, which is where the author last paused — the linear
   * format has no other terminator, and Word takes the same view. Null when
   * there is nothing there or when what is there is only words.
   */
  private _pending(
    editor: Editor
  ): { sid: string; start: number; end: number; nodes: MathNode[] } | null {
    const selection: any = editor.selection;
    if (!selection || selection.type !== 'range' || !selection.collapsed) return null;

    const store: any = editor.dataStore;
    const node = store?.getNode?.(selection.startNodeId);
    if (!node || node.stype !== 'inline-text' || typeof node.text !== 'string') return null;

    // Not inside an equation already: there the linear format is what is being
    // edited, and building it up again would fight the author.
    if (enclosingMath(this._doc(editor), selection.startNodeId)) return null;

    const end = selection.startOffset;
    const text = node.text.slice(0, end);
    const start = text.lastIndexOf(' ') + 1;
    const candidate = text.slice(start);
    if (candidate.length === 0) return null;

    const nodes = buildUp(candidate);
    return nodes ? { sid: selection.startNodeId, start, end, nodes } : null;
  }

  /**
   * Replace the typed line with the equation it describes.
   *
   * The space that triggered it is consumed, which is what Word does: it was the
   * instruction to build up, not a character the author wanted.
   */
  private async _buildUp(editor: Editor): Promise<boolean> {
    const pending = this._pending(editor);
    if (!pending) return false;

    const store: any = editor.dataStore;
    const math = store?.createNodeWithChildren?.({ stype: 'oMath', content: pending.nodes });
    if (!math) return false;

    const node = store.getNode(pending.sid);
    const parentId = node?.parentId;
    if (!parentId) return false;

    const siblings = (store.getNode(parentId)?.content ?? []) as any[];
    const at = siblings.findIndex((child: any) => (child?.sid ?? child) === pending.sid);

    const result = await transaction(editor, [
      {
        type: 'deleteTextRange',
        payload: { nodeId: pending.sid, start: pending.start, end: pending.end }
      },
      { type: 'addChild', payload: { parentId, child: math, position: at + 1 } }
    ] as never).commit();

    return result.success;
  }

  /**
   * Replace the equation the caret is in with the line it came from.
   *
   * The text goes where the equation was, so the sentence around it is
   * undisturbed, and pressing the button again — or a space — builds it back up.
   */
  private async _flatten(editor: Editor): Promise<boolean> {
    const doc = this._doc(editor);
    const math = enclosingMath(doc, editor.selection?.startNodeId);
    if (!math?.sid || !math.parentId) return false;

    const store: any = editor.dataStore;
    const line = linearOf((math.content ?? []).map((child: any) =>
      typeof child === 'string' ? store.getNode(child) : child
    ) as MathNode[]);
    if (line.length === 0) return false;

    const siblings = (store.getNode(math.parentId)?.content ?? []) as any[];
    const at = siblings.findIndex((child: any) => (child?.sid ?? child) === math.sid);
    const text = store.createNodeWithChildren({ stype: 'inline-text', text: line });

    const result = await transaction(editor, [
      { type: 'addChild', payload: { parentId: math.parentId, child: text, position: at + 1 } },
      { type: 'delete', payload: { nodeId: math.sid } }
    ] as never).commit();

    return result.success;
  }

  private _doc(editor: Editor): DocumentAccess {
    const store: any = editor.dataStore;
    return { getNode: (id: string) => store?.getNode?.(id), rootId: editor?.getRootId() ?? '' };
  }

  /**
   * Move to the next slot, or hand the key back if there is nowhere to go.
   *
   * Returns false when this was not the caret's business, which is what tells
   * the keymap's fallback to run — and outside an equation that is every press.
   */
  private async _move(editor: Editor, step: 1 | -1): Promise<boolean> {
    const doc = this._doc(editor);
    const selection: any = editor.selection;
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
    editor.updateSelection({
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
    const store: any = editor.dataStore;
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
    editor.updateSelection({
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
