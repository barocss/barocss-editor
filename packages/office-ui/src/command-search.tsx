import { useEffect, useId, useRef, useState } from 'react';
import { Dialog } from './dialog';
import { Button } from './controls';
import { Icon } from '@barocss/office-icons';
import { Tip } from './tip';
import { useOfficeLocale } from './locale';

export function CommandSearchTrigger({ onClick, disabled, iconOnly = false, hint, shortcut }: { onClick: () => void; disabled?: boolean; iconOnly?: boolean; hint?: string; shortcut?: string }) {
  const { t } = useOfficeLocale();
  const trigger = <Button square={iconOnly} data={{ 'command-icon': iconOnly ? 'true' : undefined }} tone="quiet" className="office-command-trigger" ariaLabel={t('office.commandSearch.title')} aria-keyshortcuts={shortcut} title={hint} disabled={disabled}
    onPointerDown={event => event.preventDefault()} onClick={onClick}>
    <Icon name="document-search" size={iconOnly ? 16 : 14} />{!iconOnly && <span>{t('office.commandSearch.title')}</span>}
  </Button>;
  return iconOnly ? <Tip label={hint ?? t('office.commandSearch.title')}>{trigger}</Tip> : trigger;
}

export interface SearchCommand {
  id: string; label: string; category: string; hint?: string; keywords?: string;
  disabled?: boolean; disabledReason?: string;
}
export function CommandSearch({ open, onOpenChange, commands, recentIds = [], onPick, onPickIntent }: {
  open: boolean; onOpenChange: (open: boolean) => void; commands: SearchCommand[]; recentIds?: string[];
  onPick: (id: string) => void;
  /** Capture an owned action before dismissal restores focus; undefined refuses it. */
  onPickIntent?: (id: string) => (() => void) | undefined;
}) {
  const { t } = useOfficeLocale();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string>();
  const pending = useRef<string | (() => void) | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const matches = commands.filter(command => `${command.label} ${command.category} ${command.keywords ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const ordered = query.trim() ? matches : [...recentIds.flatMap(key => matches.filter(command => command.id === key)), ...matches.filter(command => !recentIds.includes(command.id))];
  const enabled = ordered.filter(command => !command.disabled);
  const current = enabled.find(command => command.id === active) ?? enabled[0];
  const optionId = (key: string) => `${id}-${encodeURIComponent(key)}`;
  useEffect(() => { if (open) { setQuery(''); setActive(undefined); pending.current = undefined; requestAnimationFrame(() => input.current?.focus()); } }, [open]);
  useEffect(() => { if (open && current) list.current?.ownerDocument.getElementById(optionId(current.id))?.scrollIntoView?.({ block: 'nearest' }); }, [open, current?.id]);
  const choose = (command: SearchCommand) => {
    if (command.disabled) return;
    const intent = onPickIntent ? onPickIntent(command.id) : command.id;
    if (!intent) return;
    pending.current = intent;
    onOpenChange(false);
  };
  return <Dialog open={open} onOpenChange={value => { if (!value) pending.current = undefined; onOpenChange(value); }} title={t('office.commandSearch.title')} description={t('office.commandSearch.description')}
    className="office-command-dialog" onClosed={() => {
      const picked = pending.current; pending.current = undefined;
      if (typeof picked === 'function') picked();
      else if (picked) onPick(picked);
    }}>
    <input ref={input} className="office-field office-search-query" aria-label={t('office.commandSearch.query')} role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={id} aria-activedescendant={current ? optionId(current.id) : undefined}
      value={query} placeholder={t('office.commandSearch.placeholder')} onChange={event => { setQuery(event.target.value); setActive(undefined); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter') { event.preventDefault(); if (current) choose(current); }
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault(); if (!enabled.length) return;
          setActive(enabled[event.key === 'Home' ? 0 : enabled.length - 1].id);
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); if (!enabled.length) return;
          const index = enabled.findIndex(command => command.id === current?.id);
          setActive(enabled[(index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length].id);
        }
      }} />
    <div ref={list} id={id} role="listbox" aria-label={t('office.commandSearch.results')} className="office-command-results">
      {ordered.map(command => <button key={command.id} id={optionId(command.id)} type="button" role="option" tabIndex={-1} aria-selected={current?.id === command.id} aria-disabled={command.disabled || undefined}
        data-active={current?.id === command.id || undefined} className="office-search-option" onPointerDown={event => event.preventDefault()} onClick={() => choose(command)}>
        <span className="office-search-option-copy"><span>{command.label}</span><small>{command.disabled ? `${command.category} · ${command.disabledReason ?? t('office.commandSearch.unavailable')}` : `${!query && recentIds.includes(command.id) ? `${t('office.commandSearch.recent')} · ` : ''}${command.category}`}</small></span>
        {command.hint && <kbd>{command.hint}</kbd>}
      </button>)}
    </div>
    {!ordered.length && <p role="status" className="office-search-empty">{t('office.commandSearch.empty')}</p>}
  </Dialog>;
}
