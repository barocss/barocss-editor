/**
 * @barocss/vnode - VNode builder for converting templates to virtual nodes
 */

// Export VNodeBuilder
export { VNodeBuilder } from './factory';

// Export VNode types (avoid re-exporting ClassNameType to prevent name conflicts)
export type { VNode } from './types';

// Export decorator types (for backward compatibility)
export type { Decorator, VNodeBuildOptions } from './decorator';
export { DecoratorProcessor } from './decorator';

// Export utilities
export { classTokensFrom } from './utils/classname';
export { splitTextByMarks } from './utils/marks';
export { isPortal, isConditional, isComponent, isExternalComponent, isContextualComponent, isTextNode, isElement } from './utils/vnode-guards';

