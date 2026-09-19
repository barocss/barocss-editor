import { Tip } from './tip';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Icon } from '@barocss/office-icons';
import { FloatingSurface } from './floating';
import { MenuAction } from './menu-action';

const controls = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),[role="combobox"]:not([aria-disabled="true"])';
const availableControls = (element: HTMLElement) =>
  (element.matches(controls) ? [element] : [...element.querySelectorAll<HTMLElement>(controls)])
    .filter(item => item.getClientRects().length && getComputedStyle(item).visibility !== 'hidden');


/** Find existing controls; never copy commands or remount input drafts into a second toolbar. */
export function ToolbarOverflow({ host, label, children }: {
  host: RefObject<HTMLDivElement | null>; label: string; children: ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<{ element: HTMLElement; label: string }[]>([]);
  useLayoutEffect(() => {
    const bar = host.current;
    if (!bar) return;
    const measure = () => {
      // Use the full available band width to avoid the trigger keeping itself visible.
      const available = bar.parentElement?.clientWidth ?? bar.clientWidth;
      const needed = [...bar.children].reduce((right, child) => {
        const r = child.getBoundingClientRect();
        return Math.max(right, r.right - bar.getBoundingClientRect().left + bar.scrollLeft);
      }, 0) + parseFloat(getComputedStyle(bar).paddingRight || '0');
      const next = needed > available + 1;
      setOverflowing(next);
      if (!next) setOpen(false);
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(bar);
    for (const child of bar.children) observer?.observe(child);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [children, host]);
  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, [open]);
  const reveal = (element: HTMLElement) => {
    const bar = host.current;
    if (!bar) return;
    const control = availableControls(element)[0];
    const target = control ?? element;
    const frame = bar.getBoundingClientRect(), box = target.getBoundingClientRect();
    if (box.left < frame.left + 8) bar.scrollLeft += box.left - frame.left - 8;
    else if (box.right > frame.right - 8) bar.scrollLeft += box.right - frame.right + 8;
    control?.focus({ preventScroll: true });
  };
  const show = () => {
    const bar = host.current;
    if (!bar) return;
    setEntries([...bar.children].flatMap(child => {
      const element = child as HTMLElement;
      const available = availableControls(element);
      if (!available.length) return [];
      const groupName = element.getAttribute('aria-label');
      if (groupName) return [{ element, label: groupName }];
      return available.flatMap(control => {
        const name = control.getAttribute('aria-label') || control.textContent?.trim();
        return name ? [{ element: control, label: name }] : [];
      });
    }));
    setOpen(true);
  };
  return <div className="office-toolbar-viewport" data-overflow={overflowing || undefined} onFocusCapture={event => {
    const bar = host.current;
    const target = event.target as HTMLElement;
    if (!bar?.contains(target)) return;
    const frame = bar.getBoundingClientRect(), box = target.getBoundingClientRect();
    if (box.left < frame.left) bar.scrollLeft += box.left - frame.left - 8;
    else if (box.right > frame.right) bar.scrollLeft += box.right - frame.right + 8;
  }}>
    {children}
    {overflowing && <Tip label="도구 찾기"><button ref={trigger} type="button" className="office-toolbar-overflow" aria-label={`${label} 도구 찾기`} aria-expanded={open} aria-haspopup="menu"
      onMouseDown={event => event.preventDefault()} onClick={() => open ? setOpen(false) : show()}><Icon name="more" size={16} /></button></Tip>}
    {open && <FloatingSurface open at={trigger.current?.getBoundingClientRect() ?? null} variant="menu" role="menu" aria-label={`${label} 도구 위치`} prefer="below" align="end" focusOnOpen ownedElements={[trigger]}
      className="office-toolbar-jump-menu" onDismiss={reason => { setOpen(false); if (reason === 'escape') trigger.current?.focus({ preventScroll: true }); }}>
      <div className="office-toolbar-jump-heading">도구 그룹으로 이동</div>
      {entries.map((entry, index) => <MenuAction key={index} onClick={() => { setOpen(false); reveal(entry.element); }}>{entry.label}</MenuAction>)}
    </FloatingSurface>}
  </div>;
}
