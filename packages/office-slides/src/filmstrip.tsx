import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { TextField } from '@barocss/office-ui';
/* 자기 배럴을 거치지 않는다 — 심볼이 사는 모듈에서 곧장. */
import type { Slide } from './deck';
import { Thumbnail } from './thumbnail';

/**
 * The deck down the side.
 *
 * It answers what a scrollbar cannot: not how far through the deck you are, but
 * which slide you are on and what is either side of it. Word's outline pane
 * exists for the same reason and reads the document the same way — through a
 * function in the product package, so the rail and anything else that asks get
 * one answer rather than two that drift.
 *
 * The pictures are real: each is the slide drawn again by a plain renderer and
 * scaled down, never a grey box or a first line. See `thumbnail.tsx` — a
 * thumbnail is a picture, so it needs none of the editing machinery, and
 * scaling rather than re-laying-out is what makes it the *same* deck rather
 * than a narrower one.
 */
/** What the strip down the side is told. */
export interface FilmstripProps {
  editor: Editor | null;
  thumbnailWidth?: number;
  slides: Slide[];
  current?: string;
  onSelect: (sid: string) => void;
  /** Bumped when the deck changes, so each picture is redrawn. */
  revision: number;
  /** Naming one — see the field below for why the filmstrip is where it happens. */
  onRename: (sid: string, name: string) => void;
  orientation?: 'vertical' | 'horizontal';
  readOnly?: boolean;
  lifetimeKey?: string;
  /** Folding retains the field, but cannot accept its blur as a rename. */
  active?: boolean;
  canRename?: () => boolean;
}

export function Filmstrip({
  editor,
  slides,
  current,
  onSelect,
  onRename,
  revision,
  thumbnailWidth = 128,
  orientation = 'vertical',
  readOnly = false,
  lifetimeKey,
  active = true,
  canRename
}: FilmstripProps) {
  /**
   * The slide whose name a reader is typing, if any.
   *
   * **Here** rather than in the properties panel, for the reason the site's layer list gave: this is
   * where a reader is looking at a list of names, and a rename that sends them to another pane is
   * three gestures for the smallest edit there is. Double-click, which is what a list of names has
   * meant since before any of this.
   */
  const strip = useRef<HTMLElement>(null);
  const generation = useRef(0);
  const rootId = editor?.getRootId();
  const nativeRoot = rootId ? editor?.dataStore.getNode(rootId) : undefined;
  const [renaming, setRenaming] = useState<{
    sid: string; current?: string; root: typeof nativeRoot; version: number; generation: number;
  }>();
  const latest = useRef({ editor, current, nativeRoot, readOnly, active, canRename, slides });
  latest.current = { editor, current, nativeRoot, readOnly, active, canRename, slides };
  useLayoutEffect(() => { generation.current += 1; setRenaming(undefined); }, [editor, current, nativeRoot, readOnly, lifetimeKey]);
  useEffect(() => {
    if (!editor) return;
    const retire = () => { generation.current += 1; setRenaming(undefined); };
    editor.on('editor:content.change', retire);
    editor.on('editor:editable.change', retire);
    return () => { retire(); editor.off('editor:content.change', retire); editor.off('editor:editable.change', retire); };
  }, [editor]);
  useLayoutEffect(() => {
    if (renaming && !slides.some(slide => slide.sid === renaming.sid)) { generation.current += 1; setRenaming(undefined); }
  }, [slides, renaming]);

  const commitRename = (next: string) => {
    const now = latest.current, owner = renaming;
    if (!owner || !now.editor || now.readOnly || !now.editor.isEditable || !now.active || now.canRename?.() === false ||
      strip.current?.closest('[hidden], [inert]') || !strip.current?.isConnected ||
      owner.generation !== generation.current || owner.current !== now.current || owner.root !== now.nativeRoot ||
      owner.root !== now.editor.dataStore.getNode(now.editor.getRootId()!) || owner.version !== now.editor.dataStore.getVersion()) return;
    const slide = now.slides.find(slide => slide.sid === owner.sid);
    if (!slide) return;
    setRenaming(undefined);
    if (next !== slide.name) onRename(slide.sid, next);
  };

  return (
    <nav ref={strip} className="sl-filmstrip" data-orientation={orientation} aria-label="슬라이드">
      <ol>
        {slides.map((slide) => (
          <li key={slide.sid}>
            {renaming?.sid === slide.sid ? (
              <span className="sl-filmstrip-rename" onBlurCapture={event => {
                if (!latest.current.active || latest.current.canRename?.() === false || strip.current?.closest('[hidden], [inert]')) event.stopPropagation();
              }}>
                <TextField
                  value={slide.name}
                  ariaLabel={`슬라이드 ${slide.number} 새 이름`}
                  readOnly={readOnly || !editor?.isEditable}
                  onCommit={commitRename}
                />
              </span>
            ) : null}
            <button
              type="button"
              data-slide={slide.sid}
              data-current={slide.sid === current ? 'true' : undefined}
              data-hidden={slide.hidden ? 'true' : undefined}
              aria-current={slide.sid === current ? 'true' : undefined}
              aria-label={`${slide.number} · ${slide.name || `슬라이드 ${slide.number}`}`}
              onClick={() => onSelect(slide.sid)}
              onDoubleClick={() => {
                if (readOnly || !editor?.isEditable || !active || canRename?.() === false) return;
                setRenaming({ sid: slide.sid, current, root: nativeRoot, version: editor.dataStore.getVersion(), generation: generation.current });
              }}
            >
              <span className="sl-filmstrip-number">{slide.number}</span>
              <Thumbnail editor={editor} slideSid={slide.sid} width={thumbnailWidth} revision={revision} />
              <span className="sl-filmstrip-name">
                {/*
                 * A slide the author never named and whose title is empty gets
                 * its number, drawn here rather than invented by the reader —
                 * a name made up in the model would be indistinguishable from
                 * one somebody chose.
                 */}
                {slide.name || <em>슬라이드 {slide.number}</em>}
              </span>
              {slide.hidden && (
                <span className="sl-filmstrip-badge" title="발표에서 건너뜁니다">
                  숨김
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
