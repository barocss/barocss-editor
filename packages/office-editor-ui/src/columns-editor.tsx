import { useEffect, useState, type RefObject } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, Choice, FloatingSurface } from '@barocss/office-ui';
import { useEditorRevision } from './revision';
import './columns-editor.css';

/** Shared controls for independent prose columns; products choose insertion entries. */
export function ColumnsEditor({ editor, scope }: { editor: Editor; scope: RefObject<HTMLElement | null> }) {
  useEditorRevision(editor);
  const [active, setActive] = useState<string>();
  const [blockId, setBlockId] = useState<string>();
  useEffect(() => {
    const host = scope.current; if (!host) return;
    let resizing: { id: string; x: number; width: number; weight: number; next?: number; element: HTMLElement } | undefined;
    const resizeMove = (event: MouseEvent) => {
      if (!resizing) return;
      const weight = Math.max(0.2, Math.min(5, resizing.weight * (1 + (event.clientX - resizing.x) / resizing.width)));
      resizing.next = weight;
      resizing.element.style.flexGrow = String(weight);
    };
    const resizeEnd = () => {
      if (!resizing) return;
      const { id, element, weight } = resizing;
      const next = resizing.next ?? weight;
      element.style.flexGrow = String(weight); resizing = undefined;
      void editor.executeCommand('setColumnWeight', { nodeId: id, weight: next });
    };
    const pick = (event: MouseEvent) => {
      const el = event.target instanceof Element ? event.target : null;
      const col = el?.closest<HTMLElement>('[data-prose-column]');
      if (!col) return;
      if (el?.closest('[data-column-resize]') && editor.isEditable) {
        event.preventDefault(); event.stopPropagation();
        const id = col.dataset.proseColumn!;
        resizing = { id, x: event.clientX, width: col.getBoundingClientRect().width, weight: Number(editor.dataStore.getNode(id)?.attributes?.weight ?? 1), element: col };
        setActive(col.closest<HTMLElement>('[data-prose-columns]')?.dataset.proseColumns);
        return;
      }
      setActive(col.closest<HTMLElement>('[data-prose-columns]')?.dataset.proseColumns);
      let block = el?.closest<HTMLElement>('[data-bc-sid]');
      while (block && block.parentElement !== col) block = block.parentElement?.closest<HTMLElement>('[data-bc-sid]');
      setBlockId(block?.dataset.bcSid);
    };
    const over = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('application/x-prose-block')) return;
      const col = (event.target as Element)?.closest?.('[data-prose-column]');
      if (col) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
    };
    const drop = (event: DragEvent) => {
      const columnId = (event.target as Element)?.closest?.<HTMLElement>('[data-prose-column]')?.dataset.proseColumn;
      const nodeId = event.dataTransfer?.getData('application/x-prose-block');
      if (!columnId || !nodeId) return;
      event.preventDefault(); event.stopPropagation();
      void editor.executeCommand('moveToColumn', { nodeId, columnId });
    };
    host.ownerDocument.addEventListener('mousemove', resizeMove); host.ownerDocument.addEventListener('mouseup', resizeEnd); host.addEventListener('mousedown', pick, true);
    host.ownerDocument.addEventListener('pointermove', resizeMove); host.ownerDocument.addEventListener('pointerup', resizeEnd);
    host.addEventListener('pointerdown', pick, true); host.addEventListener('dragover', over); host.addEventListener('drop', drop);
    return () => { host.ownerDocument.removeEventListener('mousemove', resizeMove); host.ownerDocument.removeEventListener('mouseup', resizeEnd); host.removeEventListener('mousedown', pick, true); host.ownerDocument.removeEventListener('pointermove', resizeMove); host.ownerDocument.removeEventListener('pointerup', resizeEnd); host.removeEventListener('pointerdown', pick, true); host.removeEventListener('dragover', over); host.removeEventListener('drop', drop); };
  }, [editor, scope]);
  const group = active ? editor.dataStore.getNode(active) : undefined;
  const columns = (group?.content ?? []) as string[];
  const element = [...(scope.current?.querySelectorAll<HTMLElement>('[data-prose-columns]') ?? [])].find(el => el.dataset.proseColumns === active);
  return <FloatingSurface open={!!group && !!element} at={element?.getBoundingClientRect() ?? null} variant="toolbar" aria-label="컬럼 도구" ownedElements={[element ?? null]} onDismiss={() => setActive(undefined)}>
    <div className="oe-columns-tools">
      <Choice ariaLabel="컬럼 수" value={String(columns.length)} disabled={!editor.isEditable} onChange={value => void editor.executeCommand('setColumnCount', { nodeId: active, count: Number(value) })}>{[2, 3, 4].map(n => <option key={n} value={n}>{n}단</option>)}</Choice>
      <Button disabled={!editor.isEditable} onClick={() => void editor.executeCommand('flattenColumns', { nodeId: active })}>1단으로 합치기</Button>
      {columns.map((id, i) => <label key={id}>{i + 1}열 너비<input aria-label={`${i + 1}열 너비`} type="range" min="0.2" max="5" step="0.1" value={Number(editor.dataStore.getNode(id)?.attributes?.weight ?? 1)} disabled={!editor.isEditable} onChange={event => void editor.executeCommand('setColumnWeight', { nodeId: id, weight: Number(event.target.value) })} /></label>)}
      {blockId && <>
        <span draggable={editor.isEditable} onDragStart={event => { event.dataTransfer.setData('application/x-prose-block', blockId); event.dataTransfer.effectAllowed = 'move'; }} title="이 손잡이를 대상 컬럼으로 끌어 놓으세요"><Button disabled={!editor.isEditable}>블록 끌어 이동</Button></span>
        <Choice ariaLabel="블록을 컬럼으로 이동" value="" disabled={!editor.isEditable} onChange={columnId => void editor.executeCommand('moveToColumn', { nodeId: blockId, columnId })}><option value="">블록 이동…</option>{columns.map((id, i) => <option key={id} value={id} disabled={editor.dataStore.getNode(blockId)?.parentId === id}>{i + 1}열로 이동</option>)}</Choice>
      </>}
    </div>
  </FloatingSurface>;
}
