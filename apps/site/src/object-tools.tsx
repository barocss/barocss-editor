import { useEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react';
import { selectedNodeIds, type Editor, type ModelSelection } from '@barocss/editor-core';
import { useControls, useEditorContextVisibility, useEditorRevision } from '@barocss/office-editor-ui';
import { SITE_KEYS, SELECTABLE, siteControlsIn } from '@barocss/office-site';
import {
  FloatingSurface, Icon, IconButton, MenuAction, SecondaryPopup, Toolbar,
  observeElementAnchor, onApple, visibleElementRect
} from '@barocss/office-ui';

const ARRANGE = siteControlsIn('arrange');
const PRIMARY = ARRANGE.filter(one => ['duplicateBlocks', 'removeBlocks', 'groupBlocks', 'ungroupBlocks'].includes(one.command));
const SECONDARY = ARRANGE.filter(one => !PRIMARY.includes(one));

function attachedTo(editor: Editor, sid: string, root: string | undefined): boolean {
  const seen = new Set<string>();
  let node = editor.dataStore.getNode(sid);
  while (node?.sid && !seen.has(node.sid)) {
    if (node.sid === root) return true;
    seen.add(node.sid);
    node = node.parentId ? editor.dataStore.getNode(node.parentId) : undefined;
  }
  return false;
}

/** A delayed Site callback may act only on the exact live selection and product lifetime. */
export function useSiteSelectionTarget(editor: Editor, selection: ModelSelection | null,
  ownerKey: string, active: boolean, scope?: RefObject<HTMLElement | null>, scopeRoot?: string) {
  const root = editor.getRootId();
  const owner = useMemo(() => ({ root, scopeRoot, serial: 0, alive: false }), [editor, root, scopeRoot, ownerKey, active]);
  const latest = useRef(owner); latest.current = owner;
  const [, refresh] = useReducer(value => value + 1, 0);
  useEffect(() => {
    owner.alive = true;
    const invalidate = () => { owner.serial += 1; refresh(); };
    const events = ['editor:selection.change', 'editor:content.change', 'editor:editable.change'] as const;
    for (const event of events) editor.on(event, invalidate);
    // A new mounted target gets one render after subscriptions are ready.
    refresh();
    return () => {
      owner.alive = false;
      for (const event of events) editor.off(event, invalidate);
    };
  }, [editor, owner]);
  const serial = owner.serial;
  const key = JSON.stringify(selection);
  const ids = selection?.type === 'range' ? [selection.startNodeId, selection.endNodeId] : selectedNodeIds(selection);
  return { current: () => active && owner.alive && latest.current === owner && owner.serial === serial &&
    editor.isEditable && editor.getRootId() === root && !!root && !!selection &&
    (!scope || !!scope.current?.isConnected) && key === JSON.stringify(editor.selection) &&
    ids.length > 0 && ids.every(sid => attachedTo(editor, sid, scopeRoot ?? root)) };
}

/** Actual Site objects, anchored in the one board which owns the current gesture. */
export function ObjectTools({ editor, host, pageId, ownerKey, active, portalRoot, onDetail }: {
  editor: Editor;
  host: RefObject<HTMLElement | null>;
  /** Selectable page/component scope, not the whole multiboard canvas. */
  pageId: string;
  ownerKey: string;
  active: boolean;
  portalRoot?: HTMLElement | null;
  onDetail?: () => void;
}) {
  return <OwnedObjectTools key={`${ownerKey}:${pageId}`} editor={editor} host={host} pageId={pageId}
    ownerKey={ownerKey} active={active} portalRoot={portalRoot} onDetail={onDetail} />;
}

function OwnedObjectTools({ editor, host, pageId, ownerKey, active, portalRoot, onDetail }: Parameters<typeof ObjectTools>[0]) {
  const revision = useEditorRevision(editor);
  const chrome = useRef<HTMLDivElement>(null);
  const nativeRoot = editor.dataStore.getNode(editor.getRootId()!);
  const [gesture, setGesture] = useState<typeof nativeRoot | null>(null);
  useEffect(() => { setGesture(null); }, [editor, nativeRoot, pageId, editor.isEditable]);
  useEffect(() => { if (!active) setGesture(null); }, [active]);
  useEffect(() => {
    const board = host.current;
    if (!board) return;
    const doc = board.ownerDocument;
    const pointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.button !== 0) return;
      if (chrome.current?.contains(event.target)) return;
      // The real overlay is the board's sibling; neither its press nor its focus is inside host.
      setGesture(editor.isEditable && board.parentElement?.contains(event.target) ? nativeRoot : null);
    };
    const outsideFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || event.target === board.closest('.st-canvas')) return;
      if (!chrome.current?.contains(event.target) && !board.parentElement?.contains(event.target)) setGesture(null);
    };
    const blur = () => setGesture(null);
    doc.addEventListener('pointerdown', pointer, true); doc.addEventListener('focusin', outsideFocus, true);
    doc.defaultView?.addEventListener('blur', blur);
    return () => {
      doc.removeEventListener('pointerdown', pointer, true); doc.removeEventListener('focusin', outsideFocus, true);
      doc.defaultView?.removeEventListener('blur', blur);
    };
  }, [editor, host, nativeRoot]);
  const selection = editor.selection;
  const ids = selection?.type === 'node' ? selectedNodeIds(selection).filter(sid =>
    sid !== pageId && SELECTABLE.has(String(editor.dataStore.getNode(sid)?.stype)) && attachedTo(editor, sid, pageId)) : [];
  const selectionKey = JSON.stringify(ids);
  const target = useSiteSelectionTarget(editor, ids.length ? selection : null, ownerKey, active, host, pageId);
  const visibility = useEditorContextVisibility(editor, ids.length ? selectionKey : null, { scope: host, retainWithin: chrome, active });
  const [anchor, setAnchor] = useState<{ key: string; at: DOMRect } | null>(null);
  const geometry = () => {
    const board = host.current;
    if (!board?.isConnected || !ids.length) return null;
    const nodes = ids.map(sid => [...board.querySelectorAll<HTMLElement>('[data-bc-sid]')]
      .find(element => element.getAttribute('data-bc-sid') === sid));
    if (nodes.some(element => !element?.isConnected)) return null;
    const rects = nodes.map(element => element && visibleElementRect(element)).filter((at): at is DOMRect => !!at);
    if (!rects.length) return null;
    const left = Math.min(...rects.map(at => at.left)), top = Math.min(...rects.map(at => at.top));
    const right = Math.max(...rects.map(at => at.right)), bottom = Math.max(...rects.map(at => at.bottom));
    return new DOMRect(left, top, right - left, bottom - top);
  };
  useEffect(() => {
    const board = host.current;
    if (!board || !ids.length || !active) { setAnchor(null); return; }
    const elements = () => ids.map(sid => [...board.querySelectorAll<HTMLElement>('[data-bc-sid]')]
      .find(element => element.getAttribute('data-bc-sid') === sid));
    return observeElementAnchor(board, () => elements().find(element => element && visibleElementRect(element)) ?? null, () => {
      const at = geometry();
      if (!at) { setAnchor(null); return; }
      setAnchor(previous => previous?.key === selectionKey && previous.at.x === at.x && previous.at.y === at.y &&
        previous.at.width === at.width && previous.at.height === at.height ? previous : { key: selectionKey, at });
    });
    // The native subscription remeasures after the renderer changes the selected objects.
  }, [editor, host, pageId, active, selectionKey, revision]);
  const payload = (one: (typeof ARRANGE)[number]) => ({ pageId, ...one.payload });
  const current = () => target.current() && !!geometry();
  const can = (one: (typeof ARRANGE)[number]) => current() && editor.canExecuteCommand(one.command, payload(one));
  const run = (one: (typeof ARRANGE)[number]) => {
    if (!can(one)) return;
    void editor.executeCommand(one.command, payload(one));
  };
  const apple = useMemo(() => onApple(), []);
  const primary = useControls(editor, PRIMARY, { keys: SITE_KEYS, apple, can, onRun: run });
  const secondary = useControls(editor, SECONDARY, { keys: SITE_KEYS, apple, can, onRun: run });
  const at = anchor?.key === selectionKey ? anchor.at : null;
  return <FloatingSurface open={(visibility.open || gesture === nativeRoot) && current() && !!at} compact at={at} role="group"
    aria-label="선택한 객체 도구" className="office-compact-selection" data-site-selection-chrome="object"
    portalRoot={portalRoot} ownedElements={[host]} onDismiss={reason => { setGesture(null); visibility.dismiss(reason); }}>
    <Toolbar variant="compact" elementRef={chrome} label="선택한 객체 도구">
      {primary.filter(one => !['groupBlocks', 'ungroupBlocks'].includes(one.control.command) || !one.disabled).map(one =>
        <IconButton key={one.key} label={one.says} shortcut={one.shortcut} disabled={one.disabled} preserveFocus
          onClick={one.run} data={{ 'site-object-control': one.key }}><Icon name={one.control.icon ?? 'group'} size={16} /></IconButton>)}
      <SecondaryPopup triggerLabel="객체 도구 더 보기" label="추가 객체 도구" variant="menu" disabled={!current()}>
        {secondary.map(one => <MenuAction key={one.key} disabled={one.disabled} onClick={one.run}
          data-site-object-control={one.key}><Icon name={one.control.icon ?? 'group'} size={16} /><span>{one.label}</span></MenuAction>)}
        {onDetail && <MenuAction onClick={() => { if (current()) onDetail(); }}>
          <Icon name="expand" size={16} /><span>자세한 속성</span>
        </MenuAction>}
      </SecondaryPopup>
    </Toolbar>
  </FloatingSurface>;
}
