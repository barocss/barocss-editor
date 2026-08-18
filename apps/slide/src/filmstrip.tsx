import type { Editor } from '@barocss/editor-core';
import type { Slide } from '@barocss/office-slides';
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
export function Filmstrip({
  editor,
  slides,
  current,
  onSelect,
  /** Bumped when the deck changes, so each picture is redrawn. */
  revision
}: {
  editor: Editor | null;
  slides: Slide[];
  current?: string;
  onSelect: (sid: string) => void;
  revision: number;
}) {
  return (
    <nav className="sl-filmstrip" aria-label="슬라이드">
      <ol>
        {slides.map((slide) => (
          <li key={slide.sid}>
            <button
              type="button"
              data-slide={slide.sid}
              data-current={slide.sid === current ? 'true' : undefined}
              data-hidden={slide.hidden ? 'true' : undefined}
              aria-current={slide.sid === current ? 'true' : undefined}
              onClick={() => onSelect(slide.sid)}
            >
              <span className="sl-filmstrip-number">{slide.number}</span>
              <Thumbnail editor={editor} slideSid={slide.sid} width={128} revision={revision} />
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
