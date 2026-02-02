import { useMemo } from 'react';
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
 * Renders overlay layer content by filtering decorators by layerTarget and building them with ReactRenderer.buildOverlayDecorators.
 * Matches editor-view-dom: decorator/selection/context/custom layers get their subset of decorators rendered.
 */
export function EditorViewOverlayLayerContent({ layer, registry: registryProp }: EditorViewOverlayLayerContentProps) {
  const { decoratorManagerRef, decoratorVersion } = useEditorViewContext();
  const renderer = useMemo(
    () => new ReactRenderer(registryProp ?? getGlobalRegistry()),
    [registryProp]
  );
  const decorators = decoratorManagerRef.current?.getAll() ?? [];
  const filtered = useMemo(
    () => decorators.filter((d) => (d.layerTarget ?? 'content') === layer),
    [decorators, layer, decoratorVersion]
  );
  return <>{renderer.buildOverlayDecorators(filtered)}</>;
}
