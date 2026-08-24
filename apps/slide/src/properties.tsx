import { useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds } from '@barocss/editor-core';
import {
  Button,
  Choice,
  NumberField,
  TextField,
  PropertyEmpty,
  PropertyTabs,
  PropertyGroup,
  PropertyNumber,
  PropertyPanel,
  PropertyRow,
  PropertyToggle,
  ColorField,
  PropertyChoice,
  LENGTH_UNITS,
  fromDisplay,
  stepFor,
  toDisplay,
  unitSuffix,
  type LengthUnit
} from '@barocss/office-ui';
import { useEditorRevision } from './revision';
import { EffectList, PaintList } from './paint-panel';
import { ComboGallery, PathGallery, PresetGallery } from './preset-gallery';
import {
  NO_CROP,
  agreedAttr,
  boxAt,
  boxesInside,
  masterOf,
  FACINGS,
  FACING_LABELS,
  MOTION_EFFECTS,
  effectsOf,
  matchingPreset,
  paintsOf,
  presetAttrs,
  slideTimeline,
  DECK_THEMES,
  THEME_COLOUR_SLOTS,
  themePayload,
  CUSTOM_THEME,
  themeFor,
  themeMatching,
  themeRef,
  isCropped,
  laysOut,
  transitionOf,
  componentOf,
  deckDesigns,
  jumpOf,
  instanceResizable,
  definitionAt,
  componentsOf,
  instanceVars,
  documentVars,
  varBindsOf,
  varRef,
  UNBINDABLE,
  type DocumentVar,
  type VarBind,
  type Slide
} from '@barocss/office-slides';

/**
 * The properties of what the reader is on.
 *
 * The panel every Office product has, drawn with the suite's components so it is
 * the same panel a reader has already used. What is in it is Slides': a box has
 * a position and a size, which is the whole difference between a slide and a
 * page.
 *
 * ## What it is looking at
 *
 * The nearest box above wherever the selection starts, which answers both
 * questions with one reading. A node selection carries the selected box as its
 * start, so clicking a shape shows that shape; a caret in a paragraph starts
 * inside a text frame, so typing shows the frame being typed in. When neither
 * is in a box it shows the slide, which is the next thing out.
 *
 * (This used to say a node selection did not exist yet. It does, and `boxAt`
 * had been answering for both cases since it did — the note was the stale part,
 * which is the failure this repository keeps finding in its own comments.)
 *
 * ## Why nothing here holds state
 *
 * A field that remembered what was typed would disagree with the document after
 * an undo. Values are read from the model on every render and go back through a
 * command, so the panel cannot be the reason the document and the screen differ.
 * The reading itself is `boxAt` in `office-slides` — pure, and shared with
 * whatever draws the handles later, so the panel and the handles cannot come to
 * different conclusions about which box is being edited.
 *
 * ## What it offers is what the node declares
 *
 * A rectangle has a corner radius and a line does not; a frame clips its
 * contents and an ellipse has nothing to clip. So the rows are not a fixed list
 * — the panel asks the schema which attributes *this* node type declares and
 * draws a control for the ones it knows how to draw.
 *
 * The alternative is a list here and a list in the command and a declaration in
 * the schema, all saying the same thing until one of them stops. That already
 * happened: `cornerRadius`, `locked` and `visible` were declared, drawn, and
 * named by neither command — three attributes a reader could see on the page
 * and nothing could change.
 *
 * ## The unit is the reader's
 *
 * The model is in twips because a slide is a physical surface. A reader is not,
 * so the fields convert — through `@barocss/office-ui`'s converter, shared with
 * whatever Word grows, because two products in one suite showing the same kind
 * of number in different units is the sort of thing nobody decides and everybody
 * inherits.
 *
 * This panel used to show pixels, with a reason: a reader is looking at a
 * 1280×720 slide. The reason does not survive the zoom control — it divided
 * twips by fifteen and stopped, so at half size a box occupying 48 screen pixels
 * read as 96. Neither a physical length nor the reader's pixels, but the pixels
 * it would be at 100%. Centimetres by default, and pixels still on the menu for
 * a deck that is never going to be paper.
 */
/**
 * The four corners, clockwise from the top left — CSS's order and every design
 * tool's, so a document, this panel and the stylesheet all say the same four
 * numbers in the same order.
 */
/**
 * What a connector draws where it arrives, in the reader's words.
 *
 * Eight, because a diagram's end shape *means* something and the meanings are not this
 * product's to invent — a flow is an arrow, an association a dot, and UML's inheritance
 * and composition a hollow triangle and a diamond. See `canvas-connector.ts`.
 */
const CAP_OPTIONS = [
  { id: 'none', label: '없음' },
  { id: 'arrow', label: '화살표' },
  { id: 'open', label: '열린 화살' },
  { id: 'triangle', label: '삼각형' },
  { id: 'hollow', label: '빈 삼각형' },
  { id: 'circle', label: '점' },
  { id: 'diamond', label: '마름모' },
  { id: 'bar', label: '막대' },
  // "Blocked", "not this way" — the one people otherwise draw by deleting the arrow,
  // which loses the fact that the relationship exists *and* is refused.
  { id: 'cross', label: '가위표' }
];

/** The two ends, and what each starts as: a line points *at* something. */
const CAP_ENDS = [
  { key: 'startCap', label: '시작 모양', fallback: 'none' },
  { key: 'endCap', label: '끝 모양', fallback: 'arrow' }
] as const;

const CORNERS = [
  { key: 'cornerTopLeft', label: '왼쪽 위', aria: '왼쪽 위 모서리' },
  { key: 'cornerTopRight', label: '오른쪽 위', aria: '오른쪽 위 모서리' },
  { key: 'cornerBottomRight', label: '오른쪽 아래', aria: '오른쪽 아래 모서리' },
  { key: 'cornerBottomLeft', label: '왼쪽 아래', aria: '왼쪽 아래 모서리' }
] as const;

/** What each slot is called in the panel, which is not what the file calls it. */
const SLOT_NAMES: Record<string, string> = {
  dark1: '어두운 색 1',
  light1: '밝은 색 1',
  dark2: '어두운 색 2',
  light2: '밝은 색 2',
  accent1: '강조 1',
  accent2: '강조 2',
  accent3: '강조 3',
  accent4: '강조 4',
  accent5: '강조 5',
  accent6: '강조 6',
  hyperlink: '하이퍼링크',
  followedHyperlink: '방문한 링크'
};

export function Properties({
  editor,
  slides,
  current,
  /** Which fill's editor is open, so the overlay can draw its axis. */
  paintEdit,
  onPaintEdit,
  /**
   * Which colour stop of that fill is being edited — the app's, so the dot on the
   * shape and the picker in this panel are the same selection.
   */
  stopEdit,
  onStopEdit,
  unit,
  onUnit,
  onEditTheme,
  libraryDecks = []
}: {
  editor: Editor | null;
  slides: Slide[];
  current?: string;
  paintEdit?: number | null;
  onPaintEdit?: (index: number | null) => void;
  stopEdit?: number;
  onStopEdit?: (index: number) => void;
  /**
   * Which unit the fields are in — the *reader's*, held by the app.
   *
   * It was this panel's own state until the overlay's drag readout had to say a
   * length too: two components each choosing a unit is a panel saying 2.5cm about
   * the box a badge calls 25mm. The document is in twips whatever anybody is
   * looking at.
   */
  unit: LengthUnit;
  onUnit: (unit: LengthUnit) => void;
  /**
   * A way into the theme's own slots.
   *
   * A callback rather than a dialog drawn here, because which dialog is open is
   * the app's state — the size and layout dialogs are already there, and a panel
   * that opened its own would be a second place that knows about them.
   */
  onEditTheme?: () => void;
  /**
   * The decks in the reader's own library, by name — for a button that points at one.
   *
   * Handed in rather than read here: the names are storage (the app's), and this panel has none.
   * Empty is the ordinary case and draws no control at all.
   */
  libraryDecks?: string[];
}) {
  /**
   * Which events those are is the suite's answer, not this file's — see
   * `useEditorRevision`, where the three of them and the reason for each are
   * written down once. It was hand-rolled here, and the copy in Word's ribbon
   * was missing one of the three for months.
   */
  const tick = useEditorRevision(editor);

  const box = useMemo(() => {
    if (!editor) return undefined;
    const store = (editor as any).dataStore;
    const rootId = (editor as any).getRootId?.();
    if (!store || !rootId) return undefined;

    const at = (editor as any).selection?.startNodeId as string | undefined;
    return boxAt({ rootId, getNode: (sid: string) => store.getNode(sid) }, at);
  }, [editor, tick]);

  /**
   * Every box the reader has selected, which is a different question from "which
   * box is the panel about".
   *
   * The rows are about *one* box — a position, a size, a fill — and there is no
   * useful answer for three. Motion is the exception: "these three, one after
   * another" is a thing a reader means, and it is the only place in this panel
   * that needs to know there are three.
   */
  const chosen = useMemo(() => {
    const ids = selectedNodeIds((editor as any)?.selection) ?? [];
    return ids.filter((sid): sid is string => typeof sid === 'string');
  }, [editor, tick]);

  /** The other deck this button names, and the page in it — read from the document. */
  const jumpDeck = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const node = box?.sid ? store?.getNode(box.sid) : undefined;
    const deck = node?.attributes?.goToDeck;
    return typeof deck === 'string' && deck.length > 0 ? deck : undefined;
  }, [editor, box, tick]);

  const jumpDeckPage = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const node = box?.sid ? store?.getNode(box.sid) : undefined;
    const page = node?.attributes?.goTo;
    return jumpDeck && typeof page === 'string' && page.length > 0 ? page : undefined;
  }, [editor, box, tick, jumpDeck]);

  const here = useMemo(() => slides.find((slide) => slide.sid === current), [slides, current]);

  /**
   * Or the **design** they are standing in: a layout, or the master.
   *
   * The same "what am I on" question, and the answer a reader could never act on: nothing has
   * ever changed what a layout *is*. `deckDesigns` is the model's list, so this reads the name,
   * the background and how many slides a change reaches from the one place that derives them.
   */
  const design = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId || !current) return undefined;
    const node = store.getNode(current);
    if (node?.stype !== 'slideLayout' && node?.stype !== 'slideMaster') return undefined;
    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
    const found = deckDesigns(doc as never).find((one) => one.sid === current);
    if (!found) return undefined;
    return { ...found, fill: node.attributes?.fill };
  }, [editor, current, tick]);

  /**
   * The **definition** the reader is standing in, when they are not standing on a slide.
   *
   * The panel's "what am I on" question has a third answer now, and it needs one: a card's size
   * cannot be changed from a placement (a placement's extent is the card's), so if it cannot be
   * changed here there is nowhere at all.
   */
  const definition = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId || !current) return undefined;
    const node = store.getNode(current);
    if (node?.stype !== 'component') return undefined;
    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
    const found = componentsOf(doc as never).find((one) => one.sid === current);
    if (!found) return undefined;

    /** How many placements it has, counted from the document — it is derived, not recorded. */
    let placements = 0;
    const walk = (sid: string, depth: number) => {
      if (depth > 32) return;
      const one = store.getNode(sid);
      if (!one) return;
      if (one.stype === 'instance' && one.attributes?.componentId === found.id) placements += 1;
      for (const child of (one.content ?? []) as string[]) {
        if (typeof child === 'string') walk(child, depth + 1);
      }
    };
    walk(rootId, 0);

    return {
      ...found,
      width: typeof node.attributes?.width === 'number' ? node.attributes.width : 0,
      height: typeof node.attributes?.height === 'number' ? node.attributes.height : 0,
      placements
    };
  }, [editor, current, tick]);

  /**
   * The boxes this panel is *about*, which is not always the one it is showing.
   *
   * One when a reader has clicked a shape or has a caret in one. All of them when
   * a reader has selected several — because a reader who selects two shapes and
   * types a width is asking for two shapes to be that wide, and until 2026-08-20
   * this panel changed one of them: measured, a 6000-twip rectangle and a
   * 2000-twip ellipse showed **10.58cm** (the rectangle's, presented as the
   * selection's) and typing a width left the ellipse alone.
   */
  const targets = useMemo(
    () => (chosen.length > 1 ? chosen : box?.sid ? [box.sid] : []),
    [chosen, box]
  );
  /** Whether the panel is about several boxes, which its heading has to say. */
  const many = targets.length > 1;

  /**
   * Whether any of them is a **placement**, whose size is the card's rather than its own.
   *
   * The overlay refuses the resize handles for the same reason (`onlyPlacement` there), and the
   * fields have to say so too: a number a reader can type that changes nothing on the slide is
   * the fault the arranged-frame pair was fixed for.
   */
  const placed = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId) return false;
    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
    // A card with a part that **fills** it is one a reader may resize: the drag reaches the card
    // instead of writing a box nothing reads. So the fields are greyed only where the model has
    // no answer, which is the whole rule this pair follows. Asked of the definition, because that
    // is where the parts are — a placement holds none.
    return targets.some((sid) => {
      const node = store.getNode(sid);
      return node?.stype === 'instance' && !instanceResizable(doc as never, node);
    });
  }, [editor, targets, tick]);

  const doc = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    return store && rootId ? { rootId, getNode: (sid: string) => store.getNode(sid) } : undefined;
  }, [editor, tick]);

  /**
   * What the selection agrees this attribute is — or `null`, which the fields
   * draw as an empty box with a placeholder.
   *
   * `null` rather than the first value, because a panel that shows one of two
   * values applies it to both the next time anything else changes. The
   * arithmetic is `agreedAttr`, in the model, so the overlay and anything else
   * that asks gets the same answer.
   */
  const shared = (key: string): unknown =>
    doc ? agreedAttr(doc as never, targets, key) : undefined;

  /**
   * Which attributes the selection declares, asked of the schema.
   *
   * The panel draws a control only for what the nodes actually have, so a line
   * gets no corner radius and a group — which declares no fill — gets no fill
   * swatch offering to set one the renderer would ignore.
   *
   * *Any* of them, for a selection: a rectangle and an ellipse together offer the
   * corner radius, because the rectangle has one and the command skips the boxes
   * that do not. Greying it out would be answering a question nobody asked.
   */
  const declares = useMemo(() => {
    const schema = (editor as any)?.dataStore?.getActiveSchema?.();
    const store = (editor as any)?.dataStore;
    const types = targets
      .map((sid) => store?.getNode(sid)?.stype)
      .filter((stype: unknown): stype is string => typeof stype === 'string');
    const sets = (types.length > 0 ? types : box?.stype ? [box.stype] : []).map(
      (stype) => schema?.getNodeType?.(stype)?.attrs
    );
    return (key: string) => sets.some((attrs) => !!attrs && key in attrs);
  }, [editor, box, targets, tick]);

  const number = (key: 'x' | 'y' | 'width' | 'height'): number | null => {
    const value = shared(key);
    return typeof value === 'number' ? toDisplay(value, unit) : null;
  };

  const colour = (key: string): string | null => {
    const value = shared(key);
    return typeof value === 'string' && value.length > 0 ? value : null;
  };

  const locked = shared('locked') === true;
  /**
   * Inside a frame that arranges, where a position is not the reader's to type.
   *
   * Asked of the model (`laysOut`), not decided here: the command refuses `x` and `y` for
   * the same reason, and two places working it out separately is how a panel comes to
   * offer a field that does nothing.
   */
  const arranged = targets.some((sid) => {
    const parent = (editor as any)?.dataStore?.getNode(sid)?.parentId as string | undefined;
    return !!parent && laysOut((editor as any)?.dataStore?.getNode(parent)?.attributes);
  });
  const visible = shared('visible') !== false;

  /** A number the model keeps in twips, shown in whatever the reader chose. */
  const lengthOf = (key: string): number | null => {
    const value = shared(key);
    return typeof value === 'number' ? toDisplay(value, unit) : null;
  };

  /** A number the model keeps as itself — degrees, a ratio. */
  const plain = (key: string, fallback: number | null = null): number | null => {
    const value = shared(key);
    return typeof value === 'number' ? value : fallback;
  };

  /** A switch, where absent means off — which is how the document writes "not set". */
  const plainBool = (key: string): boolean => shared(key) === true;

  /**
   * What this shape's press does, as the one string the control shows.
   *
   * `page:<sid>` and `kind:<kind>` rather than two controls: a press does *one* thing, and two
   * controls that can disagree would be a shape that both goes to page four and goes back. The
   * document's own shape is the same one decision — `goTo` **or** `goToKind` — which is why the
   * command clears the other half whenever it writes one.
   */
  /** Whether the reader has just asked for another deck and not yet said which. */
  const [naming, setNaming] = useState(false);

  const jumpValue = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId || !box?.sid) return '';
    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
    const jump = jumpOf(doc as never, store.getNode(box.sid));
    if (!jump) return '';
    // Another document is its own answer: the page is not in this one, so no page option can be
    // the value the control shows.
    if (jump.deck) return 'deck';
    if (jump.kind !== 'page') return `kind:${jump.kind}`;
    // The page as it is *now*: a button pointing at a page the deck no longer has shows as
    // nothing chosen, and the deck's own check is what says so out loud.
    return jump.toSid ? `page:${jump.toSid}` : '';
  }, [editor, box, tick]);

  const setGeometry = (key: string, value: number) => {
    void (editor as any)?.executeCommand?.('setBoxGeometry', {
      nodeIds: targets,
      [key]: fromDisplay(value, unit)
    });
  };

  const setStyle = (patch: Record<string, unknown>) => {
    void (editor as any)?.executeCommand?.('setBoxStyle', { nodeIds: targets, ...patch });
  };

  const setGeometryRaw = (patch: Record<string, unknown>) => {
    void (editor as any)?.executeCommand?.('setBoxGeometry', { nodeIds: targets, ...patch });
  };

  /**
   * Locking goes through its own command.
   *
   * Every other box command is refused for a locked box — that is what `locked`
   * means — so a lock set through `setBoxStyle` could never be taken off again.
   */
  /**
   * A connector's own command, for the same reason a frame's layout has one: what a
   * connector *is* is not a style — it is a pair of shapes, a route between them and
   * the shapes at each end — and `setBoxStyle` would be writing attributes it has no
   * rules for.
   */
  const setConnector = (patch: Record<string, unknown>) => {
    void (editor as any)?.executeCommand?.('setConnector', { nodeIds: targets, ...patch });
  };

  /** Arranging what is in a frame, which is its own command. */
  const setLayout = (patch: Record<string, unknown>) => {
    void (editor as any)?.executeCommand?.('setFrameLayout', { nodeId: box?.sid, ...patch });
  };

  /**
   * Take the crop off, and give the box back the size it was cropped from.
   *
   * Only the fractions would leave a picture in a box the crop had shrunk, so
   * the whole source would be squeezed into the cropped rectangle — undoing the
   * crop and keeping its consequence. The box grows by exactly what was cut:
   * a box showing half the width goes back to twice as wide.
   */
  const uncrop = () => {
    const attrs = (box?.attributes ?? {}) as Record<string, number | undefined>;
    const kept = {
      width: 1 - (attrs.cropLeft ?? 0) - (attrs.cropRight ?? 0),
      height: 1 - (attrs.cropTop ?? 0) - (attrs.cropBottom ?? 0)
    };
    const whole =
      kept.width > 0 && kept.height > 0
        ? {
            x: Math.round((attrs.x ?? 0) - ((attrs.cropLeft ?? 0) / kept.width) * (attrs.width ?? 0)),
            y: Math.round((attrs.y ?? 0) - ((attrs.cropTop ?? 0) / kept.height) * (attrs.height ?? 0)),
            width: Math.round((attrs.width ?? 0) / kept.width),
            height: Math.round((attrs.height ?? 0) / kept.height)
          }
        : {};

    void (editor as any)?.executeCommand?.('cropPicture', {
      nodeId: box?.sid,
      ...whole,
      ...NO_CROP
    });
  };

  /**
   * How the slide on screen arrives, read from the deck rather than held here.
   *
   * The same rule the rest of this panel follows: a control that remembered its
   * own answer would be a second copy of the document's state, and the first
   * thing to disagree with it after an undo.
   */
  const transition = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId || !current) return { effect: 'none' as const, duration: 400 };
    return transitionOf({ rootId, getNode: (sid: string) => store.getNode(sid) }, current);
  }, [editor, current, tick]);

  /**
   * The build this box has, and which press plays it.
  /**
   * The theme's slots, as a reader picks them: the colour each resolves to, and
   * the name that says what following it *means*.
   *
   * Two shapes the same blue are a coincidence; two shapes on accent 1 are a
   * decision, and this is the control that lets a reader make the second one.
   */
  const themeSwatches = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId) return [];

    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
    const theme = themeFor(doc as never, undefined);
    if (!theme) return [];

    return THEME_COLOUR_SLOTS.map((slot) => {
      const colour = theme.attributes?.[slot];
      return typeof colour === 'string' && colour
        ? { value: themeRef(slot), colour, label: SLOT_NAMES[slot] ?? slot }
        : undefined;
    }).filter((swatch): swatch is { value: string; colour: string; label: string } => !!swatch);
  }, [editor, tick]);

  /**
   * The **document's** own colours, offered beside the theme's in every colour field.
   *
   * The gesture that makes a document variable worth having for a bare shape: a reader picks 강조
   * from the picker and the shape stores `var:강조`, which is the same mechanism a theme slot uses
   * and needs no new command — `setBoxStyle` writes it the way it writes a hex.
   *
   * Only the ones of kind `color`, because that is what a swatch can be: a number or a state in
   * this list would be a swatch with no colour to draw. Those reach a shape through a card, where a
   * binding is a declaration and the value is converted while the parts are resolved — the
   * measurement is in `canvas-variable.ts`.
   */
  const varSwatches = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId) return [];

    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
    return documentVars(doc as never)
      .filter((one) => one.kind === 'color' && one.value)
      .map((one) => ({ value: varRef(one.name), colour: one.value, label: one.label }));
  }, [editor, tick]);

  /**
   * The shape's paints and effects, read as lists.
   *
   * Through `paintsOf`/`effectsOf` rather than off the attributes, so a shape
   * written before there were lists — `fill`, `gradientFrom`, `shadowColor` —
   * shows in the panel as the list it is equivalent to, and gains a real one the
   * first time a reader edits it.
   */
  const paints = useMemo(() => paintsOf(box?.attributes as never), [box, tick]);
  const effects = useMemo(() => effectsOf(box?.attributes as never), [box, tick]);

  /**
   * Whether the selection agrees about a *stack*, which a number's rule cannot
   * answer.
   *
   * `agreedAttr` compares with `===`, which is right for a length and useless for
   * a list — two shapes with the same three fills hold two different arrays. So
   * these compare the **read** rather than the attribute: `paintsOf` builds its
   * objects literally, so their JSON is stable, whereas two documents' raw
   * attributes can hold the same fill with its keys in a different order.
   *
   * And the answer is a *note* rather than a blank list, because a stack cannot be
   * blanked: "these two have no shared fills" is not a list, and an empty panel
   * would hide the very rows a reader is about to replace. Editing writes to the
   * whole selection, which is what Figma's *Mixed* chip does when it is clicked.
   */
  const stacksAgree = (read: (attrs: unknown) => unknown): boolean => {
    if (targets.length < 2) return true;
    const store = (editor as any)?.dataStore;
    const seen = targets.map((sid) => JSON.stringify(read(store?.getNode(sid)?.attributes)));
    return seen.every((entry) => entry === seen[0]);
  };

  const paintNote = stacksAgree(paintsOf as never)
    ? undefined
    : '선택한 상자들의 채우기가 서로 다릅니다. 고치면 모두 같아집니다.';
  const effectNote = stacksAgree(effectsOf as never)
    ? undefined
    : '선택한 상자들의 효과가 서로 다릅니다. 고치면 모두 같아집니다.';

  /**
   * Which preset the deck's theme *is*, so the list shows what is applied.
   *
   * Read from the values rather than from the stored `name`, which is what this
   * used to do — so a deck whose accent had been changed to the company's red went
   * on calling itself "Office", and a reader could not see why the list would not
   * put it back. Nothing selected is the truthful third state: this is a theme of
   * the reader's own now. See `themeMatching`.
   */
  const themeName = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId) return '';
    const theme = themeFor({ rootId, getNode: (sid: string) => store.getNode(sid) } as never, undefined);
    // Named rather than blank when it matches nothing. A select whose value is
    // not one of its options shows the *first* one, so an empty string here read
    // as "Office" — which is the exact lie this was written to stop. A word the
    // reader can see is also better than a blank: it says the deck has a theme of
    // its own, which is a thing they did on purpose.
    return themeMatching(theme)?.name ?? CUSTOM_THEME;
  }, [editor, tick]);

  /** What the current slide's layout follows, if it follows anything. */
  const masterName = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId || !here?.layoutId) return undefined;
    const master = masterOf({ rootId, getNode: (sid: string) => store.getNode(sid) }, here.layoutId);
    const name = master?.attributes?.name;
    return typeof name === 'string' && name ? name : master ? '이름 없음' : undefined;
  }, [editor, here, tick]);

  const setTransition = (patch: { effect: string; duration?: number }) => {
    void (editor as any)?.executeCommand?.('setSlideTransition', {
      slideId: current,
      duration: transition.duration,
      ...patch
    });
  };

  const setLocked = (value: boolean) => {
    void (editor as any)?.executeCommand?.('setBoxLocked', { nodeIds: targets, locked: value });
  };

  /**
   * Which half of the panel is showing.
   *
   * A shape has two kinds of answer — what it *is* and what it *does* — and they
   * are used at different times: nobody sets a corner radius and an entrance
   * effect in the same minute. Nine sections in one column made the motion half
   * something a reader scrolled past, which is how a feature comes to look
   * missing.
   *
   * The app's state, not the document's, and kept across selections: a reader
   * animating four shapes in a row should not have to find the tab again for
   * each one.
   */
  const [tab, setTab] = useState<'style' | 'motion'>('style');

  return (
    <PropertyPanel
      title="속성"
      className="sl-properties"
      action={
        <Choice
          ariaLabel="단위"
          testClass="sl-unit"
          className="w-auto"
          value={unit}
          onChange={(picked) => onUnit(picked as LengthUnit)}
        >
          {LENGTH_UNITS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Choice>
      }
    >
      {/*
        * Two tabs, because a shape has two kinds of answer and they are used at
        * different times. The motion half is the same data the timeline draws,
        * for *this shape only* — the pane is the slide's list, and this is what
        * the selected box does in it.
        */}
      <PropertyTabs
        tabs={[
          { id: 'style', label: '속성' },
          { id: 'motion', label: '모션' }
        ]}
        active={tab}
        onChange={(id) => setTab(id as 'style' | 'motion')}
      />

      {tab === 'motion' ? (
        box ? (
          <MotionTab
            editor={editor}
            box={box}
            chosen={chosen}
            current={current}
            locked={locked}
            tick={tick}
          />
        ) : (
          <SlideMotionTab
            transition={transition}
            onTransition={setTransition}
          />
        )
      ) : box ? (
        <>
          <PropertyGroup
            /**
             * What the group is about: this box, or how many.
             *
             * Said here rather than left to the reader to notice, because every
             * field below it now writes to all of them — and a heading naming one
             * shape over fields that change six is the surprise this whole change
             * was about.
             */
            label={many ? `${targets.length}개 선택` : labelFor(box.stype, box.role)}
          >
            {locked && (
              <PropertyEmpty>
                잠긴 상자입니다. 위치와 크기를 바꿀 수 없습니다.
              </PropertyEmpty>
            )}
            {arranged && (
              <PropertyEmpty>
                정렬하는 프레임 안에 있습니다. 위치는 프레임이 정하고, 끌면 순서가 바뀝니다.
              </PropertyEmpty>
            )}
            {/*
              * A placement's size is the card's, said in words as well as by the greyed
              * fields — the same pair the arranged case above needed. Measured before either:
              * dragging a placement's corner wrote a box of 8280×6440 onto a card whose parts
              * stayed 5040×3960, so the outline grew and the card did not change.
              */}
            {placed && (
              <PropertyEmpty>
                컴포넌트를 놓은 자리입니다. 크기는 컴포넌트가 정합니다.
              </PropertyEmpty>
            )}
            <PropertyRow label="위치">
              {/*
                * Greyed inside a frame that arranges, because the frame owns the
                * coordinates (canvas-model §5) and the command refuses them. A field a
                * reader can type into that changes nothing is the fault this pair was
                * fixed for — the drag had it too, and now means the order instead.
                */}
              <PropertyNumber
                ariaLabel="X"
                value={number('x')}
                suffix="X"
                step={stepFor(unit)}
                disabled={locked || arranged}
                onCommit={(value) => setGeometry('x', value)}
              />
              <PropertyNumber
                ariaLabel="Y"
                value={number('y')}
                suffix="Y"
                step={stepFor(unit)}
                disabled={locked || arranged}
                onCommit={(value) => setGeometry('y', value)}
              />
            </PropertyRow>
            <PropertyRow label="크기">
              <PropertyNumber
                ariaLabel="너비"
                value={number('width')}
                suffix="W"
                step={stepFor(unit)}
                disabled={locked || placed}
                onCommit={(value) => setGeometry('width', value)}
              />
              <PropertyNumber
                ariaLabel="높이"
                value={number('height')}
                suffix="H"
                step={stepFor(unit)}
                disabled={locked || placed}
                onCommit={(value) => setGeometry('height', value)}
              />
            </PropertyRow>
            {/*
              * What this box asks of the frame that arranges it.
              *
              * Only inside one, because that is the only place it means anything — and it is the
              * other half of the greyed position fields above: the frame owns where a child
              * goes, and these are what the child gets to say about how it is treated.
              *
              * Measured before they existed: widening a frame moved its children and left every
              * one of them its old size, so a card built out of a frame could be made wider and
              * its rows would sit in the middle of it.
              */}
            {arranged && (
              <PropertyRow label="프레임 안에서">
                {/*
                  * Not called 채우기, and that is a real distinction rather than a test's
                  * convenience: in this panel 채우기 already means **paint** — 채우기 추가, 1번
                  * 채우기, 1번 채우기 종류 — so a switch of that name beside them would be a
                  * reader asking which of the two the row is about. 가득 is what it does to the
                  * frame's room; the colour is what goes in it.
                  */}
                <PropertyToggle
                  ariaLabel="프레임 가득 채우기"
                  label="가득"
                  value={plainBool('layoutStretch')}
                  disabled={locked}
                  onChange={(on) =>
                    void (editor as any)?.executeCommand?.('setBoxLayout', {
                      nodeIds: targets,
                      stretch: on
                    })
                  }
                />
                <PropertyNumber
                  ariaLabel="남은 공간 늘리기"
                  // A share, not a length: 0 keeps its own size, 1 takes what is left, and two
                  // children at 1 halve it — `flex-grow`'s meaning, which is the one readers of
                  // any other tool already know.
                  value={plain('layoutGrow', 0) ?? 0}
                  suffix="↔"
                  step={1}
                  disabled={locked}
                  onCommit={(value) =>
                    void (editor as any)?.executeCommand?.('setBoxLayout', {
                      nodeIds: targets,
                      grow: Math.max(0, value)
                    })
                  }
                />
              </PropertyRow>
            )}
            {/*
              * A **button**: pressing this shows another page.
              *
              * One row, two controls, because a jump is two different kinds of answer: a page
              * the reader picks by name, and the presses that have no page to name — 돌아가기 is
              * the reader's own history, and 다음/이전/처음/끝 are the buttons every non-linear deck
              * puts in a corner.
              *
              * The pages are offered *by name* because that is what a reader knows; what goes
              * in the document is the page's durable id, minted by the command if the page has
              * none. Two pages may be called the same thing, and a sid does not survive a save.
              */}
            {!many && (
              <PropertyRow label="누르면">
                <PropertyChoice
                  ariaLabel="누르면 이동"
                  value={jumpValue}
                  options={[
                    { id: '', label: '아무 일 없음' },
                    { id: 'kind:next', label: '다음 장' },
                    { id: 'kind:previous', label: '이전 장' },
                    { id: 'kind:first', label: '처음 장' },
                    { id: 'kind:last', label: '끝 장' },
                    { id: 'kind:back', label: '돌아가기' },
                    /* A page in another document — the deck of a hundred slides that is really
                       four decks. See `goToDeck`. */
                    { id: 'deck', label: '다른 덱…' },
                    ...slides.map((slide) => ({
                      id: `page:${slide.sid}`,
                      label: `${slide.number}. ${slide.name || '제목 없음'}`
                    }))
                  ]}
                  disabled={locked}
                  onChange={(picked) => {
                    if (!picked) return void (editor as any)?.executeCommand?.('setBoxJump', { nodeIds: targets, to: null });
                    if (picked === 'deck') {
                      /*
                       * Another document: the two fields below are what it needs, and the command
                       * is not run until there is a source to run it with — a button pointing at
                       * an empty address is a button that does nothing.
                       */
                      return setNaming(true);
                    }
                    if (picked.startsWith('kind:')) {
                      return void (editor as any)?.executeCommand?.('setBoxJump', {
                        nodeIds: targets,
                        kind: picked.slice(5)
                      });
                    }
                    void (editor as any)?.executeCommand?.('setBoxJump', {
                      nodeIds: targets,
                      to: picked.slice(5)
                    });
                  }}
                />
              </PropertyRow>
            )}
            {/*
              * Where the other deck is, and which page of it.
              *
              * Two fields rather than one, because they are two answers — a *source this product
              * can fetch* (there is no library of decks, so there is no id for "the pricing deck")
              * and a page's durable id **in that document**, which this one cannot check. The
              * deck's own check says so out loud: 볼 것, not 고칠 것.
              */}
            {!many && (naming || jumpDeck) && (
              <PropertyRow label="다른 덱">
                {/*
                  * The reader's own decks by **name**, and 직접 입력 for anything else.
                  *
                  * Both, because `goToDeck` is both: a name in the library survives the deck being
                  * moved, and an address is the only thing that can be followed on a machine that
                  * has never seen this library (§11i). A free-text box alone was the first version
                  * and asked a reader to know which they wanted, with the names one dialog away.
                  */}
                {libraryDecks.length > 0 && (
                  <PropertyChoice
                    ariaLabel="라이브러리 덱"
                    value={
                      jumpDeck && libraryDecks.includes(jumpDeck) ? jumpDeck : 'typed'
                    }
                    options={[
                      ...libraryDecks.map((name) => ({ id: name, label: name })),
                      { id: 'typed', label: '직접 입력' }
                    ]}
                    disabled={locked}
                    onChange={(picked) => {
                      if (picked === 'typed') return setNaming(true);
                      void (editor as any)?.executeCommand?.('setBoxJump', {
                        nodeIds: targets,
                        deck: picked,
                        to: jumpDeckPage ?? undefined
                      });
                    }}
                  />
                )}
                <TextField
                  ariaLabel="다른 덱 주소"
                  data={{ 'jump-deck': '' }}
                  value={jumpDeck ?? ''}
                  disabled={locked}
                  onCommit={(source) =>
                    void (editor as any)?.executeCommand?.('setBoxJump', {
                      nodeIds: targets,
                      deck: source,
                      to: jumpDeckPage ?? undefined
                    })
                  }
                />
                <TextField
                  ariaLabel="다른 덱의 장"
                  data={{ 'jump-deck-page': '' }}
                  value={jumpDeckPage ?? ''}
                  disabled={locked || !jumpDeck}
                  onCommit={(pageId) =>
                    void (editor as any)?.executeCommand?.('setBoxJump', {
                      nodeIds: targets,
                      deck: jumpDeck as string,
                      to: pageId
                    })
                  }
                />
              </PropertyRow>
            )}
            {declares('rotation') && (
              <PropertyRow label="회전">
                <PropertyNumber
                  ariaLabel="회전"
                  // Degrees, which is what the model keeps — no conversion, and
                  // no rounding for a reader to notice.
                  value={plain('rotation', 0)}
                  suffix="°"
                  disabled={locked}
                  onCommit={(value) => setGeometryRaw({ rotation: value })}
                />
              </PropertyRow>
            )}
            {declares('opacity') && (
              <PropertyRow label="투명도">
                <PropertyNumber
                  ariaLabel="불투명도"
                  // Per cent, because that is what a reader of any other tool
                  // types. The model keeps 0–1.
                  value={Math.round((plain('opacity', 1) ?? 1) * 100)}
                  suffix="%"
                  step={5}
                  disabled={locked}
                  onCommit={(value) =>
                    setGeometryRaw({ opacity: Math.min(1, Math.max(0, value / 100)) })
                  }
                />
              </PropertyRow>
            )}
            <PropertyRow label="상태">
              {declares('visible') && (
                <PropertyToggle
                  ariaLabel="표시"
                  label="표시"
                  value={visible}
                  disabled={locked}
                  onChange={(value) => setGeometryRaw({ visible: value })}
                />
              )}
              {declares('locked') && (
                <PropertyToggle
                  ariaLabel="잠금"
                  label="잠금"
                  value={locked}
                  // Not disabled by `locked`: this is the one control that has to
                  // work on a locked box, because it is what unlocks it.
                  onChange={setLocked}
                />
              )}
            </PropertyRow>
          </PropertyGroup>

          {/*
            * A frame that arranges what is in it.
            *
            * `layoutMode` is declared on `frame` and on nothing else, so the
            * group appears for a frame and for no other box — the same rule the
            * rest of this panel follows, asked of the schema rather than of a
            * list of stypes.
            *
            * Turning it on *is* the arrangement: the command sets the mode and
            * places the children in one transaction, so a reader who picks
            * "가로" sees the boxes move rather than a setting that promises to
            * matter later.
            */}
          {declares('layoutMode') && (
            <PropertyGroup label="배치">
              <PropertyRow label="방향">
                <PropertyChoice
                  ariaLabel="배치 방향"
                  value={
                    typeof box?.attributes?.layoutMode === 'string'
                      ? (box.attributes.layoutMode as string)
                      : 'none'
                  }
                  options={[
                    { id: 'none', label: '없음' },
                    { id: 'row', label: '가로' },
                    { id: 'column', label: '세로' },
                    { id: 'grid', label: '그리드' }
                  ]}
                  disabled={locked}
                  onChange={(value) => setLayout({ layoutMode: value })}
                />
              </PropertyRow>
              {laysOut(box?.attributes) && (
                <>
                  <PropertyRow label="간격">
                    <PropertyNumber
                      ariaLabel="간격"
                      value={lengthOf('gap') ?? 0}
                      suffix={unitSuffix(unit)}
                      step={stepFor(unit)}
                      disabled={locked}
                      onCommit={(value) => setLayout({ gap: fromDisplay(Math.max(0, value), unit) })}
                    />
                  </PropertyRow>
                  <PropertyRow label="여백">
                    <PropertyNumber
                      ariaLabel="안쪽 여백"
                      value={lengthOf('padding') ?? 0}
                      suffix={unitSuffix(unit)}
                      step={stepFor(unit)}
                      disabled={locked}
                      onCommit={(value) =>
                        setLayout({ padding: fromDisplay(Math.max(0, value), unit) })
                      }
                    />
                  </PropertyRow>
                  <PropertyRow label="맞춤">
                    <PropertyChoice
                      ariaLabel="교차 축 맞춤"
                      value={
                        typeof box?.attributes?.alignItems === 'string'
                          ? (box.attributes.alignItems as string)
                          : 'start'
                      }
                      options={[
                        { id: 'start', label: '시작' },
                        { id: 'center', label: '가운데' },
                        { id: 'end', label: '끝' }
                      ]}
                      disabled={locked}
                      onChange={(value) => setLayout({ alignItems: value })}
                    />
                  </PropertyRow>
                  {box?.attributes?.layoutMode === 'grid' && (
                    <PropertyRow label="열">
                      <PropertyNumber
                        ariaLabel="열 수"
                        value={plain('columns', 2)}
                        disabled={locked}
                        onCommit={(value) =>
                          setLayout({ columns: Math.max(1, Math.round(value)) })
                        }
                      />
                    </PropertyRow>
                  )}
                </>
              )}
            </PropertyGroup>
          )}

          {/*
            * A line that remembers what it joins.
            *
            * Only for a connector, and driven by the schema like every other row here:
            * `declares('startNodeId')` is true of nothing else, so a rectangle never
            * sees a route control and a reader never learns a rule that has
            * exceptions.
            *
            * The two ends are not offered as *shapes* to pick — that is a drag on the
            * canvas, which is the next piece of work — but everything about the line
            * itself is here: the way it goes, how far it bows, and what is drawn where
            * it arrives.
            */}
          {/*
            * A **placement** of a component: what it can be asked for, and the two decisions
            * about following.
            *
            * Drawn from the definition's own declaration (`instanceVars`), so the fields are
            * whatever the card says it takes — a panel with a fixed list of fields would be a
            * second place that has to know what a card is.
            */}
          {box?.stype === 'instance' && (
            <ComponentGroup editor={editor} sid={box.sid as string} locked={locked} tick={tick} />
          )}

          {/*
            * A **part** of a definition: what it takes from the card, and whether it is the
            * slot. Drawn only while the reader is inside one, because a binding on a box that
            * is on a slide is a claim about a card that does not exist.
            */}
          {box?.sid && <PartGroup editor={editor} sid={box.sid as string} locked={locked} tick={tick} />}

          {/*
            * And what an **ordinary shape** takes from the document's variables.
            *
            * The same rows as a card's part, about the document instead of the card — because a
            * reference (`fill: 'var:주의'`) only fits where the schema says a string goes, and a
            * number, a state and a shape's words needed a declaration (§10h-2). Drawn only when the
            * document has variables of its own: a group of empty selects on every shape is chrome
            * for a feature the deck is not using.
            */}
          {box?.sid && targets.length > 0 && (
            <BindGroup editor={editor} sids={targets} locked={locked} tick={tick} />
          )}

          {declares('startNodeId') && (
            <PropertyGroup label="연결선">
              <PropertyRow label="경로">
                <PropertyChoice
                  ariaLabel="경로"
                  value={String(box?.attributes?.kind ?? 'elbow')}
                  options={[
                    { id: 'elbow', label: '직각' },
                    { id: 'straight', label: '직선' },
                    { id: 'curve', label: '곡선' },
                    /**
                     * 활 — the arc, and the one route with no magnets: it leaves each
                     * shape *towards* the control point, so it points at the shape
                     * however the shape is turned. See `arcPoints`.
                     */
                    { id: 'arc', label: '활' }
                  ]}
                  disabled={locked}
                  onChange={(value) => setConnector({ kind: value })}
                />
              </PropertyRow>
              {Array.isArray(box?.attributes?.waypoints) &&
                (box.attributes.waypoints as unknown[]).length > 0 && (
                  <PropertyRow label="경유점">
                    {/*
                      * The count, and a way back.
                      *
                      * Bends are placed on the line itself — a grip in the middle of each
                      * run — so there is nothing to *set* here. What a panel is for is
                      * saying how many there are (a line with one bend hidden behind a
                      * shape looks like a line with none) and undoing all of them at once,
                      * which is otherwise several double-clicks.
                      */}
                    <span className="sl-wp-count">
                      {(box.attributes.waypoints as unknown[]).length}개
                    </span>
                    <Button
                      title="경유점 지우기"
                      data={{ 'wp-clear': '' }}
                      disabled={locked}
                      onClick={() => setConnector({ waypoints: [] })}
                    >
                      지우기
                    </Button>
                  </PropertyRow>
                )}
              <PropertyRow label="방향">
                {/*
                  * Turn the line round.
                  *
                  * A connector is a relationship and a relationship has a direction — the
                  * arrowhead is on the end — and drawing it the wrong way round happens
                  * whenever a reader picks the two shapes in the order they were thinking
                  * of them. The ways back were deleting the line or dragging both ends
                  * past each other.
                  */}
                <Button
                  title="시작과 끝을 바꿉니다"
                  data={{ 'conn-reverse': '' }}
                  disabled={locked}
                  onClick={() =>
                    void (editor as any)?.executeCommand?.('reverseConnector', {
                      nodeIds: targets
                    })
                  }
                >
                  뒤집기
                </Button>
              </PropertyRow>
              <PropertyRow label="흐름">
                <PropertyToggle
                  ariaLabel="흐름"
                  label="흐르게"
                  /**
                   * Dashes travelling along the line. An arrowhead says where it points
                   * standing still; a flow says it moving, and with six lines on a slide
                   * the one that flows is the one the eye follows.
                   */
                  value={box?.attributes?.flow === true}
                  disabled={locked}
                  onChange={(next) => setConnector({ flow: next })}
                />
              </PropertyRow>
              <PropertyRow label="이름표">
                <TextField
                  ariaLabel="이름표"
                  /**
                   * The word the line carries — "yes", "no", "1..n", "on failure".
                   * Short by construction (`LABEL_MAX`): a line carries a word, and a
                   * paragraph on one is a text box that should have been placed as one.
                   */
                  value={
                    typeof box?.attributes?.label === 'string'
                      ? (box.attributes.label as string)
                      : ''
                  }
                  maxLength={24}
                  placeholder="선 위에 쓸 말"
                  disabled={locked}
                  onCommit={(value) => setConnector({ label: value })}
                />
              </PropertyRow>
              {/*
                * A word for each end, beside the one in the middle.
                *
                * UML's multiplicity — `1` here, `0..*` there — which is the difference
                * between "an order has items" and "an order has many items". In the panel
                * rather than on the canvas: the double-click gesture already means the
                * *middle* label, and a second gesture that depended on how near an end the
                * pointer was would be a control a reader could not aim.
                */}
              <PropertyRow label="양끝 이름표">
                <TextField
                  ariaLabel="시작 이름표"
                  value={
                    typeof box?.attributes?.startLabel === 'string'
                      ? (box.attributes.startLabel as string)
                      : ''
                  }
                  maxLength={24}
                  placeholder="시작 쪽"
                  disabled={locked}
                  onCommit={(value) => setConnector({ startLabel: value })}
                />
                <TextField
                  ariaLabel="끝 이름표"
                  value={
                    typeof box?.attributes?.endLabel === 'string'
                      ? (box.attributes.endLabel as string)
                      : ''
                  }
                  maxLength={24}
                  placeholder="끝 쪽"
                  disabled={locked}
                  onCommit={(value) => setConnector({ endLabel: value })}
                />
              </PropertyRow>
              {/*
                * How the label is set, and only when there *is* one.
                *
                * A size field on a line with no label is a control for nothing — the same
                * rule the 경유점 row follows. A diagram's words carry weight the line
                * cannot: a red 실패 on the path nobody wants, a bold 필수 on the one they
                * must take.
                */}
              {(['label', 'startLabel', 'endLabel'] as const).some(
                (key) =>
                  typeof box?.attributes?.[key] === 'string' &&
                  (box.attributes[key] as string).length > 0
              ) && (
                  <PropertyRow label="이름표 꾸미기">
                    {/*
                      * Points, because that is what a reader means by "열 포인트" — the
                      * model keeps twips like every other length here, and twenty of them
                      * are a point. The conversion is in this one place rather than in the
                      * command, so the document never holds a unit an app invented.
                      */}
                    <PropertyNumber
                      ariaLabel="이름표 크기"
                      value={
                        typeof box?.attributes?.labelSize === 'number'
                          ? (box.attributes.labelSize as number) / 20
                          : null
                      }
                      suffix="pt"
                      step={1}
                      disabled={locked}
                      onCommit={(value) => setConnector({ labelSize: Math.round(value * 20) })}
                    />
                    <ColorField
                      ariaLabel="이름표 색"
                      themeSwatches={themeSwatches}
                      varSwatches={varSwatches}
                      value={colour('labelColor')}
                      disabled={locked}
                      onChange={(value) => setConnector({ labelColor: value })}
                      onClear={() => setConnector({ labelColor: null })}
                    />
                    <PropertyToggle
                      ariaLabel="이름표 굵게"
                      label="굵게"
                      value={box?.attributes?.labelBold === true}
                      disabled={locked}
                      onChange={(next) => setConnector({ labelBold: next })}
                    />
                  </PropertyRow>
                )}
              <PropertyRow label="구부리기">
                <PropertyNumber
                  ariaLabel="구부리기"
                  /**
                   * Signed, and that is the whole use of it: two connectors between the
                   * same pair of shapes sit on top of each other until one is bowed the
                   * other way.
                   */
                  value={toDisplay((box?.attributes?.bend as number) ?? 0, unit)}
                  suffix={unit}
                  disabled={locked}
                  onCommit={(value) => setConnector({ bend: fromDisplay(value, unit) })}
                />
              </PropertyRow>
              {CAP_ENDS.map((end) => (
                <PropertyRow key={end.key} label={end.label}>
                  <PropertyChoice
                    ariaLabel={end.label}
                    value={String(box?.attributes?.[end.key] ?? end.fallback)}
                    options={CAP_OPTIONS}
                    disabled={locked}
                    onChange={(value) => setConnector({ [end.key]: value })}
                  />
                </PropertyRow>
              ))}
            </PropertyGroup>
          )}

          {(declares('fill') || declares('stroke') || declares('cornerRadius')) && (
          <PropertyGroup label="채우기와 선">
            {declares('stroke') && (
            <PropertyRow label="선">
              <ColorField
                ariaLabel="선 색"
                themeSwatches={themeSwatches}
                      varSwatches={varSwatches}
                value={colour('stroke')}
                disabled={locked}
                onChange={(value) => setStyle({ stroke: value })}
                onClear={() => setStyle({ stroke: null })}
              />
            </PropertyRow>
            )}
            {declares('strokeWidth') && (
              <PropertyRow label="선 두께">
                <PropertyNumber
                  ariaLabel="선 두께"
                  /**
                   * Points, whatever the reader picked for everything else.
                   *
                   * A stroke is a line *weight*, not a distance across the
                   * slide, and every tool that draws one measures it in points —
                   * a one-point rule is a one-point rule on paper and on a
                   * projector. In centimetres the same rule reads 0.07, which
                   * is a number nobody can type or check.
                   */
                  value={toDisplay(box?.attributes?.strokeWidth as number ?? 0, 'pt')}
                  suffix="pt"
                  step={0.5}
                  disabled={locked}
                  onCommit={(value) =>
                    setStyle({ strokeWidth: fromDisplay(Math.max(0, value), 'pt') })
                  }
                />
              </PropertyRow>
            )}
            {declares('strokeDash') && (
              <PropertyRow label="선 모양">
                <PropertyChoice
                  ariaLabel="선 모양"
                  value={
                    typeof box?.attributes?.strokeDash === 'string'
                      ? (box.attributes.strokeDash as string)
                      : 'solid'
                  }
                  options={[
                    { id: 'solid', label: '실선' },
                    { id: 'dash', label: '파선' },
                    { id: 'dot', label: '점선' },
                    { id: 'dashDot', label: '일점쇄선' }
                  ]}
                  disabled={locked}
                  onChange={(value) => setStyle({ strokeDash: value })}
                />
              </PropertyRow>
            )}
            {/*
              * A rectangle declares this and nothing else does, which is the
              * whole reason the rows come from the schema rather than a list.
              */}
            {declares('cornerRadius') && (
              <>
                <PropertyRow label="모서리">
                  <PropertyNumber
                    ariaLabel="모서리 둥글기"
                    value={lengthOf('cornerRadius') ?? 0}
                    suffix={unitSuffix(unit)}
                    step={stepFor(unit)}
                    disabled={locked}
                    onCommit={(value) =>
                      setStyle({ cornerRadius: fromDisplay(Math.max(0, value), unit) })
                    }
                  />
                </PropertyRow>
                {/*
                  * And each corner on its own, which is what a card with two
                  * rounded corners at the top needs.
                  *
                  * A corner with no number of its own follows the radius above,
                  * so each field shows what the box is actually drawing rather
                  * than a zero. That is why the four are declared without a
                  * default — see `corners.ts`.
                  */}
                {CORNERS.map((corner) => (
                  <PropertyRow key={corner.key} label={corner.label}>
                    <PropertyNumber
                      ariaLabel={corner.aria}
                      value={lengthOf(corner.key) ?? lengthOf('cornerRadius') ?? 0}
                      suffix={unitSuffix(unit)}
                      step={stepFor(unit)}
                      disabled={locked}
                      onCommit={(value) =>
                        setStyle({ [corner.key]: fromDisplay(Math.max(0, value), unit) })
                      }
                    />
                  </PropertyRow>
                ))}
              </>
            )}
          </PropertyGroup>
          )}

          {/*
            * The text inside the box, which is not the same question as the box.
            *
            * `verticalAlign` was declared on `textFrame` the day the node was
            * written and drawn by the renderer ever since, with nothing anywhere
            * that could set it: a title centred in its placeholder was a
            * document you could write by hand and not by editing. Word's cells
            * have had these three buttons since its table work.
            *
            * Shown for whatever declares it, like every other row here — today
            * that is the text frame, and a cell on a slide the day one declares
            * the same attribute.
            */}
          {declares('verticalAlign') && (
            <PropertyGroup label="텍스트">
              <PropertyRow label="세로 맞춤">
                <PropertyChoice
                  ariaLabel="세로 맞춤"
                  value={
                    typeof box?.attributes?.verticalAlign === 'string'
                      ? (box.attributes.verticalAlign as string)
                      : 'top'
                  }
                  options={[
                    { id: 'top', label: '위' },
                    { id: 'middle', label: '가운데' },
                    { id: 'bottom', label: '아래' }
                  ]}
                  disabled={locked}
                  onChange={(value) => setStyle({ verticalAlign: value })}
                />
              </PropertyRow>
              {declares('textInset') && (
                <PropertyRow label="안쪽 여백">
                  <PropertyNumber
                    ariaLabel="텍스트 안쪽 여백"
                    value={lengthOf('textInset') ?? 0}
                    suffix={unitSuffix(unit)}
                    step={stepFor(unit)}
                    disabled={locked}
                    onCommit={(value) =>
                      setStyle({ textInset: fromDisplay(Math.max(0, value), unit) })
                    }
                  />
                </PropertyRow>
              )}
            </PropertyGroup>
          )}

          {/*
            * A picture: how it sits in its box, and what has been cropped away.
            *
            * `fit` was declared on `picture` the day the node was written and
            * read by the renderer ever since, with nothing that could set it —
            * the same fault as `verticalAlign` above, in the same schema, found
            * by the same sweep.
            *
            * The crop itself is dragged rather than typed: double-click a
            * picture and the handles take source away instead of resizing it.
            * What belongs here is the way *back*, because a reader who has
            * cropped too far has no gesture that means "all of it again".
            */}
          {declares('fit') && (
            <PropertyGroup label="그림">
              <PropertyRow label="맞춤">
                <PropertyChoice
                  ariaLabel="그림 맞춤"
                  value={
                    typeof box?.attributes?.fit === 'string'
                      ? (box.attributes.fit as string)
                      : 'contain'
                  }
                  options={[
                    { id: 'contain', label: '전체 보기' },
                    { id: 'cover', label: '가득 채우기' },
                    { id: 'fill', label: '늘이기' }
                  ]}
                  disabled={locked}
                  onChange={(value) => setStyle({ fit: value })}
                />
              </PropertyRow>
              <PropertyRow label="자르기">
                <Button
                  className="w-full"
                  ariaLabel="자르기 원래대로"
                  disabled={locked || !isCropped(box?.attributes as never)}
                  onClick={() => uncrop()}
                >
                  원래대로
                </Button>
              </PropertyRow>
            </PropertyGroup>
          )}


          {/*
            * The stacks: every paint the shape is filled with, and every effect
            * on it.
            *
            * Two groups of flat rows became two *lists*, because a shape can
            * have several of each — a photograph tinted by a colour over it, a
            * card with a soft shadow and a hard key line — and a form with one
            * row per idea cannot say either. The rows add, reorder by their
            * order in the list, switch off and delete, which is what a stack has
            * to offer before it is one.
            *
            * Shown for the nodes that declare them, like every other row here.
            */}
          {declares('fills') && (
            <PaintList
              label="채우기"
              note={paintNote}
              paints={paints}
              themeSwatches={themeSwatches}
                      varSwatches={varSwatches}
              disabled={locked}
              editing={paintEdit ?? null}
              onEditing={onPaintEdit}
              stopEditing={stopEdit ?? 0}
              onStopEditing={onStopEdit}
              /**
               * Writing the list takes the flat attributes away with it.
               *
               * They are the *same fact* — `fill` and `gradientFrom` are what a
               * shape said before it could say a list — and a document holding
               * both would have two answers to one question, with the reader's
               * newer one winning silently. Cleared here rather than in the
               * command, because it is the panel that knows the reader has just
               * replaced the old form with the new one.
               */
              onChange={(next) =>
                setStyle({
                  fills: next,
                  fill: null,
                  gradientFrom: null,
                  gradientTo: null,
                  gradientAngle: null,
                  gradientKind: null
                })
              }
            />
          )}

          {declares('effects') && (
            <EffectList
              effects={effects}
              note={effectNote}
              themeSwatches={themeSwatches}
                      varSwatches={varSwatches}
              disabled={locked}
              onChange={(next) =>
                setStyle({
                  effects: next,
                  shadowColor: null,
                  shadowBlur: null,
                  shadowDistance: null,
                  shadowAngle: null
                })
              }
            />
          )}
        </>
      ) : design ? (
        /*
         * A **layout** or the **master**, with nothing selected in it: the thing the deck
         * inherits from. Where a slide's group would be, because it is the same question — what
         * am I standing on — and until now this had no third answer, which is exactly the state
         * the feature was in: readable by everything, changeable by nobody.
         */
        <PropertyGroup
          label={design.kind === 'master' ? `마스터 · ${design.name || design.id}` : `레이아웃 · ${design.name || design.id}`}
        >
          <PropertyRow label="이름">
            <TextField
              ariaLabel="정의 이름"
              value={design.name}
              onCommit={(name) =>
                void (editor as any)?.executeCommand?.('setDesign', { nodeId: design.sid, name })
              }
            />
          </PropertyRow>
          <PropertyRow label="배경">
            {/*
              * The colour every slide that follows it draws — which is the one thing a layout
              * has always been able to give a slide *live* (`backgroundOf` reads the chain:
              * the slide's own, then its layout's, then the master's).
              */}
            <ColorField
              ariaLabel="정의 배경"
              value={typeof design.fill === 'string' ? design.fill : null}
              themeSwatches={themeSwatches}
                      varSwatches={varSwatches}
              onChange={(fill) =>
                void (editor as any)?.executeCommand?.('setDesign', { nodeId: design.sid, fill })
              }
              onClear={() =>
                void (editor as any)?.executeCommand?.('setDesign', { nodeId: design.sid, fill: null })
              }
            />
          </PropertyRow>
          <PropertyRow label="따르는 장">
            <span className="text-neutral-500" data-design-reach={design.slides}>
              {design.slides}장
            </span>
            {/*
              * And the way to push this layout's arrangement onto them.
              *
              * Because a layout's **boxes are copied, not drawn from the layout**: a slide draws
              * its layout's formatting and background live and its boxes never. Offered rather
              * than automatic — a reader who edits a layout and watches twenty slides rearrange
              * without asking has lost twenty slides. A *component* is the other decision, and
              * deliberately: a card's parts are the definition's, so nothing is offered because
              * nothing has to be carried (§10b-2a).
              */}
            {design.kind === 'layout' && design.slides > 0 && (
              <Button
                title="이 레이아웃을 따르는 장들의 상자를 각자의 자리로 옮깁니다"
                data={{ 'design-apply': design.id }}
                onClick={() =>
                  void (editor as any)?.executeCommand?.('applyDesign', { layoutId: design.id })
                }
              >
                따르는 장에 적용
              </Button>
            )}
          </PropertyRow>
        </PropertyGroup>
      ) : definition ? (
        /*
         * A **definition** with nothing selected in it: the card itself.
         *
         * Where a slide's group would be, because it is the same question — what am I standing
         * on — and the reader standing on a card has a different answer to it. Its size is here
         * because a placement's is not: a placement's extent *is* the card's, so this is the
         * one place a card's size can be changed (canvas-model §10b-12).
         */
        <PropertyGroup label={`컴포넌트 · ${definition.name || '이름 없음'}`}>
          <PropertyRow label="이름">
            <span className="text-neutral-500">{definition.id}</span>
          </PropertyRow>
          <PropertyRow label="크기">
            <PropertyNumber
              ariaLabel="컴포넌트 너비"
              value={toDisplay(definition.width, unit)}
              suffix="W"
              step={stepFor(unit)}
              onCommit={(value) =>
                void (editor as any)?.executeCommand?.('setComponentSize', {
                  componentId: definition.id,
                  width: Math.round(fromDisplay(value, unit))
                })
              }
            />
            <PropertyNumber
              ariaLabel="컴포넌트 높이"
              value={toDisplay(definition.height, unit)}
              suffix="H"
              step={stepFor(unit)}
              onCommit={(value) =>
                void (editor as any)?.executeCommand?.('setComponentSize', {
                  componentId: definition.id,
                  height: Math.round(fromDisplay(value, unit))
                })
              }
            />
          </PropertyRow>
          <PropertyRow label="놓인 곳">
            {/* What changing this card changes, said as a number: 스무 곳 is a different
                decision from 한 곳. */}
            <span className="text-neutral-500">{definition.placements}곳</span>
          </PropertyRow>
          <PropertyEmpty>
            변수는 왼쪽 컴포넌트 목록에서, 부품이 무엇을 받는지는 부품을 골라서 정합니다.
          </PropertyEmpty>
        </PropertyGroup>
      ) : (
        <PropertyGroup label={here ? `슬라이드 ${here.number}` : '슬라이드'}>
          {/*
           * The slide's own facts first, and the hint after them.
           *
           * It read the other way round — a sentence telling the reader to click
           * something, with the answers to what they *are* looking at underneath
           * — which puts an instruction where a value belongs and makes the
           * panel look empty when it is not.
           */}
          {here && (
            <>
              <PropertyRow label="레이아웃">
                <span className="text-neutral-500">{here.layoutId ?? '없음'}</span>
              </PropertyRow>
              {/*
                * And what the layout itself follows.
                *
                * Read-only, like the layout above it: both are the deck's
                * structure rather than this slide's, and a control that changed
                * them from here would be changing every slide that shares them
                * from a panel that says "슬라이드 1".
                */}
              {masterName && (
                <PropertyRow label="마스터">
                  <span className="text-neutral-500">{masterName}</span>
                </PropertyRow>
              )}
              {/*
                * And the theme the deck is designed in.
                *
                * Choosing one re-colours every shape that *follows* the deck and
                * leaves alone every shape that chose its own colour — which is
                * not a rule this has to implement. It is what naming a slot
                * already means, and it is the reason the theme exists.
                */}
              <PropertyRow label="테마">
                <span className="flex items-center gap-1">
                  <PropertyChoice
                    ariaLabel="테마"
                    value={themeName}
                    /**
                     * The designed sets, and — only while it applies — the
                     * reader's own.
                     *
                     * Offered rather than selectable: there is nothing for
                     * choosing "사용자 지정" to *do*, so it appears when it is the
                     * answer and is gone once a preset is picked.
                     */
                    options={[
                      ...(themeName === CUSTOM_THEME
                        ? [{ id: CUSTOM_THEME, label: CUSTOM_THEME }]
                        : []),
                      ...DECK_THEMES.map((entry) => ({ id: entry.name, label: entry.name }))
                    ]}
                    onChange={(name) => {
                      const chosen = DECK_THEMES.find((entry) => entry.name === name);
                      if (!chosen) return;
                      void (editor as any)?.executeCommand?.(
                        'setDeckTheme',
                        themePayload(chosen)
                      );
                    }}
                  />
                  {/*
                    And a way into the slots the list is naming.
                    
                    Beside the list rather than replacing it, because they are two
                    different things a reader wants: one of the designed sets, or
                    the one colour their company actually uses. Every tool with
                    themes offers both, in this order.
                  */}
                  {onEditTheme && (
                    <Button
                      title="테마 색 편집"
                      data={{ 'theme-edit': '' }}
                      onClick={onEditTheme}
                    >
                      편집
                    </Button>
                  )}
                </span>
              </PropertyRow>
              <PropertyRow label="발표">
                <span className="text-neutral-500">
                  {here.hidden ? '건너뜀' : '표시'}
                </span>
              </PropertyRow>
              {/*
                * How this slide arrives — the first thing in this product that
                * has a duration.
                *
                * A slide's, not a box's, which is why it sits here rather than
                * in the panel above: a transition is the whole slide replacing
                * the one before it. The timing itself lives beside the document
                * in a `motionTrack`; this row names an effect and a length and
                * lets the command write as much of that structure as is missing.
                */}
              <PropertyRow label="전환">
                <PropertyChoice
                  ariaLabel="화면 전환"
                  value={transition.effect}
                  options={[
                    { id: 'none', label: '없음' },
                    { id: 'fade', label: '흐리게' },
                    { id: 'slideLeft', label: '왼쪽으로 밀기' },
                    { id: 'slideRight', label: '오른쪽으로 밀기' },
                    { id: 'slideUp', label: '위로 밀기' },
                    { id: 'wipe', label: '닦아내기' },
                    { id: 'zoom', label: '확대' }
                  ]}
                  onChange={(value) => setTransition({ effect: value })}
                />
              </PropertyRow>
              {transition.effect !== 'none' && (
                <PropertyRow label="전환 시간">
                  <PropertyNumber
                    ariaLabel="화면 전환 시간"
                    value={transition.duration / 1000}
                    suffix="초"
                    step={0.1}
                    onCommit={(value) =>
                      setTransition({
                        effect: transition.effect,
                        duration: Math.max(50, Math.round(value * 1000))
                      })
                    }
                  />
                </PropertyRow>
              )}
            </>
          )}
          <PropertyEmpty>
            상자를 클릭하면 위치와 크기가 여기에 나옵니다.
          </PropertyEmpty>
        </PropertyGroup>
      )}
    </PropertyPanel>
  );
}

/**
 * What to call the thing that is selected.
 *
 * By role first, because a title and a body are both `textFrame` and the role is
 * the difference the reader cares about — naming both "텍스트 상자" would make
 * the panel say the same thing about two different jobs.
 */
/**
 * What one placement of a component can be asked for.
 *
 * ## Why the fields come from the document
 *
 * A card declares its own variables (`componentVar`), so this draws what *this* definition
 * says it takes: a name, a number, a colour, a state. A panel with its own list of fields
 * would be a second place that has to know what a card is — the fault this repository keeps
 * finding, and the reason the declaration is nodes rather than a blob in one attribute.
 *
 * ## What setting one writes
 *
 * One small node: the placement's `componentValue`. The value is put into the part while the
 * placement's children are **resolved** (§10b-2a), so nothing on the slide is rewritten — where the
 * first design substituted it into a copy of the part and had to write both halves in one
 * transaction to keep undo honest.
 *
 * ## The one button
 *
 * **분리** stops the placement following the definition at all, and leaves a group: the parts are
 * copied into the document at that moment, so what the reader was looking at is what they get. 적용
 * stood beside it and is gone — a placement is the definition as it stands, so there was never
 * anything for it to carry.
 */
function ComponentGroup({
  editor,
  sid,
  locked,
  tick
}: {
  editor: Editor | null;
  sid: string;
  locked: boolean;
  /** The document's revision, so the fields are never older than the slide. */
  tick: number;
}) {
  const { vars, definition } = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId) return { vars: [], definition: undefined };
    const doc = { rootId, getNode: (one: string) => store.getNode(one) };
    const node = store.getNode(sid);
    const found = componentOf(doc as never, node);
    return { vars: instanceVars(doc as never, node, found), definition: found };
  }, [editor, sid, tick]);

  const set = (name: string, value: string) =>
    void (editor as any)?.executeCommand?.('setComponentValue', { nodeId: sid, name, value });

  return (
    <PropertyGroup label={definition ? `컴포넌트 · ${definition.name || '이름 없음'}` : '컴포넌트'}>
      {vars.map((one) => (
        <PropertyRow key={one.name} label={one.label}>
          {one.kind === 'boolean' ? (
            <PropertyToggle
              ariaLabel={one.label}
              label="보이기"
              value={one.value !== 'false' && one.value !== ''}
              disabled={locked}
              onChange={(next) => set(one.name, next ? 'true' : 'false')}
            />
          ) : one.kind === 'color' ? (
            <ColorField
              ariaLabel={one.label}
              value={one.value}
              disabled={locked}
              onChange={(next) => set(one.name, next)}
            />
          ) : one.kind === 'number' ? (
            /*
             * A number, in a field for numbers — with the arrows and the keyboard a reader expects.
             * It was a text box, which is what the document keeps (one string shape to write, diff
             * and check) and not what a reader should be typing into.
             */
            <PropertyNumber
              ariaLabel={one.label}
              value={Number(one.value) || 0}
              step={1}
              disabled={locked}
              onCommit={(next) => set(one.name, String(next))}
            />
          ) : one.kind === 'choice' ? (
            <PropertyChoice
              ariaLabel={one.label}
              value={one.value}
              options={one.choices.map((choice) => ({ id: choice, label: choice }))}
              disabled={locked}
              onChange={(next) => set(one.name, next)}
            />
          ) : (
            <TextField
              ariaLabel={one.label}
              testClass={`sl-var-${one.name}`}
              data={{ 'component-var': one.name }}
              value={one.value}
              disabled={locked}
              /**
               * Committed on Enter and on blur, not typed live.
               *
               * The distinction is `TextField`'s own and the reason is exactly this field: every
               * commit is a history entry, so a live field would put a hundred of them in for one
               * word. What it writes is now one small node — the placement's `componentValue` —
               * because the parts that bind it are drawn from the definition rather than rewritten.
               */
              onCommit={(next) => set(one.name, next)}
            />
          )}
        </PropertyRow>
      ))}

      <PropertyRow label="정의">
        {/*
          * 적용 stood here, beside 분리, and it is gone: this placement *is* the definition as it
          * stands, so there was nothing left for the button to carry. What remains is the one
          * decision a reader still makes — stop following it (§10b-2a).
          */}
        <Button
          title="이 자리의 상자로 만듭니다 — 더 이상 정의를 따르지 않습니다"
          data={{ 'component-detach': '' }}
          disabled={locked}
          onClick={() => void (editor as any)?.executeCommand?.('detachComponent', { nodeId: sid })}
        >
          분리
        </Button>
      </PropertyRow>
    </PropertyGroup>
  );
}

/**
 * What one **piece** of a definition takes from the card's variables, and whether it is the slot.
 *
 * ## Why the rows are the part's own attributes
 *
 * It was three rows — 글자, 색, 표시 — because there were three attributes on the part
 * (`bindText`, `bindFill`, `bindVisible`), which is exactly three things a variable could drive: a
 * `number` could only ever be text, and a card's corner radius was unreachable. The bindings are
 * the **definition's** declarations now (canvas-model §10g-2), so what a piece can take is *what it
 * declares* — and this panel already knows how to ask that.
 *
 * Offered here, refused in the command: a content model cannot see across to another node's
 * attributes, so "can this piece take that attribute" is checked where the schema is in hand.
 *
 * ## Which variables each row offers
 *
 * The ones whose **kind fits**. A colour attribute offered a boolean would be a control that can
 * only produce a value nothing draws — and the kinds are the schema's own, which is what makes this
 * a filter rather than an opinion.
 */
/**
 * What an ordinary shape takes from the **document's** variables.
 *
 * ## Why this exists beside the colour picker
 *
 * A colour can already be a reference typed into the attribute (`fill: 'var:주의'`) and the picker
 * offers those — but a **number**, a **state** and a shape's **words** cannot: measured with a
 * transaction, a reference commits into a string attribute and is refused in a number or a boolean,
 * which is the validator doing its job (§10h). So those need a declaration, and this is where a
 * reader makes one.
 *
 * ## Why the rows are the same as a card part's
 *
 * Because it is the same question one scope out: *what drives this attribute*. A reader who has
 * bound a card's badge to a state should meet the same control on a rectangle, and the only
 * difference is which list of variables is offered — the card's, or the document's.
 *
 * Geometry is not offered, and that is the measured half: a bound size would be **drawn** where the
 * resolution says and **answered** where the document says, and the overlay, the guides and the
 * snapping all read the answer — so the handles would sit where the shape is not. `UNBINDABLE` is
 * that list, in the model, so the panel and the command cannot disagree about it.
 */
function BindGroup({
  editor,
  sids,
  locked,
  tick
}: {
  editor: Editor | null;
  /** Every selected shape: one binding, written to all of them, or refused for all of them. */
  sids: string[];
  locked: boolean;
  tick: number;
}) {
  const { vars, binds, stype, declares, inCard } = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    const nothing = {
      vars: [] as DocumentVar[],
      binds: [] as VarBind[],
      stype: undefined as string | undefined,
      declares: [] as string[],
      inCard: false
    };
    if (!store || !rootId || sids.length === 0) return nothing;

    const doc = { rootId, getNode: (one: string) => store.getNode(one) };
    const node = store.getNode(sids[0]);
    const schema = store.getActiveSchema?.();
    const declared = schema?.getNodeType?.(node?.stype ?? '')?.attrs ?? {};

    return {
      vars: documentVars(doc as never) as DocumentVar[],
      /*
       * The first shape's bindings, and the rows are written to all of them. A selection that
       * disagrees shows the first one's answer, which is what every other multi-select row here does
       * — and editing one writes it to the whole selection, which is what a reader means by
       * selecting three things.
       */
      binds: varBindsOf(node as never) as VarBind[],
      stype: node?.stype as string | undefined,
      declares: BINDABLE_ROWS.filter(
        (name) => name in declared && !OFF_LIMITS.has(name) && !UNBINDABLE.has(name)
      ) as string[],
      // Inside a definition the *card's* rows are the ones that make sense, and they are drawn by
      // `PartGroup` right above. Two groups offering two lists for one attribute is a panel asking
      // the reader to know which is which.
      inCard: !!definitionAt(doc as never, sids[0])
    };
  }, [editor, sids, tick]);

  // Nothing to bind to, or a place where the card's own bindings are the answer.
  if (vars.length === 0 || inCard) return null;

  const bind = (attr: string, name: string | null) =>
    void (editor as any)?.executeCommand?.('setVarBind', { nodeIds: sids, attr, var: name });

  const bound = (attr: string) => binds.find((one) => one.attr === attr)?.var ?? '';

  /** The variables whose kind fits an attribute — the same rule the card's rows follow. */
  const fitting = (attr: string) => {
    const kinds =
      attr === 'text'
        ? ['text', 'number', 'choice']
        : COLOUR_ATTRS.has(attr)
          ? ['color', 'text']
          : BOOLEAN_ATTRS.has(attr)
            ? ['boolean']
            : ['number', 'text'];
    return [
      { id: '', label: '없음' },
      ...vars
        .filter((one) => kinds.includes(one.kind))
        .map((one) => ({ id: one.name, label: one.label || one.name }))
    ];
  };

  const rows = [
    ...(stype === 'textFrame' || stype === 'sticky' ? ['text'] : []),
    ...declares.filter((name) => name !== 'text')
  ];

  return (
    <PropertyGroup label="문서 변수 연결">
      {rows.map((attr) => (
        <PropertyRow key={attr} label={LABELS[attr] ?? attr}>
          {/* Named rather than marked in the markup: `PropertyChoice` is a shared control and
              takes no `data` — a test finds this row by the label, like every other row here. */}
          <PropertyChoice
            ariaLabel={`${LABELS[attr] ?? attr} 문서 변수`}
            value={bound(attr)}
            options={fitting(attr)}
            disabled={locked}
            onChange={(name) => bind(attr, name || null)}
          />
        </PropertyRow>
      ))}
    </PropertyGroup>
  );
}

function PartGroup({
  editor,
  sid,
  locked,
  tick
}: {
  editor: Editor | null;
  sid: string;
  locked: boolean;
  tick: number;
}) {
  const { vars, binds, part, stype, attrs, definition, declares } = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    const nothing = {
      vars: [] as ReturnType<typeof componentsOf>[number]['vars'],
      binds: [] as ReturnType<typeof componentsOf>[number]['binds'],
      part: undefined as string | undefined,
      stype: undefined as string | undefined,
      attrs: {} as Record<string, unknown>,
      definition: undefined as string | undefined,
      declares: [] as string[]
    };
    if (!store || !rootId) return nothing;

    const doc = { rootId, getNode: (one: string) => store.getNode(one) };
    const owner = definitionAt(doc as never, sid);
    const found = owner ? componentsOf(doc as never).find((one) => one.sid === owner) : undefined;
    if (!found) return nothing;

    const node = store.getNode(sid);
    const schema = store.getActiveSchema?.();
    const declared = schema?.getNodeType?.(node?.stype ?? '')?.attrs ?? {};

    return {
      vars: found.vars,
      binds: found.binds,
      /*
       * A piece is named by its own durable `partId`, which is what a binding matches — and which a
       * nested piece may have too, so a row inside a card's frame is bindable like any other.
       */
      part: typeof node?.attributes?.partId === 'string' ? node.attributes.partId : undefined,
      stype: node?.stype as string | undefined,
      attrs: (node?.attributes ?? {}) as Record<string, unknown>,
      definition: found.id,
      /**
       * The attributes worth offering: what the part declares, less the ones a binding would be
       * nonsense on.
       *
       * Its **place** is the arrangement's or the reader's drag, its identity is not a value, and
       * its bindings are these rows — so those are out. Everything else a part declares is fair,
       * which is the whole point of the change: a card's corner radius, a frame's gap, a badge's
       * opacity.
       */
      declares: BINDABLE_ROWS.filter(
        (name) => name in declared && !OFF_LIMITS.has(name)
      ) as string[]
    };
  }, [editor, sid, tick]);

  // Not inside a definition, or a piece with no durable name: nothing here can be said about it.
  if (!definition) return null;

  const bind = (attr: string, name: string | null) =>
    void (editor as any)?.executeCommand?.('setComponentBind', {
      componentId: definition,
      part,
      attr,
      var: name
    });

  /** What a row shows now: the variable bound to that attribute, if any. */
  const bound = (attr: string) =>
    binds.find((one) => one.part === part && one.attr === attr)?.var ?? '';

  /** The variables whose kind fits an attribute of this shape. */
  const fitting = (attr: string) => {
    const kinds =
      attr === 'text'
        ? ['text', 'number', 'choice']
        : COLOUR_ATTRS.has(attr)
          ? ['color', 'text']
          : BOOLEAN_ATTRS.has(attr)
            ? ['boolean']
            : ['number', 'text'];
    return [
      { id: '', label: '없음' },
      ...vars.filter((one) => kinds.includes(one.kind)).map((one) => ({ id: one.name, label: one.label || one.name }))
    ];
  };

  /**
   * The rows, in the order a reader thinks about a card: its words, then how it looks, then whether
   * it is there. Only what this piece actually declares, plus `text` for the ones that hold words.
   */
  const rows = [
    ...(stype === 'textFrame' || stype === 'sticky' ? ['text'] : []),
    ...declares.filter((name) => name !== 'text')
  ];

  return (
    <PropertyGroup label={`컴포넌트 부품${part ? ` · ${part}` : ''}`}>
      {!part && (
        <PropertyEmpty>
          이 조각에는 이름이 없습니다. 컴포넌트의 부품에만 변수를 연결할 수 있습니다.
        </PropertyEmpty>
      )}

      {part && vars.length === 0 && (
        <PropertyEmpty>
          이 컴포넌트에는 아직 변수가 없습니다. 왼쪽 컴포넌트 목록에서 만들 수 있습니다.
        </PropertyEmpty>
      )}

      {part &&
        vars.length > 0 &&
        rows.map((attr) => (
          <PropertyRow key={attr} label={LABELS[attr] ?? attr}>
            <PropertyChoice
              ariaLabel={`${LABELS[attr] ?? attr} 변수`}
              value={bound(attr)}
              options={fitting(attr)}
              disabled={locked}
              onChange={(name) => bind(attr, name || null)}
            />
          </PropertyRow>
        ))}

      {stype === 'frame' && (
        <PropertyRow label="슬롯">
          {/*
            * Not a binding, and never was: it says where a reader's own things go. It was in the
            * same command as the bindings only because both were attributes on a part.
            */}
          <PropertyToggle
            ariaLabel="슬롯"
            label="여기에 담기"
            value={typeof attrs.slot === 'string' && attrs.slot.length > 0}
            disabled={locked}
            onChange={(on) =>
              void (editor as any)?.executeCommand?.('setComponentSlot', {
                nodeId: sid,
                slot: on ? part ?? 'slot' : null
              })
            }
          />
        </PropertyRow>
      )}
    </PropertyGroup>
  );
}

/**
 * The attributes a **binding row** may be about, in the order a reader thinks about a shape: its
 * words, then how it looks, then how it is arranged.
 *
 * A list rather than "everything the shape declares", and the full browser suite is what asked for
 * it: the wider rule put a row for `flipX` in the panel, labelled `flipX` because the product has no
 * word for it — a panel of raw attribute names, which is the thing this repository would call wrong
 * anywhere else. It also broke a test by accident, because `getByLabel('X')` matches
 * "flipX 문서 변수".
 *
 * So the rule is: **a row exists where the product has a word for the attribute.** Anything a reader
 * cannot be told the name of is not something to offer them, and adding one is adding it to `LABELS`
 * — one place, and the panel and the tests agree by construction.
 */
const BINDABLE_ROWS = [
  'text',
  'fill',
  'stroke',
  'strokeWidth',
  'cornerRadius',
  'opacity',
  'visible',
  'gap',
  'padding',
  'layoutStretch',
  'layoutGrow'
] as const;

/**
 * What a binding would be nonsense on.
 *
 * A piece's **place** is the arrangement's or the reader's drag (§5), its durable names are identity
 * rather than values, and its own bindings are the rows above — so none of those is a thing a
 * variable can drive.
 */
const OFF_LIMITS = new Set([
  'x',
  'y',
  'partId',
  'slot',
  'name',
  'role',
  'locked',
  'componentId',
  'goTo',
  'goToKind',
  'goToDeck'
]);

/** The attributes a colour variable belongs in, and the ones a boolean does. */
const COLOUR_ATTRS = new Set(['fill', 'stroke', 'shadowColor']);
const BOOLEAN_ATTRS = new Set(['visible', 'clipsContent', 'layoutStretch', 'flipH', 'flipV']);

/** The reader's word for an attribute, where the schema's name is not one. */
const LABELS: Record<string, string> = {
  text: '글자',
  fill: '색',
  stroke: '선 색',
  strokeWidth: '선 굵기',
  visible: '표시',
  opacity: '투명도',
  cornerRadius: '둥근 정도',
  rotation: '회전',
  width: '너비',
  height: '높이',
  gap: '간격',
  padding: '안쪽 여백',
  layoutStretch: '가득',
  layoutGrow: '늘리기'
};

function labelFor(stype: string, role?: string): string {
  if (role === 'title') return '제목 상자';
  if (role === 'subtitle') return '부제목 상자';
  if (role === 'body') return '본문 상자';

  const names: Record<string, string> = {
    textFrame: '텍스트 상자',
    frame: '프레임',
    group: '그룹',
    rectangle: '사각형',
    ellipse: '타원',
    line: '선',
    path: '경로',
    sticky: '메모',
    connector: '연결선',
    component: '컴포넌트',
    instance: '인스턴스'
  };
  return names[stype] ?? stype;
}

/**
 * What the selected shape *does*: its place in the slide's sequence.
 *
 * The same data the timeline draws, for this shape only — the pane is the
 * slide's list, and this is that list filtered to what is selected. Two readers
 * of one fact, which is one too many for it to be computed twice: both call
 * `slideTimeline`.
 *
 * Rows rather than the timeline's bars, because a panel is a column: what a
 * reader wants here is "this shape has three motions, in this order", and *when*
 * each happens is the axis's question, downstairs.
 */
function MotionTab({
  editor,
  box,
  /** Every selected box, for the one gesture that is about more than one. */
  chosen,
  current,
  locked,
  tick
}: {
  editor: Editor | null;
  box: { sid: string; stype: string; attributes?: Record<string, unknown> };
  chosen: string[];
  current?: string;
  locked: boolean;
  tick: number;
}) {
  const steps = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    const name = box.attributes?.name;
    if (!store || !rootId || !current || typeof name !== 'string' || !name) return [];
    return slideTimeline(
      { rootId, getNode: (sid: string) => store.getNode(sid) } as never,
      current
    ).filter((step) => step.target === name);
  }, [editor, current, box, tick]);

  const run = (command: string, payload: Record<string, unknown>) =>
    void (editor as any)?.executeCommand?.(command, payload);

  const [gallery, setGallery] = useState(false);
  /** How far apart the shapes of a group start — see `addBoxesMotion`. */
  const [apart, setApart] = useState(120);

  /**
   * The boxes inside this one, when it holds any.
   *
   * "Animate this group" means the group half the time and *the eight cards in
   * it* the other half, and the two are different animations: one shape moving,
   * or eight moving a beat apart. So both are offered, and the reader says which.
   */
  const inside = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId) return [];
    return boxesInside({ rootId, getNode: (sid: string) => store.getNode(sid) }, box.sid);
  }, [editor, box.sid, tick]);

  /** Whether a tile animates the children rather than the box. */
  const [toChildren, setToChildren] = useState(false);
  const targets = chosen.length > 1 ? chosen : toChildren ? inside : [];
  /** Whether the panel is about several boxes, which its heading has to say. */
  const many = targets.length > 1;
  /**
   * What this shape *does*, which is builds and paths together.
   *
   * A path is a kind of step rather than an effect, and to a reader it is one
   * more thing in the same list — so the rows are both, and the row for a path
   * says 경로 where a build names its effect.
   */
  const builds = steps.filter((step) => step.kind === 'build' || step.kind === 'path');

  const isMedia = box.stype === 'mediaVideo' || box.stype === 'mediaAudio';
  const playback =
    steps.find((step) => step.kind === 'play')?.startsWith ?? 'none';

  return (
    <>
      {isMedia && (
        <PropertyGroup label="재생">
          <PropertyRow label="시작">
            <PropertyChoice
              ariaLabel="재생 시작"
              value={playback}
              options={[
                { id: 'none', label: '순서에 없음' },
                { id: 'onClick', label: '클릭할 때' },
                { id: 'withPrevious', label: '이전과 함께' },
                { id: 'afterPrevious', label: '이전 다음에' }
              ]}
              disabled={locked}
              onChange={(value) => run('setBoxPlayback', { nodeId: box.sid, startsWith: value })}
            />
          </PropertyRow>
          {/* Where the other half is, said once rather than by its absence — the
              same rule the 애니메이션 group follows below. Only once the film is in
              the sequence, because the 필름 group is on its *step*. */}
          {playback !== 'none' && (
            <PropertyEmpty>어디부터 어디까지 재생할지는 아래 타임라인에서 자릅니다.</PropertyEmpty>
          )}
        </PropertyGroup>
      )}

      <PropertyGroup
        label="애니메이션"
        action={
          <Button
            square
            /* 모션 추가 rather than 효과 추가: the 속성 tab has an 효과 추가 of
               its own — a shadow — and one label meaning two things in one
               panel is a label a reader has to learn twice. What this adds is a
               whole motion, which is also what a tile in the gallery is. */
            ariaLabel={gallery ? '모션 추가 닫기' : '모션 추가'}
            pressed={gallery}
            disabled={locked}
            /* A group's action, so it is smaller than a control in a row — the
               one thing this button says about itself that the primitive cannot. */
            className="h-5 w-5 text-[11px]"
            onClick={() => setGallery((open) => !open)}
          >
            {gallery ? '−' : '＋'}
          </Button>
        }
      >
        {builds.length === 0 ? (
          gallery ? null : <PropertyEmpty>모션이 없습니다. ＋ 로 추가하세요.</PropertyEmpty>
        ) : (
          builds.map((step, index) => (
            <PropertyRow key={step.sid} label={`${index + 1}번`}>
              {step.kind === 'path' ? (
                /* A path has no effect to choose: what it is, is its path — and
                   the path itself is edited on the shape, where it is drawn. */
                <PropertyChoice
                  ariaLabel={`${index + 1}번 방향`}
                  value={step.facing ?? 'fixed'}
                  options={FACINGS.map((facing) => ({
                    id: facing,
                    label: `경로 · ${FACING_LABELS[facing]}`
                  }))}
                  disabled={locked}
                  onChange={(value) => run('setMotionStep', { stepId: step.sid, facing: value })}
                />
              ) : (
                <PropertyChoice
                  ariaLabel={`${index + 1}번 효과`}
                  value={step.effect ?? 'fade'}
                  options={MOTION_EFFECTS.map((effect) => ({
                    id: effect.id,
                    label: effect.label
                  }))}
                  disabled={locked}
                  onChange={(value) => run('setMotionStep', { stepId: step.sid, effect: value })}
                />
              )}
              <Button
                square
                ariaLabel={`${index + 1}번 삭제`}
                disabled={locked}
                onClick={() => run('removeMotionStep', { stepId: step.sid })}
              >
                ␡
              </Button>
            </PropertyRow>
          ))
        )}

        {/*
          * The gallery, which is the *adding* gesture rather than a second way to
          * set the effect.
          *
          * A tile is a whole motion — the effect, the length, the curve, the side
          * and the amount — so picking one is `addBoxBuild` carrying all five,
          * one command and one entry in the history. The dropdown above stays
          * what it was: the effect of a motion that already exists.
          */}
        {gallery && (
          <div className="px-2 pb-2">
            {/*
              * With more than one box selected, a tile animates *all* of them, a
              * beat apart — which is what every tool calls "apply to all" and
              * what a reader means by animating a group. It writes one step per
              * shape rather than one step naming several: each gets its own bar
              * the moment it is made, so making the third one a little later is a
              * drag rather than dissolving a group to get at it.
              */}
            {/*
              * A group's own motion, or its contents' — the one thing about
              * animating a container that a reader has to say, because both are
              * ordinary and they are different animations.
              */}
            {inside.length > 1 && chosen.length <= 1 && (
              <label className="mb-2 flex items-center gap-2 px-0.5 text-[11px] text-neutral-500">
                <PropertyToggle
                  ariaLabel="안의 상자에 적용"
                  value={toChildren}
                  onChange={setToChildren}
                  label={`안의 ${inside.length}개에 하나씩`}
                />
              </label>
            )}

            {many && (
              <label className="mb-2 flex items-center gap-2 px-0.5 text-[11px] text-neutral-500">
                {`선택한 ${targets.length}개에 적용 · 간격`}
                <NumberField
                  ariaLabel="상자 간격"
                  value={apart}
                  min={0}
                  max={1000}
                  step={20}
                  suffix="ms"
                  className="w-20 flex-none"
                  onCommit={setApart}
                />
              </label>
            )}

            <PresetGallery
              disabled={locked}
              active={matchingPreset(builds[builds.length - 1])?.id}
              onPick={(preset) => {
                if (many) {
                  run('addBoxesMotion', { nodeIds: targets, apart, ...presetAttrs(preset) });
                } else {
                  run('addBoxBuild', { nodeId: box.sid, ...presetAttrs(preset) });
                }
                setGallery(false);
              }}
            />

            {/*
              * The combinations, between the single motions and the paths.
              *
              * Two motions at once under one name — the tiles the model could not
              * hold until the timeline learned to composite. For a *group* of
              * shapes they are not offered: "these three, each doing two things,
              * a beat apart" is six steps from one click, which is more than a
              * click should mean.
              */}
            {!many && (
              <ComboGallery
                disabled={locked}
                onPick={(combo) => {
                  run('addBoxCombo', { nodeId: box.sid, combo: combo.id });
                  setGallery(false);
                }}
              />
            )}

            {/*
              * The paths, in the same panel as the motions and after them.
              *
              * A path is a different *kind* of step — it needs a style written
              * before the animation, which no effect does — and it is the same
              * question to a reader: what does this shape do. Measured, a path
              * composes with every other motion rather than replacing one, so it
              * belongs beside them rather than instead of them.
              */}
            <PathGallery
              disabled={locked}
              onPick={(preset) => {
                if (many) {
                  run('addBoxesMotion', { nodeIds: targets, apart, preset: preset.id });
                } else {
                  run('addBoxPath', { nodeId: box.sid, preset: preset.id });
                }
                setGallery(false);
              }}
            />
          </div>
        )}

        {/* Where the rest of it is, said once rather than by its absence — and
            not while the gallery is open, where it is a line of text between the
            reader and the tile they are reaching for. */}
        {!gallery && (
          <PropertyEmpty>시작·길이·방향·곡선은 아래 타임라인에서 조절합니다.</PropertyEmpty>
        )}
      </PropertyGroup>
    </>
  );
}

/**
 * The slide's motion, when no box is selected: how the slide itself arrives.
 *
 * A transition belongs to the *slide*, so it is here and not in the timeline —
 * the timeline is what happens once the slide is up, and a row a reader cannot
 * reorder or delay would be a lie about what that list is.
 */
function SlideMotionTab({
  transition,
  onTransition
}: {
  transition: { effect: string; duration: number };
  onTransition: (patch: { effect: string; duration?: number }) => void;
}) {
  return (
    <PropertyGroup label="화면 전환">
      <PropertyRow label="전환">
        <PropertyChoice
          ariaLabel="화면 전환"
          value={transition.effect}
          options={[
            { id: 'none', label: '없음' },
            { id: 'fade', label: '흐리게' },
            { id: 'slideLeft', label: '왼쪽으로 밀기' },
            { id: 'slideRight', label: '오른쪽으로 밀기' },
            { id: 'slideUp', label: '위로 밀기' },
            { id: 'wipe', label: '닦아내기' },
            { id: 'zoom', label: '확대' }
          ]}
          onChange={(value) => onTransition({ effect: value })}
        />
      </PropertyRow>
      {transition.effect !== 'none' && (
        <PropertyRow label="시간">
          <PropertyNumber
            ariaLabel="화면 전환 시간"
            value={transition.duration / 1000}
            suffix="초"
            step={0.1}
            onCommit={(value) =>
              onTransition({
                effect: transition.effect,
                duration: Math.max(50, Math.round(value * 1000))
              })
            }
          />
        </PropertyRow>
      )}
    </PropertyGroup>
  );
}
