import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './cn';

export interface StyleOption {
  id: string;
  label: string;
}

/**
 * The paragraph style control.
 *
 * Shows nothing when the selected blocks are in different styles. A dropdown
 * that picked one of them would apply it to all on the next change, which is a
 * reformat the user never asked for — so "they disagree" is drawn as its own
 * state rather than as one of the values.
 */
export function StyleSelect({
  options,
  value,
  disabled,
  onChange
}: {
  options: StyleOption[];
  value: string | null;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const mixed = value === null;

  return (
    <Select.Root value={value ?? ''} onValueChange={onChange} disabled={disabled}>
      <Select.Trigger
        className={cn(
          'w-toolbar-style inline-flex h-7 min-w-36 items-center justify-between gap-2 rounded',
          'border border-neutral-300 px-2 text-sm dark:border-neutral-700',
          'disabled:pointer-events-none disabled:opacity-40',
          mixed && 'text-neutral-500'
        )}
        data-mixed={mixed ? 'true' : 'false'}
        aria-label="Paragraph style"
      >
        <Select.Value placeholder="—" />
        <Select.Icon>
          <ChevronDown className="h-3.5 w-3.5" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-30 overflow-hidden rounded border border-neutral-200 bg-white shadow-md dark:border-neutral-700 dark:bg-neutral-900"
        >
          <Select.Viewport className="p-1">
            {options.map((option) => (
              <Select.Item
                key={option.id}
                value={option.id}
                data-style={option.id}
                className={cn(
                  'flex cursor-default items-center gap-2 rounded px-2 py-1 text-sm outline-none',
                  'data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-800'
                )}
              >
                <Select.ItemIndicator>
                  <Check className="h-3.5 w-3.5" />
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
