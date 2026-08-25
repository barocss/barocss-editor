import * as Select from '@radix-ui/react-select';
import { Icon } from '@barocss/office-icons';
import { cn } from './cn';
import { STATE } from './controls';

export interface ChoiceOption {
 id: string;
  label: string;
}

/**
 * A control that picks one value out of several: the paragraph style, the font,
 * the size, the shape's fill.
 *
 * Shows nothing when the selection does not agree on one. A dropdown that picked
 * one of two fonts would apply it to both on the next change, which is a
 * reformat the user never asked for — so "they disagree" is drawn as its own
 * state rather than as one of the values.
 *
 * The name is passed in rather than fixed: three of these sit next to each other
 * and a screen reader announcing all of them as "paragraph style" would be worse
 * than no name at all.
 */
export function ChoiceSelect({
 options,
  value,
  disabled,
  onChange,
  ariaLabel,
  className,
  testClass
}: {
  options: ChoiceOption[];
  value: string | null;
  disabled?: boolean;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
  /**
   * The product's hook class, for its own tests and styles.
 *
   * No default. It was `w-toolbar-style`, which is Word's prefix and Word's
 * word for the thing — a suite component carrying one product's naming is one
   * the next product has to override before it can use.
   */
  testClass?: string;
}) {
  const mixed = value === null;

  return (
    <Select.Root value={value ?? ''} onValueChange={onChange} disabled={disabled}>
 <Select.Trigger
        className={cn(
          testClass,
          'inline-flex h-[var(--ou-control-h)] items-center justify-between gap-2 rounded-[var(--ou-radius)]',
          'border border-[color:var(--ou-line)] px-2 text-sm',
        STATE,
 'disabled:pointer-events-none disabled:opacity-40',
 mixed && 'text-[color:var(--ou-muted)]',
 className ?? 'min-w-36'
 )}
        data-mixed={mixed ? 'true' : 'false'}
 aria-label={ariaLabel}
      >
        <Select.Value placeholder="—" />
 <Select.Icon>
          <Icon name="open" size={14} />
 </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
 sideOffset={4}
          /**
           * Above a dialog, not merely above the page.
           *
           * It was `z-30`, which is above a toolbar and *below* a dialog's
           * overlay — so a select inside a dialog opened its list underneath the
           * dim layer and no option could be clicked. The dialog is 40/50, and
           * a menu belongs above whatever opened it whatever that was.
           */
          className="z-[var(--ou-z-popover)] overflow-hidden rounded-[var(--ou-radius)] border border-[color:var(--ou-line)] bg-[color:var(--ou-panel)] shadow-[var(--ou-lift-2)]"
        >
          <Select.Viewport className="p-1">
 {options.map((option) => (
              <Select.Item
                key={option.id}
                value={option.id}
                data-style={option.id}
                className={cn(
                  'flex cursor-default items-center gap-2 rounded px-2 py-1 text-sm outline-none',
                  'data-[highlighted]:bg-[color:var(--ou-ground)]'
                )}
              >
                <Select.ItemIndicator>
                  <Icon name="chosen" size={14} />
                </Select.ItemIndicator>
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
