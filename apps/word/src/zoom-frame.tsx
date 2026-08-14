import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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
export function ZoomFrame({ zoom, children }: { zoom: number; children: React.ReactNode }) {
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

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
    el.style.transformOrigin = 'top center';
  }, [zoom]);

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
      <div ref={inner} className="w-zoom-page" style={zoom !== 1 ? { width: size?.width } : undefined}>
        {children}
      </div>
    </div>
  );
}
