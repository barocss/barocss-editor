import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type RefObject, type ReactNode } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds } from '@barocss/editor-core';
import { Button, FloatingSurface, SecondaryPopup, Toolbar } from '@barocss/office-ui';
import { ContextToolbar, useEditorContextVisibility, useEditorRevision, useNodeRect } from '@barocss/office-editor-ui';
import type { Slide } from './deck';
import { boxAt } from './selection';
import { Ribbon } from './ribbon';
import { captureSlidesSelectionOwner, changeSlidesSelectionContext, createSlidesSelectionLifetime, ownsSlidesSelection, selectedSlidesTable, trackSlidesSelectionLifetime } from './selection-owner';

function SelectionMore({ children }: { children: (owner: RefObject<HTMLElement | null>) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div data-slides-more-owner={open || undefined}><SecondaryPopup triggerLabel="추가 Slides 도구" label="추가 Slides 서식"
    open={open} onOpenChange={setOpen} keepMounted>{children}</SecondaryPopup></div>;
}

/** Product chrome keeps the canvas and rich notes as two owners of one native editor. */
export function SlidesDocumentChrome({ editor, slides, current, scope, expanded, onExpandedChange, detailAnchor, onInspect }: {
  editor: Editor; slides: Slide[]; current?: string; scope: RefObject<HTMLElement | null>;
  expanded: boolean; onExpandedChange?: (expanded: boolean) => void; detailAnchor?: RefObject<HTMLElement | null>; onInspect: () => void;
}) {
  const revision = useEditorRevision(editor);
  const lifetime = useMemo(() => createSlidesSelectionLifetime(editor, current), [editor]);
  const [, refreshLifetime] = useReducer((value: number) => value + 1, 0);
  const [region, setRegion] = useState<'canvas' | 'notes'>('canvas');
  const objectChrome = useRef<HTMLDivElement>(null);
  const globalChrome = useRef<HTMLDivElement>(null);
  const [canvasGesture, setCanvasGesture] = useState<{ root: ReturnType<Editor['dataStore']['getNode']>; slide?: string } | null>(null);
  const nativeRoot = editor.dataStore.getNode(editor.getRootId()!);
  useLayoutEffect(() => { setCanvasGesture(null); }, [editor, nativeRoot, current, editor.isEditable]);
  useEffect(() => trackSlidesSelectionLifetime(lifetime), [lifetime]);
  useLayoutEffect(() => { changeSlidesSelectionContext(lifetime, current, region); }, [lifetime, current, region]);
  useEffect(() => {
    const host = scope.current; if (!host) return;
    const regionChanged = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      if (globalChrome.current?.contains(event.target)) return;
      if (!host.contains(event.target)) { lifetime.generation += 1; refreshLifetime(); setCanvasGesture(null); return; }
      if (objectChrome.current?.contains(event.target) || event.target.closest('[data-editor-context-toolbar]')) return;
      const next = event.target.closest('.sl-notes') ? 'notes' : event.target.closest('.sl-stage, .sl-overlay') ? 'canvas' : null;
      if (!next) return;
      changeSlidesSelectionContext(lifetime, current, next); setRegion(next);
      setCanvasGesture(next === 'canvas' ? { root: editor.dataStore.getNode(editor.getRootId()!), slide: current } : null);
    };
    const interrupt = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && event.target instanceof Element && event.target.closest('[data-slides-more-owner], [data-palette-owner], [data-slides-detail], [role=menu], [role=listbox]')) return;
      if (event.key === 'Escape' && event.target instanceof Node && (host.contains(event.target) || globalChrome.current?.contains(event.target))) { lifetime.generation += 1; refreshLifetime(); setCanvasGesture(null); }
    };
    const blur = () => { lifetime.generation += 1; refreshLifetime(); setCanvasGesture(null); };
    host.ownerDocument.defaultView?.addEventListener('blur', blur);
    host.ownerDocument.addEventListener('pointerdown', regionChanged, true); host.ownerDocument.addEventListener('focusin', regionChanged, true);
    host.ownerDocument.addEventListener('keydown', interrupt, true);
    return () => { host.ownerDocument.defaultView?.removeEventListener('blur', blur); host.ownerDocument.removeEventListener('pointerdown', regionChanged, true); host.ownerDocument.removeEventListener('focusin', regionChanged, true); host.ownerDocument.removeEventListener('keydown', interrupt, true); };
  }, [scope, lifetime, current, editor]);
  const owner = captureSlidesSelectionOwner(lifetime);
  const captureIntent = () => { const captured = captureSlidesSelectionOwner(lifetime); return () => ownsSlidesSelection(captured); };
  const ids = selectedNodeIds(editor.selection);
  const access = { rootId: editor.getRootId()!, getNode: (id: string) => editor.dataStore.getNode(id) };
  const scene = boxAt(access, ids[0] ?? editor.selection?.startNodeId);
  const table = selectedSlidesTable(editor);
  const target = region === 'canvas' ? table ?? scene?.sid : undefined;
  const at = useNodeRect(editor, scope, target);
  const visibility = useEditorContextVisibility(editor, target ?? null, { scope, retainWithin: objectChrome, active: !expanded && editor.isEditable });
  const canvasOwned = editor.isEditable && region === 'canvas' && canvasGesture?.root === nativeRoot && canvasGesture?.slide === current;
  const textRange = editor.selection?.type === 'range' && !editor.selection.collapsed && !table;
  const groups = ['character', 'paragraph', 'list', ...(table ? ['table'] : ['order', 'align', 'group'])];
  void revision;
  return <>
    <div ref={globalChrome} className="sl-insertion-chrome">
      <Toolbar variant="compact" surface="floating" label="Slides 삽입 도구">
        <Ribbon inline key={`${lifetime.generation}:${current}:${region}`} editor={editor} slides={slides} current={current}
          directControls groupIds={['history', 'slide', 'insert']} controlIds={['undo','redo','slide-new','insert-textbox','insert-rectangle','insert-table','insert-image']}
          portalContainer={globalChrome} canRunIntent={() => ownsSlidesSelection(owner)} captureIntent={captureIntent} />
        <SelectionMore key={`insert:${lifetime.generation}:${current}:${region}`}>{chrome => <Ribbon editor={editor} slides={slides} current={current}
          groupIds={['slide','insert']} portalContainer={chrome} canRunIntent={() => ownsSlidesSelection(owner)} captureIntent={captureIntent} />}</SelectionMore>
      </Toolbar>
      <FloatingSurface open={expanded && editor.isEditable} keepMounted at={(detailAnchor?.current ?? globalChrome.current)?.getBoundingClientRect() ?? null}
        portalRoot={globalChrome.current} variant="panel" prefer="below" align="end" focusOnOpen focusOrigin={detailAnchor ?? globalChrome}
        aria-label="전체 Slides 도구" data-slides-detail className="sl-document-detail" ownedElements={detailAnchor ? [detailAnchor] : [globalChrome]}
        onDismiss={reason => { onExpandedChange?.(false); if (reason === 'escape') detailAnchor?.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }}>
        <Ribbon key={`detail:${lifetime.generation}:${current}:${region}`} editor={editor} slides={slides} current={current} portalContainer={globalChrome}
          canRunIntent={() => ownsSlidesSelection(owner)} captureIntent={captureIntent} />
      </FloatingSurface>
    </div>
    {!expanded && <ContextToolbar compact editor={editor} scope={scope} portalRoot={scope.current} active={editor.isEditable}
      controls={[]} label="선택한 Slides 도구" data-slides-formatting data-slides-selection-pending={!textRange}>
      {(selection, chrome) => {
        if (!textRange || selection?.type !== 'range' || selection.collapsed || JSON.stringify(selection) !== JSON.stringify(editor.selection)) return null;
        const captured = captureSlidesSelectionOwner(lifetime, selection);
        return <div className="sl-selection-tools" key={`${lifetime.generation}:${JSON.stringify(selection)}`}>
          <Ribbon inline editor={editor} slides={slides} current={current} groupIds={['character']} controlIds={['bold','italic']} fontControls={['family','color']}
            directControls portalContainer={chrome} canRunIntent={() => ownsSlidesSelection(captured)} />
          <SelectionMore>{more => <><Ribbon editor={editor} slides={slides} current={current} groupIds={['character','paragraph','list']}
            directControls portalContainer={more} canRunIntent={() => ownsSlidesSelection(captured)} />
            <Button onMouseDown={event => event.preventDefault()} onClick={onInspect}>자세한 속성</Button></>}</SelectionMore>
        </div>;
      }}
    </ContextToolbar>}
    {!expanded && !textRange && target && <FloatingSurface compact open={(visibility.open || canvasOwned) && !!at} at={at} portalRoot={scope.current}
      aria-label="선택한 Slides 도구" data-slides-formatting onDismiss={reason => { lifetime.generation += 1; refreshLifetime(); setCanvasGesture(null); visibility.dismiss(reason); }} ownedElements={[scope]}>
      <div ref={objectChrome} key={`${lifetime.generation}:${JSON.stringify(editor.selection)}`}>
        <Toolbar variant="compact" label={table ? '선택한 Slides 표 도구' : '선택한 Slides 개체 도구'}>
          <Ribbon inline editor={editor} slides={slides} current={current} groupIds={table ? ['table'] : ['group','order']}
            controlIds={table ? ['row-below','column-right','cells-merge','cell-split'] : ['duplicate-boxes','delete-boxes','bring-forward','send-backward']}
            directControls portalContainer={objectChrome} canRunIntent={() => ownsSlidesSelection(owner)} />
          <SelectionMore>{more => <><Ribbon editor={editor} slides={slides} current={current} groupIds={groups} directControls portalContainer={more}
            canRunIntent={() => ownsSlidesSelection(owner)} />
            <Button onMouseDown={event => event.preventDefault()} onClick={onInspect}>자세한 속성</Button></>}</SelectionMore>
        </Toolbar>
      </div>
    </FloatingSurface>}
  </>;
}
