type Ctor<T> = new (...args: any[]) => T;

class StateRegistryImpl {
  private stypeToCtor: Map<string, Ctor<any>> = new Map();

  register<T>(stype: string, ctor: Ctor<T>): void {
    if (!stype || typeof stype !== 'string') return;
    if (typeof ctor !== 'function') return;
    this.stypeToCtor.set(stype, ctor);
  }

  get<T>(stype: string): Ctor<T> | undefined {
    return this.stypeToCtor.get(stype) as Ctor<T> | undefined;
  }
}

export const StateRegistry = new StateRegistryImpl();


