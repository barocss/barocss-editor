/**
 * @barocss/renderer-react
 * DSL → React directly (no VNode). Same templates as renderer-dom, output is ReactNode.
 * Decorators (inline/block/layer) are rendered in the same tree as content, matching renderer-dom.
 */
export { ReactRenderer } from './react-renderer';
export { buildToReact } from './build-to-react';
export type { ReactRendererOptions } from './react-renderer';
export type { BuildOptions } from './build-to-react';
export type { Decorator } from './decorator/types';
