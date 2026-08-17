import { Editor, Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { copyOf, deckSlides, layoutPlaceholders, type DeckAccess } from './deck';
import { SLIDE_16_9 } from './geometry';

/**
 * The commands that are a deck's own.
 *
 * Everything else Slides offers is text editing, which is the shared kit's and
 * Word's. These five are the ones that have no counterpart in a document: a
 * page is a consequence of how much text there is, and a slide is a thing the
 * author makes, moves, hides and throws away.
 *
 * Without them the product is a deck *viewer*, which is what it was until now.
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
