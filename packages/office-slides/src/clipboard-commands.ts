import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { copyForPaste, pastable, type DeckAccess, type DeckNode } from './deck';
import { cardsFor, pasteCardsPlan, type CardsCarried } from './paste-cards';
import { boxOf } from './geometry';
import { fromSurface, isSceneType, slideAt, toSurface } from './selection';

/**
 * Copying objects between slides, containers and decks.
 *
 * The first feature that needs a coordinate to *change meaning* as it moves. A
 * box's `x` and `y` are measured from its container, so a shape copied out of a
 * frame and pasted onto a slide has to arrive with different numbers in order
 * to stay in the same place. That conversion is `toSurface` on the way out and
 * `fromSurface` on the way in, and it is why those two exist — see
 * `docs/specs/canvas-model.md`.
 *
 * ## Why these are not `copy`, `cut` and `paste`
 *
 * Those exist and are the text ones: they take a range selection and refuse
 * anything else, which is right. What a reader means by Ctrl+C depends entirely
 * on what kind of selection they have, and a deck is the one product where both
 * kinds are live at once. The app binds whichever matches the selection it has,
 * the same way it already does for Delete.
 *
 * ## Two clipboards, on purpose
 *
 * The system clipboard is what carries a shape to another deck, in another tab,
 * and it is the reason the payload is JSON in text: it is the only format two
 * windows are certain to agree on. But reading it needs permission the browser
 * may refuse, and writing it needs a user gesture that a test does not have. So
 * the extension keeps its own copy as well, and a paste prefers the system's
 * when it can read one and falls back to its own when it cannot.
 *
 * The fallback is not a convenience. Without it, copy and paste inside one deck
 * would work only where the permission happened to be granted, which is a
 * feature that works on the developer's machine.
 */

/** What a copied selection looks like on the clipboard. */
interface Payload {
  /** Recognises our own writing, so pasted prose is not mistaken for a shape. */
  barocssSlides: 1;
  /** Each box, in the slide's coordinates rather than its container's. */
  boxes: DeckNode[];
  /**
   * What the boxes **need**: the card definitions they name, and the document variables those need.
   *
   * A placement holds no parts, so a copy of one is a copy of a *name* — measured against a fresh
   * deck, it pasted an invisible empty box and nothing said so. See `paste-cards.ts` for what the
   * paste does with these, and for why a pasted card is a plain copy rather than a brand-kit import.
   *
   * Optional, because a payload written before this existed is still a payload: a paste that finds
   * none behaves exactly as it used to.
   */
  needs?: CardsCarried;
}

const MARKER = 'barocssSlides';

/** A tenth of an inch, the same nudge `duplicateBoxes` uses. */
const OFFSET = 144;

export class SlidesClipboardExtension implements Extension {
  name = 'slides-clipboard';
  priority = 46;

  /**
   * The last thing copied here.
   *
   * Deliberately not the document's: a clipboard is a property of the person,
   * not of the deck, and two people editing one deck do not share one.
   */
  private _held: Payload | null = null;

  onCreate(editor: Editor): void {
    const register = (
      name: string,
      execute: (payload?: any) => Promise<boolean>,
      canExecute: () => boolean
    ) => {
      editor.registerCommand({
        name,
        execute: async (_ed: Editor, payload?: any) => await execute(payload),
        canExecute
      });
    };

    register(
      'copyBoxes',
      () => this._copy(editor),
      () => this._selected(editor).length > 0
    );

    /**
     * Cut is copy and then delete, in that order and in one command.
     *
     * Not two commands from the app, which would put two entries in the history
     * — a reader pressing undo after a cut expects the shapes back, once.
     */
    register(
      'cutBoxes',
      () => this._cut(editor),
      () => this._selected(editor).length > 0
    );

    /**
     * Paste into the container the reader is looking at.
     *
     * `parentId` is the app's to give: the overlay knows whether the reader has
     * gone inside a frame, and the document does not. Without one it lands on
     * the slide the selection is on, which is the answer for every other case.
     *
     * `canExecute` cannot say whether the *system* clipboard holds a box —
     * reading it is asynchronous and may prompt — so it answers for what this
     * extension is holding. A paste that finds nothing does nothing.
     */
    register(
      'pasteBoxes',
      (payload) => this._paste(editor, payload?.parentId, payload?.at),
      () => this._held !== null
    );
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  private _access(editor: Editor): DeckAccess | null {
    const store = editor.dataStore;
    const rootId = editor?.getRootId();
    if (!store || !rootId) return null;
    return { rootId, getNode: (sid: string) => store.getNode(sid) };
  }

  /** The selected boxes, in the order the document holds them. */
  private _selected(editor: Editor): string[] {
    const doc = this._access(editor);
    if (!doc) return [];

    const ids = new Set(selectedNodeIds(editor.selection));
    if (ids.size === 0) return [];

    return [...ids].filter((sid) => isSceneType((doc.getNode(sid) as any)?.stype));
  }

  // ── Copying ────────────────────────────────────────────────────────────────

  private async _copy(editor: Editor): Promise<boolean> {
    const doc = this._access(editor);
    const chosen = this._selected(editor);
    if (!doc || chosen.length === 0) return false;

    /**
     * Copied in the slide's coordinates, not the container's.
     *
     * The payload has to mean something in a deck that has never heard of the
     * frame this came out of. Converting on the way out makes it
     * self-contained: what is on the clipboard is "a box that looked like it
     * was here", and where it lands is the paste's problem.
     */
    /**
     * With the references inside the copy made **local to it** — see `copyForPaste`.
     *
     * Without that, pasting two shapes and the line joining them gave a line pointing at
     * the *originals*: a duplicated diagram was two sets of shapes with both lines
     * attached to the first set.
     */
    const boxes = copyForPaste(doc, chosen).map((copy, at) => {
      const placed = toSurface(doc, chosen[at], boxOf(copy.attributes as never));
      copy.attributes = { ...copy.attributes, x: placed.x, y: placed.y };
      return copy;
    });

    if (boxes.length === 0) return false;

    this._held = { barocssSlides: 1, boxes, needs: cardsFor(doc, boxes) };
    await this._write(this._held);
    return true;
  }

  private async _cut(editor: Editor): Promise<boolean> {
    if (!(await this._copy(editor))) return false;
    // Through the command rather than by hand, so cutting refuses exactly what
    // deleting refuses — a locked box among them, above all.
    return (await editor?.executeCommand('deleteBoxes')) === true;
  }

  // ── Pasting ────────────────────────────────────────────────────────────────

  private async _paste(
    editor: Editor,
    parentId?: string,
    at?: { x: number; y: number }
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc) return false;

    const payload = (await this._read()) ?? this._held;
    if (!payload || payload.boxes.length === 0) return false;

    const into = this._destination(editor, doc, parentId);
    if (!into) return false;

    /**
     * Where it lands.
     *
     * Given a point, the boxes keep their arrangement relative to each other and
     * the first one goes there — which is what a paste-at-the-pointer means.
     * Given none, they land where they were, nudged, so a paste into the same
     * place is visible rather than exactly underneath the original.
     */
    const first = boxOf(payload.boxes[0].attributes as never);
    const shift = at ? { x: at.x - first.x, y: at.y - first.y } : { x: OFFSET, y: OFFSET };

    /**
     * Sids made here rather than read back after the commit.
     *
     * A pasted line has to point at the pasted shapes, and their sids do not exist until
     * they are added — so either the paste is two transactions (and two undos for one
     * gesture) or it names the nodes itself. `addChild` honours a `sid` a caller
     * provides, so it names them.
     */
    /**
     * What this deck is missing before any of it can be drawn.
     *
     * The definitions the copy names, and the variables they need — in **this** transaction, so one
     * press of undo takes the paste back rather than leaving a library behind. `renames` is what a
     * clash produces: the deck already has that id and says something else, so the arriving card
     * comes in under a new name and the pasted placements have to point at it.
     */
    const plan = pasteCardsPlan(doc, payload.needs);

    const store = editor.dataStore;
    const repoint = (node: DeckNode, depth = 0): void => {
      if (depth > 32) return;
      const id = node.attributes?.componentId;
      if (typeof id === 'string' && plan.renames[id]) {
        node.attributes = { ...node.attributes, componentId: plan.renames[id] };
      }
      for (const child of ((node as { content?: unknown }).content ?? []) as unknown[]) {
        if (child && typeof child === 'object') repoint(child as DeckNode, depth + 1);
      }
    };

    const steps = [
      ...plan.steps,
      ...pastable(payload.boxes, () => store.generateId()).map((node) => {
        const child = node as DeckNode;
        const box = boxOf(child.attributes as never);
        const placed = fromSurface(doc, into, {
          x: box.x + shift.x,
          y: box.y + shift.y
        });
        child.attributes = { ...child.attributes, x: placed.x, y: placed.y };
        repoint(child);
        return { type: 'addChild', payload: { parentId: into, child } };
      })
    ];

    const before = this._childrenOf(doc, into).length;
    const result = await transaction(editor, steps as never).commit();
    if (!result.success) return false;

    // What was pasted is what is selected — a reader pastes in order to move
    // what they pasted, and it is the last N children because that is where
    // `addChild` put them.
    const made = this._childrenOf(doc, into).slice(before);
    if (made.length > 0) editor?.setNode({ nodeIds: made });

    return true;
  }

  private _childrenOf(doc: DeckAccess, sid: string): string[] {
    const content = (doc.getNode(sid) as any)?.content;
    return Array.isArray(content) ? content.filter((c: unknown): c is string => typeof c === 'string') : [];
  }

  /**
   * Which container a paste lands in.
   *
   * The app's answer first, because it is the only one that knows the reader
   * has gone inside a frame. Then the slide of whatever is selected, then the
   * first slide — so a paste into a deck nobody has clicked on yet still works.
   */
  private _destination(editor: Editor, doc: DeckAccess, parentId?: string): string | undefined {
    if (parentId && doc.getNode(parentId)) return parentId;

    const selected = selectedNodeIds(editor.selection)[0];
    const fromSelection = selected ? slideAt(doc, selected) : undefined;
    if (fromSelection) return fromSelection;

    const caret = editor.selection?.startNodeId as string | undefined;
    return caret ? slideAt(doc, caret) : undefined;
  }

  // ── The system clipboard ───────────────────────────────────────────────────

  private async _write(payload: Payload): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
    } catch {
      // Denied, or no gesture. The extension's own copy still holds it, which
      // is what makes copy and paste work inside one deck regardless.
    }
  }

  private async _read(): Promise<Payload | null> {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return null;
    try {
      const text = await navigator.clipboard.readText();
      if (!text.includes(MARKER)) return null;
      const parsed = JSON.parse(text) as Payload;
      return parsed?.barocssSlides === 1 && Array.isArray(parsed.boxes) ? parsed : null;
    } catch {
      return null;
    }
  }
}

/** The clipboard commands, as an extension a kit can install. */
export function createClipboardCommands(): SlidesClipboardExtension {
  return new SlidesClipboardExtension();
}
