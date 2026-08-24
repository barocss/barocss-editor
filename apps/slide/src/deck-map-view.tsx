import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, Choice } from '@barocss/office-ui';
import { deckMap, twipToPx } from '@barocss/office-slides';
import { Thumbnail } from './thumbnail';

/**
 * The deck as a **picture of where its presses go**.
 *
 * ## What this is for, and what it is not
 *
 * A filmstrip says what order the pages are in. Once a deck has buttons that is no longer the
 * whole truth — a menu leads to four sections, a section leads back — and the two things a reader
 * most needs to see are exactly the two a strip cannot show: **a page nothing leads to**, and a
 * button that leads **nowhere**. An island is obvious in a picture and invisible in a list.
 *
 * It is a **view**: nothing here is written. The fact — *pressing this shows that* — lives on the
 * shape (canvas-model §11b), so there is no position on a page to keep, and a deck nobody has
 * opened this on costs nothing. Which is also why a page cannot be dragged: dragging would be
 * asking this to remember a place, and it does not remember anything.
 *
 * ## Where the arithmetic is
 *
 * All of it is `deckMap` in the model — the ranks, the places, the arrows routed by the deck's
 * **own** connector router, which page is an island, which buttons are dead — so the picture and
 * the show cannot disagree about where a press goes. This file scales it into the pane and draws
 * it, and knows nothing about graphs.
 */
export function DeckMapView({
  editor,
  revision,
  current,
  onGoTo,
  onClose
}: {
  editor: Editor | null;
  /** Bumped when the deck changes, so the picture and its thumbnails are redrawn. */
  revision: number;
  current?: string;
  /** Take the reader to a page — which is the one thing a press in here does. */
  onGoTo: (sid: string) => void;
  onClose: () => void;
}) {
  const [direction, setDirection] = useState<'down' | 'right'>('down');
  const frame = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ width: 0, height: 0 });

  const map = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId) return null;
    return deckMap({ rootId, getNode: (sid: string) => store.getNode(sid) } as never, {
      direction
    });
  }, [editor, revision, direction]);

  /**
   * The room, measured — not guessed from the window.
   *
   * The same reason the stage measures its own pane: the panes beside it open and close, and a
   * picture fitted to the window would be fitted to a width it does not have.
   */
  useEffect(() => {
    const box = frame.current;
    if (!box) return;
    const measure = () => setRoom({ width: box.clientWidth, height: box.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  /**
   * One scale for the whole picture, capped at a page being *small*.
   *
   * A two-page deck fitted to the pane would draw each page nearly full size, and then the map
   * would be a worse filmstrip. What a map is for is seeing the shape of the deck at a glance, so
   * a page is at most a thumbnail's width.
   */
  const scale = useMemo(() => {
    if (!map || map.width <= 0 || room.width <= 0) return 0;
    const fit = Math.min(
      (room.width - 32) / twipToPx(map.width),
      (room.height - 32) / twipToPx(map.height)
    );
    const asThumbnail = 200 / twipToPx(map.pages[0]?.width ?? 1);
    return Math.max(0.02, Math.min(fit, asThumbnail));
  }, [map, room]);

  const px = (twips: number) => twipToPx(twips) * scale;

  return (
    <section className="sl-map" aria-label="덱 지도">
      <div className="sl-map-bar">
        <span className="sl-map-title">지도</span>
        {/*
          * Which way the ranks run. Two answers because a deck of six pages reads down and a deck
          * of twenty reads across — the same choice the diagram tidy offers, and the same words.
          */}
        <Choice
          ariaLabel="지도 방향"
          className="w-auto"
          value={direction}
          onChange={(picked) => setDirection(picked as 'down' | 'right')}
        >
          <option value="down">아래로</option>
          <option value="right">오른쪽으로</option>
        </Choice>
        {map && map.dead.length > 0 && (
          <span className="sl-map-dead" data-map-dead={map.dead.length}>
            이동할 장이 없는 버튼 {map.dead.length}개
          </span>
        )}
        <Button title="지도 닫기" data={{ 'map-close': '' }} onClick={onClose}>
          닫기
        </Button>
      </div>

      <div className="sl-map-frame" ref={frame}>
        {!map || map.pages.length === 0 ? (
          <p className="sl-map-empty">덱에 장이 없습니다.</p>
        ) : (
          <div
            className="sl-map-canvas"
            style={{ width: px(map.width), height: px(map.height) }}
            data-map-pages={map.pages.length}
          >
            {/*
              * The arrows under the pages, so a line never crosses a picture it is joining — and
              * `overflow: visible`, because a route may bow outside the box it was measured in.
              */}
            <svg
              className="sl-map-lines"
              aria-hidden
              viewBox={`0 0 ${twipToPx(map.width)} ${twipToPx(map.height)}`}
              width={px(map.width)}
              height={px(map.height)}
            >
              <defs>
                <marker
                  id="sl-map-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                </marker>
              </defs>
              {map.links.map((link, index) => (
                <path
                  key={`${link.from}-${link.to}-${link.kind}-${index}`}
                  d={link.path}
                  data-map-link={link.kind}
                  className={link.kind === 'jump' ? 'sl-map-jump' : 'sl-map-flow'}
                  markerEnd="url(#sl-map-arrow)"
                />
              ))}
            </svg>

            {map.pages.map((page) => (
              <button
                key={page.sid}
                type="button"
                className="sl-map-page"
                data-map-page={page.sid}
                data-map-current={page.sid === current ? 'true' : undefined}
                data-map-unreachable={page.unreachable ? 'true' : undefined}
                data-map-hidden={page.hidden ? 'true' : undefined}
                style={{
                  left: px(page.x),
                  top: px(page.y),
                  width: px(page.width),
                  height: px(page.height)
                }}
                /* Every page is somewhere to go — the same rule the check's rows follow. */
                onClick={() => onGoTo(page.sid)}
                title={`${page.number}. ${page.name || '제목 없음'}`}
              >
                <Thumbnail
                  editor={editor}
                  slideSid={page.sid}
                  width={Math.max(24, Math.round(px(page.width)))}
                  revision={revision}
                />
                <span className="sl-map-label">
                  {page.number}
                  {page.hidden ? ' · 숨김' : ''}
                </span>
                {/* The two things a strip cannot say. */}
                {page.unreachable && <span className="sl-map-island">오는 길 없음</span>}
                {page.dead > 0 && <span className="sl-map-broken">끊긴 버튼 {page.dead}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
