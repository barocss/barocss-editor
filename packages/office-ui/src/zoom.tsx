import { useState } from 'react';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import { cn } from './cn';

/**
 * How large the document is drawn.
 *
 * Shared, because every product in the suite has one and a reader who has used
 * one expects the next to work the same way: minus, a percentage they can type
 * into, plus, and a way back to fitting the pane.
 *
 * It holds no zoom of its own — the number comes in and a new one goes out —
 * for the same reason the toolbar holds no formatting state: a control that
 * remembered its value would disagree with the thing it is supposed to describe
 * the moment anything else changed it, and something else always does (a wheel,
 * a window resize, a fit).
 *
 * What it does hold is the *half-typed* text, which is not the same thing: while
 * a reader is typing "15" on the way to "150" the document must not jump to 15%
 * and back. So the field shows what they are typing until they are done with it,
 * and the document only hears the finished number.
 */
export function ZoomControl({
  zoom,
  onChange,
  onFit,
  className,
  fitLabel = 'Fit'
}: {
  zoom: number;
  onChange: (zoom: number) => void;
  /** What "fit" means is the product's; only the button is shared. */
  onFit?: () => void;
  className?: string;
  fitLabel?: string;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? `${Math.round(zoom * 100)}%`;

  const commit = (value: string) => {
    setTyped(null);
    const parsed = Number.parseFloat(value.replace('%', '').trim());
    if (Number.isFinite(parsed) && parsed > 0) onChange(parsed / 100);
  };

  const button =
    'inline-flex h-7 w-7 items-center justify-center rounded text-neutral-600 ' +
    'hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800';

  return (
    <div className={cn('office-zoom flex items-center gap-0.5', className)} data-zoom={zoom.toFixed(2)}>
      <button type="button" data-zoom-out aria-label="축소" className={button} onClick={() => onChange(zoom / 1.25)}>
        <Minus size={14} aria-hidden />
      </button>

      <input
        aria-label="확대/축소"
        data-zoom-value
        value={shown}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          // A field's keys are the field's: without this the Enter that commits
          // a zoom carries on to the document. See `PropertyNumber`.
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setTyped(null);
            (event.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          'h-7 w-14 rounded border border-transparent bg-transparent text-center text-xs tabular-nums',
          'hover:border-neutral-300 focus:border-neutral-400 focus:outline-none',
          'dark:hover:border-neutral-700'
        )}
      />

      <button type="button" data-zoom-in aria-label="확대" className={button} onClick={() => onChange(zoom * 1.25)}>
        <Plus size={14} aria-hidden />
      </button>

      {onFit && (
        <button type="button" data-zoom-fit aria-label={fitLabel} title={fitLabel} className={button} onClick={onFit}>
          <Maximize2 size={13} aria-hidden />
        </button>
      )}
    </div>
  );
}
