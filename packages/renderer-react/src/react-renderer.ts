/**
 * ReactRenderer: ModelData + RendererRegistry → ReactNode
 * DSL → React directly (no VNode). Same templates as renderer-dom, output is React.
 */
import type { RendererRegistry, ModelData } from '@barocss/dsl';
import { getGlobalRegistry } from '@barocss/dsl';
import type { ReactNode } from 'react';
import { buildToReact, buildOverlayDecorators as buildOverlayDecoratorsImpl } from './build-to-react';
import type { Decorator } from './decorator/types';

export interface ReactRendererOptions {
  /** Name for debugging */
  name?: string;
}

/**
 * ReactRenderer builds a React tree from DSL registry + model.
 * Input: RendererRegistry + ModelData (same as renderer-dom).
 * Output: ReactNode (no VNode in the pipeline).
 */
export class ReactRenderer {
  private registry: RendererRegistry;

  constructor(registry?: RendererRegistry, _options?: ReactRendererOptions) {
    this.registry = registry ?? getGlobalRegistry();
    if (!this.registry) {
      throw new Error('[ReactRenderer] Registry is required. Pass a RendererRegistry or ensure getGlobalRegistry() is available.');
    }
  }

  getRegistry(): RendererRegistry {
    return this.registry;
  }

  /**
   * Build ReactNode from model. Optionally pass decorators to render them in the same tree (inline/block/layer), matching renderer-dom.
   */
  build(model: ModelData, decorators: Decorator[] = []): ReactNode {
    if (!model || !model.stype) {
      throw new Error('[ReactRenderer] build: model must have stype property');
    }
    return buildToReact(this.registry, model.stype, model, { decorators });
  }

  /**
   * Build overlay layer content from decorators only (for decorator/selection/context/custom layers).
   */
  buildOverlayDecorators(decorators: Decorator[]): ReactNode {
    return buildOverlayDecoratorsImpl(this.registry, decorators ?? []);
  }
}
