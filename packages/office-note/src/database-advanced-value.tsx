import { useEffect, useRef, useState } from 'react';
import { SearchSelect, SelectionTag } from '@barocss/office-ui';
import type { DataField } from '@barocss/schema';

export interface DatabaseSourceOption {
  source: string;
  editable?: boolean;
  label: string;
  fields: DataField[];
  rowIds: string[];
  records: Record<string, unknown>[];
}
export interface AdvancedValueProps {
  rawValue?: unknown;
  error?: string;
  sources?: DatabaseSourceOption[];
  onOpenRelated?: (source: string, rowId: string) => boolean | void;
}
const itemName = (source: DatabaseSourceOption, index: number) => {
  const name = source.fields.find(field => field.kind === 'text')?.name;
  return String((name ? source.records[index]?.[name] : '') || `항목 ${index + 1}`);
};

export function DatabaseComputedValue({ value, label, error }: { value: unknown; label: string; error?: string }) {
  const shown = value == null || value === '' ? '비어 있음' : Array.isArray(value) ? value.join(', ') : String(value);
  return <div className="ondb-computed" tabIndex={0} aria-label={label} data-db-computed="true" data-error={!!error || undefined} title={error || '자동 계산되는 속성입니다'}>
    <span>{shown}</span>{error && <small>{error}</small>}
  </div>;
}

export function DatabaseRelationValue({ field, rawValue, label, disabled, commit, sources = [], onOpenRelated, error }: {
  field: DataField; label: string; disabled: boolean; commit: (value: unknown) => void | Promise<boolean>;
} & AdvancedValueProps) {
  const [navigationError, setNavigationError] = useState('');
  const source = sources.find(source => source.source === field.relation?.source);
  const incoming = Array.isArray(rawValue) ? rawValue.filter((value): value is string => typeof value === 'string') : [];
  const incomingKey = JSON.stringify(incoming);
  const raw = useRef(incoming); raw.current = incoming;
  const selection = useRef(incoming);
  const [selected, setSelected] = useState(incoming);
  const pending = useRef(0);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    if (pending.current) return;
    selection.current = raw.current; setSelected(raw.current);
  }, [incomingKey]);
  const write = (next: string[]) => {
    selection.current = next; setSelected(next); setNavigationError(''); pending.current += 1;
    // Each click starts from the latest intent, even before the host publishes its
    // previous transaction. The host's asynchronous result still governs success.
    queue.current = queue.current.then(async () => {
      let accepted = false;
      try { accepted = await commit(next) !== false; }
      catch { accepted = false; }
      pending.current -= 1;
      if (!accepted) setNavigationError('연결을 저장하지 못했습니다. 다시 시도하세요.');
      if (!pending.current && !accepted) { selection.current = raw.current; setSelected(raw.current); }
    });
  };
  const options = source?.rowIds.map((id, index) => ({ id, label: itemName(source, index) })) ?? [];
  const picker = { options, ariaLabel: label, popupLabel: `${label} 관계 선택`, searchLabel: '연결할 항목 검색', disabled,
    showTags: false, placeholder: field.relation?.source ? '항목 연결' : '대상 데이터베이스를 설정하세요',
    emptyMessage: source ? '일치하는 항목이 없습니다.' : '대상 데이터베이스가 없거나 아직 설정되지 않았습니다.' };
  return <div className="ondb-relation-value">
    {selected.map(id => {
      const index = source?.rowIds.indexOf(id) ?? -1;
      const name = source && index >= 0 ? itemName(source, index) : '찾을 수 없는 항목';
      return <SelectionTag key={id} label={name} missing={index < 0} removeLabel={`${name} 연결 해제`}
        onOpen={index >= 0 && onOpenRelated ? () => { if (source && onOpenRelated(source.source, id) === false) setNavigationError('이 항목의 데이터베이스 블록을 현재 페이지에서 열 수 없습니다.'); } : undefined}
        onRemove={disabled ? undefined : () => write(selection.current.filter(value => value !== id))} />;
    })}
    {field.relation?.multiple === false
      ? <SearchSelect {...picker} value={selected[0] ?? ''} onChange={id => write(id ? [id] : [])} />
      : <SearchSelect {...picker} multiple value={selected} onChange={next => {
        // Preserve queued user intent if another selection arrives before React publishes it.
        const removed = selected.filter(id => !next.includes(id));
        const kept = selection.current.filter(id => !removed.includes(id));
        write([...kept, ...next.filter(id => !selected.includes(id) && !kept.includes(id))]);
      }} />}
    {(error || navigationError) && <small className="ondb-inline-error">{error || navigationError}</small>}
  </div>;
}
