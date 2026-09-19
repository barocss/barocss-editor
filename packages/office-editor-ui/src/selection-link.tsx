import { useEffect, useState } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { Icon, IconButton, TextField } from '@barocss/office-ui';

/** A mixed selection has no single URL to show, but can still have its links removed. */
export function selectedLink(editor: Editor, selection: ModelSelection | null): string {
  if (selection?.type !== 'range') return '';
  const urls = new Set<string>();
  const ids = selection.startNodeId === selection.endNodeId ? [selection.startNodeId]
    : [...editor.dataStore.createRangeIterator(selection.startNodeId, selection.endNodeId, { includeStart: true, includeEnd: true })];
  for (const id of ids) {
    const node = editor.dataStore.getNode(id);
    if (typeof node?.text !== 'string') continue;
    const from = id === selection.startNodeId ? selection.startOffset : 0;
    const to = id === selection.endNodeId ? selection.endOffset : node.text.length;
    for (const mark of node.marks ?? []) {
      if (mark.stype !== 'link' || !mark.range || mark.range[1] <= from || mark.range[0] >= to) continue;
      const href = mark.attrs?.href ?? mark.attrs?.url;
      if (typeof href === 'string') urls.add(href);
    }
  }
  return urls.size === 1 ? [...urls][0] : '';
}

export function usableHref(value: string): boolean {
  if (!value || /[\u0000-\u0020]/.test(value)) return false;
  try { return ['https:', 'http:', 'mailto:', 'tel:'].includes(new URL(value, 'https://note.invalid').protocol); }
  catch { return false; }
}

/** Link editing acts on the saved range while its field owns native focus. */
export function SelectionLinkControl({ editor, selection }: { editor: Editor; selection: ModelSelection | null }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(selection);
  useEffect(() => { setOpen(false); setError(''); }, [key]);
  const restore = () => { if (selection) editor.selectionManager.setSelection(selection); };
  const apply = async (value = href) => {
    if (!selection || busy) return;
    const address = value.trim();
    if (!usableHref(address)) { setError('유효한 링크 주소를 입력하세요.'); return; }
    restore(); setBusy(true);
    try {
      if (await editor.executeCommand('toggleLink', { href: address, replace: true })) setOpen(false);
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!selection || busy) return;
    restore(); setBusy(true);
    try { if (await editor.executeCommand('removeLink')) { setOpen(false); setHref(''); } }
    finally { setBusy(false); }
  };
  return <>
    <IconButton label="링크" pressed={open} preserveFocus onClick={() => {
      setHref(selectedLink(editor, selection)); setError(''); setOpen(value => !value);
    }}><Icon name="type-url" size={14} /></IconButton>
    {open && <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <TextField ariaLabel="링크 주소" placeholder="https://" value={href} onChange={setHref}
          className="w-40" onKeys={event => {
            if (event.key === 'Enter') { event.preventDefault(); void apply(event.currentTarget.value); }
            if (event.key === 'Escape') setOpen(false);
          }} />
        <IconButton label="링크 적용" disabled={busy} preserveFocus onClick={() => void apply()}><Icon name="chosen" size={14} /></IconButton>
        <IconButton label="링크 해제" disabled={busy || !editor.canExecuteCommand('removeLink', { selection })}
          preserveFocus onClick={() => void remove()}><Icon name="reject" size={14} /></IconButton>
      </div>
      {error && <span role="alert" className="text-xs text-[color:var(--ou-muted)]">{error}</span>}
    </div>}
  </>;
}
