export * from './types.js';
export { EventEmitter } from './event-emitter.js';
export type { IDecoratorValidator } from './validator.js';
export { DecoratorManager } from './decorator-manager.js';
export { RemoteDecoratorManager } from './remote-decorator-manager.js';
export type { DecoratorOwner } from './remote-decorator-manager.js';
export {
  PatternDecoratorConfigManager,
  type PatternDecoratorConfig,
} from './pattern-decorator-config-manager.js';
export { runPatternConfigs, runPatternFromModel, type PatternModelLike } from './run-pattern.js';
export {
  DecoratorGeneratorManager,
  type DecoratorGenerator,
  type DecoratorGeneratorContext,
  type GeneratorModelLike,
} from './decorator-generator.js';
