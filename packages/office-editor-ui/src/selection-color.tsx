import { useEffect, useRef, useState } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { FloatingSurface, Icon, IconButton, TextColorOptions } from '@barocss/office-ui';

/** Undefined denotes mixed colors; null is the inherited/default color. */
export function selectedTextColor(editor: Editor, selection: ModelSelection | null, kind: 'text' | 'background'): string | null | undefined {
  if (!selection || selection.type !== 'range') return null;
  const markType = kind === 'text' ? 'fontColor' : 'bgColor', attr = kind === 'text' ? 'color' : 'bgColor';
  const ids = selection.startNodeId === selection.endNodeId ? [selection.startNodeId]
    : [...editor.dataStore.createRangeIterator(selection.startNodeId, selection.endNodeId, { includeStart: true, includeEnd: true })];
  const values = new Set<string | null>();
  for (const id of ids) {
    const node = editor.dataStore.getNode(id);
    if (typeof node?.text !== 'string') continue;
    const start = id === selection.startNodeId ? selection.startOffset : 0;
    const end = id === selection.endNodeId ? selection.endOffset : node.text.length;
    if (end <= start) continue;
    let covered = 0;
    for (const mark of node.marks ?? []) {
      if (mark.stype !== markType || !mark.range) continue;
      const length = Math.max(0, Math.min(end, mark.range[1]) - Math.max(start, mark.range[0]));
      if (!length) continue;
      covered += length;
      values.add(typeof mark.attrs?.[attr] === 'string' ? String(mark.attrs[attr]).toLowerCase() : null);
    }
    if (covered < end - start) values.add(null);
  }
  return values.size > 1 ? undefined : [...values][0] ?? null;
}

/** Color actions retain the same editor range while the menu owns focus. */
export function SelectionColorControl({ editor, selection }: { editor: Editor; selection: ModelSelection | null }) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState('');
  const host = useRef<HTMLSpanElement>(null);
  const key = JSON.stringify(selection);
  useEffect(() => { setOpen(false); setProblem(''); }, [key]);
  const run = async (command: string, color?: string) => {
    if (!selection) return;
    editor.selectionManager.setSelection(selection);
    const ok = await editor.executeCommand(command, { selection, color });
    if (ok) { setOpen(false); setProblem(''); }
    else setProblem('선택한 글자에 서식을 적용하지 못했습니다.');
  };
  return <span ref={host} className="inline-flex">
    <IconButton label="글자색 및 배경색" pressed={open} preserveFocus onClick={() => setOpen(value => !value)}>
      <Icon name="font-color" size={14} />
    </IconButton>
    <FloatingSurface open={open} at={host.current?.getBoundingClientRect() ?? null} variant="menu" aria-label="글자 색상 선택"
      prefer="below" align="end" focusOnOpen portalRoot={host.current} ownedElements={[host]} onDismiss={() => setOpen(false)}>
      <TextColorOptions onPick={(kind, color) => void run(kind === 'text' ? 'setFontColor' : 'setBgColor', color)}
        textColor={selectedTextColor(editor, selection, 'text')} backgroundColor={selectedTextColor(editor, selection, 'background')}
        onReset={kind => void run(kind === 'text' ? 'removeFontColor' : 'removeBgColor')} />
      {problem && <span role="alert">{problem}</span>}
    </FloatingSurface>
  </span>;
}
