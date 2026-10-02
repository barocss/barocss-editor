import { useEffect, useRef, useState } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { FloatingSurface, Icon, IconButton, TextField } from '@barocss/office-ui';
import { ownsEditorSelection } from './editor-context';

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
  const [dirty, setDirty] = useState(false);
  const host = useRef<HTMLSpanElement>(null);
  const key = JSON.stringify(selection);
  const savedDOM = useRef<{ root: ReturnType<Editor['getRootId']>; key: string; anchor: Node; focus: Node; anchorOffset: number; focusOffset: number } | null>(null);
  useEffect(() => { setOpen(false); setError(''); setDirty(false); }, [key]);
  const dismiss = () => {
    const saved = savedDOM.current;
    // A text field replaces the browser range; cancel restores only its still-owned target.
    if (saved && editor.isEditable && editor.getRootId() === saved.root && saved.key === key &&
        JSON.stringify(editor.selection) === saved.key && saved.anchor.isConnected && saved.focus.isConnected) {
      const validOffset = (node: Node, offset: number) => offset <= (node.nodeType === Node.TEXT_NODE ? node.textContent?.length ?? 0 : node.childNodes.length);
      if (validOffset(saved.anchor, saved.anchorOffset) && validOffset(saved.focus, saved.focusOffset)) {
        saved.anchor.ownerDocument?.getSelection()?.setBaseAndExtent(saved.anchor, saved.anchorOffset, saved.focus, saved.focusOffset);
      }
    }
    host.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    setOpen(false);
  };
  const restore = () => { if (selection) editor.selectionManager.setSelection(selection); };
  const apply = async (value = href) => {
    if (!selection || busy) return;
    const address = value.trim();
    if (!usableHref(address)) { setError('유효한 링크 주소를 입력하세요.'); return; }
    restore(); setBusy(true);
    try {
      if (await editor.executeCommand('toggleLink', { href: address, replace: true })) { setOpen(false); setDirty(false); }
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!selection || busy) return;
    restore(); setBusy(true);
    try { if (await editor.executeCommand('removeLink')) { setOpen(false); setHref(''); setDirty(false); } }
    finally { setBusy(false); }
  };
  return <span ref={host} className="inline-flex">
    <IconButton label="링크" pressed={open} preserveFocus onClick={() => {
      if (!open) {
        const dom = host.current?.ownerDocument.getSelection();
        if (dom?.anchorNode && dom.focusNode && ownsEditorSelection(editor, dom)) {
          savedDOM.current = { root: editor.getRootId(), key, anchor: dom.anchorNode, focus: dom.focusNode, anchorOffset: dom.anchorOffset, focusOffset: dom.focusOffset };
        }
        if (!dirty) setHref(selectedLink(editor, selection));
      }
      setError(''); setOpen(value => !value);
    }}><Icon name="type-url" size={14} /></IconButton>
    <FloatingSurface open={open} at={host.current?.getBoundingClientRect() ?? null} variant="panel"
      aria-label="링크 편집" prefer="below" align="end" portalRoot={host.current} ownedElements={[host]}
      onDismiss={reason => { if (reason === 'escape') dismiss(); else setOpen(false); }}>
      <div className="flex items-center gap-1">
        <TextField ariaLabel="링크 주소" placeholder="https://" value={href} onChange={value => { setHref(value); setDirty(true); }}
          className="w-40" onKeys={event => {
            if (event.key === 'Enter') { event.preventDefault(); void apply(event.currentTarget.value); }
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
          }} />
        <IconButton label="링크 적용" disabled={busy} preserveFocus onClick={() => void apply()}><Icon name="chosen" size={14} /></IconButton>
        <IconButton label="링크 해제" disabled={busy || !editor.canExecuteCommand('removeLink', { selection })}
          preserveFocus onClick={() => void remove()}><Icon name="reject" size={14} /></IconButton>
      </div>
      {error && <span role="alert" className="text-xs text-[color:var(--ou-muted)]">{error}</span>}
    </FloatingSurface>
  </span>;
}
