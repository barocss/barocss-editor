import { useEffect, useMemo, useState } from 'react';
import { getGlobalRegistry } from '@barocss/dsl';
import { ReactRenderer } from '@barocss/renderer-react';
import { useEditorViewContext } from './EditorViewContext';
import type { EditorViewLayerType } from './types';

export interface EditorViewOverlayLayerContentProps {
  /** Layer to render (decorator, selection, context, custom). Only decorators with layerTarget === layer are rendered. */
  layer: Exclude<EditorViewLayerType, 'content'>;
  /** Registry for resolving decorator templates. If omitted, uses getGlobalRegistry(). */
  registry?: import('@barocss/dsl').RendererRegistry;
}

/**
 * Renders overlay layer content by filtering merged decorators by layerTarget and building them with ReactRenderer.buildOverlayDecorators.
 * Uses getMergedDecorators(document) so remote, pattern, and generator decorators are included.
 */
export function EditorViewOverlayLayerContent({ layer, registry: registryProp }: EditorViewOverlayLayerContentProps) {
  const { editor, getMergedDecorators, decoratorVersion } = useEditorViewContext();
  const [documentSnapshot, setDocumentSnapshot] = useState<unknown>(() => editor.getDocumentProxy?.() ?? null);

  useEffect(() => {
    const onContent = () => setDocumentSnapshot(editor.getDocumentProxy?.() ?? null);
    editor.on?.('editor:content.change', onContent);
    setDocumentSnapshot(editor.getDocumentProxy?.() ?? null);
    return () => editor.off?.('editor:content.change', onContent);
  }, [editor]);

  const renderer = useMemo(
    () => new ReactRenderer(registryProp ?? getGlobalRegistry()),
    [registryProp]
  );
  const decorators = useMemo(
    () => getMergedDecorators(documentSnapshot),
    [documentSnapshot, getMergedDecorators, decoratorVersion]
  );
  const filtered = useMemo(
    () => decorators.filter((d) => (d.layerTarget ?? 'content') === layer),
    [decorators, layer]
  );
  return <>{renderer.buildOverlayDecorators(filtered)}</>;
}
