import { useEffect, useRef, useState } from 'react';
import { Button, ChoiceSelect, Field, FloatingSurface, TextField } from '@barocss/office-ui';
import { evaluateDatasetRecords, inspectFormula, type DataField } from '@barocss/schema';
import type { DatabaseSourceOption } from './database-advanced-value';

export const DATABASE_FIELD_KINDS = [
  { id: 'text', label: '텍스트' }, { id: 'number', label: '숫자' }, { id: 'date', label: '날짜' },
  { id: 'choices', label: '다중 선택' }, { id: 'boolean', label: '체크박스' }, { id: 'choice', label: '선택' },
  { id: 'relation', label: '관계' }, { id: 'formula', label: '수식' }, { id: 'rollup', label: '롤업' }
];
const NONE = '__no_property__';
const nameOf = (field: DataField) => field.label || field.name;

export function DatabaseFieldEditor({ field, fields, sources, sourceName, anchor, disabled, error, onUpdate, onRename, onClose }: {
  field: DataField; fields: DataField[]; sources: DatabaseSourceOption[]; sourceName: string; anchor: HTMLElement | null; disabled: boolean; error?: string;
  onUpdate: (patch: Record<string, unknown>) => Promise<boolean>; onRename: (name: string) => void; onClose: () => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const picker = useRef({ get current(): Element | null {
    const trigger = popup.current?.querySelector('[role="combobox"][aria-expanded="true"]');
    const id = trigger?.getAttribute('aria-controls');
    return id ? popup.current?.ownerDocument.getElementById(id) ?? null : null;
  } });
  const [kind, setKind] = useState(field.kind);
  const [target, setTarget] = useState(field.relation?.source ?? sources[0]?.source ?? '');
  const [multiple, setMultiple] = useState(field.relation?.multiple !== false);
  const [expression, setExpression] = useState(field.formula?.expression ?? '');
  const [relation, setRelation] = useState(field.rollup?.relationField ?? '');
  const [property, setProperty] = useState(field.rollup?.field ?? '');
  const [operation, setOperation] = useState(field.rollup?.operation ?? 'count');
  const [failure, setFailure] = useState('');
  const formulaInput = useRef<HTMLTextAreaElement>(null);
  const metadataKey = JSON.stringify([field.kind, field.relation, field.formula, field.rollup]);
  const previousMetadata = useRef(metadataKey);
  useEffect(() => {
    if (previousMetadata.current === metadataKey) return;
    previousMetadata.current = metadataKey;
    setKind(field.kind); setTarget(field.relation?.source ?? sources[0]?.source ?? '');
    setMultiple(field.relation?.multiple !== false); setExpression(field.formula?.expression ?? '');
    setRelation(field.rollup?.relationField ?? ''); setProperty(field.rollup?.field ?? '');
    setOperation(field.rollup?.operation ?? 'count'); setFailure('');
  }, [metadataKey, field, sources]);
  const update = async (patch: Record<string, unknown>) => {
    const ok = await onUpdate(patch); setFailure(ok ? '' : '설정을 적용하지 못했습니다. 연결 대상과 속성 설정을 확인하세요.'); return ok;
  };
  const chooseKind = (kind: string) => {
    setKind(kind as DataField['kind']); setFailure('');
    if (!['relation', 'formula', 'rollup'].includes(kind)) void update({ kind, ...((kind === 'choice' || kind === 'choices') && !field.options?.length ? { options: ['시작 전', '진행 중', '완료'] } : {}) });
  };
  const relationTargets = sources.filter(source => source.editable !== false);
  const relations = fields.filter(field => field.kind === 'relation');
  const relationField = relations.find(field => field.name === relation);
  const related = sources.find(source => source.source === relationField?.relation?.source);
  const selectedProperty = related?.fields.find(field => field.name === property);
  const formula = inspectFormula(expression);
  const missing = formula.references.filter(name => !fields.some(field => field.name === name));
  const allSources = sources.map(source => ({ name: source.source, fields: source.fields, records: source.records, rowIds: source.rowIds }));
  const current = allSources.find(source => source.name === sourceName);
  let preview: unknown;
  let previewError = '';
  if (kind === 'formula' && formula.valid && !missing.length && current) {
    const staged = { ...current, fields: fields.map(one => one.name === field.name ? { ...one, kind: 'formula' as const, formula: { expression } } : one) };
    const evaluated = evaluateDatasetRecords(staged, allSources.map(source => source.name === sourceName ? staged : source));
    preview = evaluated.records[0]?.[field.name];
    previewError = evaluated.errors[0]?.[field.name] ?? '';
  }
  const formulaError = !formula.valid ? formula.error || '수식을 입력하세요.' : missing.length ? `찾을 수 없는 속성: ${missing.join(', ')}` : previewError;
  const rollupValid = !!relationField && !!related && !!selectedProperty;
  const apply = () => {
    if (kind === 'relation') void update({ kind, relation: { source: target, multiple } });
    if (kind === 'formula') void update({ kind, formula: { expression } });
    if (kind === 'rollup') void update({ kind, rollup: { relationField: relation, field: property, operation } });
  };
  return <FloatingSurface open at={anchor?.getBoundingClientRect() ?? null} prefer="below" align="start" variant="panel" role="dialog" aria-label="필드 편집" className={`ondb-field-popup ${kind === 'formula' ? 'ondb-formula-popup' : ''}`} onDismiss={onClose} ownedElements={[anchor, picker.current]} focusOnOpen>
    <div ref={popup} className="ondb-field-editor" aria-label="데이터베이스 필드 편집">
      <Field label="필드 이름"><TextField ariaLabel="필드 이름" value={nameOf(field)} disabled={disabled} onCommit={name => { void update({ name, label: name }).then(ok => { if (ok) onRename(name); }); }} /></Field>
      <Field label="데이터 유형"><ChoiceSelect ariaLabel="필드 유형" value={kind} options={DATABASE_FIELD_KINDS.some(option => option.id === kind) ? DATABASE_FIELD_KINDS : [...DATABASE_FIELD_KINDS, { id: kind, label: kind }]} disabled={disabled} onChange={chooseKind} /></Field>
      {(kind === 'choice' || kind === 'choices') && <Field label="선택 항목"><TextField ariaLabel="선택 항목" value={(field.options ?? []).join(', ')} disabled={disabled} placeholder="쉼표로 구분" onCommit={options => void update({ options: [...new Set(options.split(',').map(value => value.trim()).filter(Boolean))] })} /></Field>}
      {kind === 'relation' && <div className="ondb-advanced-settings">
        <Field label="대상"><ChoiceSelect ariaLabel="관계 대상 데이터베이스" disabled={disabled} value={target || NONE} options={[{ id: NONE, label: '대상을 선택하세요' }, ...relationTargets.map(source => ({ id: source.source, label: source.label }))]} onChange={value => setTarget(value === NONE ? '' : value)} /></Field>
        <label className="ondb-setting-check"><input type="checkbox" aria-label="여러 항목 연결 허용" disabled={disabled} checked={multiple} onChange={event => setMultiple(event.target.checked)} />여러 항목 연결 허용</label>
        {!relationTargets.some(source => source.source === target) && <p className="ondb-inline-error">연결할 데이터베이스를 선택하세요.</p>}
        <Button ariaLabel="관계 설정 적용" disabled={disabled || !relationTargets.some(source => source.source === target)} onClick={apply}>적용</Button>
      </div>}
      {kind === 'rollup' && <div className="ondb-advanced-settings">
        <Field label="관계"><ChoiceSelect ariaLabel="롤업 관계 속성" disabled={disabled} value={relation || NONE} options={[{ id: NONE, label: '관계를 선택하세요' }, ...relations.map(field => ({ id: field.name, label: nameOf(field) }))]} onChange={value => { setRelation(value === NONE ? '' : value); setProperty(''); }} /></Field>
        {!relations.length && <p className="ondb-value-empty">먼저 관계 속성을 추가하세요.</p>}
        <Field label="속성"><ChoiceSelect ariaLabel="롤업 대상 속성" value={property || NONE} options={[{ id: NONE, label: '속성을 선택하세요' }, ...(related?.fields ?? []).map(field => ({ id: field.name, label: nameOf(field) }))]} disabled={disabled || !related} onChange={value => setProperty(value === NONE ? '' : value)} /></Field>
        <Field label="계산"><ChoiceSelect ariaLabel="롤업 계산" disabled={disabled} value={operation} options={[{ id: 'count', label: '개수' }, { id: 'sum', label: '합계' }, { id: 'average', label: '평균' }, { id: 'min', label: '최솟값' }, { id: 'max', label: '최댓값' }]} onChange={value => setOperation(value as typeof operation)} /></Field>
        {relation && !related && <p className="ondb-inline-error">관계의 대상 데이터베이스를 찾을 수 없습니다.</p>}
        <Button ariaLabel="롤업 설정 적용" disabled={disabled || !rollupValid} onClick={apply}>적용</Button>
      </div>}
      {kind === 'formula' && <div className="ondb-formula-settings">
        <textarea ref={formulaInput} aria-label="수식" disabled={disabled} value={expression} spellCheck={false} placeholder={'prop("수량") * 2'} onChange={event => setExpression(event.target.value)} onKeyDown={event => event.stopPropagation()} />
        <div className="ondb-formula-references" aria-label="수식에 속성 삽입">{fields.filter(one => one.name !== field.name).map(one => <button type="button" key={one.name} onMouseDown={event => event.preventDefault()} onClick={() => {
          const input = formulaInput.current; const start = input?.selectionStart ?? expression.length; const end = input?.selectionEnd ?? start;
          const reference = `prop(${JSON.stringify(one.name)})`; setExpression(expression.slice(0, start) + reference + expression.slice(end));
          requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + reference.length, start + reference.length); });
        }}>{nameOf(one)}</button>)}</div>
        <p className="ondb-formula-help">prop("속성"), if, empty, concat, round, abs, min, max, toNumber</p>
        {formulaError ? <p role="alert" className="ondb-inline-error">{formulaError}</p> : <p className="ondb-formula-preview" aria-label="수식 결과 미리보기">{current?.records.length ? `첫 항목: ${String(preview ?? '비어 있음')}` : '문법이 올바릅니다. 항목을 추가하면 결과가 표시됩니다.'}</p>}
        <Button ariaLabel="수식 적용" disabled={disabled || !!formulaError} onClick={apply}>적용</Button>
      </div>}
      {(failure || error) && <p role="alert" className="ondb-inline-error">{error || failure}</p>}
      <div className="ondb-field-editor-actions"><Button disabled={disabled} ariaLabel={`${nameOf(field)} 필드 삭제`} onClick={() => { void update({ remove: true }).then(ok => { if (ok) onClose(); }); }}>필드 삭제</Button><Button onClick={onClose}>필드 편집 닫기</Button></div>
    </div>
  </FloatingSurface>;
}
