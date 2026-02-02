export * from './types';
export { EventEmitter } from './event-emitter';
export type { IDecoratorValidator } from './validator';
export { DecoratorManager } from './decorator-manager';
export { RemoteDecoratorManager } from './remote-decorator-manager';
export type { DecoratorOwner } from './remote-decorator-manager';
export {
  PatternDecoratorConfigManager,
  type PatternDecoratorConfig,
} from './pattern-decorator-config-manager';
export { runPatternConfigs, runPatternFromModel, type PatternModelLike } from './run-pattern';
export {
  DecoratorGeneratorManager,
  type DecoratorGenerator,
  type DecoratorGeneratorContext,
  type GeneratorModelLike,
} from './decorator-generator';
export { DecoratorSchemaRegistry } from './decorator-schema-registry';
