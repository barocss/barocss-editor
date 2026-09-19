import { useEffect, useRef, useState } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { Button, FloatingSurface, MenuAction } from '@barocss/office-ui';

export function selectedNoteBlocks(editor: Editor, selection: ModelSelection | null): string[] {
  if (selection?.type !== 'range' || selection.collapsed) return [];
  const root = editor.getRootId();
  const top = (id: string) => {
    let node = editor.dataStore.getNode(id);
    while (node?.parentId && node.parentId !== root) node = editor.dataStore.getNode(node.parentId);
    return node && root && node.parentId === root ? node.sid : undefined;
  };
  const children = editor.dataStore.getNode(root!)?.content as string[] | undefined;
  const start = top(selection.startNodeId), end = top(selection.endNodeId);
  if (!children || !start || !end || start === end) return [];
  const a = children.indexOf(start), b = children.indexOf(end);
  return a < 0 || b < 0 ? [] : children.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** Explicit whole-block actions; ordinary text selection and Delete keep their usual meaning. */
export function MultiBlockControl({ editor, selection, nodeIds }: { editor: Editor; selection: ModelSelection | null; nodeIds?: string[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ids = nodeIds ?? selectedNoteBlocks(editor, selection), key = ids.join(',');
  useEffect(() => { setOpen(false); setError(''); }, [key]);
  if (ids.length < 2) return null;
  const hasDatabase = (id: string): boolean => {
    const node = editor.dataStore.getNode(id);
    return node?.stype === 'noteDatabase' || !!node?.content?.some(child => hasDatabase(String(child)));
  };
  const canCopy = !ids.some(hasDatabase);
  const run = async (action: string) => {
    if (busy) return;
    setBusy(true); if (selection) editor.selectionManager.setSelection(selection);
    try {
      if (await editor.executeCommand(action === 'copy' ? 'copyBlocks' : `batchNoteBlocks:${action}`, { nodeIds: ids })) setOpen(false);
      else setError('블록 작업을 적용하지 못했습니다.');
    } finally { setBusy(false); }
  };
  return <div ref={host} onMouseDown={event => event.preventDefault()}>
    <Button tone="quiet" ariaLabel="선택 범위의 블록 작업" pressed={open} onClick={() => setOpen(value => !value)}>{ids.length}개 블록</Button>
    <FloatingSurface open={open} at={host.current?.getBoundingClientRect() ?? null} portalRoot={host.current} variant="menu" aria-label="여러 블록 작업" prefer="below" align="end" ownedElements={[host]} onDismiss={() => setOpen(false)}>
      <p className="px-3 py-1 text-xs opacity-60">선택에 걸친 {ids.length}개 블록 전체에 적용</p>
      {([['copy', '블록 복사'], ['up', '블록 위로 이동'], ['down', '블록 아래로 이동'], ['duplicate', '블록 복제'], ['delete', '블록 삭제']] as const).map(([action, label]) =>
        <MenuAction key={action} disabled={busy || (action === 'copy' && !canCopy) || (action !== 'copy' && !editor.canExecuteCommand(`batchNoteBlocks:${action}`, { nodeIds: ids }))} onClick={() => void run(action)}>{label}</MenuAction>)}
      {!canCopy && <p className="px-3 py-1 text-xs opacity-60">데이터베이스는 블록 복제를 사용하세요.</p>}
      {error && <p role="alert">{error}</p>}
    </FloatingSurface>
  </div>;
}
