import { useEffect, useRef, useState } from 'react';
import { Button, DataTable, DataTableCell, DataTableRow, PropertyToggle, TextField } from '@barocss/office-ui';

function EditableCell({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  const finish = () => { setEditing(false); requestAnimationFrame(() => button.current?.focus()); };
  return <DataTableCell>{editing ? <div data-cell-editor onBlur={() => setEditing(false)}>
    <TextField inputRef={input} ariaLabel="예시 작업 편집" value={value} onCommit={onCommit} onKeys={event => {
      if (!event.nativeEvent.isComposing && ['Enter', 'Escape'].includes(event.key)) finish();
    }} />
  </div> : <button ref={button} className="ds-table-value" onClick={() => setEditing(true)} aria-label="예시 작업 편집">{value || '비어 있음'}</button>}</DataTableCell>;
}

export function DataTableSpecimens() {
  const [names, setNames] = useState(['출시 문서 검토', '고객 요청 정리', '분기별 운영 지표 확인']);
  const [selected, setSelected] = useState<number[]>([]);
  return <div className="ds-table-example">
    <div className="ds-table-scroll"><DataTable aria-label="데이터 표 예시">
      <thead><tr><th data-row-control><PropertyToggle ariaLabel="예시 전체 행 선택" value={selected.length === 3 ? true : selected.length ? null : false} onChange={value => setSelected(value ? [0, 1, 2] : [])} /></th><th>작업</th><th>예산</th><th>자동 계산</th></tr></thead>
      <tbody>{names.map((name, index) => <DataTableRow key={index} selected={selected.includes(index)}>
        <td data-row-control><PropertyToggle ariaLabel={`예시 ${index + 1}행 선택`} value={selected.includes(index)} onChange={value => setSelected(ids => value ? [...ids, index] : ids.filter(id => id !== index))} /></td>
        <EditableCell value={name} onCommit={value => setNames(items => items.map((item, i) => i === index ? value : item))} />
        <DataTableCell numeric><button className="ds-table-value" disabled aria-label={`${index + 1}행 예산 편집 권한 없음`}>{[1840000, 325000, 97000][index].toLocaleString('ko-KR')}</button></DataTableCell>
        <DataTableCell numeric readOnly invalid={index === 2}><div tabIndex={0} aria-label={`${index + 1}행 계산 결과`} className="ds-table-computed">{index === 2 ? '계산 오류' : index === 0 ? '184,000' : '32,500'}<small>{index === 2 ? '참조할 값을 확인하세요.' : '자동 계산'}</small></div></DataTableCell>
      </DataTableRow>)}</tbody>
    </DataTable></div>
    <div className="ds-table-summary"><span role="status">{selected.length}개 행 선택</span><Button tone="quiet" disabled={!selected.length} onClick={() => setSelected([])}>행 선택 해제</Button></div>
    <p>행 선택은 옅은 배경으로, 현재 셀은 네 면 테두리로 표시합니다. 작업을 눌러 편집하세요. Enter는 확정, Escape는 취소합니다. 예산은 권한이 없는 상태입니다.</p>
  </div>;
}
