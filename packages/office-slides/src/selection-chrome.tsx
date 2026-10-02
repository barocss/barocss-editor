import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds } from '@barocss/editor-core';
import { Icon, Button, FloatingSurface, Toolbar } from '@barocss/office-ui';
import { ContextToolbar, useEditorContextVisibility, useEditorRevision, useNodeRect } from '@barocss/office-editor-ui';
import type { Slide } from './deck';
import { boxAt } from './selection';
import { Ribbon } from './ribbon';
import { SLIDES_PRIMARY_CONTROL_IDS, SlidesInsertDropdown } from './insert-dropdown';
import { captureSlidesSelectionOwner, changeSlidesSelectionContext, createSlidesSelectionLifetime, ownsSlidesSelection, selectedSlidesTable, trackSlidesSelectionLifetime } from './selection-owner';

/** Product chrome keeps the canvas and rich notes as two owners of one native editor. */
export function SlidesDocumentChrome({ editor, slides, current, scope, inspectorHost, onInspectorEscape, onInspect, active = true }: {
  editor: Editor; slides: Slide[]; current?: string; scope: RefObject<HTMLElement | null>;
  active?: boolean; inspectorHost?: HTMLElement | null; onInspectorEscape?: () => void; onInspect: (origin?: HTMLElement) => void;
}) {
  const revision = useEditorRevision(editor);
  const lifetime = useMemo(() => createSlidesSelectionLifetime(editor, current), [editor]);
  const [, refreshLifetime] = useReducer((value: number) => value + 1, 0);
  const [region, setRegion] = useState<'canvas' | 'notes'>('canvas');
  const objectChrome = useRef<HTMLDivElement>(null);
  const globalChrome = useRef<HTMLDivElement>(null);
  const inspectorScope = useRef<HTMLElement | null>(null);
  inspectorScope.current = inspectorHost?.closest<HTMLElement>('[data-floating-panel]') ?? null;
  const [canvasGesture, setCanvasGesture] = useState<{ root: ReturnType<Editor['dataStore']['getNode']>; slide?: string } | null>(null);
  const nativeRoot = editor.dataStore.getNode(editor.getRootId()!);
  useLayoutEffect(() => { setCanvasGesture(null); }, [editor, nativeRoot, current, editor.isEditable]);
  useLayoutEffect(() => { if (!active) { lifetime.generation += 1; refreshLifetime(); setCanvasGesture(null); } }, [active, lifetime]);
  useEffect(() => trackSlidesSelectionLifetime(lifetime), [lifetime]);
  useLayoutEffect(() => { changeSlidesSelectionContext(lifetime, current, region); }, [lifetime, current, region]);
  useEffect(() => {
    const host = scope.current; if (!host) return;
    const regionChanged = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      if (globalChrome.current?.contains(event.target) || inspectorHost?.closest('[data-floating-panel]')?.contains(event.target)) return;
      if (!host.contains(event.target)) { lifetime.generation += 1; refreshLifetime(); setCanvasGesture(null); return; }
      if (objectChrome.current?.contains(event.target) || event.target.closest('[data-editor-context-toolbar]')) return;
      const next = event.target.closest('.sl-notes') ? 'notes' : event.target.closest('.sl-stage, .sl-overlay') ? 'canvas' : null;
      if (!next) return;
      changeSlidesSelectionContext(lifetime, current, next); setRegion(next);
      setCanvasGesture(next === 'canvas' ? { root: editor.dataStore.getNode(editor.getRootId()!), slide: current } : null);
    };
    const interrupt = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && event.target instanceof Element && event.target.closest('[data-slides-more-owner], [data-palette-owner], [data-slides-inspector-tools], [role=menu], [role=listbox]')) return;
      if (event.key === 'Escape' && event.target instanceof Node && (host.contains(event.target) || globalChrome.current?.contains(event.target))) { lifetime.generation += 1; refreshLifetime(); setCanvasGesture(null); }
    };
    const blur = () => { lifetime.generation += 1; refreshLifetime(); setCanvasGesture(null); };
    host.ownerDocument.defaultView?.addEventListener('blur', blur);
    host.ownerDocument.addEventListener('pointerdown', regionChanged, true); host.ownerDocument.addEventListener('focusin', regionChanged, true);
    host.ownerDocument.addEventListener('keydown', interrupt, true);
    return () => { host.ownerDocument.defaultView?.removeEventListener('blur', blur); host.ownerDocument.removeEventListener('pointerdown', regionChanged, true); host.ownerDocument.removeEventListener('focusin', regionChanged, true); host.ownerDocument.removeEventListener('keydown', interrupt, true); };
  }, [scope, lifetime, current, editor, inspectorHost]);
  const owner = captureSlidesSelectionOwner(lifetime);
  const captureIntent = () => { const captured = captureSlidesSelectionOwner(lifetime); return () => active && ownsSlidesSelection(captured); };
  const ids = selectedNodeIds(editor.selection);
  const access = { rootId: editor.getRootId()!, getNode: (id: string) => editor.dataStore.getNode(id) };
  const scene = boxAt(access, ids[0] ?? editor.selection?.startNodeId);
  const table = selectedSlidesTable(editor);
  const target = region === 'canvas' ? table ?? scene?.sid : undefined;
  const at = useNodeRect(editor, scope, target);
  const visibility = useEditorContextVisibility(editor, target ?? null, { scope, retainWithin: objectChrome, relatedChrome: inspectorScope, active: active && editor.isEditable });
  const canvasOwned = active && editor.isEditable && region === 'canvas' && canvasGesture?.root === nativeRoot && canvasGesture?.slide === current;
  const textRange = editor.selection?.type === 'range' && !editor.selection.collapsed && !table;
  const groups = ['character', 'paragraph', 'list', ...(table ? ['table'] : ['order', 'align', 'group'])];
  void revision;
  const inspectorOwner = useRef<HTMLDivElement>(null);
  return <>
    {active && inspectorHost && editor.isEditable && (textRange || target) && createPortal(
      <div ref={inspectorOwner} key={`${lifetime.generation}:${current}:${region}:${JSON.stringify(editor.selection)}`} className="sl-inspector-commands"
        onKeyDown={event => {
          if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 ||
            (event.target instanceof Element && event.target.closest('input,textarea,[role="menu"],[role="listbox"],[data-floating-surface]'))) return;
          event.preventDefault(); event.stopPropagation(); onInspectorEscape?.();
        }}>
        <Ribbon editor={editor} slides={slides} current={current} directControls panel
          groupIds={textRange ? ['character', 'paragraph', 'list'] : groups}
          portalContainer={inspectorOwner} canRunIntent={() => active && ownsSlidesSelection(owner)} captureIntent={captureIntent} />
      </div>, inspectorHost)}
    <div ref={globalChrome} className="sl-insertion-chrome" hidden={!active} inert={!active}>
      <Toolbar variant="compact" surface="floating" label="Slides 삽입 도구">
        <Ribbon inline key={`${lifetime.generation}:${current}:${region}`} editor={editor} slides={slides} current={current}
          directControls groupIds={['history', 'slide', 'insert']} controlIds={SLIDES_PRIMARY_CONTROL_IDS}
          portalContainer={globalChrome} canRunIntent={() => active && ownsSlidesSelection(owner)} captureIntent={captureIntent} />
        <SlidesInsertDropdown key={`insert:${lifetime.generation}:${current}:${region}`} editor={editor} slides={slides} current={current}
          canRunIntent={() => active && ownsSlidesSelection(owner)} captureIntent={captureIntent} />
      </Toolbar>
    </div>
    <ContextToolbar compact editor={editor} scope={scope} relatedChrome={inspectorScope} onRelatedChromeEscape={onInspectorEscape} portalRoot={scope.current} active={active && editor.isEditable}
      controls={[]} label="선택한 Slides 도구" data-slides-formatting data-slides-selection-pending={!textRange}>
      {(selection, chrome) => {
        if (!textRange || selection?.type !== 'range' || selection.collapsed || JSON.stringify(selection) !== JSON.stringify(editor.selection)) return null;
        const captured = captureSlidesSelectionOwner(lifetime, selection);
        return <div className="sl-selection-tools" key={`${lifetime.generation}:${JSON.stringify(selection)}`}>
          <Ribbon inline editor={editor} slides={slides} current={current} groupIds={['character']} controlIds={['bold','italic']} fontControls={['family','color']}
            directControls portalContainer={chrome} canRunIntent={() => active && ownsSlidesSelection(captured)} />
          <Button square tone="quiet" ariaLabel="선택 속성 열기" onMouseDown={event => event.preventDefault()} onClick={event => { if (ownsSlidesSelection(captured)) onInspect(event.currentTarget); }}><Icon name="more" /></Button>
        </div>;
      }}
    </ContextToolbar>
    {active && !textRange && target && <FloatingSurface compact open={(visibility.open || canvasOwned) && !!at} at={at} portalRoot={scope.current}
      aria-label="선택한 Slides 도구" data-slides-formatting onDismiss={(reason, event) => { if (reason === 'escape' && event?.target instanceof Node && inspectorScope.current?.contains(event.target)) { onInspectorEscape?.(); return; } lifetime.generation += 1; refreshLifetime(); setCanvasGesture(null); visibility.dismiss(reason); }} ownedElements={[scope, inspectorScope, globalChrome]}>
      <div ref={objectChrome} key={`${lifetime.generation}:${JSON.stringify(editor.selection)}`}>
        <Toolbar variant="compact" label={table ? '선택한 Slides 표 도구' : '선택한 Slides 개체 도구'}>
          <Ribbon inline editor={editor} slides={slides} current={current} groupIds={table ? ['table'] : ['group','order']}
            controlIds={table ? ['row-below','column-right','cells-merge','cell-split'] : ['duplicate-boxes','delete-boxes','bring-forward','send-backward']}
            directControls portalContainer={objectChrome} canRunIntent={() => active && ownsSlidesSelection(owner)} />
          <Button square tone="quiet" ariaLabel="선택 속성 열기" onMouseDown={event => event.preventDefault()} onClick={event => { if (ownsSlidesSelection(owner)) onInspect(event.currentTarget); }}><Icon name="more" /></Button>
        </Toolbar>
      </div>
    </FloatingSurface>}
  </>;
}
