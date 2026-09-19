import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@barocss/office-icons';
import * as Dialog from '@radix-ui/react-dialog';
import { FloatingSurface } from './floating';

export interface SearchOption { id: string; label: string; description?: string; disabled?: boolean; leading?: ReactNode }

/** Opening an item and removing it are separate actions, never nested buttons. */
export function SelectionTag({ label, onOpen, onRemove, removeLabel, missing = false }: {
  label: string; onOpen?: () => void; onRemove?: () => void; removeLabel?: string; missing?: boolean;
}) {
  return <span className="office-selection-tag" data-missing={missing || undefined}>
    {onOpen ? <button type="button" className="office-selection-tag-label" aria-label={`${label} 항목 열기`} onClick={onOpen}>{label}</button> : <span className="office-selection-tag-label">{label}</span>}
    {onRemove && <button type="button" className="office-selection-tag-remove" aria-label={removeLabel ?? `${label} 제거`} onClick={event => {
      // Removing this button inside a label must not activate the next remaining control.
      event.preventDefault(); onRemove();
    }}><Icon name="close" size={12} /></button>}
  </span>;
}

type Selection = { multiple: true; value: string[]; onChange: (value: string[]) => void } | { multiple?: false; value: string; onChange: (value: string) => void };
export type SearchSelectProps = Selection & {
  options: SearchOption[]; ariaLabel: string; placeholder?: string; disabled?: boolean; readOnly?: boolean;
  showTags?: boolean; searchLabel?: string; popupLabel?: string; emptyMessage?: string;
};

/** Controlled selection. Persistence, pending edits and failed-save recovery belong to the host. */
export function SearchSelect(props: SearchSelectProps) {
  const { options, ariaLabel, placeholder = '선택하세요', disabled = false, readOnly = false,
    showTags = true, searchLabel = `${ariaLabel} 검색`, popupLabel = `${ariaLabel} 선택`, emptyMessage = '일치하는 항목이 없습니다.' } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string>();
  const [at, setAt] = useState<DOMRect | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const listId = useId();
  const values = props.multiple ? props.value : props.value ? [props.value] : [];
  const blocked = disabled || readOnly;
  const matches = options.filter(option => `${option.label} ${option.description ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const enabled = matches.filter(option => !option.disabled);
  const current = enabled.find(option => option.id === active) ?? enabled[0];
  const optionId = (id: string) => `${listId}-${encodeURIComponent(id)}`;
  useEffect(() => {
    if (!open) return;
    const measure = () => setAt(trigger.current?.getBoundingClientRect() ?? null);
    measure(); window.addEventListener('scroll', measure, true); window.addEventListener('resize', measure);
    return () => { window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); };
  }, [open]);
  useEffect(() => { if (blocked) setOpen(false); }, [blocked]);
  useEffect(() => {
    if (open && current) list.current?.ownerDocument.getElementById(optionId(current.id))?.scrollIntoView?.({ block: 'nearest' });
  }, [open, current?.id]);
  const close = (restore: boolean) => {
    setOpen(false);
    requestAnimationFrame(() => {
      const button = trigger.current;
      if (button?.isConnected && (restore || button.ownerDocument.activeElement === button.ownerDocument.body)) button.focus({ preventScroll: true });
    });
  };
  const pick = (option: SearchOption) => {
    if (blocked || option.disabled) return;
    if (props.multiple) props.onChange(values.includes(option.id) ? values.filter(id => id !== option.id) : [...values, option.id]);
    else { props.onChange(option.id); close(true); }
  };
  return <div className="office-search-select" data-readonly={readOnly || undefined}>
    {props.multiple && showTags && values.length > 0 && <div className="office-selection-tags" aria-label={`${ariaLabel} 선택한 항목`}>
      {values.map(id => <SelectionTag key={id} label={options.find(option => option.id === id)?.label ?? id} missing={!options.some(option => option.id === id)}
        onRemove={blocked ? undefined : () => props.onChange(values.filter(value => value !== id))} />)}
    </div>}
    <button ref={trigger} type="button" className="office-field office-search-select-trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} disabled={blocked}
      onClick={() => { if (open) close(true); else { setQuery(''); setActive(values[0]); setOpen(true); } }}>
      <span>{props.multiple ? values.length ? `${values.length}개 선택` : placeholder : options.find(option => option.id === props.value)?.label ?? (props.value || placeholder)}</span><Icon name="open" size={14} />
    </button>
    <FloatingSurface open={open} at={at} variant="panel" role="presentation" className="office-search-popup" prefer="below" align="start" ownedElements={[trigger]} onDismiss={reason => close(reason === 'escape')} style={{ pointerEvents: 'auto' }}>
      <Dialog.Root open={open} modal={false} onOpenChange={value => { if (!value) close(true); }}>
      <Dialog.Content className="office-search-content" aria-describedby={undefined}
        onOpenAutoFocus={event => { event.preventDefault(); search.current?.focus({ preventScroll: true }); }}
        onCloseAutoFocus={event => event.preventDefault()}
        onInteractOutside={event => event.preventDefault()}
        onEscapeKeyDown={event => { if (event.isComposing || composing.current || event.keyCode === 229) event.preventDefault(); }}>
      <Dialog.Title className="office-search-title">{popupLabel}</Dialog.Title>
      <input ref={search} className="office-field office-search-query" role="combobox" aria-label={searchLabel} aria-expanded="true" aria-autocomplete="list" aria-controls={listId}
        aria-activedescendant={current ? optionId(current.id) : undefined} placeholder="검색…" value={query}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onChange={event => { setQuery(event.target.value); setActive(undefined); }}
        onKeyDown={event => {
          if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'Enter') { event.preventDefault(); if (current) pick(current); }
          else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault(); if (!enabled.length) return;
            const index = enabled.findIndex(option => option.id === current?.id);
            setActive(enabled[(index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length].id);
          }
        }} />
      <div ref={list} id={listId} role="listbox" aria-label={ariaLabel} aria-multiselectable={props.multiple || undefined} className="office-search-options">
        {matches.map(option => <button key={option.id} id={optionId(option.id)} type="button" role="option" tabIndex={-1} disabled={option.disabled}
          aria-selected={values.includes(option.id)} data-active={current?.id === option.id || undefined} className="office-search-option"
          onPointerDown={event => event.preventDefault()} onClick={() => pick(option)}>
          {option.leading && <span className="office-search-leading" aria-hidden="true">{option.leading}</span>}
          <span className="office-search-option-copy"><span>{option.label}</span>{option.description && <small>{option.description}</small>}</span>
          <span className="office-search-check" aria-hidden="true">{values.includes(option.id) && <Icon name="chosen" size={14} />}</span>
        </button>)}
      </div>
      {!matches.length && <p role="status" className="office-search-empty">{emptyMessage}</p>}
      {props.multiple && <div className="office-search-footer"><span>{values.length}개 선택</span><button type="button" className="office-button" disabled={!values.length || blocked} onClick={() => props.onChange([])}>전체 해제</button></div>}
      </Dialog.Content></Dialog.Root>
    </FloatingSurface>
  </div>;
}
