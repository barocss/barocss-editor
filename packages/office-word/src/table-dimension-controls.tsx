import { useState } from 'react';
import { selectedNodeIds, type Editor } from '@barocss/editor-core';
import { cellOf, cellPlacementOf, columnsOf, gridOf, tableRowsOf, tableDimensionGrid } from '@barocss/office-text';
import { ChoiceSelect, NumberField, RibbonAction, RibbonGroup, Icon } from '@barocss/office-ui';
import { TWIPS_PER_CM, type WordObjectTarget } from './object-layout';

export function WordTableDimensionControls({ editor, target, container }: { editor: Editor; target: WordObjectTarget; container?: HTMLElement | null }) {
  const doc = { rootId: target.rootId, getNode: (id: string) => editor.dataStore.getNode(id) };
  const table = doc.getNode(target.nodeId)!;
  const count = columnsOf(doc, tableRowsOf(doc, table));
  const selection = editor.selection;
  const ids = selection?.type === 'range' ? [selection.startNodeId] : selectedNodeIds(selection);
  const cells = ids.flatMap(id => { const cell = cellOf(doc, doc.getNode(id)); return cell ? [cell] : []; });
  const rows = [...new Set(cells.map(cell => cell.parentId))].flatMap(id => { const row = id ? doc.getNode(id) : undefined; return row ? [row] : []; });
  const currentColumn = cells[0] ? cellPlacementOf(doc, cells[0])?.at.column ?? 0 : 0;
  const [column, setColumn] = useState(currentColumn);
  const [error, setError] = useState('');
  const columnIndex = Math.min(column, Math.max(0, count - 1));
  const element = Array.from(container?.querySelectorAll<HTMLTableElement>('table.w-table') ?? []).find(el => el.getAttribute('data-bc-sid') === target.nodeId);
  const measured = Array.from(element?.rows[0]?.cells ?? []).flatMap(cell => Array.from({ length: cell.colSpan }, () => cell.offsetWidth * 15 / cell.colSpan));
  const grid = tableDimensionGrid(count, gridOf(table.attributes ?? {}), measured, (element?.offsetWidth ?? count * 120) * 15);
  const commonRow = (key: string) => rows.length && rows.every(row => row.attributes?.[key] === rows[0].attributes?.[key]) ? rows[0].attributes?.[key] : undefined;
  const height = commonRow('height');
  const rule = commonRow('heightRule') ?? (rows.length === 1 ? 'auto' : null);
  const run = async (command: string, payload: Record<string, unknown>) => {
    setError('');
    try { if (!await editor.run(command, payload)) setError('선택한 행 또는 열을 변경하지 못했습니다.'); }
    catch { setError('크기를 변경하지 못했습니다. 다시 시도하세요.'); }
  };
  const rowDisabled = !editor.isEditable || !editor.canRun('setRowHeight');
  return <RibbonGroup id="table-dimensions" label="행·열 크기">
    <div className="w-table-dimension-controls">
      <div className="w-ribbon-row">
        <NumberField ariaLabel="행 높이" prefix="행 높이" suffix="cm" value={typeof height === 'number' && rule !== 'auto' ? height / TWIPS_PER_CM : null}
          min={0.1} max={55} step={0.1} decimals={2} disabled={rowDisabled}
          onCommit={value => void run('setRowHeight', { height: Math.round(value * TWIPS_PER_CM), rule: rule === 'exact' ? 'exact' : 'atLeast' })} />
        <ChoiceSelect ariaLabel="행 높이 방식" value={typeof rule === 'string' ? rule : null} disabled={rowDisabled}
          options={[{ id: 'auto', label: '자동 높이' }, { id: 'atLeast', label: '최소 높이' }, { id: 'exact', label: '고정 높이' }]}
          onChange={rule => void run('setRowHeight', { rule, height: rule === 'auto' ? 0 : typeof height === 'number' && height > 0 ? height : Math.round(TWIPS_PER_CM) })} />
      </div>
      <div className="w-ribbon-row">
        <ChoiceSelect ariaLabel="크기를 바꿀 열" value={String(columnIndex)} disabled={!editor.isEditable || !count}
          options={Array.from({ length: count }, (_, i) => ({ id: String(i), label: `${i + 1}열` }))} onChange={id => setColumn(Number(id))} />
        <NumberField ariaLabel="열 너비" prefix="열 너비" suffix="cm" value={grid[columnIndex] ? grid[columnIndex] / TWIPS_PER_CM : null}
          min={0.1} max={55} step={0.1} decimals={2} disabled={!editor.isEditable || !count}
          onCommit={width => void run('setWordObjectLayout', { ...target, column: { index: columnIndex, width }, measuredColumns: grid.map(n => n / TWIPS_PER_CM) })} />
        <RibbonAction id="equal-columns" label="열 너비 균등 분배" icon={<Icon name="insert-table" />} disabled={!editor.isEditable || count < 2}
          onActivate={() => void run('setWordObjectLayout', { ...target, distributeColumns: true, measuredColumns: grid.map(n => n / TWIPS_PER_CM) })} />
      </div>
      {error && <span role="alert">{error}</span>}
    </div>
  </RibbonGroup>;
}
