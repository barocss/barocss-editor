import { useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { placeNear } from './place-near';

/** Passive gesture feedback. The host supplies viewport coordinates and formatted units. */
export function SelectionReadout({ at, getAnchor, children, className, ...props }: Omit<HTMLAttributes<HTMLOutputElement>, 'style'> & {
  at: { x: number; y: number };
  /** Persistent feedback follows transforms that do not trigger a React render. */
  getAnchor?: () => DOMRect | null;
  [name: `data-${string}`]: string | number | boolean | undefined;
}) {
  const ref = useRef<HTMLOutputElement>(null);
  const [visible, setVisible] = useState(true);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const view = element.ownerDocument.defaultView!;
    const measure = () => {
      const anchor = getAnchor?.();
      if (getAnchor && (!anchor || anchor.bottom < 0 || anchor.top > view.innerHeight || anchor.right < 0 || anchor.left > view.innerWidth)) {
        setVisible(false); return;
      }
      setVisible(true);
      const point = anchor ? { x: anchor.left + anchor.width / 2, y: anchor.bottom } : at;
      const x = Math.max(8, Math.min(view.innerWidth - 8, point.x));
      const y = Math.max(8, Math.min(view.innerHeight - 8, point.y));
      const box = element.getBoundingClientRect();
      const next = placeNear({ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }, box,
        { gap: 10, margin: 8, prefer: 'below', within: { width: view.innerWidth, height: view.innerHeight } });
      setPosition(previous => previous?.left === next.left && previous?.top === next.top ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    view.addEventListener('resize', measure);
    let frame = 0;
    const follow = () => { measure(); frame = view.requestAnimationFrame(follow); };
    if (getAnchor) frame = view.requestAnimationFrame(follow);
    return () => { view.cancelAnimationFrame(frame); observer.disconnect(); view.removeEventListener('resize', measure); };
  }, [at.x, at.y, children, getAnchor]);
  if (typeof document === 'undefined') return null;
  return createPortal(<output {...props} ref={ref} aria-live="off" className={cn('office-selection-readout', className)}
    style={{ position: 'fixed', ...position, visibility: position && visible ? 'visible' : 'hidden', pointerEvents: 'none' }}>{children}</output>, document.body);
}
