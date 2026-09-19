import { MultiBlockControl } from './multi-block-control';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Editor } from '@barocss/editor-core';
import { ContextToolbar, SelectionLinkControl, SelectionColorControl, useNodeRect } from '@barocss/office-editor-ui';
import { FloatingSurface, Icon } from '@barocss/office-ui';
import { AdditionalFormattingControl, additionalFormattingCommands } from './additional-formatting-control';
import { HeadingLevelControl } from './heading-level-control';
import { noteControlsIn } from './toolbar-model';

/** Note chooses the commands and insertion target; shared UI owns contextual surfaces. */
export function NoteContextualToolbar({ editor, hold, sid, insertion, onFormattingChange }: {
  editor: Editor;
  hold: RefObject<HTMLDivElement | null>;
  sid?: string;
  insertion: (close: () => void) => ReactNode;
  onFormattingChange: (visible: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const root = editor.dataStore.getNode(editor.getRootId()!);
  const firstChild = root?.content?.[0];
  const target = sid ?? (typeof firstChild === 'string' ? firstChild : firstChild?.sid);
  const at = useNodeRect(editor, hold, target);
  const around = hold.current?.getBoundingClientRect();

  const insert = () => {
    // A hovered block can differ from the caret's block. The adjacent + belongs
    // to its visible block, even while a text selection remains elsewhere.
    const selectionNode = editor.selection?.startNodeId;
    let ancestor = selectionNode ? editor.dataStore.getNode(selectionNode) : undefined;
    while (ancestor && ancestor.sid !== target) {
      const parent = ancestor.parentId;
      ancestor = typeof parent === 'string' ? editor.dataStore.getNode(parent) : undefined;
    }
    if (editor.selection?.type !== 'range' || !ancestor) {
      const first = (nodeId: string): string | undefined => {
        const node = editor.dataStore.getNode(nodeId);
        if (typeof node?.text === 'string') return nodeId;
        for (const child of node?.content ?? []) {
          if (typeof child !== 'string') continue;
          const found = first(child);
          if (found) return found;
        }
      };
      const run = first(target ?? editor.getRootId()!) ?? target;
      if (run) editor.selectionManager.setSelection({ type: 'range', startNodeId: run, endNodeId: run, startOffset: 0, endOffset: 0, collapsed: true });
    }
    setAdding(value => !value);
  };

  return <>
    {at && around && <button ref={trigger} type="button" className="on-add" data-note-add aria-label="블록 추가" aria-expanded={adding}
      style={{ top: at.top - around.top + 2, left: 2 }} onMouseDown={event => event.preventDefault()} onClick={insert}><Icon name="add" size={15} /></button>}
    <FloatingSurface open={adding} at={trigger.current?.getBoundingClientRect() ?? null} variant="menu"
      prefer="below" align="start" portalRoot={hold.current} data-note-insert aria-label="블록 추가"
      onDismiss={() => setAdding(false)} ownedElements={[trigger]}>
      {insertion(() => setAdding(false))}
    </FloatingSurface>
    <ContextToolbar editor={editor} scope={hold} controls={noteControlsIn('mark').filter(item => !additionalFormattingCommands.has(item.command))} mark="note-control"
      data-note-formatting onOpenChange={onFormattingChange}>
      {selection => <><MultiBlockControl editor={editor} selection={selection} /><HeadingLevelControl editor={editor} selection={selection} /><SelectionLinkControl editor={editor} selection={selection} /><SelectionColorControl editor={editor} selection={selection} /><AdditionalFormattingControl editor={editor} selection={selection} /></>}
    </ContextToolbar>
  </>;
}
