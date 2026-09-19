import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '@barocss/office-icons';
import { IconButton } from './controls';
import { Toolbar, ToolbarToggle, type ToggleState } from './toolbar';
import { cn } from './cn';

/** Product-neutral ribbon chrome. The host supplies tabs, commands and selection state. */
export function RibbonTabs<Id extends string>({ label, value, options, onChange, panelId, variant = 'ribbon', itemData }: {
  label: string;
  value: Id;
  options: readonly { id: Id; label: string; disabled?: boolean }[];
  onChange: (id: Id) => void;
  panelId?: string;
  variant?: 'ribbon' | 'panel';
  itemData?: (id: Id) => Record<string, string | undefined>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const enabled = options.filter(option => !option.disabled);
  const stop = enabled.some(option => option.id === value) ? value : enabled[0]?.id;
  useEffect(() => {
    const list = host.current;
    const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !selected) return;
    const frame = list.getBoundingClientRect(), item = selected.getBoundingClientRect();
    if (item.left < frame.left) list.scrollLeft += item.left - frame.left;
    else if (item.right > frame.right) list.scrollLeft += item.right - frame.right;
  }, [value]);
  return <div ref={host} className="office-ribbon-tabs" data-variant={variant} role="tablist" aria-label={label}>
    {options.map(option => <button
      {...Object.fromEntries(Object.entries(itemData?.(option.id) ?? {}).map(([key, value]) => [`data-${key}`, value]))}
      key={option.id} type="button" role="tab" id={panelId ? `${panelId}-${option.id}` : undefined}
      aria-controls={panelId} aria-selected={value === option.id} tabIndex={stop === option.id ? 0 : -1} disabled={option.disabled}
      onMouseDown={event => { if (variant === 'ribbon') event.preventDefault(); }}
      onClick={() => onChange(option.id)}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229 || !enabled.length) return;
        const index = enabled.findIndex(item => item.id === option.id);
        const next = event.key === 'ArrowRight' ? (index + 1) % enabled.length :
          event.key === 'ArrowLeft' ? (index - 1 + enabled.length) % enabled.length :
          event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); event.stopPropagation();
        onChange(enabled[next].id);
        host.current?.querySelectorAll<HTMLButtonElement>('[role=tab]:not(:disabled)')[next]?.focus();
      }}
    >{option.label}</button>)}
  </div>;
}

/** Shared command band; products supply the commands and optional tabs above it. */
export function RibbonToolbar({ children, label, className, compact = false }: { children: ReactNode; label: string; className?: string; compact?: boolean }) {
  return <Toolbar overflow={compact} label={label} className={cn('office-ribbon-toolbar', compact && 'office-compact-toolbar', className)}>{children}</Toolbar>;
}

export function RibbonToggle({ expanded, onChange, panelId }: { expanded: boolean; onChange: (expanded: boolean) => void; panelId: string }) {
  return <button type="button" className="office-toolbar-expand" aria-expanded={expanded} aria-controls={expanded ? panelId : undefined}
    onMouseDown={event => event.preventDefault()} onClick={() => onChange(!expanded)}>{expanded ? '간단히 보기' : '상세 도구'}</button>;
}

export function RibbonGroup({ id, label, children, onLaunch, className, layout = 'row' }: {
  id: string;
  label: string;
  children: ReactNode;
  onLaunch?: () => void;
  className?: string;
  layout?: 'row' | 'columns' | 'stack';
}) {
  return <div data-ribbon-group={id} data-group={id} data-layout={layout} className={cn('office-ribbon-group', className)} role="group" aria-label={label}>
    <div className="office-ribbon-group-body">{children}</div>
    <div className="office-ribbon-group-footer">
      <span>{label}</span>
      {onLaunch && <IconButton label={`${label} 상세 설정`} size="sm" preserveFocus onClick={onLaunch}>
        <Icon name="dialog-launch" size={12} />
      </IconButton>}
    </div>
  </div>;
}

export function RibbonAction({ id, label, icon, onActivate, disabled, state = 'off', shortcut }: {
  id: string;
  label: string;
  icon: ReactNode;
  onActivate: () => void;
  disabled?: boolean;
  state?: ToggleState;
  shortcut?: string;
}) {
  return <ToolbarToggle id={id} label={label} onActivate={onActivate} disabled={disabled} state={state}
    shortcut={shortcut} className="office-ribbon-action">
    {icon}<span>{label}</span>
  </ToolbarToggle>;
}
