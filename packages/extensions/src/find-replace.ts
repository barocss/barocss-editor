import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, replaceText } from '@barocss/model';

/**
 * Finding words, and putting other words in their place.
 *
 * ## Why no product had this, and what the record said instead
 *
 * Word's key map records that `Mod+f` was taken out because *"`editor-core` registers `find` as
 * `execute: () => true`, a stub"*. The site deleted its 찾기 menu entry for the same stated reason,
 * and `every-command-does-something` opens with it as the fault that check was written for.
 *
 * **None of it is true.** `editor-core` registers no `find` at all, and this extension has been a
 * complete implementation since the day it was written — measured: three matches found in a
 * two-paragraph document, all three replaced correctly. What is true is smaller and stranger:
 * **nothing installs it.** Not Word's kit, not the deck's, not the site's, and not
 * `createDefaultExtensions`. So ⌘F reached no command, which looks exactly like reaching a stub.
 *
 * ## And why nothing installed it
 *
 * Because it drew its own panel. `document.createElement`, `position: fixed`, `background: white`,
 * `#e2e8f0` borders, appended to `document.body` — a shared model package building UI, in a
 * repository whose whole shape is that `office-ui` draws and the packages below it do not. The
 * panel could not be themed, could not be placed, could not be styled by a product, and would have
 * been white-on-white in the dark theme all three products now honour.
 *
 * The highlighting told the same story from the other end: `_highlightMatches` was an empty method
 * under a comment saying *"deferred to DOM layer"*. So a search found twelve matches and showed the
 * reader none of them.
 *
 * ## What it is now
 *
 * **A search, and a place in it.** No DOM. `find` performs the search; `findNext` and `findPrev`
 * move through the results by **moving the editor's selection onto the match**, which is what every
 * editor of this kind does and what makes a match visible without anything being injected. A product
 * draws the panel it wants and reads `state` for the count and the query.
 *
 * That is also the difference between a match a reader can act on and one they can only look at: the
 * selection *is* the match, so 바꾸기 and every mark command work on it without a second mechanism.
 */
export interface FindReplaceMatch {
  nodeId: string;
  offset: number;
  length: number;
  text: string;
}

export interface FindReplaceState {
  query: string;
  replacement: string;
  matches: FindReplaceMatch[];
  /** Where the reader is in the results, or `-1` before there are any. */
  currentIndex: number;
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface FindReplaceExtensionOptions {
  enabled?: boolean;
}

type Said = {
  query?: string;
  replacement?: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
};

export class FindReplaceExtension implements Extension {
  name = 'findReplace';
  priority = 30;

  private _options: FindReplaceExtensionOptions;
  private _state: FindReplaceState = {
    query: '',
    replacement: '',
    matches: [],
    currentIndex: -1,
    caseSensitive: false,
    wholeWord: false
  };

  constructor(options: FindReplaceExtensionOptions = {}) {
    this._options = { enabled: true, ...options };
  }

  /** What a product's panel draws: the query, the count, and where the reader is in it. */
  get state(): Readonly<FindReplaceState> {
    return this._state;
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    const register = (
      name: string,
      execute: (payload?: Said) => Promise<boolean> | boolean,
      can: (payload?: Said) => boolean
    ) =>
      (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
        name,
        execute: async (_ed: Editor, payload?: Said) => await execute(payload),
        canExecute: (_ed: Editor, payload?: Said) => can(payload)
      });

    /**
     * **Search**, and go to the first result.
     *
     * It opened a panel and searched as the reader typed. A panel is the product's, so this takes
     * the query it would have collected — and a `find` with no query is a `find` a control asks
     * about before anything is typed, which is why the guard allows one and the run does not.
     */
    register(
      'find',
      (payload) => this._search(editor, payload),
      (payload) => payload?.query === undefined || payload.query.length > 0
    );

    /**
     * The same, and remembering what to put in their place.
     *
     * One command rather than a mode, because the difference between 찾기 and 바꾸기 is *which rows a
     * panel draws* — a fact about the product's UI — and the search underneath is one search.
     */
    register(
      'findAndReplace',
      (payload) => this._search(editor, payload),
      (payload) => payload?.query === undefined || payload.query.length > 0
    );

    register('findNext', () => this._goTo(editor, 1), () => this._state.matches.length > 0);
    register('findPrev', () => this._goTo(editor, -1), () => this._state.matches.length > 0);

    /**
     * Replace **the one the reader is on**, then search again.
     *
     * Searching again rather than adjusting the offsets by hand: a replacement of a different length
     * moves every match after it in the same run, and the arithmetic for that is the search.
     */
    register(
      'replaceOne',
      () => this._replaceOne(editor),
      () => this._state.currentIndex >= 0 && this._state.currentIndex < this._state.matches.length
    );

    register('replaceAll', () => this._replaceAll(editor), () => this._state.matches.length > 0);
  }

  onDestroy(_editor: Editor): void {
    this._state = { ...this._state, matches: [], currentIndex: -1 };
  }

  // ── Searching ──────────────────────────────────────────────────────────────

  private _search(editor: Editor, said?: Said): boolean {
    if (said?.query !== undefined) this._state.query = said.query;
    if (said?.replacement !== undefined) this._state.replacement = said.replacement;
    if (said?.caseSensitive !== undefined) this._state.caseSensitive = said.caseSensitive;
    if (said?.wholeWord !== undefined) this._state.wholeWord = said.wholeWord;

    this._state.matches = [];
    this._state.currentIndex = -1;
    if (!this._state.query) return false;

    const store = editor.dataStore;
    const rootId = editor.getRootId?.();
    if (!store || !rootId) return false;

    this._collect(editor, rootId);
    if (this._state.matches.length === 0) return false;

    this._state.currentIndex = 0;
    this._show(editor);
    return true;
  }

  /** Every run under this node, in document order, with every occurrence in each. */
  private _collect(editor: Editor, sid: string): void {
    const store = editor.dataStore;
    const node = store?.getNode(sid) as Record<string, any> | undefined;
    if (!node) return;

    if (typeof node.text === 'string') {
      const held = this._state.caseSensitive ? node.text : node.text.toLowerCase();
      const want = this._state.caseSensitive ? this._state.query : this._state.query.toLowerCase();

      let at = 0;
      while (want.length > 0 && (at = held.indexOf(want, at)) !== -1) {
        if (!this._state.wholeWord || whole(held, at, want.length)) {
          this._state.matches.push({
            nodeId: sid,
            offset: at,
            length: want.length,
            text: (node.text as string).slice(at, at + want.length)
          });
        }
        at += want.length;
      }
    }

    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') this._collect(editor, child);
    }
  }

  // ── Moving through the results ─────────────────────────────────────────────

  private _goTo(editor: Editor, by: number): boolean {
    const held = this._state.matches;
    if (held.length === 0) return false;

    // Round, because a reader at the last result pressing next means the first one.
    this._state.currentIndex = (this._state.currentIndex + by + held.length) % held.length;
    this._show(editor);
    return true;
  }

  /**
   * **The match becomes the selection**, which is the whole of how a result is shown.
   *
   * The old code had an empty `_highlightMatches` under a comment saying the drawing was deferred to
   * the DOM layer, so a search found twelve matches and showed none of them. A selection needs no
   * layer: the view already draws one, the reader can act on it, and 바꾸기 and every mark command
   * work on the match without a second mechanism.
   */
  private _show(editor: Editor): void {
    const at = this._state.matches[this._state.currentIndex];
    if (!at) return;

    (editor as never as { selectionManager?: { setSelection: (s: ModelSelection) => void } }).selectionManager?.setSelection({
      type: 'range',
      startNodeId: at.nodeId,
      startOffset: at.offset,
      endNodeId: at.nodeId,
      endOffset: at.offset + at.length,
      collapsed: false,
      direction: 'forward'
    } as ModelSelection);
  }

  // ── Replacing ──────────────────────────────────────────────────────────────

  private async _replaceOne(editor: Editor): Promise<boolean> {
    const at = this._state.matches[this._state.currentIndex];
    if (!at) return false;

    const where = this._state.currentIndex;
    const ops = [replaceText(at.nodeId, at.offset, at.offset + at.length, this._state.replacement)];
    const result = await transaction(editor, ops as never).commit();
    if (!result.success) return false;

    /*
     * Search again, and stay where the reader was. One fewer match, so the index is clamped rather
     * than kept — at the last result, replacing it puts the reader on the new last one.
     */
    this._search(editor);
    if (this._state.matches.length > 0) {
      this._state.currentIndex = Math.min(where, this._state.matches.length - 1);
      this._show(editor);
    }
    return true;
  }

  private async _replaceAll(editor: Editor): Promise<boolean> {
    if (this._state.matches.length === 0) return false;

    /*
     * From the last backwards, so every offset is still true when its turn comes: a replacement of a
     * different length moves everything after it in the same run.
     */
    const ops = [...this._state.matches]
      .reverse()
      .map((at) => replaceText(at.nodeId, at.offset, at.offset + at.length, this._state.replacement));

    const result = await transaction(editor, ops as never).commit();
    if (!result.success) return false;

    this._search(editor);
    return true;
  }
}

/**
 * Whether an occurrence stands on its own rather than inside a longer word.
 *
 * A letter or a digit on either side means it does not. Deliberately not a `\b` regular expression:
 * `\b` is defined by ASCII word characters, so `고양이` in `고양이와` would be a whole word to it and
 * every match in Korean, Japanese or Chinese would pass the filter.
 */
function whole(held: string, at: number, length: number): boolean {
  const wordish = /[\p{L}\p{N}_]/u;
  const before = at > 0 ? held[at - 1] : '';
  const after = at + length < held.length ? held[at + length] : '';
  return !wordish.test(before) && !wordish.test(after);
}

export function createFindReplaceExtension(options?: FindReplaceExtensionOptions): FindReplaceExtension {
  return new FindReplaceExtension(options);
}
