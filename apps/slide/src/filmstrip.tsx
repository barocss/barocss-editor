import type { Slide } from '@barocss/office-slides';

/**
 * The deck down the side.
 *
 * It answers what a scrollbar cannot: not how far through the deck you are, but
 * which slide you are on and what is either side of it. Word's outline pane
 * exists for the same reason and reads the document the same way — through a
 * function in the product package, so the rail and anything else that asks get
 * one answer rather than two that drift.
 *
 * Not thumbnails yet. A real thumbnail is the slide drawn again at a small
 * scale, which means a second render of the same document, and the view is
 * built around one. Names and numbers are what a rail is actually read for, and
 * a fake thumbnail — a grey box, a first line — would be worse than neither.
 */
export function Filmstrip({
  slides,
  current,
  onSelect
}: {
  slides: Slide[];
  current?: string;
  onSelect: (sid: string) => void;
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
