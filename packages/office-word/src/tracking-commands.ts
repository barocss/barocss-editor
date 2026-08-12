/**
 * Editing while changes are being tracked.
 *
 * The document's `trackRevisions` switch existed and nothing read it: turning
 * tracking on changed nothing, and the revisions on screen were marks somebody
 * had written into the file by hand. This is what makes the switch mean
 * something.
 *
 * Deletion is wrapped and insertion is not. A tracked delete is a different
 * operation — the text stays and is marked — so it has to be decided before the
 * original runs. A tracked insert is the same operation with a mark added, so it
 * runs first and is marked after, which keeps the typing path exactly as it was.
 * That path was measured into shape earlier and is not worth disturbing for a
 * mark that can be applied a moment later.
 *
 * What the rules are lives in revision-record, with a test per case.
 */
import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import type { CommentAuthor } from './comment-commands';
import {
  backspaceTargetOffset,
  recordDeletion,
  recordInsertion,
  type CoveredRun,
  type Reviewer,
  type RunMark
} from './revision-record';

/** The deletes that become proposals while tracking is on. */
const DELETE_COMMANDS = ['backspace', 'deleteForward', 'deleteWordBackward', 'deleteWordForward'];

export class WordTrackingExtension implements Extension {
  name = 'wordTracking';
  // After the commands it wraps, so the wrapper is what the editor holds.
  priority = 45;

  private _revision = 0;

  constructor(private readonly _author: CommentAuthor) {}

  onCreate(editor: Editor): void {
    for (const name of DELETE_COMMANDS) this._wrapDelete(editor, name);
    this._wrapInsert(editor);
  }

  /** True when this document is collecting changes rather than making them. */
  private _tracking(editor: Editor): boolean {
    const store: any = (editor as any).dataStore;
    const root = store?.getNode?.((editor as any).getRootId?.());
    if (!root) return false;

    for (const childId of root.content ?? []) {
      const child = typeof childId === 'string' ? store.getNode(childId) : childId;
      if (child?.stype !== 'resources') continue;
      for (const resourceId of child.content ?? []) {
        const resource = typeof resourceId === 'string' ? store.getNode(resourceId) : resourceId;
        if (resource?.stype === 'docSettings') {
          return resource.attributes?.trackRevisions === true;
        }
      }
    }
    return false;
  }

  private _reviewer(): Reviewer {
    return {
      author: this._author.name,
      date: this._author.date(),
      nextId: () => `rev-${this._author.name}-${++this._revision}`
    };
  }

  private _command(editor: Editor, name: string): any {
    return (editor as any)._commands?.get(name);
  }

  /**
   * The runs a selection covers, with the marks already on them.
   *
   * Only inline text: a selection that reaches a picture or a table has
   * structure in it, and structure is not something a range of marks can
   * describe. Those fall through to the ordinary delete.
   */
  private _runsOf(editor: Editor, selection: ModelSelection): CoveredRun[] | null {
    const store: any = (editor as any).dataStore;
    if (!store || selection.type !== 'range') return null;

    const ids: string[] =
      selection.startNodeId === selection.endNodeId
        ? [selection.startNodeId]
        : Array.from(
            store.createRangeIterator?.(selection.startNodeId, selection.endNodeId, {
              includeStart: true,
              includeEnd: true
            }) ?? []
          );

    const runs: CoveredRun[] = [];
    for (const sid of ids) {
      const node = store.getNode(sid);
      if (!node || node.stype !== 'inline-text' || typeof node.text !== 'string') return null;

      const start = sid === selection.startNodeId ? selection.startOffset : 0;
      const end = sid === selection.endNodeId ? selection.endOffset : node.text.length;
      if (end <= start) continue;

      runs.push({ sid, start, end, marks: (node.marks ?? []) as RunMark[] });
    }

    return runs.length > 0 ? runs : null;
  }

  /**
   * What a collapsed Backspace should cover.
   *
   * Text already proposed for removal is stepped over rather than proposed
   * again, or the caret sits in front of a character that will not go and the
   * key looks broken.
   */
  private _backspaceRange(editor: Editor, selection: ModelSelection): ModelSelection | null {
    const store: any = (editor as any).dataStore;
    const node = store?.getNode?.(selection.startNodeId);
    if (!node || node.stype !== 'inline-text') return null;

    const to = backspaceTargetOffset((node.marks ?? []) as RunMark[], selection.startOffset);
    if (to === selection.startOffset) return null;

    return {
      type: 'range',
      startNodeId: selection.startNodeId,
      startOffset: to,
      endNodeId: selection.startNodeId,
      endOffset: selection.startOffset
    } as ModelSelection;
  }

  private _wrapDelete(editor: Editor, name: string): void {
    const original = this._command(editor, name);
    if (!original) return;

    (editor as any).registerCommand({
      ...original,
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection: ModelSelection | undefined = payload?.selection ?? (ed as any).selection;

        if (!this._tracking(ed) || !selection || selection.type !== 'range') {
          return await original.execute(ed, payload);
        }

        // A collapsed caret at the very start of a run is a block boundary — a
        // merge, not a range of characters — and a merge is structure. Word
        // records those too; this does not yet, and passing it on is the honest
        // thing rather than dropping the keystroke.
        const range =
          selection.collapsed || selection.startOffset === selection.endOffset
            ? name === 'backspace'
              ? this._backspaceRange(ed, selection)
              : null
            : selection;

        if (!range) return await original.execute(ed, payload);

        const runs = this._runsOf(ed, range);
        if (!runs) return await original.execute(ed, payload);

        const ops = recordDeletion(runs, this._reviewer());
        if (ops.length === 0) {
          // Everything covered was already proposed for removal. Nothing to
          // record, but the caret still steps over it.
          this._moveCaret(ed, range.startNodeId, range.startOffset);
          return true;
        }

        const result = await transaction(ed, ops as never).commit();
        if (!result.success) return false;

        this._moveCaret(ed, range.startNodeId, range.startOffset);
        return true;
      }
    });
  }

  /**
   * Mark what was typed, after it has been typed.
   *
   * The range comes back from the command's own answer — where the caret ended
   * up — rather than from the range it was given, which is one edit behind by
   * the time this runs.
   */
  private _wrapInsert(editor: Editor): void {
    const original = this._command(editor, 'replaceText');
    if (!original) return;

    (editor as any).registerCommand({
      ...original,
      execute: async (ed: Editor, payload?: { range?: ModelSelection; text?: string }) => {
        const done = await original.execute(ed, payload);
        if (!done || !this._tracking(ed)) return done;

        const text = payload?.text ?? '';
        if (text.length === 0) return done;

        const after: any = (ed as any).selection;
        if (!after || after.type !== 'range') return done;

        const store: any = (ed as any).dataStore;
        const node = store?.getNode?.(after.startNodeId);
        if (!node || node.stype !== 'inline-text') return done;

        const end = after.startOffset;
        const ops = recordInsertion(
          {
            sid: after.startNodeId,
            start: Math.max(0, end - text.length),
            end,
            marks: (node.marks ?? []) as RunMark[]
          },
          this._reviewer()
        );
        if (ops.length === 0) return done;

        await transaction(ed, ops as never).commit();
        return done;
      }
    });
  }

  /** Put the caret where the deleted text would have left it. */
  private _moveCaret(editor: Editor, sid: string, offset: number): void {
    (editor as any).updateSelection({
      type: 'range',
      startNodeId: sid,
      startOffset: offset,
      endNodeId: sid,
      endOffset: offset,
      collapsed: true
    });
  }
}

export function createWordTracking(author: CommentAuthor): WordTrackingExtension {
  return new WordTrackingExtension(author);
}
