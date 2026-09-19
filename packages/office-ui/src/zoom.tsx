import { useState } from 'react';
import { Icon } from '@barocss/office-icons';
import { cn } from './cn';
import { STATE } from './controls';
import { clampZoom, stepZoom, type ZoomLadder } from './viewport';

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
 *
 * ## The ± buttons walk a **ladder**, and the ladder is required
 *
 * They multiplied by 1.25, so a reader pressing ＋ from 100% went to 125%, 156%,
 * 195% — a widget whose whole job is to name a size, naming three that have no
 * name. `stepZoom` was written against exactly that, kept nine unit checks, and
 * had no caller anywhere in the suite for as long as it lived one package away.
 *
 * `ladder` is not optional and has no default. The stops and the limits differ per
 * product and there is no third table that would be right for either of them — a
 * default here would be this file quietly choosing 0.1–8 for a page, which is the
 * same fault `keyLabel(chord, apple = true)` is: made forgettable, and then
 * forgotten.
 */
export function ZoomControl({
 zoom,
 onChange,
  ladder,
  onFit,
  className,
  fitLabel = 'Fit'
}: {
 zoom: number;
  onChange: (zoom: number) => void;
  /**
   * The stops the ± buttons walk and the limits everything here is held inside.
   *
   * The product's — a deck's stops are not a page's. See `ZoomLadder`.
   */
  ladder: ZoomLadder;
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
    /*
     * Held inside the product's limits, which the field could not do before: a reader could type
     * 5000% and every caller was left to clamp it, so whether they could depended on which product
     * they were in. The typed number is still honoured off the ladder — 83% is 83%.
     */
 if (Number.isFinite(parsed) && parsed > 0) onChange(clampZoom(parsed / 100, ladder));
  };

  const button = cn(
    'inline-flex h-[var(--ou-control-h)] w-[var(--ou-control-h)] items-center justify-center',
    'rounded-[var(--ou-radius)] text-[color:var(--ou-ink)] hover:bg-[color:var(--ou-ground)]',
    STATE
  );

 return (
    <div className={cn('office-zoom flex items-center gap-0.5', className)} data-zoom={zoom.toFixed(2)}>
 <button type="button" data-zoom-out aria-label="축소" className={button} onClick={() => onChange(stepZoom(zoom, -1, ladder))}>
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
          'text-center text-[length:var(--ou-text-small)] tabular-nums hover:border-[color:var(--ou-line)]',
          /*
           * A **ring** as well as the accent border, which is the field's own rule everywhere else in
           * this library and is not enough here: this field's border is *transparent* until the
           * pointer arrives, so an accent border is one hairline against the toolbar's own ground and
           * the only thing on screen saying where the keyboard is. Measured by tabbing through the
           * app — it came back with no visible focus at all.
           */
          'focus:border-[color:var(--ou-accent)] focus:outline-none',
          'focus-visible:ring-2 focus-visible:ring-[color:var(--ou-accent)]',
          'transition-colors duration-[var(--ou-quick)]'
        )}
      />

      <button type="button" data-zoom-in aria-label="확대" className={button} onClick={() => onChange(stepZoom(zoom, 1, ladder))}>
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
