import { useRef, useState } from "react";
import * as RadixToolbar from "@radix-ui/react-toolbar";
import { cn } from "./cn";
import { STATE } from "./controls";
import { useInToolbar } from "./toolbar";
import { FloatingSurface } from "./floating";

/**
 * A toolbar control that opens a set of colours.
 *
 * ## Why not a `<select>`
 *
 * A colour is not one of a list. The swatches are a convenience — the answers
 * worth one press — and *any* colour is a legitimate one, so the panel offers
 * both: a grid of the common ones and a free field beside them. A dropdown of
 * fifteen named colours would be a worse version of the grid and would still
 * have nowhere to put the sixteenth.
 *
 * Pointer presses preserve the document selection. Click also supports keyboard
 * activation. The product owns the selected command target; this pure control
 * owns its popup placement and focus return.
 */
export interface Swatch {
  value: string;
  label: string;
}

/** Word writes colours as bare hex; the browser's input wants a `#`. */
const withHash = (value: string): string =>
  value.startsWith("#") ? value : `#${value}`;
const withoutHash = (value: string): string =>
  value.replace(/^#/, "").toUpperCase();

export function ColorPalette({
  id,
  label,
  icon,
  value,
  swatches,
  disabled,
  clearLabel,
  onPick,
  onClear,
}: {
  id: string;
  label: string;
  /** What the trigger shows above the colour bar. */
  icon: React.ReactNode;
  /** The current colour as bare hex, or `null` for none or a disagreement. */
  value: string | null;
  swatches: Swatch[];
  disabled?: boolean;
  /** The wording for "no colour"; absent when this palette cannot clear. */
  clearLabel?: string;
  onPick: (value: string) => void;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  /*
   * A toolbar button in a toolbar, an ordinary button anywhere else — see `useInToolbar`. The two
   * take the same props and draw the same element; the only difference is the arrow-key order this
   * one joins, which is worth having where there is one and fatal to ask for where there is not.
   */
  const Trigger = useInToolbar() ? RadixToolbar.Button : "button";

  const close = () => {
    trigger.current?.focus({ preventScroll: true });
    setOpen(false);
  };

  const choose = (colour: string) => {
    close();
    onPick(withoutHash(colour));
  };

  return (
    <span
      ref={host}
      data-palette-owner={open || undefined}
      className="relative inline-flex"
    >
      <Trigger
        ref={trigger}
        type="button"
        data-control={id}
        data-open={open ? "true" : "false"}
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          trigger.current?.focus({ preventScroll: true });
          setOpen((wasOpen) => !wasOpen);
        }}
        className={cn(
          "inline-flex h-[var(--ou-control-h)] min-w-[var(--ou-control-h)] flex-col items-center justify-center",
          "rounded-[var(--ou-radius)] border border-transparent px-1",
          "text-[length:var(--ou-text)] leading-none hover:bg-[color:var(--ou-ground)]",
          STATE,
          "disabled:pointer-events-none disabled:opacity-40",
          // The suite's accent, not Tailwind's sky — the same second accent the toolbar had.
          "data-[open=true]:border-[color:var(--ou-accent)] data-[open=true]:bg-[color:var(--ou-accent-soft)]"
        )}
      >
        <span>{icon}</span>
        {/* The bar under the letter, which is how every word processor shows
            what this button would apply. Transparent when there is none, so the
            button does not claim a colour the selection does not have. */}
        <span
          data-current={value ?? "none"}
          className="mt-0.5 h-1 w-4 rounded-sm border border-[color:var(--ou-line)]"
          style={{ background: value ? withHash(value) : "transparent" }}
        />
      </Trigger>

      <FloatingSurface
        open={open}
        at={open ? trigger.current?.getBoundingClientRect() ?? null : null}
        portalRoot={host.current}
        ownedElements={[host]}
        variant="panel"
        prefer="below"
        align="end"
        onDismiss={(reason) => {
          if (reason === "escape") close();
          else setOpen(false);
        }}
        aria-label={label}
        data-palette={id}
        className={cn("w-max")}
      >
        <span className="grid grid-cols-5 gap-1">
          {swatches.map((swatch) => (
            <button
              key={swatch.value}
              type="button"
              data-swatch={swatch.value}
              aria-label={swatch.label}
              title={swatch.label}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(swatch.value)}
              className={cn(
                "h-8 w-8 rounded-sm border border-[color:var(--ou-line)]",
                "transition-[outline-color] duration-[var(--ou-quick)]",
                "hover:outline hover:outline-2 hover:outline-[color:var(--ou-accent)]",
                value === swatch.value &&
                  "outline outline-2 outline-[color:var(--ou-accent)]"
              )}
              style={{ background: withHash(swatch.value) }}
            />
          ))}
        </span>

        <span className="mt-2 flex items-center gap-2">
          <input
            type="color"
            aria-label={`${label}: 다른 색`}
            value={value ? withHash(value) : "#000000"}
            onChange={(event) => choose(event.target.value)}
            className="h-8 w-8 shrink-0 cursor-pointer rounded-[var(--ou-radius)] border border-[color:var(--ou-line)] bg-transparent p-0.5"
          />
          {clearLabel && (
            <button
              type="button"
              data-swatch="none"
              aria-label={clearLabel}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                close();
                onClear?.();
              }}
              className={cn(
                "min-h-8 rounded-[var(--ou-radius)] border border-[color:var(--ou-line)] px-2 py-0.5 text-[length:var(--ou-text-small)]",
                "hover:bg-[color:var(--ou-ground)]",
                STATE
              )}
            >
              {clearLabel}
            </button>
          )}
        </span>
      </FloatingSurface>
    </span>
  );
}
