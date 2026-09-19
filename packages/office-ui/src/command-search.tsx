import { useEffect, useId, useRef, useState } from 'react';
import { Dialog } from './dialog';
import { Button } from './controls';
import { Icon } from '@barocss/office-icons';

export function CommandSearchTrigger({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <Button tone="quiet" className="office-command-trigger" ariaLabel="명령 검색" disabled={disabled}
    onPointerDown={event => event.preventDefault()} onClick={onClick}>
    <Icon name="document-search" size={14} /><span>명령 검색</span>
  </Button>;
}

export interface SearchCommand {
  id: string; label: string; category: string; hint?: string; keywords?: string;
  disabled?: boolean; disabledReason?: string;
}
export function CommandSearch({ open, onOpenChange, commands, recentIds = [], onPick }: {
  open: boolean; onOpenChange: (open: boolean) => void; commands: SearchCommand[]; recentIds?: string[];
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string>();
  const pending = useRef<string | undefined>(undefined);
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
  const choose = (command: SearchCommand) => { if (!command.disabled) { pending.current = command.id; onOpenChange(false); } };
  return <Dialog open={open} onOpenChange={value => { if (!value) pending.current = undefined; onOpenChange(value); }} title="명령 검색" description="실행할 작업을 찾으세요. 방향키로 이동하고 Enter로 실행합니다."
    className="office-command-dialog" onClosed={() => { const key = pending.current; pending.current = undefined; if (key) onPick(key); }}>
    <input ref={input} className="office-field office-search-query" aria-label="명령 검색어" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={id} aria-activedescendant={current ? optionId(current.id) : undefined}
      value={query} placeholder="명령 이름 검색…" onChange={event => { setQuery(event.target.value); setActive(undefined); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter') { event.preventDefault(); if (current) choose(current); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); if (!enabled.length) return;
          const index = enabled.findIndex(command => command.id === current?.id);
          setActive(enabled[(index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length].id);
        }
      }} />
    <div ref={list} id={id} role="listbox" aria-label="명령 검색 결과" className="office-command-results">
      {ordered.map(command => <button key={command.id} id={optionId(command.id)} type="button" role="option" tabIndex={-1} aria-selected={current?.id === command.id} aria-disabled={command.disabled || undefined}
        data-active={current?.id === command.id || undefined} className="office-search-option" onPointerDown={event => event.preventDefault()} onClick={() => choose(command)}>
        <span className="office-search-option-copy"><span>{command.label}</span><small>{command.disabled ? `${command.category} · ${command.disabledReason ?? '현재 상태에서 실행할 수 없습니다.'}` : `${!query && recentIds.includes(command.id) ? '최근 사용 · ' : ''}${command.category}`}</small></span>
        {command.hint && <kbd>{command.hint}</kbd>}
      </button>)}
    </div>
    {!ordered.length && <p role="status" className="office-search-empty">일치하는 명령이 없습니다.</p>}
  </Dialog>;
}
