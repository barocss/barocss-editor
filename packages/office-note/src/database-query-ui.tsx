import { useRef, useState, type ReactNode } from 'react';
import { Button, ChoiceSelect, FloatingSurface, FloatingPanelHeader, FloatingPanelFooter, StatusNotice, Icon, TextField } from '@barocss/office-ui';
import { validDatasetFilters, type DataField, type DatasetFilterGroup, type DatasetFilterOperator, type DatasetFilterRule, type DatasetSort } from '@barocss/schema';
import './database-query-ui.css';

const labels: Record<DatasetFilterOperator, string> = { equals: '일치', notEquals: '일치하지 않음', contains: '포함', notContains: '포함하지 않음', isEmpty: '비어 있음', notEmpty: '비어 있지 않음', gt: '초과', gte: '이상', lt: '미만', lte: '이하', before: '이전', after: '이후', on: '해당 날짜' };
const emptyGroup = (): DatasetFilterGroup => ({ mode: 'and', rules: [] });
const fieldLabel = (field: DataField) => field.label || field.name;
const operators = (field?: DataField): DatasetFilterOperator[] => [
  ...(field?.kind === 'date' ? ['on', 'before', 'after'] as const : ['equals', 'notEquals'] as const),
  ...(['number', 'formula', 'rollup'].includes(field?.kind ?? '') ? ['gt', 'gte', 'lt', 'lte'] as const : field?.kind !== 'boolean' && field?.kind !== 'date' ? ['contains', 'notContains'] as const : []),
  'isEmpty', 'notEmpty'
];
function initialRule(fields: DataField[]): DatasetFilterRule {
  const field = fields[0];
  return { id: crypto.randomUUID(), field: field?.name ?? '', operator: 'notEmpty' };
}
export function countDatabaseFilters(group?: DatasetFilterGroup): number {
  return group?.rules.reduce((count, rule) => count + ('rules' in rule ? countDatabaseFilters(rule) : 1), 0) ?? 0;
}

/** Drafts are local until Apply: changing an operator cannot briefly erase the visible rows. */
function QueryPopup({ title, triggerLabel, disabled, children }: {
  title: string; triggerLabel: string; disabled: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const picker = { get current() {
    const combo = content.current?.querySelector('[role="combobox"][aria-expanded="true"]');
    const id = combo?.getAttribute('aria-controls');
    return id ? combo?.ownerDocument.getElementById(id) ?? null : null;
  } };
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); };
  return <>
    <Button ref={trigger} aria-label={title} aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)}>{triggerLabel}</Button>
    {open && <FloatingSurface open focusOnOpen at={trigger.current?.getBoundingClientRect() ?? null} role="dialog" aria-label={title} variant="panel" prefer="below" align="start" className="ondb-query-popup" ownedElements={[trigger, picker]} onDismiss={reason => { setOpen(false); if (reason === 'escape') trigger.current?.focus({ preventScroll: true }); }}>
      <div ref={content}>{children(close)}</div>
    </FloatingSurface>}
  </>;
}

function FilterGroup({ group, fields, path = '1', depth = 0, onChange }: { group: DatasetFilterGroup; fields: DataField[]; path?: string; depth?: number; onChange: (group: DatasetFilterGroup) => void }) {
  const replace = (index: number, rule: DatasetFilterRule | DatasetFilterGroup) => onChange({ ...group, rules: group.rules.map((current, i) => i === index ? rule : current) });
  return <div className="ondb-filter-group" data-filter-depth={depth}>
    <div className="ondb-query-group-heading"><ChoiceSelect ariaLabel={`조건 그룹 ${path} 결합`} value={group.mode} options={[{ id: 'and', label: '모든 조건 (AND)' }, { id: 'or', label: '하나 이상 (OR)' }]} onChange={mode => onChange({ ...group, mode: mode as 'and' | 'or' })} /><span>을 만족하는 항목</span></div>
    {group.rules.map((rule, index) => {
      const id = `${path}.${index + 1}`;
      const field = 'field' in rule ? fields.find(field => field.name === rule.field) : undefined;
      return <div className="ondb-query-condition" key={'id' in rule ? rule.id : id}>
        {'rules' in rule ? <FilterGroup group={rule} fields={fields} path={id} depth={depth + 1} onChange={nested => replace(index, nested)} /> : <div className="ondb-query-rule">
          <ChoiceSelect ariaLabel={`조건 ${id} 속성`} value={rule.field} options={fields.map(field => ({ id: field.name, label: fieldLabel(field) }))} onChange={name => replace(index, { ...rule, field: name, operator: 'notEmpty', value: undefined })} />
          <ChoiceSelect ariaLabel={`조건 ${id} 연산자`} value={rule.operator} options={operators(field).map(operator => ({ id: operator, label: labels[operator] }))} onChange={operator => replace(index, { ...rule, operator: operator as DatasetFilterOperator, value: field?.kind === 'boolean' ? true : field?.kind === 'number' ? 0 : field?.options?.[0] ?? '' })} />
          {!['isEmpty', 'notEmpty'].includes(rule.operator) && (field?.kind === 'boolean' ? <ChoiceSelect ariaLabel={`조건 ${id} 값`} value={String(rule.value)} options={[{ id: 'true', label: '체크됨' }, { id: 'false', label: '체크되지 않음' }]} onChange={value => replace(index, { ...rule, value: value === 'true' })} /> : ['choice', 'choices'].includes(field?.kind ?? '') && field?.options?.length && ['equals', 'notEquals'].includes(rule.operator) ? <ChoiceSelect ariaLabel={`조건 ${id} 값`} value={String(rule.value ?? '')} options={field.options.map(value => ({ id: value, label: value }))} onChange={value => replace(index, { ...rule, value })} /> : <TextField ariaLabel={`조건 ${id} 값`} type={['gt', 'gte', 'lt', 'lte'].includes(rule.operator) || field?.kind === 'number' ? 'number' : field?.kind === 'date' ? 'date' : 'text'} value={rule.value === undefined ? '' : String(rule.value)} placeholder="비교할 값" onChange={value => replace(index, { ...rule, value: ['gt', 'gte', 'lt', 'lte'].includes(rule.operator) || field?.kind === 'number' ? value === '' ? undefined : Number(value) : value })} />)}
        </div>}
        <Button square tone="quiet" className="ondb-query-remove" aria-label={`조건 ${id} 삭제`} onClick={() => onChange({ ...group, rules: group.rules.filter((_, i) => i !== index) })}><Icon name="close" size={14} /></Button>
      </div>;
    })}
    <div className="ondb-query-add"><Button disabled={!fields.length || group.rules.length >= 100} onClick={() => onChange({ ...group, rules: [...group.rules, initialRule(fields)] })}>조건 추가</Button>{depth < 2 && <Button disabled={group.rules.length >= 100} onClick={() => onChange({ ...group, rules: [...group.rules, emptyGroup()] })}>조건 그룹 추가</Button>}</div>
  </div>;
}

function FilterDraft({ fields, initial, onApply, close }: { fields: DataField[]; initial: DatasetFilterGroup; onApply: (filters: DatasetFilterGroup) => Promise<boolean>; close: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const valid = validDatasetFilters(draft, fields.map(field => field.name));
  const apply = async () => {
    if (!valid || pending.current) return;
    if (JSON.stringify(draft) === JSON.stringify(initial)) { close(); return; }
    pending.current = true; setSaving(true);
    try { if (await onApply(draft)) close(); else setError('필터를 적용하지 못했습니다. 조건을 확인하세요.'); }
    catch { setError('필터를 적용하지 못했습니다. 다시 시도하세요.'); }
    finally { pending.current = false; setSaving(false); }
  };
  return <><FloatingPanelHeader title="고급 필터" onClose={close} /><p className="ondb-query-hint">조건을 묶어 이 보기에 필요한 항목만 표시합니다.</p>
    <fieldset disabled={saving}>{!draft.rules.length && <p className="ondb-query-hint">조건이 없으면 모든 항목을 표시합니다.</p>}<FilterGroup group={draft} fields={fields} onChange={setDraft} /></fieldset>
    {!valid && <p className="ondb-query-error" role="status">비교할 숫자 또는 날짜를 입력하세요.</p>}{error && <StatusNotice tone="danger" title={error} />}
    <FloatingPanelFooter leading={<Button tone="quiet" disabled={saving || !draft.rules.length} onClick={() => setDraft(emptyGroup())}>조건 모두 지우기</Button>}><Button disabled={saving} onClick={close}>취소</Button><Button tone="accent" disabled={saving || !valid} onClick={() => void apply()}>{saving ? '적용 중…' : '필터 적용'}</Button></FloatingPanelFooter>
  </>;
}
export function DatabaseFilterEditor({ fields, filters, where, equals, disabled, onApply }: { fields: DataField[]; filters?: DatasetFilterGroup; where?: string; equals?: unknown; disabled: boolean; onApply: (filters: DatasetFilterGroup) => Promise<boolean> }) {
  const initial = filters ?? { mode: 'and', rules: where ? [{ id: 'legacy-filter', field: where, operator: 'equals', value: String(equals ?? '') }] : [] } satisfies DatasetFilterGroup;
  const count = countDatabaseFilters(initial);
  return <QueryPopup title="고급 필터" triggerLabel={count ? `고급 필터 · ${count}` : '고급 필터'} disabled={disabled}>{close => <FilterDraft fields={fields} initial={initial} onApply={onApply} close={close} />}</QueryPopup>;
}

function SortDraft({ fields, initial, onApply, close }: { fields: DataField[]; initial: DatasetSort[]; onApply: (sorts: DatasetSort[]) => Promise<boolean>; close: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const reorder = (index: number, offset: number) => { const next = [...draft]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; setDraft(next); };
  const apply = async () => {
    if (pending.current) return;
    if (JSON.stringify(draft) === JSON.stringify(initial)) { close(); return; }
    pending.current = true; setSaving(true);
    try { if (await onApply(draft)) close(); else setError('정렬을 적용하지 못했습니다. 속성을 확인하세요.'); }
    catch { setError('정렬을 적용하지 못했습니다. 다시 시도하세요.'); }
    finally { pending.current = false; setSaving(false); }
  };
  return <><FloatingPanelHeader title="다중 정렬" onClose={close} /><p className="ondb-query-hint">위에서부터 우선 적용합니다. 값이 같으면 다음 속성으로 정렬합니다.</p>
    <fieldset disabled={saving}>
      {!draft.length && <p className="ondb-query-hint">정렬이 없으면 원래 항목 순서를 사용합니다.</p>}
      {draft.map((sort, index) => <div className="ondb-query-sort" key={sort.field}><span>{index + 1}</span>
        <ChoiceSelect ariaLabel={`정렬 ${index + 1} 속성`} value={sort.field} options={fields.filter(field => field.name === sort.field || !draft.some(sort => sort.field === field.name)).map(field => ({ id: field.name, label: fieldLabel(field) }))} onChange={field => setDraft(draft.map((sort, i) => i === index ? { ...sort, field } : sort))} />
        <ChoiceSelect ariaLabel={`정렬 ${index + 1} 방향`} value={sort.direction} options={[{ id: 'asc', label: '오름차순' }, { id: 'desc', label: '내림차순' }]} onChange={direction => setDraft(draft.map((sort, i) => i === index ? { ...sort, direction: direction as 'asc' | 'desc' } : sort))} />
        <Button square tone="quiet" aria-label={`정렬 ${index + 1} 우선순위 올리기`} disabled={index === 0} onClick={() => reorder(index, -1)}><Icon name="move-up" size={14} /></Button><Button square tone="quiet" aria-label={`정렬 ${index + 1} 우선순위 내리기`} disabled={index === draft.length - 1} onClick={() => reorder(index, 1)}><Icon name="move-down" size={14} /></Button><Button square tone="quiet" aria-label={`정렬 ${index + 1} 삭제`} onClick={() => setDraft(draft.filter((_, i) => i !== index))}><Icon name="close" size={14} /></Button>
      </div>)}
      <Button disabled={draft.length >= fields.length} onClick={() => { const field = fields.find(field => !draft.some(sort => sort.field === field.name)); if (field) setDraft([...draft, { field: field.name, direction: 'asc' }]); }}>정렬 추가</Button>
    </fieldset>
    {error && <StatusNotice tone="danger" title={error} />}
    <FloatingPanelFooter leading={<Button tone="quiet" disabled={saving || !draft.length} onClick={() => setDraft([])}>정렬 모두 지우기</Button>}><Button disabled={saving} onClick={close}>취소</Button><Button tone="accent" disabled={saving} onClick={() => void apply()}>{saving ? '적용 중…' : '정렬 적용'}</Button></FloatingPanelFooter>
  </>;
}
export function DatabaseSortEditor({ fields, sorts, sortBy, sortDir, disabled, onApply }: { fields: DataField[]; sorts?: DatasetSort[]; sortBy?: string; sortDir?: 'asc' | 'desc'; disabled: boolean; onApply: (sorts: DatasetSort[]) => Promise<boolean> }) {
  const initial = sorts ?? (sortBy ? [{ field: sortBy, direction: sortDir ?? 'asc' }] : []);
  return <QueryPopup title="다중 정렬" triggerLabel={initial.length ? `다중 정렬 · ${initial.length}` : '다중 정렬'} disabled={disabled}>{close => <SortDraft fields={fields} initial={initial} onApply={onApply} close={close} />}</QueryPopup>;
}
