/**
 * Optional validator for DecoratorManager. editor-view-dom uses DecoratorRegistry;
 * editor-view-react can use no validator (pass undefined).
 */

import type { Decorator } from './types';

export interface IDecoratorValidator {
  validateDecorator(decorator: Decorator): { valid: boolean; errors: string[] };
  applyDefaults(decorator: Decorator): Decorator;
}
