import { Editor, Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { copyOf, deckSlides, layoutPlaceholders, type DeckAccess } from './deck';
import { isSceneType } from './selection';
import { SLIDE_16_9 } from './geometry';

/**
 * The commands that are a deck's own.
 *
 * Everything else Slides offers is text editing, which is the shared kit's and
 * Word's. These are the ones with no counterpart in a document: a page is a
 * consequence of how much text there is, and a slide is a thing the author
 * makes, moves, hides and throws away — and the things on it are boxes with a
 * position rather than paragraphs in a flow.
 *
 * Without them the product is a deck *viewer*, which is what it was until now.
 * `setBoxGeometry` and `setBoxStyle` join them: the first thing here that edits
 * a *box* rather than a slide, and the first thing anywhere to read `locked`.
 *
 * ## One transaction each
 *
 * Every command here commits exactly one transaction, and the operations it is
 * built from — `addChild`, `removeChild`, `moveNode`, `setAttrs` — each declare
 * an inverse. That is not incidental: `transaction` collects those inverses and
 * *is* undo, so a command assembled from operations that refuse to say how to
 * undo them is a command a reader cannot take back. Duplicating a slide is a
 * single `addChild` of a copied tree rather than a clone-then-move for the same
 * reason: two steps that each undo cleanly still leave a reader pressing Ctrl+Z
 * twice for one action they took once.
 */
export class SlidesExtension implements Extension {
  name = 'slides';
  priority = 45;

  onCreate(editor: Editor): void {
    const register = (name: string, execute: (payload?: any) => Promise<boolean> | boolean, canExecute: (payload?: any) => boolean) => {
      (editor as any).registerCommand({
        name,
        execute: async (_ed: Editor, payload?: any) => await execute(payload),
        canExecute: (_ed: Editor, payload?: any) => canExecute(payload)
      });
    };

    /**
     * A new slide, after the one given.
     *
     * It starts with its layout's placeholders, which is the first thing in
     * this repository to *read* a `slideLayout` — the node was declared,
     * rendered (hidden) and used by nothing, which is the fault this product
     * keeps finding elsewhere and had committed itself within the week.
     *
     * The layout is the one asked for, or the one the preceding slide follows,
     * because a deck is mostly runs of slides that look alike.
     */
    register(
      'insertSlide',
      (payload) => this._insertSlide(editor, payload),
      () => !!this._access(editor)
    );

    register(
      'deleteSlide',
      (payload) => this._deleteSlide(editor, payload?.slideId),
      (payload) => this._canDelete(editor, payload?.slideId)
    );

    register(
      'duplicateSlide',
      (payload) => this._duplicateSlide(editor, payload?.slideId),
      (payload) => !!this._slideAt(editor, payload?.slideId)
    );

    /** Reorder, by where the slide should end up — 0 is first. */
    register(
      'moveSlide',
      (payload) => this._moveSlide(editor, payload?.slideId, payload?.to),
      (payload) => this._canMove(editor, payload?.slideId, payload?.to)
    );

    /**
     * Keep the slide, skip it while presenting.
     *
     * A property of the slide and not of the reader: hiding a slide is an
     * editorial decision about the deck, unlike which slide is on screen, which
     * is a fact about one person looking at it.
     */
    register(
      'toggleSlideHidden',
      (payload) => this._toggleHidden(editor, payload?.slideId),
      (payload) => !!this._slideAt(editor, payload?.slideId)
    );

    /**
     * Where a box is and how big.
     *
     * One command for all four numbers rather than four, because a properties
     * panel changes one at a time and a drag changes two at once, and both have
     * to be one entry in the history. Only the values given are written: a panel
     * that sent all four would overwrite a width the reader had not touched with
     * whatever its field happened to be showing.
     *
     * Refused for a locked box. `locked` is in the schema, was read by nothing,
     * and the first command that could move something is the first one that owes
     * it an answer.
     */
    register(
      'setBoxGeometry',
      (payload) => this._setBoxAttrs(editor, payload?.nodeId, this._geometryOf(payload)),
      (payload) =>
        this._canEditBox(editor, payload?.nodeId) &&
        Object.keys(this._geometryOf(payload)).length > 0
    );

    /** Fill and stroke. `null` means none, which is not the same as white. */
    register(
      'setBoxStyle',
      (payload) => this._setBoxAttrs(editor, payload?.nodeId, this._styleOf(payload)),
      (payload) =>
        this._canEditBox(editor, payload?.nodeId) && Object.keys(this._styleOf(payload)).length > 0
    );
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  private _access(editor: Editor): DeckAccess | null {
    const store = (editor as any).dataStore;
    const rootId = (editor as any).getRootId?.();
    if (!store || !rootId) return null;
    return { rootId, getNode: (sid: string) => store.getNode(sid) };
  }

  /** The slide asked for, or the first one, so a command with no argument works. */
  private _slideAt(editor: Editor, slideId?: string): string | undefined {
    const doc = this._access(editor);
    if (!doc) return undefined;

    const slides = deckSlides(doc);
    if (slideId) return slides.some((slide) => slide.sid === slideId) ? slideId : undefined;
    return slides[0]?.sid;
  }

  /**
   * A deck with no slides is not a deck.
   *
   * The last one cannot be deleted, the way a document keeps one paragraph: an
   * editor with nothing in it has nowhere to put a caret and nothing to draw,
   * and the reader's next action would have to create one implicitly.
   */
  private _canDelete(editor: Editor, slideId?: string): boolean {
    const doc = this._access(editor);
    if (!doc) return false;
    return deckSlides(doc).length > 1 && !!this._slideAt(editor, slideId);
  }

  private _canMove(editor: Editor, slideId?: string, to?: number): boolean {
    const doc = this._access(editor);
    const sid = this._slideAt(editor, slideId);
    if (!doc || !sid || typeof to !== 'number' || !Number.isInteger(to)) return false;

    const slides = deckSlides(doc);
    if (to < 0 || to >= slides.length) return false;
    // Moving a slide to where it already is is not an edit, and committing one
    // would put an entry in the history that undoes to the same document.
    return slides.findIndex((slide) => slide.sid === sid) !== to;
  }

  /**
   * Where a slide sits among the document's children.
   *
   * Not the same as its number in the deck: `docMeta` and `resources` are the
   * document's children too, so slide 1 is rarely child 0. Every position
   * passed to an operation is this one, and every position shown to a reader is
   * the other.
   */
  private _childIndexOf(editor: Editor, sid: string): number {
    const doc = this._access(editor);
    const root = doc && doc.getNode(doc.rootId);
    const children = Array.isArray(root?.content) ? (root!.content as string[]) : [];
    return children.indexOf(sid);
  }

  // ── Editing ────────────────────────────────────────────────────────────────

  private async _insertSlide(
    editor: Editor,
    payload?: { after?: string; layoutId?: string }
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc) return false;

    const slides = deckSlides(doc);
    const after = payload?.after ?? slides[slides.length - 1]?.sid;
    const previous = slides.find((slide) => slide.sid === after);
    const layoutId = payload?.layoutId ?? previous?.layoutId;

    const placeholders = layoutPlaceholders(doc, layoutId);

    /**
     * A slide with no layout still needs somewhere to type.
     *
     * An empty `surface` is legal and useless: `scene*` accepts nothing at all,
     * so the reader would get a blank rectangle with no box to put a caret in
     * and no way to make one. One title frame, at the size the layouts use.
     */
    const content =
      placeholders.length > 0
        ? placeholders
        : [
            {
              stype: 'textFrame',
              attributes: {
                role: 'title',
                x: 1440,
                y: 960,
                width: SLIDE_16_9.width - 2880,
                height: 1680
              },
              content: [{ stype: 'paragraph', attributes: {}, content: [] }]
            }
          ];

    const at = after ? this._childIndexOf(editor, after) : -1;

    const result = await transaction(editor, [
      {
        type: 'addChild',
        payload: {
          parentId: doc.rootId,
          child: {
            stype: 'surface',
            attributes: { kind: 'slide', ...(layoutId ? { layoutId } : {}) },
            content
          },
          // After the slide it follows. Appended when there is nothing to
          // follow, which `addChild` does when the position is out of range.
          ...(at >= 0 ? { position: at + 1 } : {})
        }
      }
    ] as never).commit();

    return result.success;
  }

  private async _deleteSlide(editor: Editor, slideId?: string): Promise<boolean> {
    if (!this._canDelete(editor, slideId)) return false;
    const sid = this._slideAt(editor, slideId)!;
    const doc = this._access(editor)!;

    const result = await transaction(editor, [
      { type: 'removeChild', payload: { parentId: doc.rootId, childId: sid } }
    ] as never).commit();

    return result.success;
  }

  private async _duplicateSlide(editor: Editor, slideId?: string): Promise<boolean> {
    const doc = this._access(editor);
    const sid = this._slideAt(editor, slideId);
    if (!doc || !sid) return false;

    // A tree with no sids in it, so the copy is a different node all the way
    // down rather than a second thing claiming the original's identity.
    const copy = copyOf(doc, sid);
    if (!copy) return false;

    const at = this._childIndexOf(editor, sid);

    const result = await transaction(editor, [
      {
        type: 'addChild',
        payload: {
          parentId: doc.rootId,
          child: copy,
          ...(at >= 0 ? { position: at + 1 } : {})
        }
      }
    ] as never).commit();

    return result.success;
  }

  private async _moveSlide(editor: Editor, slideId?: string, to?: number): Promise<boolean> {
    if (!this._canMove(editor, slideId, to)) return false;
    const sid = this._slideAt(editor, slideId)!;
    const doc = this._access(editor)!;

    /**
     * The target, in the document's children rather than in the deck.
     *
     * A reader says "third slide"; `moveNode` wants a child index, and the
     * document's children include `docMeta` and `resources`. Translating
     * through the slide already at the target position is the only way that
     * stays right whatever else the document holds.
     */
    const slides = deckSlides(doc);
    const target = this._childIndexOf(editor, slides[to!].sid);
    if (target < 0) return false;

    const result = await transaction(editor, [
      { type: 'moveNode', payload: { nodeId: sid, newParentId: doc.rootId, position: target } }
    ] as never).commit();

    return result.success;
  }

  // ── Boxes ──────────────────────────────────────────────────────────────────

  /**
   * Whether this box can be edited at all.
   *
   * `locked` has been in the schema since the canvas nodes were declared and
   * nothing had ever read it, because nothing could move a box. A command that
   * ignored it would make the attribute a lie rather than leave it unread.
   */
  private _canEditBox(editor: Editor, nodeId?: string): boolean {
    const doc = this._access(editor);
    if (!doc || !nodeId) return false;

    const node = doc.getNode(nodeId);
    if (!isSceneType(node?.stype)) return false;
    return node!.attributes?.locked !== true;
  }

  /** Only the numbers the caller actually gave, so nothing else is overwritten. */
  private _geometryOf(payload: any): Record<string, number> {
    const out: Record<string, number> = {};
    for (const key of ['x', 'y', 'width', 'height', 'rotation'] as const) {
      const value = payload?.[key];
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
    return out;
  }

  /**
   * Fill, stroke and opacity, with `null` kept as a value.
   *
   * `null` is how a caller says "no fill", which is a real answer — a text box
   * over a picture usually wants it — and is not the same as not mentioning
   * fill at all. So `undefined` means "leave it" and `null` means "none".
   */
  private _styleOf(payload: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of ['fill', 'stroke'] as const) {
      if (!(key in (payload ?? {}))) continue;
      const value = payload[key];
      // `null` is carried through rather than turned into `undefined`: it is the
      // caller saying "none", and `_setBoxAttrs` needs to tell that apart from
      // "not mentioned".
      if (value === null || typeof value === 'string') out[key] = value;
    }
    for (const key of ['strokeWidth', 'opacity'] as const) {
      const value = payload?.[key];
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
    return out;
  }

  /**
   * Write attributes onto a box, including taking one away.
   *
   * Removal is the awkward half and it is awkward at the operation level, not
   * here: `setAttrs` merges, and an attribute set to `undefined` is dropped from
   * the merge rather than removed from the node — so clearing a fill left the
   * old colour in place and the command reported success.
   *
   * The only way to remove one is to state the whole set with `replace: true`,
   * which means reading the node first. So a payload carrying `null` becomes a
   * replacement built from what the node has, minus the keys being cleared;
   * anything else stays a merge, which is both cheaper and safe against a
   * concurrent write to an attribute this command was not asked about.
   *
   * That every caller wanting to remove an attribute has to reconstruct the set
   * is a gap in the operation vocabulary, not a fact about slides — noted in
   * `docs/BACKLOG.md`.
   */
  private async _setBoxAttrs(
    editor: Editor,
    nodeId: string | undefined,
    attrs: Record<string, unknown>
  ): Promise<boolean> {
    if (!this._canEditBox(editor, nodeId) || Object.keys(attrs).length === 0) return false;

    const cleared = Object.keys(attrs).filter((key) => attrs[key] === null);

    let payload: Record<string, unknown>;
    if (cleared.length === 0) {
      payload = { nodeId, attrs };
    } else {
      const current = { ...(this._access(editor)!.getNode(nodeId!)?.attributes ?? {}) };
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null) delete current[key];
        else current[key] = value;
      }
      payload = { nodeId, attrs: current, replace: true };
    }

    const result = await transaction(editor, [
      { type: 'setAttrs', payload }
    ] as never).commit();

    return result.success;
  }

  private async _toggleHidden(editor: Editor, slideId?: string): Promise<boolean> {
    const doc = this._access(editor);
    const sid = this._slideAt(editor, slideId);
    if (!doc || !sid) return false;

    const slide = doc.getNode(sid);
    const result = await transaction(editor, [
      {
        type: 'setAttrs',
        payload: { nodeId: sid, attrs: { hidden: slide?.attributes?.hidden !== true } }
      }
    ] as never).commit();

    return result.success;
  }
}

export function createSlideCommands(): SlidesExtension {
  return new SlidesExtension();
}
