import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds } from '@barocss/editor-core';
import { Button, FloatingSurface } from '@barocss/office-ui';
import { ContextToolbar, useEditorContextVisibility, useEditorRevision, useNodeRect } from '@barocss/office-editor-ui';
import type { Slide } from './deck';
import { boxAt } from './selection';
import { Ribbon } from './ribbon';
import { captureSlidesSelectionOwner, changeSlidesSelectionContext, createSlidesSelectionLifetime, ownsSlidesSelection, selectedSlidesTable, trackSlidesSelectionLifetime } from './selection-owner';

/** Product chrome keeps the canvas and rich notes as two owners of one native editor. */
export function SlidesDocumentChrome({ editor, slides, current, scope, expanded, onInspect }: {
  editor: Editor; slides: Slide[]; current?: string; scope: RefObject<HTMLElement | null>;
  expanded: boolean; onInspect: () => void;
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
    <div ref={globalChrome}>
      <Ribbon key={`${lifetime.generation}:${current}:${region}`} editor={editor} slides={slides} current={current}
        groupIds={expanded ? undefined : ['history', 'slide', 'insert']} portalContainer={globalChrome}
        canRunIntent={() => ownsSlidesSelection(owner)} captureIntent={captureIntent} />
    </div>
    {!expanded && <ContextToolbar editor={editor} scope={scope} portalRoot={scope.current} active={editor.isEditable}
      controls={[]} label="선택한 Slides 도구" data-slides-formatting data-slides-selection-pending={!textRange}>
      {(selection, chrome) => {
        if (!textRange || selection?.type !== 'range' || selection.collapsed || JSON.stringify(selection) !== JSON.stringify(editor.selection)) return null;
        const captured = captureSlidesSelectionOwner(lifetime, selection);
        return <div key={`${lifetime.generation}:${JSON.stringify(selection)}`}>
          <Ribbon editor={editor} slides={slides} current={current} groupIds={['character', 'paragraph', 'list']}
            directControls portalContainer={chrome} canRunIntent={() => ownsSlidesSelection(captured)} />
          <Button onMouseDown={event => event.preventDefault()} onClick={onInspect}>자세한 속성</Button>
        </div>;
      }}
    </ContextToolbar>}
    {!expanded && !textRange && target && <FloatingSurface open={(visibility.open || canvasOwned) && !!at} at={at} portalRoot={scope.current}
      aria-label="선택한 Slides 도구" data-slides-formatting onDismiss={reason => { lifetime.generation += 1; refreshLifetime(); setCanvasGesture(null); visibility.dismiss(reason); }} ownedElements={[scope]}>
      <div ref={objectChrome} key={`${lifetime.generation}:${JSON.stringify(editor.selection)}`}>
        <Ribbon editor={editor} slides={slides} current={current} groupIds={groups} directControls portalContainer={objectChrome}
          canRunIntent={() => ownsSlidesSelection(owner)} />
        <Button onMouseDown={event => event.preventDefault()} onClick={onInspect}>자세한 속성</Button>
      </div>
    </FloatingSurface>}
  </>;
}
