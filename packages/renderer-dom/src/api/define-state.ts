import { StateRegistry } from '../state/state-registry';

export function defineState<T>(stype: string, StateClass: new (...args: any[]) => T): void {
  StateRegistry.register(stype, StateClass);
}


