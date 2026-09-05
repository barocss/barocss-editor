import { useLayoutEffect, useRef, useState } from 'react';

/**
 * The room a scaled page takes up.
 *
 * `transform` is a visual change and nothing else — which is the whole reason
 * zoom uses it, since a page must break in the same place at every size. The
 * cost is that a scaled element still occupies its *unscaled* room: at half
 * size, half the pane is blank space below the page, and at double size the
 * bottom half of the document cannot be scrolled to at all.
 *
 * So the frame is told what the page is drawn as. Its size comes from the page's
 * own untransformed size, which is the one thing a transform leaves alone —
 * measured rather than computed, because how tall the document is is the
 * layout's answer and changes with every edit.
 */
/** 틀에게 필요한 것 — 배율, 그리고 그 배율로 그려질 것. */
export interface ZoomFrameProps {
  zoom: number;
  children: React.ReactNode;
}

export function ZoomFrame({ zoom, children }: ZoomFrameProps) {
  const inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;

    const measure = () => {
      // `offsetWidth`/`offsetHeight` are the untransformed box. The drawn one
      // already has the zoom in it and would compound with every change.
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      if (width > 0 && height > 0) setSize({ width, height });
    };
    measure();

    // The document grows and shrinks as it is edited and as pages are added, and
    // nothing tells the frame — so it watches.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="w-zoom-frame"
      data-zoom={zoom.toFixed(2)}
      style={
        size && zoom !== 1
          ? { width: size.width * zoom, height: size.height * zoom, margin: '0 auto' }
          : undefined
      }
    >
      {/*
        The transform is written **in the render**, not in an effect.
        
        It was `el.style.transform = ...` inside a `useEffect`, which put it a
        frame behind the frame's own width and height — those come from the render
        above, so for one paint the box was the drawn size and the page inside it
        was not yet drawn at that size. Nobody saw it, and something else did:
        anything measuring the page from a *layout* effect read the untransformed
        rectangle, because effects run after layout effects. The wheel zoom's
        pointer anchoring measured exactly zero drift that way — it was correcting
        against a size that had not changed yet, and reported success.
        
        Written in the render, the transform is in the DOM at commit, which is
        before any effect of either kind and in any subtree.
      */}
      <div
        ref={inner}
        className="w-zoom-page"
        style={
          zoom === 1
            ? undefined
            : { width: size?.width, transform: `scale(${zoom})`, transformOrigin: 'top center' }
        }
      >
        {children}
      </div>
    </div>
  );
}
