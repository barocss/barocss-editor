import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import {
  TWIPS_PER_INCH,
  draggedTo,
  markersOf,
  nextAlign,
  snap,
  stopAt,
  stopsToDraw,
  ticksFor,
  toPixels,
  toTwips,
  tabStopsOf,
  withStop,
  type IndentMarkers,
  type TabAlign,
  type TabLeader,
  type TabStop
} from '@barocss/office-word';

/**
 * The ruler above the page.
 *
 * There was no way to put a tab stop anywhere. The layout has resolved them
 * since tabs were drawn — with alignment and leaders, every kind Word has — and
 * a document could only carry one if it arrived with one. The same for the two
 * indents that are not a single number: a first line and a hanging one are what
 * every printed paragraph is shaped by, and neither had a control.
 *
 * Both live here for the same reason they live on Word's ruler: they are
 * positions along the text, and a number in a dialog is a poor way to say where
 * something goes when the text is right there to line it up against.
 *
 * The arithmetic is in `office-word/src/ruler.ts` and is tested without a
 * browser. What is left here is what only a browser can answer — where the text
 * area is on screen — and what a pointer is doing.
 */

/**
 * What the reader has hold of, while they are holding it.
 *
 * `at` follows the pointer and nothing is written until it is let go. Writing
 * on every move made one drag into ten entries of the document's history, and
 * the last of them was whichever move happened to be processed last rather than
 * where the reader stopped — measured, a stop dragged to four inches landed an
 * eighth of an inch short.
 *
 * `moved` separates a drag from a click, and both mean something different on
 * the same target: taking hold of a stop and letting go without moving is how
 * Word changes what the stop does.
 */
type Dragging =
  | { kind: 'stop'; from: number; at: number; moved: boolean }
  | { kind: 'marker'; marker: 'firstLine' | 'left' | 'right'; at: number; moved: boolean }
  | null;

/** Where the text area sits on screen, and how wide the page's is. */
interface Geometry {
  /** Left edge of the text area, relative to the ruler. */
  left: number;
  /** Width of the text area on screen. */
  width: number;
  /** Width of the text area in the document. */
  contentWidth: number;
  /** The sheet's own width and left edge, for drawing the margins. */
  sheetLeft: number;
  sheetWidth: number;
}

/** Walk up from the caret to the first node that answers. */
function ancestorOf(
  editor: Editor,
  wanted: (node: { stype?: string; text?: unknown }) => boolean
): { sid: string; attributes: Record<string, unknown> } | null {
  const store = (editor as any).dataStore;
  const selection = (editor as any).selection;
  if (!store || !selection?.startNodeId) return null;

  let node = store.getNode(selection.startNodeId);
  for (let depth = 0; node && depth < 64; depth += 1) {
    if (wanted(node)) return { sid: node.sid, attributes: node.attributes ?? {} };
    node = node.parentId ? store.getNode(node.parentId) : null;
  }
  return null;
}

/** The paragraph the caret is in, and what it says about itself. */
const caretParagraph = (editor: Editor) =>
  ancestorOf(
    editor,
    (node) => !!node.stype && typeof node.text !== 'string' && node.stype !== 'inline-text'
  );

/**
 * How wide the page is, in the document's own unit.
 *
 * A section owns the page setup in Word, and so it does here. Read from the
 * model rather than from the sheet, which knows its width in pixels and nothing
 * about what that width means — and the ruler's inches have to be the
 * document's inches or a stop lands somewhere else than where it was put.
 */
function pageWidthOf(editor: Editor): number {
  const section = ancestorOf(editor, (node) => node.stype === 'surface');
  const declared = section?.attributes?.pageWidth;
  // US Letter, which is what the schema defaults to.
  return typeof declared === 'number' && declared > 0 ? declared : 12240;
}

/**
 * The text area, measured.
 *
 * From the sheet rather than from the layout's metrics: the sheet is what the
 * reader sees, its padding *is* the margins, and reading it needs no agreement
 * with the pass that placed it.
 */
function measure(host: HTMLElement | null, pageWidth: number): Geometry | null {
  /**
   * The surface, not the sheet.
   *
   * A sheet is paper: it is drawn behind the text, absolutely placed, and
   * carries no padding at all. The margins are the *section's* — `flowCss` puts
   * them on the surface as `padding-left` and `padding-right`, which is why the
   * sheets line up with the section's edges rather than with its text. Measuring
   * the sheet gave the whole page as the text area, and the ruler read eight and
   * a half inches wide where the text is six and a half.
   */
  const surface = document.querySelector('.w-surface') as HTMLElement | null;
  if (!surface || !host) return null;

  const box = surface.getBoundingClientRect();
  const style = getComputedStyle(surface);
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padRight = parseFloat(style.paddingRight) || 0;
  const origin = host.getBoundingClientRect().left;

  const width = box.width - padLeft - padRight;
  if (width <= 0 || box.width <= 0) return null;

  return {
    left: box.left - origin + padLeft,
    width,
    // The same fraction of the page that the text area is on screen, so the
    // ruler's inches are the document's inches whatever the zoom.
    contentWidth: (width / box.width) * pageWidth,
    sheetLeft: box.left - origin,
    sheetWidth: box.width
  };
}

/** The mark a tab stop of each alignment is drawn as, which is Word's shape. */
const STOP_GLYPH: Record<string, string> = {
  left: 'L',
  center: '⊥',
  right: '⅃',
  decimal: '⊥.',
  bar: '|'
};

const ALIGN_NAME: Record<string, string> = {
  left: '왼쪽',
  center: '가운데',
  right: '오른쪽',
  decimal: '소수점',
  bar: '세로줄'
};

/** What runs along the space a tab crosses. */
const LEADER_NAME: Record<string, string> = {
  none: '채움 없음',
  dot: '점',
  hyphen: '하이픈',
  underscore: '밑줄'
};

export function Ruler({ editor }: { editor: Editor }) {
  const host = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [paragraph, setParagraph] = useState<ReturnType<typeof caretParagraph>>(null);
  const dragging = useRef<Dragging>(null);
  const [menu, setMenu] = useState<{ at: number; existing: boolean; x: number; y: number } | null>(
    null
  );
  const [, force] = useState(0);

  // Follow the caret and the page: which paragraph's marks are shown changes
  // with the selection, and where the text area is changes with the window.
  useEffect(() => {
    const refresh = () => {
      setParagraph(caretParagraph(editor));
      setGeometry(measure(host.current, pageWidthOf(editor)));
    };
    refresh();
    const timer = window.setTimeout(refresh, 400);
    (editor as any).on?.('editor:selection.model', refresh);
    (editor as any).on?.('editor:content.change', refresh);
    window.addEventListener('resize', refresh);
    return () => {
      window.clearTimeout(timer);
      (editor as any).off?.('editor:selection.model', refresh);
      (editor as any).off?.('editor:content.change', refresh);
      window.removeEventListener('resize', refresh);
    };
  }, [editor]);

  const stops: TabStop[] = tabStopsOf(paragraph?.attributes as { tabs?: unknown });
  const markers: IndentMarkers = markersOf(paragraph?.attributes);
  const scale = geometry
    ? { contentWidth: geometry.contentWidth, pixelsWide: geometry.width }
    : { contentWidth: 1, pixelsWide: 1 };

  /** Where a pointer is, as a position in the document. */
  const positionOf = useCallback(
    (event: { clientX: number }): number => {
      if (!geometry || !host.current) return 0;
      const origin = host.current.getBoundingClientRect().left + geometry.left;
      return Math.max(0, toTwips(event.clientX - origin, scale));
    },
    [geometry, scale]
  );

  const write = useCallback(
    (command: string, payload: Record<string, unknown>) => {
      void (editor as any).executeCommand?.(command, payload);
      force((count) => count + 1);
    },
    [editor]
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!geometry || !paragraph) return;
    const at = positionOf(event);
    const target = (event.target as HTMLElement).dataset.rulerMarker as Dragging extends null
      ? never
      : 'firstLine' | 'left' | 'right' | undefined;

    if (target) {
      dragging.current = { kind: 'marker', marker: target, at, moved: false };
    } else {
      const hit = stopAt(stops, at, scale);
      if (hit) dragging.current = { kind: 'stop', from: hit.pos, at: hit.pos, moved: false };
      else return; // an empty click adds on release, not on press
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const held = dragging.current;
    if (!held || !paragraph) return;

    // Followed, not written: the document hears about this once, when the
    // reader lets go. See `Dragging`.
    const at = positionOf(event);
    dragging.current = { ...held, at, moved: held.moved || snap(at) !== snap(held.at) };
    force((count) => count + 1);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const held = dragging.current;
    dragging.current = null;
    if (!geometry || !paragraph) return;
    if (held) force((count) => count + 1);

    const at = positionOf(event);

    if (held?.kind === 'marker') {
      if (held.moved) write('setParagraphIndents', { indents: draggedTo(held.marker, at, markers) });
      return;
    }

    if (held) {
      // Dragged clear of the ruler: Word takes the stop off, which is the only
      // way to get rid of one without a dialog.
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const escaped = event.clientY < box.top - 12 || event.clientY > box.bottom + 12;
      if (escaped) {
        write('setTabStops', { tabs: withStop(stops, held.from, null) });
        return;
      }
      // Held and let go where it was: what the stop *does*, rather than where.
      const stop = stops.find((each) => each.pos === held.from);
      write('setTabStops', {
        tabs: held.moved
          ? withStop(stops, held.from, at)
          : withStop(stops, held.from, held.from, { align: nextAlign(stop?.align) })
      });
      return;
    }

    // An empty stretch of ruler: a new stop, left-aligned, as Word makes them.
    write('setTabStops', { tabs: withStop(stops, null, at) });
  };

  /**
   * Where a thing is drawn while it is being dragged.
   *
   * The document is not told until the drag ends, so the mark under the pointer
   * has to come from the drag rather than from the paragraph — otherwise it
   * stays where it was and the reader is dragging nothing.
   */
  /**
   * The menu a right-click opens.
   *
   * A tab's *leader* — the dots that run from the text to the page number in a
   * contents line, or the underscore across a form — has been drawn since tabs
   * were drawn, and nothing could ask for one: the ruler cycles what a stop
   * aligns to and had no room for a second thing to cycle. Word puts both in a
   * Tabs dialog; a menu on the ruler itself is where the reader already is, and
   * is how Google Docs does it.
   */
  const onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!geometry || !paragraph) return;
    event.preventDefault();
    const at = positionOf(event);
    const hit = stopAt(stops, at, scale);
    setMenu({ at: hit?.pos ?? snap(at), existing: !!hit, x: event.clientX, y: event.clientY });
  };

  const held = dragging.current;
  const drawnStops =
    held?.kind === 'stop' && held.moved
      ? stops.map((stop) => (stop.pos === held.from ? { ...stop, pos: snap(held.at) } : stop))
      : stops;
  const drawnMarkers: IndentMarkers =
    held?.kind === 'marker' && held.moved
      ? markersOf({ ...paragraph?.attributes, ...draggedTo(held.marker, held.at, markers) })
      : markers;

  if (!geometry) return <div className="w-ruler" ref={host} />;

  const ticks = ticksFor(geometry.contentWidth);
  const drawn = stopsToDraw(drawnStops, geometry.contentWidth);
  const x = (twips: number) => geometry.left + toPixels(twips, scale);

  return (
    <div
      className="w-ruler"
      ref={host}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
      role="slider"
      aria-label="눈금자 — 탭 정지와 들여쓰기"
      aria-valuenow={Math.round(drawnMarkers.left)}
      tabIndex={-1}
    >
      {/* The paper, and the part of it that holds text */}
      <div
        className="w-ruler-margin"
        style={{ left: geometry.sheetLeft, width: geometry.sheetWidth }}
      />
      <div className="w-ruler-text" style={{ left: geometry.left, width: geometry.width }} />

      {ticks.minor.map((at) => (
        <div key={`m${at}`} className="w-ruler-tick" style={{ left: x(at) }} />
      ))}
      {ticks.major.map((tick) => (
        <div key={`i${tick.at}`} className="w-ruler-inch" style={{ left: x(tick.at) }}>
          {tick.inch > 0 ? tick.inch : ''}
        </div>
      ))}

      {/* Where a tab would go with nothing asked for, drawn faintly */}
      {drawn.defaults.map((at) => (
        <div key={`d${at}`} className="w-ruler-default" style={{ left: x(at) }} />
      ))}

      {drawn.own.map((stop) => (
        <div
          key={`s${stop.pos}`}
          className={`w-ruler-stop leader-${stop.leader ?? 'none'}`}
          data-stop={stop.pos}
          data-align={stop.align ?? 'left'}
          data-leader={stop.leader ?? 'none'}
          style={{ left: x(stop.pos) }}
          title={`${ALIGN_NAME[stop.align ?? 'left']} 탭 · ${LEADER_NAME[stop.leader ?? 'none']} · ${(stop.pos / TWIPS_PER_INCH).toFixed(2)}″ — 오른쪽 클릭으로 바꾸기`}
        >
          {STOP_GLYPH[stop.align ?? 'left']}
        </div>
      ))}

      <div
        className="w-ruler-marker is-first"
        data-ruler-marker="firstLine"
        style={{ left: x(drawnMarkers.firstLine) }}
        title="첫 줄 들여쓰기"
      />
      <div
        className="w-ruler-marker is-left"
        data-ruler-marker="left"
        style={{ left: x(drawnMarkers.left) }}
        title="왼쪽 들여쓰기"
      />
      <div
        className="w-ruler-marker is-right"
        data-ruler-marker="right"
        style={{ left: x(geometry.contentWidth - drawnMarkers.right) }}
        title="오른쪽 들여쓰기"
      />

      {menu ? (
        <TabMenu
          menu={menu}
          stops={stops}
          onClose={() => setMenu(null)}
          onChange={(tabs) => {
            write('setTabStops', { tabs });
            setMenu(null);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * What a right-click on the ruler offers.
 *
 * Alignment is here as well as on a click, because a menu that offers half of
 * what a stop can say makes the reader remember which half is where. Clearing
 * every stop is here because dragging them off one at a time is what a reader
 * does when there is no other way, and Word has had the button since it had the
 * dialog.
 */
function TabMenu({
  menu,
  stops,
  onChange,
  onClose
}: {
  menu: { at: number; existing: boolean; x: number; y: number };
  stops: TabStop[];
  onChange: (tabs: TabStop[]) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);

  /**
   * Anywhere *else* puts it away.
   *
   * Anywhere at all put it away before the button under the pointer had done
   * anything, because this runs at the capture phase — ahead of the click it was
   * meant to let through.
   */
  useEffect(() => {
    const dismiss = (event: Event) => {
      if (event.type === 'pointerdown' && box.current?.contains(event.target as Node)) return;
      onClose();
    };
    window.addEventListener('pointerdown', dismiss, { capture: true });
    window.addEventListener('keydown', dismiss);
    return () => {
      window.removeEventListener('pointerdown', dismiss, { capture: true });
      window.removeEventListener('keydown', dismiss);
    };
  }, [onClose]);

  const stop = stops.find((each) => each.pos === menu.at);
  const set = (attributes: { align?: TabAlign; leader?: TabLeader }) =>
    onChange(withStop(stops, menu.existing ? menu.at : null, menu.at, attributes));

  return (
    <div
      className="w-ruler-menu"
      ref={box}
      style={{ position: 'fixed', left: menu.x, top: menu.y }}
      /**
       * The menu is drawn inside the ruler, so without this every click in it is
       * also a click *on* the ruler — which adds a stop or cycles an alignment
       * on top of what the menu item did. Measured: choosing a dot leader made a
       * stop with no leader, and choosing right alignment made it centred.
       */
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      role="menu"
    >
      <div className="w-ruler-menu-title">
        {(menu.at / TWIPS_PER_INCH).toFixed(2)}″ {menu.existing ? '탭 정지' : '에 탭 정지 추가'}
      </div>

      {(['left', 'center', 'right', 'decimal'] as TabAlign[]).map((align) => (
        <button
          key={align}
          type="button"
          role="menuitemradio"
          aria-checked={(stop?.align ?? 'left') === align}
          data-menu-align={align}
          onClick={() => set({ align })}
        >
          <span aria-hidden="true">{STOP_GLYPH[align]}</span> {ALIGN_NAME[align]}
        </button>
      ))}

      <hr />

      {(['none', 'dot', 'hyphen', 'underscore'] as TabLeader[]).map((leader) => (
        <button
          key={leader}
          type="button"
          role="menuitemradio"
          aria-checked={(stop?.leader ?? 'none') === leader}
          data-menu-leader={leader}
          onClick={() => set({ leader })}
        >
          {LEADER_NAME[leader]}
        </button>
      ))}

      {stops.length > 0 ? (
        <>
          <hr />
          {menu.existing ? (
            <button type="button" role="menuitem" data-menu-clear="one" onClick={() => onChange(withStop(stops, menu.at, null))}>
              이 탭 정지 지우기
            </button>
          ) : null}
          <button type="button" role="menuitem" data-menu-clear="all" onClick={() => onChange([])}>
            모두 지우기
          </button>
        </>
      ) : null}
    </div>
  );
}
