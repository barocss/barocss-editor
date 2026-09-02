/**
 * Putting a **stack** on a page, and saying how wide what is in it means to be.
 *
 * ## Why a page's insert is not a slide's
 *
 * A deck's `insertRectangle` puts a box at a coordinate in the middle of the surface the reader is
 * looking at. A page has no coordinates: a stack goes **after the block the caret is in**, which is
 * the same walk Word's `insertFrame` and `insertDrawing` do and for the same reason — "insert" means
 * *next to what I am looking at* everywhere in a document.
 *
 * That is the whole of the difference at this layer, and it is why the commands are the product's
 * while the arrangement is the canvas layer's.
 *
 * ## Why a stack arrives with something in it
 *
 * The frame insert in Word learned this twice and it is written down there: an empty layout box is a
 * rectangle a reader cannot get a caret into, and a paragraph with no *run* draws no caret filler
 * and is zero pixels high. A section arrives as a stack holding one paragraph, which is a thing a
 * reader can immediately type in.
 */
import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { addChild, node, textNode, setAttrs, transaction } from '@barocss/model';
import { SIZING, type Sizing } from './site-schema';
import { holdsABlock } from './selection';
import type { BreakpointId } from './breakpoints';
import { BASE_BREAKPOINT, withOverride } from './responsive';
import { STATE_IDS, stateableIn, withState, type StateId } from './states';

/** What a caller may say about a new stack. */
export interface InsertStackOptions {
  layoutMode?: unknown;
  gap?: unknown;
  padding?: unknown;
  columns?: unknown;
  selection?: unknown;
  /** The page on screen, which the app says because the model has no notion of one. */
  pageId?: unknown;
}

/** The gap a stack starts with: 12pt, which is a section's breathing room. */
const DEFAULT_GAP = 240;

const LAYOUTS = new Set(['row', 'column', 'grid']);

export class SiteStackExtension implements Extension {
  name = 'siteStacks';
  priority = 46;

  onCreate(editor: Editor): void {
    const register = (
      name: string,
      execute: (payload?: Record<string, unknown>) => Promise<boolean>,
      can: (payload?: Record<string, unknown>) => boolean
    ) =>
      (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
        name,
        execute: async (_ed: Editor, payload?: Record<string, unknown>) => await execute(payload),
        canExecute: (_ed: Editor, payload?: Record<string, unknown>) => can(payload)
      });

    /**
     * A **section**: a column that fills the page's width, with a paragraph in it.
     *
     * One command per shape rather than `insertStack({ layoutMode })`, which is the rule the
     * conformance harness enforces about inserts and is right here for the same reason: a toolbar
     * draws one button per shape, and a command that says what it does can be read in a key map.
     */
    register(
      'insertSection',
      async (payload) => await this._insert(editor, { ...payload, layoutMode: 'column' }),
      (payload) => !!this._blockAt(editor, payload?.selection, payload?.pageId)
    );

    register(
      'insertRow',
      async (payload) => await this._insert(editor, { ...payload, layoutMode: 'row' }),
      (payload) => !!this._blockAt(editor, payload?.selection, payload?.pageId)
    );

    register(
      'insertGrid',
      async (payload) => await this._insert(editor, { ...payload, layoutMode: 'grid', columns: 3 }),
      (payload) => !!this._blockAt(editor, payload?.selection, payload?.pageId)
    );

    /**
     * How wide the selected blocks mean to be: fill the stack, hug their content, or keep the
     * width they state.
     *
     * A set, because that is what a selection is here as everywhere — three cards told to fill is
     * one gesture, and doing it one card at a time is the reader keeping the editor's books.
     */
    register(
      'setSizing',
      async (payload) => await this._setSizing(editor, payload),
      (payload) => SIZING.includes(payload?.sizing as Sizing) && this._chosen(editor, payload).length > 0
    );

    /**
     * What the selected blocks look like — **at the width the reader is editing**.
     *
     * ## One command, because there is one gesture
     *
     * A panel changing a gap and a panel changing a gap *on mobile* are the same act to a reader:
     * they are looking at a width and they type a number. Two commands would make the product ask
     * them which kind of change they meant, and a reader who has to answer that has been handed the
     * editor's bookkeeping.
     *
     * So `at` says which width, and the command knows the rest: the widest width **is** the node, so
     * it writes attributes; a narrower one writes only the difference (`responsive.ts`). Which is
     * also the sentence a reader would say — *on mobile, this row stacks* — rather than a mechanism
     * they have to learn.
     *
     * `undefined` for a value takes it back: at the base that means the attribute goes, at a narrower
     * width it means this width stops disagreeing and the page's own answer reaches it again.
     *
     * ## And `state`, for the same reason
     *
     * *Under the pointer, this card is green* is the same gesture again — a reader is looking at a
     * state and typing a colour — so it is the same command with one more word in the payload. When
     * a state is named the width is **ignored**: a state is not a width (`states.ts`), and the paint
     * a reader sets on hover is the site's hover paint whichever board they happened to be looking
     * at. Only paint may be named in a state; a `gap` sent with one is refused rather than written,
     * because a block that resizes under the pointer leaves the pointer and flickers.
     */
    register(
      'setBlockFormat',
      async (payload) => await this._format(editor, payload),
      (payload) =>
        this._chosen(editor, payload).length > 0 &&
        (STATE_IDS.includes(payload?.state as StateId)
          ? this._stateFields(payload).length > 0
          : this._formatFields(payload).length > 0)
    );

    /*
     * There is no `setOverride` any more, and its absence is the record.
     *
     * Two commands used to say "this, only at this width", written before `setBlockFormat` took the
     * width as an argument — and once it did they were dead. Nothing noticed for a week;
     * `every-command-can-be-reached` counted what a reader can actually run and found them both.
     * One gesture, one command: a reader looking at a width and typing a number is doing the same
     * thing whichever width they are looking at.
     */
  }

  private _store(editor: Editor): { getNode: (sid: string) => any } | undefined {
    return (editor as never as { dataStore?: { getNode: (sid: string) => any } }).dataStore;
  }

  /**
   * The block a new sibling goes next to — the same walk both other products do.
   *
   * Up from whatever the selection names until it reaches something whose parent lists it and is
   * not a paragraph, which is a *block*.
   */
  private _blockAt(
    editor: Editor,
    given?: unknown,
    /**
     * The page on screen, as the last resort.
     *
     * A reader who has just opened a site has no selection and no caret, and every insert was greyed
     * out — a toolbar of things they may not have. The page is the app's to say, because the model
     * has no notion of "on screen" and should not grow one.
     */
    page?: unknown
  ): { sid: string; parentId: string; at: number } | null {
    const store = this._store(editor);
    if (!store) return null;

    const selection: any = given ?? (editor as never as { selection?: unknown }).selection;
    /*
     * No selection at all falls through to the page below, rather than returning here.
     *
     * It used to return, which put the fallback after a wall: every insert was greyed out on a
     * freshly opened site and the code that would have fixed it could not be reached. A guard that
     * returns early is a guard that decides more than it looks like it does.
     */
    let node: any = selection?.startNodeId ? store.getNode(selection.startNodeId) : undefined;
    let depth = 0;
    while (node && depth++ < 64) {
      const parent: any = node.parentId ? store.getNode(node.parentId) : undefined;
      const at = parent?.content?.indexOf?.(node.sid) ?? -1;
      if (
        parent &&
        at >= 0 &&
        typeof node.text !== 'string' &&
        node.stype !== 'inline-text' &&
        parent.stype !== 'paragraph' &&
        parent.stype !== 'heading' &&
        holdsABlock(store as never, parent.stype)
      ) {
        return { sid: node.sid, parentId: parent.sid, at };
      }
      node = parent;
    }

    const pageId = typeof page === 'string' ? page : undefined;
    const surface = pageId ? store.getNode(pageId) : undefined;
    if (surface) {
      const at = ((surface.content ?? []) as unknown[]).length;
      return { sid: pageId!, parentId: pageId!, at };
    }
    return null;
  }

  private async _insert(editor: Editor, payload: InsertStackOptions): Promise<boolean> {
    const here = this._blockAt(editor, payload?.selection, payload?.pageId);
    if (!here) return false;

    const mode = LAYOUTS.has(payload?.layoutMode as string) ? (payload!.layoutMode as string) : 'column';
    const attributes: Record<string, unknown> = {
      layoutMode: mode,
      gap: typeof payload?.gap === 'number' ? Math.max(0, payload.gap) : DEFAULT_GAP,
      padding: typeof payload?.padding === 'number' ? Math.max(0, payload.padding) : 0,
      /*
       * A section is as wide as the page. Said on the node rather than left to CSS, because the
       * reader can change it in one place afterwards and because a stack that hugged by default
       * would collapse to the width of its first word — which is what a `<div>` does and what
       * nobody means by "section".
       */
      sizing: 'fill'
    };
    if (mode === 'grid') {
      attributes.columns = typeof payload?.columns === 'number' ? Math.max(1, Math.round(payload.columns)) : 3;
    }

    /*
     * At the end of the page when there was nothing to go next to, and after the block otherwise —
     * which `_blockAt` says by returning the page as its own parent.
     */
    const position = here.parentId === here.sid ? here.at : here.at + 1;
    /*
     * `addChild(parent, child, position)` rather than the object it becomes.
     *
     * The builder has existed all along in `@barocss/model` and no product used one — because the
     * *most* used operation, `setAttrs`, was defined beside it and never exported, so the first thing
     * anyone reached for was not there and the raw object became the local style. Both are here now,
     * and a misspelt `type` is a compile error rather than a transaction that fails at runtime.
     */
    const result = await transaction(editor, [
      addChild(
        here.parentId,
        /*
         * Something to type in. An empty stack is a box a reader cannot get a caret into, and a
         * paragraph with no run draws no caret filler and is zero pixels high — both learned in the
         * word processor, both written down there.
         */
        node('frame', attributes, [node('paragraph', {}, [textNode('inline-text', '')])]) as never,
        position
      )
    ] as never).commit();

    return result.success === true;
  }

  /** The blocks a sizing change is about: the ones named, or the ones selected. */
  private _chosen(editor: Editor, payload?: Record<string, unknown>): string[] {
    const store = this._store(editor);
    if (!store) return [];
    const named = Array.isArray(payload?.nodeIds)
      ? (payload!.nodeIds as unknown[]).filter((one): one is string => typeof one === 'string')
      : selectedNodeIds((editor as never as { selection?: never }).selection);
    return named.filter((sid) => !!store.getNode(sid));
  }

  /**
   * What a block may be told, and nothing else.
   *
   * A list rather than "whatever the payload holds", because a command that writes any key it is
   * handed is a command that can put `sid` in a node's attributes — and the schema would take it.
   *
   * It grew when the panel did, and the growth is the measurement: a sample dense enough to use the
   * schema showed a reader nine more things they could see and not change — what a list is sorted by,
   * what a picture is called, how a heading ranks. The command did not need splitting for them,
   * because they are all the same sentence: *this, about the blocks I have chosen, at the width I am
   * looking at.*
   */
  private static readonly FORMAT = [
    // A stack's arrangement.
    'layoutMode',
    'gap',
    'padding',
    /*
     * And the four sides, which a hero needs and a shorthand cannot say: 96 above a heading and 64
     * below it. Each falls back to `padding`, so a box that states none of them is unchanged.
     */
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'columns',
    'alignItems',
    // Where the children sit **along** the axis, which is what a navigation bar is made of.
    'justifyContent',
    // What it does with the space it is given.
    'sizing',
    'minWidth',
    'maxWidth',
    /*
     * And how **tall**, which this schema could not say at all until a hamburger needed a line two
     * pixels high. `sizing.ts` has the five blocks that turned out to need it.
     */
    'minHeight',
    'maxHeight',
    /*
     * And **where it is**, when it is not simply the next thing in the column: a header that follows
     * the page, a badge on a card's corner, a portrait lifted into the band above. `position.ts` has
     * the argument, including why the offsets are the only lengths here that take a negative number.
     */
    /*
     * And what a **form** and a **field** say, which is the one group of fields here that is not
     * about how a block is drawn: where the answers go, what the question is, and what it arrives
     * called. `setBlockFormat` writes them for the same reason it writes everything else — one
     * command, one undo, and a panel that does not grow a special case per node type.
     */
    /*
     * And what a **picture** says about itself beyond its address: the shape it keeps at every width,
     * and whether a browser should wait until it is needed. `aspect.ts` has why a height cannot
     * answer the first.
     */
    'aspect',
    'defer',
    'action',
    'method',
    'thanks',
    'label',
    'kind',
    'name',
    'required',
    'placeholder',
    'lines',
    'choices',
    'min',
    'max',
    'maxLength',
    'position',
    'insetTop',
    'insetRight',
    'insetBottom',
    'insetLeft',
    'zOrder',
    /*
     * And **how many columns of a grid** it takes, and whether it sits in the middle of what holds
     * it — the two halves of a bento, and of the band-with-a-measure every page is made of.
     */
    'span',
    'centred',
    // What it looks like. Any of these may hold `var:이름` rather than a colour.
    'fill',
    /**
     * And **what is written on it**, which had a row and no way through.
     *
     * `ink` was declared, drawn, offered as 바탕 › 글자 — and missing from this list, so the control
     * had never written anything since the day it was added. Found by the check that runs each row
     * and asks the document whether it moved, which is the check this list is the reason for.
     *
     * It is also the attribute a whole band's readability rests on: the sample's footer went black
     * on black the day its runs stopped carrying colours of their own, and `ink` is what fixed it —
     * from the document literal, because from the panel it could not be set at all.
     */
    'ink',
    'stroke',
    'strokeWidth',
    /*
     * **How much of it comes through**, which the whole product could not set: `opacity` had been
     * exempted from the read check with the reason *"a canvas idea; a page has no z-order to see
     * through"*, and z-order is not what opacity is. `backgroundOpacity`, four lines down, is what
     * that cost — a special case for the one place the need could not be argued away.
     */
    'opacity',
    // A rounded card, which the schema had no word for until a page needed one.
    'cornerRadius',
    // And the four corners, for a box that is square where it meets the one under it.
    'cornerTopLeft',
    'cornerTopRight',
    'cornerBottomRight',
    'cornerBottomLeft',
    /*
     * What it is **painted** with, beyond a flat colour: a gradient, a picture behind the words, a
     * shadow. The names are the deck's exactly — see `paint.ts` for why the names are shared and the
     * arithmetic is not.
     */
    'gradientFrom',
    'gradientTo',
    'gradientAngle',
    'gradientKind',
    'backgroundImage',
    'backgroundFit',
    'backgroundOpacity',
    'shadowColor',
    'shadowBlur',
    'shadowDistance',
    'shadowAngle',
    /*
     * And the sheet **over** the picture, which is a different layer from fading the picture itself
     * — `paint.ts` has the argument and `backgroundOpacity` two lines up is the other half of it.
     */
    'overlay',
    'overlayOpacity',
    /*
     * **The three effects and the two rhythms**, added the day a redesign asked for them.
     *
     * A reminder of what this list is, because forgetting it cost a round: an attribute has to be in
     * **four** places to be alive — declared in the schema, drawn by a renderer, offered by a panel
     * row, and named here. Three of the four is a control that lights up and writes nothing, and the
     * conformance harness cannot see it: it asks whether a row exists, not whether the command the
     * row names will accept what the row sends. The browser's own sweep is what caught these six.
     */
    'rotate',
    'blend',
    'backdropBlur',
    'letterSpacing',
    'lineHeight',
    /*
     * **How long** it takes to get from what it says to what a state says.
     *
     * Here rather than in `_stateFields`, and the placement is the decision: this is not something a
     * state changes, it is a fact about the block that the state rules are written against. A reader
     * setting it while a state is open would otherwise write it *into* the state, where it would be
     * checked against `STATEABLE`, refused, and vanish without a word.
     */
    'transitionMs',
    /*
     * And **how it arrives**. Beside the transition rather than in `_stateFields` for the same
     * reason: it is a fact about the block that a rule is written from, not a value a state changes.
     */
    'reveal',
    // …and whose arrival it is: the block's, or its children's, one after another.
    'revealStagger',
    /*
     * And **what part of the page** this stack is, which decides the element it publishes as. Here
     * rather than in `_stateFields` for the obvious reason: a hover cannot make a box into a footer.
     */
    'landmark',
    /*
     * Whether it is **on the page**, and whether a reader may pick it up.
     *
     * Through `setBlockFormat` like every other fact about a block, rather than commands of their
     * own: a reader hiding a section is doing what they do when they change its padding — looking at
     * a block and saying something about it. Two more commands would be two more things for the
     * keyboard, the menu and the harness to know about, for a gesture that is already spelled.
     */
    'visible',
    'locked',
    /**
     * **Whether it opens, how it starts, and whether only one of a set may be open.**
     *
     * Three more that were declared, drawn, given rows, and never listed here — an accordion whose
     * 여는 것 picker wrote nothing. Grouped with `visible` because they are the same kind of fact: a
     * reader looking at a block and saying what it does, rather than what it looks like.
     */
    /*
     * `opens` is deliberately **not** here, and it was added by mistake for an afternoon: the row
     * that writes it runs `setOpens`, because opening something writes *two* blocks — this one's
     * reference and a durable name on the block being opened. Through this command it would have
     * written the sid a reader pointed at, which no saved document can carry.
     */
    /*
     * A row that scrolls sideways — the stack's own decision about what it does with what it holds,
     * beside `gap` and `layoutMode` rather than among the paint.
     */
    'scrolls',
    /**
     * **What a video plays and what an embed shows.**
     *
     * Seven names, and they are here for the reason this whole list exists: every one of them has a
     * panel row, and a row whose command will not write its attribute is a control that accepts a
     * value and throws it away. Found the moment a test asked the fault list about an embed with no
     * id — the row wrote, the command dropped it, and the document never changed.
     *
     * `id` is the one to look at twice: it is a name generic enough to belong to anything, and it
     * belongs here because `mediaEmbed` is the only node in this schema that has one.
     */
    'provider',
    'id',
    'title',
    'poster',
    'controls',
    'muted',
    'loop',
    'openAtRest',
    'opensOne',
    /**
     * And **where pressing it goes**, which is `opens`'s sibling and *is* here — the distinction
     * between them being the reason the comment above exists.
     *
     * `opens` names a second block and has to mint a durable name on it, so it needs a command of
     * its own. A destination names nothing in this document that could need naming: a page id a
     * reader picked from a list, or an address they typed. One node, one attribute.
     */
    'goes',
    /**
     * **Which connection a form sends through**, which had a row and no way through.
     *
     * `sends` is the name of a resource, so it reads like the other references and was written
     * beside them — and it was never on this list, so the 보낼 곳 연결 picker on every form has
     * accepted a choice and thrown it away for as long as forms have existed.
     *
     * Invisible twice over, and the second time is the interesting one: the check that runs each row
     * *did* find it, and an exemption on `sends` written about a different question — whether the
     * attribute is **read** — silenced the finding. An exemption says which checks it covers now.
     */
    'sends',
    /*
     * Whether it is a window.
     *
     * A page does not clip by silence — see `stackCss` — so this is a reader asking for something
     * rather than a reader escaping a default, which is the only reason it is worth a control.
     */
    'clipsContent',
    // What a reader calls it, which is what a layer list shows and a drawing says.
    'name',
    // A picture.
    'src',
    'alt',
    'fit',
    // A heading's rank, which is the one thing about a heading that is not formatting.
    'level',
    // Which kind of list, and what a code block is written in — each the one question its node has.
    'type',
    'language',
    // A list, and the question it asks of the data.
    'source',
    'sortBy',
    'sortDir',
    'limit',
    'where',
    'equals'
  ] as const;

  /** Which of them this call is actually about — a panel sends one at a time. */
  private _formatFields(payload?: Record<string, unknown>): string[] {
    return SiteStackExtension.FORMAT.filter((name) => name in (payload ?? {}));
  }

  /**
   * Which of them **this** state may hold — and the answer is not the same for all three.
   *
   * A **held** state gets paint and nothing that moves the block: a `:hover` that moved its own
   * block would move it out from under the pointer, and the browser would draw the two states
   * alternately for as long as the visitor held still. An **open** state is remembered rather than
   * held, so nothing alternates and a menu that appears is the whole point of it.
   *
   * The lists live in `states.ts` and are asked here rather than copied: a command that accepted a
   * `gap` on hover would write a document the schema's own check calls faulty, and a reader would
   * find out from a published page that flickers under their pointer.
   */
  private _stateFields(payload?: Record<string, unknown>): string[] {
    const allowed = stateableIn(payload?.state as StateId);
    return this._formatFields(payload).filter((name) => allowed.includes(name));
  }

  private async _format(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const chosen = this._chosen(editor, payload);
    const state = STATE_IDS.includes(payload?.state as StateId)
      ? (payload?.state as StateId)
      : undefined;
    const fields = state ? this._stateFields(payload) : this._formatFields(payload);
    if (chosen.length === 0 || fields.length === 0) return false;

    const at = payload?.at as BreakpointId | undefined;
    const narrower = !state && !!at && at !== BASE_BREAKPOINT;

    const store = this._store(editor);
    const steps = chosen.map((sid) => {
      /*
       * A state is not a width, and the command says so by ignoring `at` when one is given.
       *
       * A card that lifts under the pointer lifts at 390 as well as at 1280 — the gesture is the
       * same gesture — so a reader who sets a hover colour while looking at the mobile board has set
       * the site's hover colour, and the panel says as much beside the switch. The day one genuinely
       * has to differ per width it takes an `overrides` inside the state; there is no second map
       * here for it.
       */
      if (state) {
        let states = withState(
          store?.getNode(sid)?.attributes as Record<string, unknown> | undefined,
          state,
          fields[0],
          payload![fields[0]]
        );
        for (const name of fields.slice(1)) {
          states = withState({ states }, state, name, payload![name]);
        }
        return setAttrs(sid, { states });
      }

      if (!narrower) {
        /*
         * The widest width *is* the node.
         *
         * `null` is normalised to `undefined` here, and only here: at a narrower width it means
         * *nothing at this width*, which is a thing to write down; on the page itself there is
         * nothing to un-say, so it is the same act as clearing the field. A `null` left in an
         * attribute would be a third value — neither set nor unset — for every reader of it.
         */
        const attrs: Record<string, unknown> = {};
        for (const name of fields) attrs[name] = payload![name] ?? undefined;
        return setAttrs(sid, attrs);
      }

      /*
       * A narrower width says only the difference. Folded one field at a time over this node's own
       * overrides, so two selected stacks keep their own — a command that computed one map for both
       * would give the second the first's.
       */
      let overrides = store?.getNode(sid)?.attributes as Record<string, unknown> | undefined;
      let next = withOverride(overrides, at!, fields[0], payload![fields[0]]);
      for (const name of fields.slice(1)) next = withOverride({ overrides: next }, at!, name, payload![name]);
      return setAttrs(sid, { overrides: next });
    });

    return (await transaction(editor, steps as never).commit()).success === true;
  }

  private async _setSizing(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const chosen = this._chosen(editor, payload);
    const sizing = payload?.sizing as Sizing;
    if (chosen.length === 0 || !SIZING.includes(sizing)) return false;

    const steps = chosen.map((sid) => setAttrs(sid, { sizing }));
    return (await transaction(editor, steps as never).commit()).success === true;
  }
}

/** The stack commands, as an extension a kit can install. */
export function createStackCommands(): SiteStackExtension {
  return new SiteStackExtension();
}
