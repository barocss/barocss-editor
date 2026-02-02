/**
 * Decorator 시스템 Export (DOM 전용 + types).
 * DecoratorManager, RemoteDecoratorManager, PatternDecoratorConfigManager, DecoratorGeneratorManager 는 @barocss/shared 에서 import.
 */

export * from './types';
export * from './decorator-registry';
export { DecoratorRenderer } from './decorator-renderer';
export { DecoratorPrebuilder, type DecoratorModel } from './decorator-prebuilder';
export { DOMQuery } from './dom-query';
export { PositionCalculator, type DecoratorPosition } from './position-calculator';
