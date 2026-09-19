import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import {
  addQueryFilter,
  commonQueryOperators,
  filterQueryOperators,
  filterQueryOptions,
  findQueryOperator,
  mergeQueryText,
  optionLabel,
  parseFilterFragment,
  parseQuery,
  removeQueryFilter,
  splitQueryFragment,
  stringifyQuery,
  type QueryDocument,
  type QueryFilter,
  type QueryOperator,
  type QueryOption,
} from './core.js';

export interface QueryEditorProps {
  value?: QueryDocument;
  defaultValue?: QueryDocument | string;
  operators?: readonly QueryOperator[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  className?: string;
  emptyMessage?: string;
  onChange?: (document: QueryDocument, query: string) => void;
  onSubmit?: (document: QueryDocument, query: string) => void;
}

type Suggestion =
  | { type: 'operator'; operator: QueryOperator }
  | { type: 'option'; operator: QueryOperator; option: QueryOption };

const emptyDocument: QueryDocument = { text: '', filters: [] };

function initialDocument(value: QueryEditorProps['defaultValue'], operators: readonly QueryOperator[]): QueryDocument {
  if (!value) return emptyDocument;
  return typeof value === 'string' ? mergeQueryText({ text: value, filters: [] }, operators) : value;
}

function classes(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function QueryEditor({
  value,
  defaultValue,
  operators = commonQueryOperators,
  label = '검색 조건',
  placeholder = '검색어 또는 필터 입력…',
  disabled = false,
  readOnly = false,
  autoFocus = false,
  className,
  emptyMessage = '일치하는 필터가 없습니다.',
  onChange,
  onSubmit,
}: QueryEditorProps) {
  const [internal, setInternal] = useState<QueryDocument>(() => initialDocument(defaultValue, operators));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const listId = useId();
  const document = value ?? internal;
  const blocked = disabled || readOnly;
  const fragment = splitQueryFragment(document.text);
  const separator = fragment.value.indexOf(':');
  const fragmentKey = separator >= 0 ? fragment.value.slice(0, separator) : '';
  const fragmentValue = separator >= 0 ? fragment.value.slice(separator + 1) : '';
  const valueOperator = separator >= 0 ? findQueryOperator(fragmentKey, operators) : undefined;

  const suggestions = useMemo<readonly Suggestion[]>(() => {
    if (valueOperator?.options) {
      return filterQueryOptions(valueOperator.options, fragmentValue)
        .map(option => ({ type: 'option' as const, operator: valueOperator, option }));
    }
    if (separator >= 0) return [];
    return filterQueryOperators(fragment.value, operators)
      .map(operator => ({ type: 'operator' as const, operator }));
  }, [fragment.value, fragmentValue, operators, separator, valueOperator]);

  const selected = suggestions[Math.min(active, Math.max(0, suggestions.length - 1))];
  const optionId = (index: number) => `${listId}-${index}`;
  const publish = (next: QueryDocument): void => {
    if (value === undefined) setInternal(next);
    onChange?.(next, stringifyQuery(next));
  };
  const focus = (): void => {
    requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
  };
  const addFilter = (filter: QueryFilter, prefix = fragment.prefix): QueryDocument => {
    const next = addQueryFilter({ ...document, text: prefix.trimEnd() }, filter, operators);
    publish(next);
    setActive(0);
    setOpen(true);
    focus();
    return next;
  };
  const choose = (suggestion: Suggestion): void => {
    if (suggestion.type === 'operator') {
      publish({ ...document, text: `${fragment.prefix}${fragment.value.startsWith('-') ? '-' : ''}${suggestion.operator.key}:` });
      setActive(0);
      setOpen(true);
      focus();
      return;
    }
    if (suggestion.option.disabled) return;
    addFilter({
      key: suggestion.operator.key,
      value: suggestion.option.value,
      negated: fragment.value.startsWith('-') || undefined,
    });
  };
  const commitText = (): QueryDocument => {
    const next = mergeQueryText(document, operators);
    if (next.text !== document.text || next.filters !== document.filters) publish(next);
    return next;
  };
  const changeText = (event: ChangeEvent<HTMLInputElement>): void => {
    publish({ ...document, text: event.target.value });
    setActive(0);
    setOpen(true);
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!suggestions.length) return;
      event.preventDefault();
      setOpen(true);
      setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const earlierFilters = parseQuery(fragment.prefix, operators).filters;
      if (open && selected && fragment.value && !earlierFilters.length) {
        choose(selected);
      } else {
        const next = commitText();
        setOpen(false);
        onSubmit?.(next, stringifyQuery(next));
      }
      return;
    }
    if (event.key === ' ' && fragment.value) {
      const parsed = parseFilterFragment(fragment.value, operators);
      if (parsed) {
        event.preventDefault();
        addFilter(parsed);
      }
      return;
    }
    if (event.key === 'Backspace' && !document.text && document.filters.length) {
      event.preventDefault();
      publish(removeQueryFilter(document, document.filters.length - 1));
    }
  };

  useEffect(() => {
    if (blocked) setOpen(false);
  }, [blocked]);

  return <div className={classes('barocss-query-editor', className)} data-disabled={disabled || undefined} data-readonly={readOnly || undefined}>
    <div className="barocss-query-editor__field" onClick={() => { if (!blocked) input.current?.focus(); }}>
      <span className="barocss-query-editor__search" aria-hidden="true">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none"><circle cx="8.5" cy="8.5" r="5.25" stroke="currentColor" strokeWidth="1.5"/><path d="m12.5 12.5 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </span>
      {document.filters.map((filter, index) => {
        const operator = findQueryOperator(filter.key, operators);
        const text = `${filter.negated ? '제외 · ' : ''}${operator?.label ?? filter.key}: ${optionLabel(operator, filter.value)}`;
        return <span className="barocss-query-editor__chip" key={`${filter.key}-${filter.value}-${index}`}>
          <button type="button" className="barocss-query-editor__chip-label" disabled={blocked}
            aria-label={`${text} 수정`} onClick={event => {
              event.stopPropagation();
              const without = removeQueryFilter(document, index);
              publish({ ...without, text: `${without.text}${without.text ? ' ' : ''}${filter.negated ? '-' : ''}${filter.key}:${filter.value}` });
              setOpen(true);
              focus();
            }}>
            <span>{filter.negated && '− '}{operator?.label ?? filter.key}</span><strong>{optionLabel(operator, filter.value)}</strong>
          </button>
          {!blocked && <button type="button" className="barocss-query-editor__remove" aria-label={`${text} 제거`}
            onClick={event => { event.stopPropagation(); publish(removeQueryFilter(document, index)); focus(); }}>×</button>}
        </span>;
      })}
      <input ref={input} className="barocss-query-editor__input" value={document.text} aria-label={label}
        role="combobox" aria-expanded={open && suggestions.length > 0} aria-controls={listId}
        aria-activedescendant={open && selected ? optionId(suggestions.indexOf(selected)) : undefined}
        aria-autocomplete="list" placeholder={document.filters.length ? '' : placeholder} disabled={disabled} readOnly={readOnly}
        autoFocus={autoFocus} onFocus={() => { if (!blocked) setOpen(true); }} onChange={changeText} onKeyDown={keyDown}
        onBlur={event => {
          const next = event.relatedTarget;
          if (!(next instanceof Node) || !event.currentTarget.parentElement?.parentElement?.contains(next)) setOpen(false);
        }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} />
      {document.text || document.filters.length ? <button type="button" className="barocss-query-editor__clear" aria-label="검색 조건 모두 지우기"
        disabled={blocked} onClick={event => { event.stopPropagation(); publish(emptyDocument); setOpen(false); focus(); }}>×</button> : null}
    </div>
    {open && !blocked && <div id={listId} className="barocss-query-editor__menu" role="listbox" aria-label="검색 필터 제안">
      {suggestions.map((suggestion, index) => {
        const isOption = suggestion.type === 'option';
        const title = isOption ? suggestion.option.label : suggestion.operator.label;
        const detail = isOption ? suggestion.option.description : suggestion.operator.description;
        const key = isOption ? `${suggestion.operator.key}:${suggestion.option.value}` : suggestion.operator.key;
        const unavailable = isOption && suggestion.option.disabled;
        return <button id={optionId(index)} key={key} type="button" role="option" tabIndex={-1}
          aria-selected={index === active} aria-disabled={unavailable || undefined} disabled={unavailable}
          className="barocss-query-editor__option" data-active={index === active || undefined}
          onPointerDown={event => event.preventDefault()} onClick={() => choose(suggestion)}>
          <span className="barocss-query-editor__option-mark" aria-hidden="true">{isOption ? '↳' : `${suggestion.operator.key}:`}</span>
          <span className="barocss-query-editor__option-copy"><strong>{title}</strong>{detail && <small>{detail}</small>}</span>
          {!isOption && <kbd>{suggestion.operator.key}:</kbd>}
        </button>;
      })}
      {!suggestions.length && <p className="barocss-query-editor__empty" role="status">
        {valueOperator && !valueOperator.options ? valueOperator.placeholder ?? `${valueOperator.label} 값을 입력하세요.` : emptyMessage}
      </p>}
      <div className="barocss-query-editor__hint"><span><kbd>↑↓</kbd> 이동</span><span><kbd>Enter</kbd> 선택</span><span><kbd>Esc</kbd> 닫기</span></div>
    </div>}
  </div>;
}
