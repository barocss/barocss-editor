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
  completesMove,
  recordDeletion,
  recordFormatChange,
  recordInsertion,
  recordMoveFrom,
  recordMoveTo,
  recordParagraphMerge,
  type CoveredRun,
  type PendingMove,
  type Reviewer,
  type RunMark
} from './revision-record';

/** The deletes that become proposals while tracking is on. */
const DELETE_COMMANDS = ['backspace', 'deleteForward', 'deleteWordBackward', 'deleteWordForward'];

/**
 * The commands that change how text looks rather than what it says.
 *
 * Listed rather than detected: a command that reformats and one that edits are
 * indistinguishable from outside, and guessing wrong in either direction is
 * worse than a list somebody has to keep up to date. A name that is not
 * registered is skipped, so the list may name more than a given kit provides.
 */
const FORMAT_COMMANDS = [
  'toggleBold',
  'toggleItalic',
  'toggleUnderline',
  'toggleStrikeThrough',
  'toggleSubscript',
  'toggleSuperscript',
  'toggleSmallCaps',
  'toggleHighlight',
  'toggleCode',
  'setFontFamily',
  'setFontSize',
  'setFontColor',
  'setBgColor',
  'removeFontFamily',
  'removeFontSize',
  'removeFontColor',
  'removeBgColor',
  'setAlignment',
  'alignLeft',
  'alignCenter',
  'alignRight',
  'alignJustify',
  'setHeading',
  'setParagraph',
  'indentText',
  'outdentText'
];

export class WordTrackingExtension implements Extension {
  name = 'wordTracking';
  // After the commands it wraps, so the wrapper is what the editor holds.
  priority = 45;

  private _revision = 0;

  constructor(private readonly _author: CommentAuthor) {}

  onCreate(editor: Editor): void {
    for (const name of DELETE_COMMANDS) this._wrapDelete(editor, name);
    for (const name of FORMAT_COMMANDS) this._wrapFormat(editor, name);
    this._wrapInsert(editor);
    this._wrapMove(editor);
  }

  /** The cut waiting to be recognised as the first half of a move. */
  private _pendingMove: PendingMove | null = null;

  /** True when this document is collecting changes rather than making them. */
  private _tracking(editor: Editor): boolean {
    const store: any = editor.dataStore;
    const root = store?.getNode?.(editor?.getRootId());
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
    const store: any = editor.dataStore;
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
    const store: any = editor.dataStore;
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

    editor.registerCommand({
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

        // Nothing behind the caret in this run: Backspace here joins this block
        // to the one above, and what is being proposed is the boundary rather
        // than any text.
        if (!range) {
          const merge = name === 'backspace' ? this._recordMerge(ed, selection) : null;
          if (merge) return merge;
          return await original.execute(ed, payload);
        }

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

    editor.registerCommand({
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

  /**
   * Propose joining this block to the one before it.
   *
   * Only at the very start of the first run of a block — anywhere else there is
   * text behind the caret and an ordinary delete applies. Returns true when the
   * boundary was recorded, so the caller stops rather than falling through to a
   * merge that would actually happen.
   */
  private _recordMerge(editor: Editor, selection: ModelSelection): boolean | null {
    if (selection.startOffset !== 0) return null;

    const store: any = editor.dataStore;
    const run = store?.getNode?.(selection.startNodeId);
    const block = run?.parentId ? store.getNode(run.parentId) : undefined;
    if (!block?.sid) return null;

    // The first run only: a caret at offset 0 of the second run has the first
    // run's text behind it, and joining blocks is not what Backspace means
    // there.
    const first = (block.content ?? [])[0];
    const firstSid = typeof first === 'string' ? first : first?.sid;
    if (firstSid !== selection.startNodeId) return null;

    const ops = recordParagraphMerge(block.sid, { ...(block.attributes ?? {}) }, this._reviewer());
    // Already proposed: the caret should step past the boundary rather than
    // propose it again, which for now means leaving it where it is.
    if (ops.length === 0) return true;

    void transaction(editor, ops as never).commit();
    return true;
  }

  /**
   * Record what a formatting command changed, once it has changed it.
   *
   * The before-state is read first because the command is about to overwrite it,
   * and it is both the node's attributes and its marks: bold is a mark over
   * characters, alignment is a property of the paragraph, and a reviewer cannot
   * be expected to know which of their toolbar buttons is which.
   */
  private _wrapFormat(editor: Editor, name: string): void {
    const original = this._command(editor, name);
    if (!original) return;

    editor.registerCommand({
      ...original,
      execute: async (ed: Editor, payload?: any) => {
        if (!this._tracking(ed)) return await original.execute(ed, payload);

        const selection: ModelSelection | undefined = payload?.selection ?? (ed as any).selection;
        const runs = selection ? this._runsOf(ed, selection) : null;
        const store: any = (ed as any).dataStore;

        const before = (runs ?? []).map((run) => ({
          run,
          was: {
            attributes: { ...(store?.getNode?.(run.sid)?.attributes ?? {}) },
            marks: JSON.parse(JSON.stringify(run.marks)) as RunMark[]
          }
        }));

        const done = await original.execute(ed, payload);
        if (!done || before.length === 0) return done;

        const reviewer = this._reviewer();
        const ops = before.flatMap(({ run, was }) => {
          const now = store?.getNode?.(run.sid);
          return recordFormatChange({ ...run, marks: (now?.marks ?? []) as RunMark[] }, was, reviewer);
        });
        if (ops.length > 0) await transaction(ed, ops as never).commit();

        return done;
      }
    });
  }

  /**
   * Cut and paste, recorded as one move rather than two unrelated changes.
   *
   * A reviewer shown a deletion here and an addition there has to work out that
   * they are the same words; accepting only one loses the text or leaves two
   * copies of it.
   */
  private _wrapMove(editor: Editor): void {
    const cut = this._command(editor, 'cut');
    const paste = this._command(editor, 'paste');
    if (!cut || !paste) return;

    editor.registerCommand({
      ...cut,
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection: ModelSelection | undefined = payload?.selection ?? (ed as any).selection;
        if (!this._tracking(ed) || !selection || selection.type !== 'range') {
          this._pendingMove = null;
          return await cut.execute(ed, payload);
        }

        const runs = this._runsOf(ed, selection);
        if (!runs) return await cut.execute(ed, payload);

        // The clipboard still gets the text — a tracked cut is still a cut as
        // far as the rest of the machine is concerned. What changes is that the
        // document keeps it, marked as having moved away.
        const text = runs.map((run) => this._textOf(ed, run)).join('');
        const reviewer = this._reviewer();
        const move: PendingMove = {
          moveId: `move-${reviewer.author}-${++this._revision}`,
          text,
          author: reviewer.author
        };

        const ops = recordMoveFrom(runs, move, reviewer);
        if (ops.length === 0) return await cut.execute(ed, payload);

        const result = await transaction(ed, ops as never).commit();
        if (!result.success) return false;

        this._pendingMove = move;
        return true;
      }
    });

    editor.registerCommand({
      ...paste,
      execute: async (ed: Editor, payload?: any) => {
        const pending = this._pendingMove;
        const before: any = (ed as any).selection;
        const done = await paste.execute(ed, payload);
        if (!done || !this._tracking(ed)) return done;

        const after: any = (ed as any).selection;
        if (!after || after.type !== 'range' || !before) return done;

        const store: any = (ed as any).dataStore;
        const node = store?.getNode?.(after.startNodeId);
        if (!node || node.stype !== 'inline-text') return done;

        const text = String(payload?.clipboardText ?? pending?.text ?? '');
        const reviewer = this._reviewer();
        const run: CoveredRun = {
          sid: after.startNodeId,
          start: Math.max(0, after.startOffset - text.length),
          end: after.startOffset,
          marks: (node.marks ?? []) as RunMark[]
        };

        const ops = completesMove(pending, text, reviewer)
          ? recordMoveTo(run, pending!, reviewer)
          : recordInsertion(run, reviewer);

        this._pendingMove = null;
        if (ops.length > 0) await transaction(ed, ops as never).commit();

        return done;
      }
    });
  }

  private _textOf(editor: Editor, run: CoveredRun): string {
    const node = editor.dataStore?.getNode?.(run.sid);
    return String(node?.text ?? '').slice(run.start, run.end);
  }

  /** Put the caret where the deleted text would have left it. */
  private _moveCaret(editor: Editor, sid: string, offset: number): void {
    editor.updateSelection({
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
