import { MultiBlockControl } from './multi-block-control';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Editor } from '@barocss/editor-core';
import { ContextToolbar, SelectionLinkControl, SelectionColorControl, useEditorRevision, useNodeRect } from '@barocss/office-editor-ui';
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
  const [inserting, setInserting] = useState<{ sid: string; selection: Editor['selection'] }>();
  const revision = useEditorRevision(editor);
  const trigger = useRef<HTMLButtonElement>(null);
  const rootId = editor.getRootId();
  useEffect(() => setInserting(undefined), [editor, rootId]);
  const root = editor.dataStore.getNode(rootId!);
  const firstChild = root?.content?.[0];
  // Pointer hover can change while an insertion menu remains open.
  const target = inserting?.sid ?? sid ?? (typeof firstChild === 'string' ? firstChild : firstChild?.sid);
  const at = useNodeRect(editor, hold, target);
  const around = hold.current?.getBoundingClientRect();

  useEffect(() => {
    if (!inserting) return;
    const previous = inserting.selection;
    const current = editor.selection;
    // Keep the menu only while its block and complete selection still exist.
    // Range expansion can keep the same start node while changing its destination.
    if (!editor.dataStore.getNode(inserting.sid) || !previous || !current ||
        current.type !== previous.type || current.startNodeId !== previous.startNodeId ||
        current.endNodeId !== previous.endNodeId || current.startOffset !== previous.startOffset ||
        current.endOffset !== previous.endOffset) setInserting(undefined);
  }, [editor, inserting, revision]);

  useEffect(() => {
    const host = hold.current;
    if (!inserting || !host) return;
    // The editor owns Escape while this menu is open. Body clicks still dismiss it.
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || trigger.current?.contains(target) ||
          target.closest('[data-note-insert]')) return;
      setInserting(undefined);
    };
    host.addEventListener('pointerdown', outside, true);
    return () => host.removeEventListener('pointerdown', outside, true);
  }, [hold, inserting]);

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
    // A hover opener may start from a field outside this editor. Give its menu an owned key target.
    if (!hold.current?.contains(hold.current.ownerDocument.activeElement)) trigger.current?.focus({ preventScroll: true });
    setInserting(value => value || !target ? undefined : { sid: target, selection: editor.selection && { ...editor.selection } });
  };

  return <>
    {at && around && <button ref={trigger} type="button" className="on-add" data-note-add aria-label="블록 추가" aria-expanded={!!inserting}
      style={{ top: at.top - around.top + 2, left: 2 }} onMouseDown={event => event.preventDefault()} onClick={insert}><Icon name="add" size={15} /></button>}
    <FloatingSurface open={!!inserting} at={trigger.current?.getBoundingClientRect() ?? null} variant="menu"
      prefer="below" align="start" portalRoot={hold.current} data-note-insert aria-label="블록 추가"
      onDismiss={() => setInserting(undefined)} ownedElements={[trigger, hold]}>
      {insertion(() => setInserting(undefined))}
    </FloatingSurface>
    <ContextToolbar editor={editor} scope={hold} controls={noteControlsIn('mark').filter(item => !additionalFormattingCommands.has(item.command))} mark="note-control"
      data-note-formatting onOpenChange={onFormattingChange}>
      {selection => <><MultiBlockControl editor={editor} selection={selection} /><HeadingLevelControl editor={editor} selection={selection} /><SelectionLinkControl editor={editor} selection={selection} /><SelectionColorControl editor={editor} selection={selection} /><AdditionalFormattingControl editor={editor} selection={selection} /></>}
    </ContextToolbar>
  </>;
}
