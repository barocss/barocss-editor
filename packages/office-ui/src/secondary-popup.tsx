import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Icon } from '@barocss/office-icons';
import { IconButton } from './controls';
import { FloatingSurface, type FloatingOwnedElement } from './floating';
import { cn } from './cn';

export interface SecondaryPopupProps {
  triggerLabel: string;
  label: string;
  triggerIcon?: ReactNode;
  children: ReactNode | ((owner: RefObject<HTMLElement | null>) => ReactNode);
  variant?: 'menu' | 'panel';
  keepMounted?: boolean;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  ownedElements?: readonly FloatingOwnedElement[];
  className?: string;
}

/** Pure temporary controls. The adapter owns commands and the subject lifetime. */
export function SecondaryPopup({ triggerLabel, label, triggerIcon, children, variant = 'panel', keepMounted = false,
  disabled = false, open: suppliedOpen, onOpenChange, ownedElements = [], className }: SecondaryPopupProps) {
  const owner = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const trigger = () => owner.current?.querySelector<HTMLButtonElement>('[data-secondary-trigger]');
  const [localOpen, setLocalOpen] = useState(false);
  useEffect(() => { if (disabled) setLocalOpen(false); }, [disabled]);
  const open = !disabled && (suppliedOpen ?? localOpen);
  const change = (value: boolean) => { closing.current = !value; if (suppliedOpen === undefined) setLocalOpen(value); onOpenChange?.(value); };
  return <div ref={owner} className="office-secondary-owner" data-secondary-open={open || undefined}>
    <IconButton data={{ 'secondary-trigger': 'true' }} label={triggerLabel} disabled={disabled} pressed={open} preserveFocus onClick={() => {
      change(!open); trigger()?.focus({ preventScroll: true });
    }}>{triggerIcon ?? <Icon name="more" size={16} />}</IconButton>
    <FloatingSurface open={open} at={owner.current?.getBoundingClientRect() ?? null} portalRoot={owner.current}
      variant={variant} prefer="below" align="end" focusOnOpen focusOrigin={owner} keepMounted={keepMounted}
      aria-label={label} data-secondary-popup className={cn('office-secondary-popup', className)} ownedElements={[owner, ...ownedElements]}
      onBlurCapture={event => { if (closing.current || event.currentTarget.hidden || event.currentTarget.inert) event.stopPropagation(); }}
      onDismiss={reason => { change(false); if (reason === 'escape') trigger()?.focus({ preventScroll: true }); }}>
      {typeof children === 'function' ? children(owner) : children}
    </FloatingSurface>
  </div>;
}
