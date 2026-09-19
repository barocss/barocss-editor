import { useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  applyJqlSuggestion,
  getJqlSuggestions,
  jiraJqlCatalog,
  parseJql,
  type JqlCatalog,
  type JqlParseResult,
  type JqlSuggestion,
} from './jql.js';

export interface JqlTemplate {
  id: string;
  label: string;
  query: string;
}

export interface JqlEditorProps {
  value?: string;
  defaultValue?: string;
  catalog?: JqlCatalog;
  templates?: readonly JqlTemplate[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  onChange?: (source: string, result: JqlParseResult) => void;
  onSubmit?: (source: string, result: JqlParseResult) => void;
}

const defaultTemplates: readonly JqlTemplate[] = [
  { id: 'mine', label: '내 미해결 업무', query: 'assignee = currentUser() AND resolution IS EMPTY' },
  { id: 'active', label: '진행 중 우선순위', query: 'status = "In Progress" AND priority >= High ORDER BY updated DESC' },
  { id: 'recent', label: '이번 주 생성', query: 'created >= startOfWeek() ORDER BY created DESC' },
];

function classes(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function JqlEditor({
  value,
  defaultValue = '',
  catalog = jiraJqlCatalog,
  templates = defaultTemplates,
  label = 'JQL 검색',
  placeholder = '필드 이름부터 입력하세요. 예: project = PRODUCT',
  disabled = false,
  readOnly = false,
  className,
  onChange,
  onSubmit,
}: JqlEditorProps) {
  const [internal, setInternal] = useState(defaultValue);
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const listId = useId();
  const source = value ?? internal;
  const result = useMemo(() => parseJql(source, catalog), [catalog, source]);
  const suggestions = useMemo(() => getJqlSuggestions(source, cursor, catalog), [catalog, cursor, source]);
  const selected = suggestions[Math.min(active, Math.max(0, suggestions.length - 1))];
  const blocked = disabled || readOnly;
  const publish = (next: string): void => {
    if (value === undefined) setInternal(next);
    onChange?.(next, parseJql(next, catalog));
  };
  const updateCursor = (): void => setCursor(input.current?.selectionStart ?? 0);
  const focusAt = (at: number): void => {
    requestAnimationFrame(() => {
      input.current?.focus({ preventScroll: true });
      input.current?.setSelectionRange(at, at);
      setCursor(at);
    });
  };
  const choose = (suggestion: JqlSuggestion): void => {
    const edit = applyJqlSuggestion(source, suggestion);
    publish(edit.source);
    setActive(0);
    setOpen(true);
    focusAt(edit.cursor);
  };
  const change = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    publish(event.target.value);
    setCursor(event.target.selectionStart);
    setActive(0);
    setOpen(true);
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      setOpen(false);
      onSubmit?.(source, result);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!suggestions.length) return;
      event.preventDefault();
      setOpen(true);
      setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length);
      return;
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && open && selected) {
      event.preventDefault();
      choose(selected);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };
  return <div className={classes('barocss-jql-editor', className)} data-disabled={disabled || undefined} data-readonly={readOnly || undefined}>
    <div className="barocss-jql-editor__topline">
      <span>JQL</span>
      <span className={result.valid ? 'is-valid' : 'is-invalid'}>{result.valid ? '문법 확인됨' : `${result.diagnostics.filter(item => item.severity === 'error').length}개 오류`}</span>
    </div>
    <div className="barocss-jql-editor__surface">
      <textarea ref={input} value={source} aria-label={label} aria-controls={listId}
        aria-expanded={open && suggestions.length > 0} aria-activedescendant={open && selected ? `${listId}-${suggestions.indexOf(selected)}` : undefined}
        placeholder={placeholder} disabled={disabled} readOnly={readOnly} spellCheck={false}
        onFocus={() => { if (!blocked) { updateCursor(); setOpen(true); } }} onClick={updateCursor} onSelect={updateCursor}
        onChange={change} onKeyDown={keyDown} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; updateCursor(); }} />
      {source && !blocked && <button type="button" className="barocss-jql-editor__clear" aria-label="JQL 모두 지우기" onClick={() => { publish(''); setOpen(true); focusAt(0); }}>×</button>}
    </div>
    {open && !blocked && <div id={listId} role="listbox" aria-label="JQL 제안" className="barocss-jql-editor__suggestions">
      {suggestions.slice(0, 8).map((suggestion, index) => <button type="button" role="option" tabIndex={-1}
        id={`${listId}-${index}`} key={suggestion.id} aria-selected={index === active} data-active={index === active || undefined}
        onPointerDown={event => event.preventDefault()} onClick={() => choose(suggestion)}>
        <span className={`jql-kind jql-kind-${suggestion.kind}`}>{suggestion.kind}</span>
        <span><strong>{suggestion.label}</strong>{suggestion.detail && <small>{suggestion.detail}</small>}</span>
        <kbd>↵</kbd>
      </button>)}
      {!suggestions.length && <p>현재 위치에 제안할 항목이 없습니다.</p>}
    </div>}
    <div className="barocss-jql-editor__footer">
      <div className="barocss-jql-editor__templates" aria-label="JQL 예시">
        {templates.map(template => <button type="button" key={template.id} disabled={blocked} onClick={() => { publish(template.query); setOpen(false); focusAt(template.query.length); }}>{template.label}</button>)}
      </div>
      <span><kbd>Ctrl</kbd> + <kbd>Enter</kbd> 실행</span>
    </div>
    {!!result.diagnostics.length && <div className="barocss-jql-editor__diagnostics" role="status">
      {result.diagnostics.slice(0, 3).map((diagnostic, index) => <p key={`${diagnostic.code}-${diagnostic.from}-${index}`} data-severity={diagnostic.severity}>
        <strong>{diagnostic.severity === 'error' ? '오류' : '확인'}</strong>{diagnostic.message}<span>{diagnostic.from + 1}번째 문자</span>
      </p>)}
    </div>}
  </div>;
}
