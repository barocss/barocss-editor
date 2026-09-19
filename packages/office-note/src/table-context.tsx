import { useEffect, useRef, useState, type RefObject } from 'react';
import { selectedNodeIds, type Editor, type ModelSelection } from '@barocss/editor-core';
import { buildTableGrid, findAncestorCell, findAncestorTable, findCellPosition } from '@barocss/model';
import { ownsEditorSelection, useEditorRevision, useNodeRect } from '@barocss/office-editor-ui';
import { FloatingSurface, Button, Tip, MenuAction } from '@barocss/office-ui';
import { Icon } from '@barocss/office-icons';
import { actsFor } from './block-model';
import { cellAt } from './selection';

type TableSelection = { cellId: string; tableId: string; selection: ModelSelection };

/** Cell commands keep their selection while their menu receives keyboard focus. */
export function TableContext({ editor, scope, active = true }: {
  editor: Editor;
  scope: RefObject<HTMLElement | null>;
  active?: boolean;
}) {
  const revision = useEditorRevision(editor);
  const chrome = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<TableSelection | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [group, setGroup] = useState<'row' | 'column' | 'cell' | 'theme' | null>(null);
  const [menuAt, setMenuAt] = useState<DOMRect | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const at = useNodeRect(editor, scope, context?.tableId);

  useEffect(() => {
    const doc = scope.current?.ownerDocument ?? document;
    const update = () => {
      if (!active) { setContext(null); return; }
      if (chrome.current?.contains(doc.activeElement) || menu.current?.contains(doc.activeElement)) return;
      const focused = doc.activeElement;
      if (focused && focused !== doc.body && !scope.current?.contains(focused)) {
        setContext(null); return;
      }
      const selection = editor.selection;
      if (selection?.type === 'table') {
        const ids = selectedNodeIds(selection);
        const tableId = ids.length === 1 && editor.dataStore.getNode(ids[0])?.stype === 'bTable' ? ids[0] : undefined;
        const cellId = tableId && buildTableGrid(editor.dataStore, tableId).slots[0]?.find(slot => slot.sid)?.sid;
        setContext(tableId && cellId ? { tableId, cellId, selection: { ...selection } } : null);
        return;
      }
      if (!selection || (selection.type !== 'range' && selection.type !== 'cell')) {
        setContext(null); return;
      }
      const dom = doc.getSelection();
      if (selection.type === 'range' && !ownsEditorSelection(editor, dom, scope.current)) {
        setContext(null); return;
      }
      const domCell = (node: Node | null | undefined) => cellAt(node?.nodeType === 1 ? node as Element
        : node?.parentElement ?? null, sid => editor.dataStore.getNode(sid)?.stype);
      const from = domCell(dom?.anchorNode), to = domCell(dom?.focusNode);
      if (dom?.rangeCount && (!from || !to)) { setContext(null); return; }
      // Native selection is immediate; its model notification may arrive after a menu click.
      const ids = selection.type === 'cell' ? selectedNodeIds(selection) : [from, to].filter((id): id is string => !!id);
      const cellId = ids[0] && findAncestorCell(editor.dataStore, ids[0]);
      const tableId = cellId && findAncestorTable(editor.dataStore, cellId);
      if (!cellId || !tableId || !ids.every(id => findAncestorTable(editor.dataStore, id) === tableId)) {
        setContext(null); return;
      }
      setContext({ cellId, tableId, selection: { ...selection } });
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (chrome.current?.contains(target) || menu.current?.contains(target)) return;
      // A fresh body gesture closes the old menu immediately. Model selection can arrive
      // after the next toolbar click, so it must not dismiss a newly opened menu.
      setGroup(null);
      const pointed = target?.nodeType === 1 ? target as Element : target?.parentElement ?? null;
      if (!scope.current?.contains(target) || !cellAt(pointed, sid => editor.dataStore.getNode(sid)?.stype)) setContext(null);
    };
    update();
    doc.addEventListener('selectionchange', update);
    doc.addEventListener('focusin', update);
    doc.addEventListener('pointerdown', outside);
    return () => {
      doc.removeEventListener('selectionchange', update);
      doc.removeEventListener('focusin', update);
      doc.removeEventListener('pointerdown', outside);
    };
  }, [editor, scope, active, revision]);

  const selectionKey = context ? JSON.stringify(context.selection) : '';
  useEffect(() => { setDismissed(false); }, [selectionKey]);
  useEffect(() => { if (!context) setGroup(null); }, [context]);
  const grid = context && editor.dataStore.getNode(context.cellId)
    ? buildTableGrid(editor.dataStore, context.tableId) : null;
  const payload = context ? { cellId: context.cellId, selection: context.selection } : undefined;
  const canDeleteRow = () => {
    if (!grid || !context || grid.rowIds.length <= 1) return false;
    const position = findCellPosition(grid, context.cellId);
    const row = position && editor.dataStore.getNode(grid.rowIds[position.row]);
    if (!row) return false;
    // Removing a section's final body/footer row would leave its required row+ empty.
    return row.stype === 'bTableHeader' || !!row.parentId
      && (editor.dataStore.getNode(row.parentId)?.content?.length ?? 0) > 1;
  };
  const canMerge = () => {
    if (!grid || !context) return false;
    const selection = context.selection;
    const ids = selection.type === 'cell' ? selectedNodeIds(selection)
      : [selection.startNodeId, selection.endNodeId].map(id => findAncestorCell(editor.dataStore, id));
    const first = ids[0], last = ids[ids.length - 1];
    if (!first || !last || first === last) return false;
    const a = findCellPosition(grid, first), b = findCellPosition(grid, last);
    if (!a || !b) return false;
    const top = Math.min(a.row, b.row), bottom = Math.max(a.row, b.row);
    const left = Math.min(a.column, b.column), right = Math.max(a.column, b.column);
    for (let row = top; row <= bottom; row++) for (let column = left; column <= right; column++) {
      const sid = grid.slots[row][column]?.sid;
      if (!sid) continue;
      const position = findCellPosition(grid, sid)!;
      const attrs = editor.dataStore.getNode(sid)?.attributes;
      if (position.row < top || position.column < left
        || position.row + Number(attrs?.rowspan ?? 1) - 1 > bottom
        || position.column + Number(attrs?.colspan ?? 1) - 1 > right) return false;
    }
    return true;
  };
  const canRun = (command: string) => !!grid && !busy
    && (context?.selection.type !== 'table' || !['mergeCells', 'splitCell'].includes(command))
    && (command !== 'deleteRow' || canDeleteRow())
    && (command !== 'deleteColumn' || grid.columnCount > 1)
    && (command !== 'mergeCells' || canMerge())
    && editor.canExecuteCommand(command, payload);
  const run = async (command: string) => {
    if (!context || !canRun(command)) return;
    setBusy(true);
    editor.selectionManager.setSelection(context.selection);
    try {
      await editor.executeCommand(command, payload);
      setGroup(null);
      // Return typing to the editor; the transaction supplies the resulting caret.
      scope.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus({ preventScroll: true });
    } finally { setBusy(false); }
  };
  const applyAppearance = async (command: string, options: Record<string, unknown>) => {
    if (!context || busy) return;
    editor.selectionManager.setSelection(context.selection);
    if (!editor.canExecuteCommand(command, options)) return;
    setBusy(true);
    try { await editor.executeCommand(command, options); }
    finally { setBusy(false); }
  };
  const background = (color: string) => void applyAppearance('setTableCellBackground', {
    ...(context && ['cell', 'table'].includes(context.selection.type) ? {} : { cellId: context?.cellId }), color
  });

  useEffect(() => {
    setMenuAt(group ? chrome.current?.getBoundingClientRect() ?? null : null);
  }, [at, group]);
  const groups = [
    { id: 'row', label: '행 편집', text: '행', icon: 'row-above' },
    { id: 'column', label: '열 편집', text: '열', icon: 'column-left' },
    { id: 'cell', label: '셀 편집', text: '셀', icon: 'merge-cells' },
    { id: 'theme', label: '표 테마', text: '테마', icon: 'shading' }
  ] as const;
  const colors = [
    { label: '기본 색상', color: '' }, { label: '연한 노랑', color: 'FEF3C7' }, { label: '연한 파랑', color: 'DBEAFE' },
    { label: '연한 초록', color: 'DCFCE7' }, { label: '연한 분홍', color: 'FCE7F3' }, { label: '연한 회색', color: 'E2E8F0' }
  ];
  const fill = String(editor.dataStore.getNode(context?.cellId ?? '')?.attributes?.shadingFill ?? '').replace(/^#/, '');
  const visible = active && !!grid && !dismissed;
  return <>
    <FloatingSurface open={visible} at={at} prefer="above" align="end" gap={36} aria-label="표 편집"
      data-note-table-context portalRoot={scope.current} ownedElements={[scope, menu]}
      onDismiss={() => { setDismissed(true); setGroup(null); }}>
      <div ref={chrome} className="flex items-center gap-0.5">
        <span className="px-1 text-xs text-[color:var(--ou-muted)]">{grid?.rowIds.length} × {grid?.columnCount}</span>
        {groups.map(item => <Tip key={item.id} label={item.label}><Button ariaLabel={item.label} tone="quiet" pressed={group === item.id}
          className="gap-1 px-2" onMouseDown={event => event.preventDefault()} onClick={() => setGroup(current => current === item.id ? null : item.id)}>
          <Icon name={item.icon} /><span>{item.text}</span>
        </Button></Tip>)}
      </div>
    </FloatingSurface>
    <FloatingSurface key={group} open={visible && !!group} at={menuAt} prefer="below" align="start" variant="menu"
      aria-label={groups.find(item => item.id === group)?.label} focusOnOpen portalRoot={scope.current}
      ownedElements={[scope, chrome]} onDismiss={() => {
        const trigger = chrome.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
        setGroup(null);
        trigger?.focus({ preventScroll: true });
      }}>
      <div ref={menu} className="min-w-40">
        {actsFor('bTable').filter(action => group === 'row' ? action.command.includes('Row')
          : group === 'column' ? action.command.includes('Column') : group === 'cell' && ['mergeCells', 'splitCell'].includes(action.command))
          .map(action => <MenuAction key={action.command} disabled={!canRun(action.command)}
            title={action.title} data-note-table-action={action.command} onClick={() => void run(action.command)}>
            <Icon name={action.icon} /><span>{action.label}{action.command.startsWith('insert') ? ' 추가' : ''}</span>
          </MenuAction>)}
        {group === 'cell' && <>
          <div role="separator" className="my-1 border-t border-[color:var(--ou-line)]" />
          <div className="on-table-color-label">셀 배경색</div>
          <div className="on-table-colors">
            {colors.map(color => <MenuAction key={color.label} aria-label={`셀 배경색 · ${color.label}`} title={color.label}
              disabled={busy || !editor.canExecuteCommand('setTableCellBackground', { cellId: context?.cellId, color: color.color })}
              style={{ backgroundColor: color.color ? `#${color.color}` : 'transparent' }} onClick={() => background(color.color)}>
              {color.color ? <span className="sr-only">{color.label}</span> : <Icon name="reject" />}
            </MenuAction>)}
          </div>
          <label className="flex items-center justify-between gap-2 px-2 py-1 text-xs">
            직접 선택<input type="color" aria-label="셀 배경색 직접 선택" disabled={busy}
              value={/^[0-9a-f]{6}$/i.test(fill) ? `#${fill}` : '#ffffff'}
              onChange={event => background(event.target.value)} />
          </label>
        </>}
        {group === 'row' && context && <>
          <div role="separator" className="my-1 border-t border-[color:var(--ou-line)]" />
          <MenuAction aria-label="첫 행을 머리글로 사용"
            aria-pressed={editor.dataStore.getNode(grid?.rowIds[0] ?? '')?.stype === 'bTableHeader'}
            disabled={busy || !editor.canExecuteCommand('setTableHeader', { tableId: context.tableId,
              enabled: editor.dataStore.getNode(grid?.rowIds[0] ?? '')?.stype !== 'bTableHeader' })}
            onClick={() => void applyAppearance('setTableHeader', { tableId: context.tableId,
              enabled: editor.dataStore.getNode(grid?.rowIds[0] ?? '')?.stype !== 'bTableHeader' })}>
            <Icon name="row-above" /><span>{editor.dataStore.getNode(grid?.rowIds[0] ?? '')?.stype === 'bTableHeader' ? '머리글 해제' : '첫 행을 머리글로'}</span>
          </MenuAction>
        </>}
        {group === 'theme' && ([['plain', '기본'], ['striped', '줄무늬'], ['blue', '파랑']] as const).map(([theme, label]) =>
          <MenuAction key={theme} aria-label={`표 테마 · ${label}`} data-note-table-theme={theme}
            selected={(editor.dataStore.getNode(context?.tableId ?? '')?.attributes?.theme ?? 'plain') === theme}
            aria-current={(editor.dataStore.getNode(context?.tableId ?? '')?.attributes?.theme ?? 'plain') === theme ? 'true' : undefined}
            disabled={busy || !editor.canExecuteCommand('setTableTheme', { tableId: context?.tableId, theme })}
            onClick={() => void applyAppearance('setTableTheme', { tableId: context?.tableId, theme })}>
            <span className="on-table-theme-thumb" data-theme={theme} aria-hidden="true" /><span>{label}</span>
          </MenuAction>)}
      </div>
    </FloatingSurface>
  </>;
}
