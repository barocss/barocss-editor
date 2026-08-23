import { useRef } from 'react';
import { Button, type ButtonTone } from './controls';

/**
 * Choosing a file, which is the one form control a product cannot style.
 *
 * ## Why this is a primitive and not four lines in each app
 *
 * `<input type="file">` draws its own button, in the browser's own language, and
 * that button cannot be restyled — not its height, not its border, not its text.
 * So every application on the web does the same three things: hide the input,
 * draw a real button beside it, and `click()` the input from the button. Written
 * out, it is a ref, a hidden input, a button, and **one detail everybody gets
 * wrong the first time**:
 *
 * - **The value has to be cleared.** An input keeps the file it was given, and
 *   `change` only fires when the value *changes* — so a reader who picks the same
 *   file twice gets one opening and then silence. Cleared on every pick here,
 *   which makes "open it again" work and is invisible in the code of whoever
 *   forgets it.
 *
 * That is the whole of it, and it is exactly the kind of thing that should exist
 * once: the deck's file row was carrying it, and Word will want the same control
 * the day it opens a `.docx` or inserts a picture.
 *
 * ## Why the button is `Button`
 *
 * So that "열기" beside "저장" is the same control, drawn from the same tokens.
 * The whole reason this package has a `Button` is that a hand-rolled one next to a
 * shared one comes out a different height — and a file picker that drew its own
 * would be that fault with an excuse.
 *
 * ## Not a drop target
 *
 * Dragging a file onto the window is a different gesture with a different surface
 * (the whole app, not a button) and its own states to draw. It belongs where the
 * surface is, and putting it here would make this component about two things.
 */
export function FilePick({
  children,
  accept,
  onPick,
  tone,
  disabled,
  ariaLabel,
  title,
  className,
  testClass,
  data,
  inputData
}: {
  /** The button's label. */
  children: React.ReactNode;
  /** What the browser's dialog should offer, e.g. `.json,application/json`. */
  accept?: string;
  /** The file a reader chose. Never called with nothing. */
  onPick: (file: File) => void;
  tone?: ButtonTone;
  disabled?: boolean;
  /**
   * The **input's** accessible name, which is what a reader of the picker hears.
   * The button carries its label from its own text.
   */
  ariaLabel?: string;
  title?: string;
  className?: string;
  testClass?: string;
  /** `data-` attributes for the button. */
  data?: Record<string, string | undefined>;
  /**
   * `data-` attributes for the hidden input — separate, because the input is the
   * element a *test* drives: `setInputFiles` needs the real control, and no
   * amount of clicking a button will hand a browser a file.
   */
  inputData?: Record<string, string | undefined>;
}) {
  const picker = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        tone={tone}
        disabled={disabled}
        title={title}
        onClick={() => picker.current?.click()}
        className={className}
        testClass={testClass}
        data={data}
      >
        {children}
      </Button>
      <input
        ref={picker}
        type="file"
        accept={accept}
        aria-label={ariaLabel}
        disabled={disabled}
        {...Object.fromEntries(
          Object.entries(inputData ?? {}).map(([key, value]) => [`data-${key}`, value])
        )}
        /**
         * `sr-only` rather than `display: none`: a hidden input is not focusable
         * and cannot be reached by a keyboard or named by a screen reader, so the
         * control would exist for a pointer only.
         */
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // See the header: cleared either way, so the same file twice is two
          // openings rather than one and then nothing.
          event.target.value = '';
          if (file) onPick(file);
        }}
      />
    </>
  );
}
