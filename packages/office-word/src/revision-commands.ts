/**
 * Reviewing tracked changes: accept, reject, and moving between them.
 *
 * Recording a change and showing it is only half of review. Without these a
 * document that has been revised can never be finished — the marks accumulate
 * and there is no way to say yes or no to any of them, which is the reason the
 * feature exists.
 *
 * Each resolution is one transaction, so one undo takes it back. That matters
 * more here than elsewhere: accepting is destructive by design, and a reviewer
 * who accepts the wrong change needs the text back, not an apology.
 */
import { Editor, Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import type { DocumentAccess } from '@barocss/office-text';
import {
  revisionAfter,
  revisionAt,
  revisionById,
  revisions,
  type Revision
} from './revision-index';
import { resolveAllOps, resolveRevisionOps } from './revision-resolve';

export class WordRevisionExtension implements Extension {
  name = 'wordRevisions';
  priority = 40;

  onCreate(editor: Editor): void {
    const register = (
      name: string,
      execute: (ed: Editor, payload?: any) => Promise<boolean> | boolean,
      canExecute: (ed: Editor, payload?: any) => boolean
    ) => editor.registerCommand({ name, execute, canExecute });

    register(
      'acceptRevision',
      async (ed, payload) => await this._resolve(ed, payload?.id, 'accept'),
      (ed, payload) => !!this._target(ed, payload?.id)
    );

    register(
      'rejectRevision',
      async (ed, payload) => await this._resolve(ed, payload?.id, 'reject'),
      (ed, payload) => !!this._target(ed, payload?.id)
    );

    register(
      'acceptAllRevisions',
      async (ed) => await this._resolveAll(ed, 'accept'),
      (ed) => revisions(this._doc(ed)).length > 0
    );

    register(
      'rejectAllRevisions',
      async (ed) => await this._resolveAll(ed, 'reject'),
      (ed) => revisions(this._doc(ed)).length > 0
    );

    // Navigation is a command rather than a pane's private business so that a
    // keyboard shortcut and a button both reach the same place.
    /*
     * `_move` answers **which** revision it landed on, or `null` — and a command answers *whether it
     * ran*. The two were the same thing while the editor was reached through a cast: a string is
     * truthy, so the command "worked" and told every caller checking `=== true` that it had not.
     */
    register(
      'nextRevision',
      (ed, payload) => this._move(ed, payload?.from, 1) !== null,
      (ed) => revisions(this._doc(ed)).length > 0
    );

    register(
      'previousRevision',
      (ed, payload) => this._move(ed, payload?.from, -1) !== null,
      (ed) => revisions(this._doc(ed)).length > 0
    );
  }

  private _doc(editor: Editor): DocumentAccess {
    const store: any = editor.dataStore;
    return { getNode: (id: string) => store?.getNode?.(id), rootId: editor?.getRootId() ?? '' };
  }

  /**
   * The revision a command acts on: the one named, or the one the caret is in.
   *
   * Naming one is what a pane does; falling back to the caret is what a toolbar
   * button does, and Word's Accept behaves the same way.
   */
  private _target(editor: Editor, id: string | undefined): Revision | undefined {
    const doc = this._doc(editor);
    if (id) return revisionById(doc, id);

    const selection: any = editor.selection;
    const position =
      selection?.type === 'range'
        ? { sid: selection.startNodeId, offset: selection.startOffset }
        : null;
    return revisionAt(doc, position);
  }

  private async _resolve(
    editor: Editor,
    id: string | undefined,
    action: 'accept' | 'reject'
  ): Promise<boolean> {
    const doc = this._doc(editor);
    const revision = this._target(editor, id);
    if (!revision) return false;

    const ops = resolveRevisionOps(doc, revision, action);
    if (ops.length === 0) return false;

    const result = await transaction(editor, ops as never).commit();
    return result.success;
  }

  private async _resolveAll(editor: Editor, action: 'accept' | 'reject'): Promise<boolean> {
    const doc = this._doc(editor);
    const all = revisions(doc);
    if (all.length === 0) return false;

    // One transaction for the lot. Accepting sixty changes and then wanting them
    // back is not sixty undos.
    const ops = resolveAllOps(doc, all, action);
    if (ops.length === 0) return false;

    const result = await transaction(editor, ops as never).commit();
    return result.success;
  }

  /** Put the caret at the start of the next revision, and say which it is. */
  private _move(editor: Editor, from: string | undefined, step: 1 | -1): string | null {
    const doc = this._doc(editor);
    const current = from ?? this._target(editor, undefined)?.id;
    const next = revisionAfter(doc, current, step);
    const span = next?.spans[0];
    if (!next || !span) return null;

    editor.updateSelection({
      type: 'range',
      startNodeId: span.sid,
      startOffset: span.start,
      endNodeId: span.sid,
      endOffset: span.end,
      collapsed: false
    });

    return next.id;
  }
}

export function createWordRevisions(): WordRevisionExtension {
  return new WordRevisionExtension();
}
