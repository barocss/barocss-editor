import { useState } from 'react';
import { Icon } from '@barocss/office-icons';
import { cn } from './cn';
import { STATE } from './controls';

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

  const button = cn(
    'inline-flex h-[var(--ou-control-h)] w-[var(--ou-control-h)] items-center justify-center',
    'rounded-[var(--ou-radius)] text-[color:var(--ou-ink)] hover:bg-[color:var(--ou-ground)]',
    STATE
  );

 return (
    <div className={cn('office-zoom flex items-center gap-0.5', className)} data-zoom={zoom.toFixed(2)}>
 <button type="button" data-zoom-out aria-label="축소" className={button} onClick={() => onChange(zoom / 1.25)}>
 <Icon name="zoom-out" size={14} />
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
          'h-[var(--ou-control-h)] w-14 rounded-[var(--ou-radius)] border border-transparent bg-transparent',
          'text-center text-xs tabular-nums hover:border-[color:var(--ou-line)]',
          'focus:border-[color:var(--ou-accent)] focus:outline-none',
          'transition-colors duration-[var(--ou-quick)]'
        )}
      />

      <button type="button" data-zoom-in aria-label="확대" className={button} onClick={() => onChange(zoom * 1.25)}>
 <Icon name="zoom-in" size={14} />
      </button>

      {onFit && (
        <button type="button" data-zoom-fit aria-label={fitLabel} title={fitLabel} className={button} onClick={onFit}>
          <Icon name="zoom-fit" size={13} />
        </button>
      )}
    </div>
  );
}
