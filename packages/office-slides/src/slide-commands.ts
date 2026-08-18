import { Editor, Extension } from '@barocss/editor-core';
import { CANVAS_GEOMETRY_ATTRS, CANVAS_STYLE_ATTRS } from '@barocss/schema';
import { transaction } from '@barocss/model';
import { copyOf, deckSlides, layoutPlaceholders, noteFor, type DeckAccess } from './deck';
import { isSceneType } from './selection';
import { SLIDE_16_9 } from './geometry';

/** One attribute as the schema declares it: enough to check a value against. */
interface AttrShape {
  type?: string;
  required?: boolean;
  default?: unknown;
}

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
      (payload) => this._setBoxAttrs(editor, payload?.nodeId, this._geometryOf(editor, payload)),
      (payload) =>
        this._canEditBox(editor, payload?.nodeId) &&
        Object.keys(this._geometryOf(editor, payload)).length > 0
    );

    /**
     * How big every slide is.
     *
     * Deck-wide, and applied to every surface rather than held once on the
     * document: a slide already carries its own size, because a deck may
     * genuinely mix them, and a second place saying the same thing is a second
     * place to disagree. So "the deck is 4:3" is what it looks like — every
     * slide is.
     *
     * Nothing on the slides is rescaled. A shape at 3in from the left is at 3in
     * from the left on a narrower slide too, which is what every presentation
     * tool does and what an author expects: the alternative silently rewrites
     * every coordinate in the deck.
     */
    register(
      'setDeckSize',
      (payload) => this._setDeckSize(editor, payload),
      (payload) =>
        Number.isFinite(payload?.width) &&
        Number.isFinite(payload?.height) &&
        payload.width > 0 &&
        payload.height > 0
    );

    /**
     * Which layout a slide follows.
     *
     * Only the binding. Re-applying the layout's placeholders to a slide that
     * already has content would throw away what the author wrote, and there is
     * no reading of "change layout" that a reader would want to undo twice.
     */
    register(
      'setSlideLayout',
      (payload) => this._setSlideLayout(editor, payload?.slideId, payload?.layoutId),
      (payload) => !!this._slideAt(editor, payload?.slideId)
    );

    /** Fill and stroke. `null` means none, which is not the same as white. */
    register(
      'setBoxStyle',
      (payload) => this._setBoxAttrs(editor, payload?.nodeId, this._styleOf(editor, payload)),
      (payload) =>
        this._canEditBox(editor, payload?.nodeId) &&
        Object.keys(this._styleOf(editor, payload)).length > 0
    );

    /**
     * Give a slide a note to present from.
     *
     * `surfaceNote` has been declared since the deck was described and `noteFor`
     * has resolved one since; nothing could ever make one. A deck could show a
     * note an author had written by hand into the fixture and could not add a
     * note to a slide.
     *
     * Two steps in one transaction, because a note is *two* things: a resource
     * holding the text, and the slide naming it. Either alone is not a note —
     * a resource nobody names is unreachable, and a name pointing at nothing
     * resolves to nothing — so one command, one undo.
     *
     * The id is the slide's sid. It is unique by construction and it says which
     * slide the note belongs to when a person reads the file, which is more than
     * a counter would. The *binding* is still the slide naming the note, the way
     * a surface names its header: a note carrying a `surfaceId` reads better and
     * cannot work, because a sid is handed out at load and an authored document
     * has none to write.
     */
    register(
      'addSlideNote',
      (payload) => this._addNote(editor, payload?.slideId),
      (payload) => {
        const doc = this._access(editor);
        const slide = this._slideAt(editor, payload?.slideId);
        return !!doc && !!slide && !noteFor(doc, slide);
      }
    );

    /**
     * Lock a box, or let it go.
     *
     * Its own command because every other one is refused for a locked box — that
     * is what `locked` means and `_canEditBox` enforces it — so a lock set
     * through `setBoxStyle` could never be taken off again. The attribute was
     * readable and unsettable: the guard had been written, the schema had
     * declared it, and nothing in the product could produce a locked box at all.
     *
     * Guarded on being a box and nothing else. Locking a locked box is refused
     * as well, so the toolbar's state and the command agree and a no-op does not
     * get an entry in the history.
     */
    register(
      'setBoxLocked',
      (payload) =>
        this._setBoxAttrs(editor, payload?.nodeId, { locked: payload?.locked === true }, {
          evenIfLocked: true
        }),
      (payload) => {
        if (typeof payload?.locked !== 'boolean' || !payload?.nodeId) return false;
        const node = this._access(editor)?.getNode(payload.nodeId);
        if (!isSceneType(node?.stype)) return false;
        return (node!.attributes?.locked === true) !== payload.locked;
      }
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

  /**
   * Which attributes each command may write, asked of the schema.
   *
   * These were two hardcoded lists — `['x','y','width','height','rotation']` and
   * `['fill','stroke','strokeWidth','opacity']` — and they had already drifted
   * from what the schema declares. `cornerRadius`, `locked` and `visible` were
   * declared, drawn by the renderers, and named by neither list: three
   * attributes a document could hold, a reader could see on the page, and
   * nothing in the product could change. Found by reading a rectangle's
   * attributes in a browser, which is not a way of finding things that scales.
   *
   * So the split is stated once, in the schema, and read here:
   *
   * - **Geometry** is `CANVAS_GEOMETRY_ATTRS` — where the box is, how big, how
   *   turned, how solid, whether drawn. Less `locked`, which has its own command
   *   because every other one is refused for a locked box.
   * - **Style** is `CANVAS_STYLE_ATTRS`, plus whatever else the node type itself
   *   declares: `cornerRadius` on a rectangle, `verticalAlign` on a text frame,
   *   `clipsContent` on a frame. There is nowhere else for a per-shape
   *   presentation attribute to go, and a new one added to the schema is
   *   settable the same day rather than the day somebody notices.
   * - **Identity is excluded**: an extra the schema marks `required` is what
   *   makes the node that node — a `path` without `d` is not a path — and is not
   *   something a formatting command may take away. Required attributes *inside*
   *   the geometry group are not identity and stay settable, which is what keeps
   *   `width` and `height` writable.
   *
   * A node with no declaration in the schema gets nothing written to it, rather
   * than everything.
   */
  private _declaredAttrs(editor: Editor, nodeId?: string): Record<string, AttrShape> {
    const stype = nodeId ? this._access(editor)?.getNode(nodeId)?.stype : undefined;
    if (!stype) return {};
    const schema = (editor as any).dataStore?.getActiveSchema?.();
    return (schema?.getNodeType?.(stype)?.attrs ?? {}) as Record<string, AttrShape>;
  }

  /**
   * The payload's values for a set of declared attributes, typed as declared.
   *
   * A value of the wrong type is dropped rather than coerced: a width of `"12"`
   * is a caller's mistake and writing 12 would hide it. `null` is kept for a
   * string attribute alone, because that is how a caller says "no fill" — see
   * `_setBoxAttrs`, which turns it into a removal.
   */
  private _valuesFor(
    payload: any,
    declared: Record<string, AttrShape>,
    allow: (key: string, shape: AttrShape) => boolean
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, shape] of Object.entries(declared)) {
      if (!allow(key, shape)) continue;
      if (!(key in (payload ?? {}))) continue;

      const value = payload[key];
      if (shape.type === 'number' && typeof value === 'number' && Number.isFinite(value)) {
        out[key] = value;
      } else if (shape.type === 'boolean' && typeof value === 'boolean') {
        out[key] = value;
      } else if (shape.type === 'string' && (typeof value === 'string' || value === null)) {
        out[key] = value;
      }
    }
    return out;
  }

  /** Where the box is and how it is drawn, less the lock. */
  private _geometryOf(editor: Editor, payload: any): Record<string, unknown> {
    return this._valuesFor(
      payload,
      this._declaredAttrs(editor, payload?.nodeId),
      (key) => key !== 'locked' && key in CANVAS_GEOMETRY_ATTRS
    );
  }

  /** How the box is painted, including whatever this shape declares of its own. */
  private _styleOf(editor: Editor, payload: any): Record<string, unknown> {
    return this._valuesFor(
      payload,
      this._declaredAttrs(editor, payload?.nodeId),
      (key, shape) =>
        !(key in CANVAS_GEOMETRY_ATTRS) && (key in CANVAS_STYLE_ATTRS || shape.required !== true)
    );
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
  /**
   * The resource and the binding, together.
   *
   * `$alias` is what lets one transaction do both: the note is declared with a
   * name, and the step that points the slide at it refers to that name rather
   * than to a sid nobody can know until the transaction has run.
   */
  private async _addNote(editor: Editor, slideId?: string): Promise<boolean> {
    const doc = this._access(editor);
    const slide = this._slideAt(editor, slideId);
    if (!doc || !slide || noteFor(doc, slide)) return false;

    const resources = this._resourcesOf(doc);
    if (!resources) return false;

    const surface = doc.getNode(slide);
    const result = await transaction(editor, [
      {
        type: 'addChild',
        payload: {
          parentId: resources,
          child: {
            stype: 'surfaceNote',
            attributes: { id: slide },
            /**
             * A paragraph, and a run inside it.
             *
             * The caret filler gives an empty line its height and is drawn for
             * an empty `inline-text`; a paragraph with no run gets none, so a
             * new note was 0 pixels high — there and impossible to click into.
             */
            content: [
              {
                stype: 'paragraph',
                attributes: {},
                content: [{ stype: 'inline-text', text: '' }]
              }
            ]
          }
        }
      },
      {
        type: 'setAttrs',
        payload: { nodeId: slide, attrs: { ...(surface?.attributes ?? {}), noteId: slide } }
      }
    ] as never).commit();

    return result.success;
  }

  /** Where definitions live, which a note is one of. */
  private _resourcesOf(doc: DeckAccess): string | undefined {
    const root = doc.getNode(doc.rootId);
    const children = Array.isArray(root?.content) ? (root!.content as unknown[]) : [];
    for (const sid of children) {
      if (typeof sid !== 'string') continue;
      if (doc.getNode(sid)?.stype === 'resources') return sid;
    }
    return undefined;
  }

  private async _setBoxAttrs(
    editor: Editor,
    nodeId: string | undefined,
    attrs: Record<string, unknown>,
    /**
     * `evenIfLocked` is for the one command that has to reach a locked box: the
     * one that unlocks it. Everything else goes through the guard, which is what
     * `locked` is for.
     */
    options?: { evenIfLocked?: boolean }
  ): Promise<boolean> {
    const allowed = options?.evenIfLocked
      ? !!nodeId && isSceneType(this._access(editor)?.getNode(nodeId)?.stype)
      : this._canEditBox(editor, nodeId);
    if (!allowed || Object.keys(attrs).length === 0) return false;

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

  private async _setDeckSize(
    editor: Editor,
    payload?: { width?: number; height?: number }
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc) return false;

    const width = Number(payload?.width);
    const height = Number(payload?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return false;
    }

    const slides = deckSlides(doc);
    if (slides.length === 0) return false;

    // Only the slides that are not already that size, so resizing a deck that
    // is already 16:9 commits nothing.
    const steps = slides
      .filter((slide) => {
        const attrs = (doc.getNode(slide.sid) as any)?.attributes ?? {};
        return attrs.width !== width || attrs.height !== height;
      })
      .map((slide) => ({
        type: 'setAttrs',
        payload: { nodeId: slide.sid, attrs: { width, height } }
      }));

    if (steps.length === 0) return false;
    return (await transaction(editor, steps as never).commit()).success;
  }

  private async _setSlideLayout(
    editor: Editor,
    slideId?: string,
    layoutId?: string
  ): Promise<boolean> {
    const sid = this._slideAt(editor, slideId);
    const doc = this._access(editor);
    if (!sid || !doc) return false;

    const attributes = { ...((doc.getNode(sid) as any)?.attributes ?? {}) };
    const current = attributes.layoutId ?? null;
    const next = typeof layoutId === 'string' && layoutId.length > 0 ? layoutId : null;

    // Setting a slide to the layout it already follows is not an edit, and
    // committing one would put an entry in the history that undoes to itself.
    if (current === next) return false;

    /**
     * Clearing it means restating the rest.
     *
     * `setAttrs` merges and drops `undefined`, so "this slide follows no
     * layout" cannot be said by leaving the key out — the whole attribute set
     * has to be written with `replace`. Logged in `docs/BACKLOG.md` as a gap in
     * the operation vocabulary; this is the second command to work around it.
     */
    if (next === null) delete attributes.layoutId;
    else attributes.layoutId = next;

    return (
      await transaction(editor, [
        { type: 'setAttrs', payload: { nodeId: sid, attrs: attributes, replace: true } }
      ] as never).commit()
    ).success;
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
