import { useState, type ReactNode, type RefObject } from 'react';
import { SecondaryPopup } from '@barocss/office-ui';

/** Keep secondary controls within the current Word selection lifetime. */
export function WordSelectionMore({ children, label = '추가 Word 서식' }: { children: ReactNode | ((owner: RefObject<HTMLElement | null>) => ReactNode); label?: string }) {
  const [open, setOpen] = useState(false);
  return <div className="w-selection-more" data-word-more-owner={open || undefined}>
    <SecondaryPopup triggerLabel="추가 서식" label={label} keepMounted open={open} onOpenChange={setOpen} className="w-selection-secondary">
      {children}
    </SecondaryPopup>
  </div>;
}
