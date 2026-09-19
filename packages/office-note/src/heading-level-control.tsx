import { useEffect, useRef, useState } from 'react';
import type { INode } from '@barocss/datastore';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { Button, FloatingSurface, Icon, MenuAction } from '@barocss/office-ui';
import { NOTE_CONVERSIONS } from './block-actions';

/** Only an entire single prose block changes type; table and callout headers retain their roles. */
export function selectedProseBlock(editor: Editor, selection: ModelSelection | null): INode | undefined {
  if (selection?.type !== 'range') return;
  const parent = (id: string) => {
    const run = editor.dataStore.getNode(id);
    return typeof run?.text === 'string' && run.parentId ? editor.dataStore.getNode(run.parentId) : undefined;
  };
  const start = parent(selection.startNodeId), end = parent(selection.endNodeId);
  if (!start?.sid || start.sid !== end?.sid || !['paragraph', 'heading', 'taskItem'].includes(String(start.stype))) return;
  return start;
}

export function HeadingLevelControl({ editor, selection }: { editor: Editor; selection: ModelSelection | null }) {
  const hold = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(selection);
  useEffect(() => setOpen(false), [key]);
  const block = selectedProseBlock(editor, selection);
  if (!block) return null;
  const value = block.stype === 'heading' ? `heading${block.attributes?.level ?? 1}` : block.stype;
  const options = NOTE_CONVERSIONS.filter(item => item.kind === 'paragraph' || item.kind.startsWith('heading'));
  const apply = async (kind: string) => {
    if (!selection || busy) return;
    editor.selectionManager.setSelection(selection); setBusy(true);
    try {
      if (kind === value || await editor.executeCommand('convertNoteBlock', { nodeId: block.sid, kind })) setOpen(false);
    } finally { setBusy(false); }
  };
  return <div ref={hold} onMouseDown={event => event.preventDefault()}>
    <Button tone="quiet" ariaLabel="문단 및 제목 수준" pressed={open} disabled={busy} onClick={() => setOpen(value => !value)}>
      {NOTE_CONVERSIONS.find(item => item.kind === value)?.label ?? '문단'} <Icon name="open" size={12} />
    </Button>
    <FloatingSurface open={open} at={hold.current?.getBoundingClientRect() ?? null} portalRoot={hold.current} prefer="below" align="start" variant="menu" role="group" aria-label="문단 유형" ownedElements={[hold]} onDismiss={() => setOpen(false)} className="min-w-36">
      {options.map(item => <MenuAction key={item.kind} role="button" selected={value === item.kind} disabled={busy || (value !== item.kind && !editor.canExecuteCommand('convertNoteBlock', { nodeId: block.sid, kind: item.kind }))} onClick={() => void apply(item.kind)}>{item.label}</MenuAction>)}
    </FloatingSurface>
  </div>;
}
