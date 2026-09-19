import { useRef, useState } from 'react';
import { Button, FloatingSurface, MenuAction, TextField } from '@barocss/office-ui';
import type { DataField } from '@barocss/schema';

export function DatabaseMultiChoice({ field, value, label, disabled, commit }: {
  field: DataField; value: unknown; label: string; disabled: boolean; commit: (value: unknown) => void | Promise<boolean>;
}) {
  const trigger = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const values = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : typeof value === 'string' && value ? [value] : [];
  const options = [...new Set([...(field.options ?? []), ...values])].filter(option => option.toLowerCase().includes(query.toLowerCase()));
  const apply = async (next: string[]) => { setBusy(true); try { if (await commit(next) === false) setError('선택을 저장하지 못했습니다.'); else setError(''); } catch { setError('선택을 저장하지 못했습니다.'); } finally { setBusy(false); } };
  return <div ref={trigger}>
    <Button tone="quiet" ariaLabel={label} disabled={disabled} onClick={() => { setOpen(v => !v); setQuery(''); }}>{values.length ? values.map(v => <span key={v} className="ondb-status">{v}</span>) : '비어 있음'}</Button>
    <FloatingSurface open={open} at={trigger.current?.getBoundingClientRect() ?? null} portalRoot={trigger.current} variant="menu" aria-label={`${label} 다중 선택`} prefer="below" align="start" ownedElements={[trigger]} onDismiss={() => setOpen(false)}>
      <TextField ariaLabel="다중 선택 검색" value={query} onChange={setQuery} />
      {options.map(option => <MenuAction key={option} role="menuitemcheckbox" aria-checked={values.includes(option)} selected={values.includes(option)} disabled={disabled || busy} onClick={() => void apply(values.includes(option) ? values.filter(v => v !== option) : [...values, option])}>{option}</MenuAction>)}
      {!options.length && <p>일치하는 옵션이 없습니다. 속성 설정에서 옵션을 추가하세요.</p>}
      <MenuAction disabled={disabled || busy || !values.length} onClick={() => void apply([])}>선택 모두 지우기</MenuAction>
      {error && <p role="alert">{error}</p>}
    </FloatingSurface>
  </div>;
}
