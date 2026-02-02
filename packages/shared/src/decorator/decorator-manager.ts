/**
 * DecoratorManager: CRUD and events for decorators. Shared by editor-view-dom and editor-view-react.
 * Optional validator (e.g. DecoratorRegistry in editor-view-dom); when omitted, no validation/defaults.
 */

import type {
  Decorator,
  DecoratorEvents,
  DecoratorQueryOptions,
  DecoratorUpdateOptions,
  LayerDecorator,
  InlineDecorator,
  BlockDecorator,
} from './types.js';
import { EventEmitter } from './event-emitter.js';
import type { IDecoratorValidator } from './validator.js';

export class DecoratorManager extends EventEmitter<DecoratorEvents> {
  private decorators = new Map<string, Decorator>();
  private validator: IDecoratorValidator | undefined;

  constructor(validator?: IDecoratorValidator) {
    super();
    this.validator = validator;
  }

  add(decorator: Decorator): void {
    if (this.validator) {
      const validation = this.validator.validateDecorator(decorator);
      if (!validation.valid) {
        throw new Error(`Invalid decorator: ${validation.errors.join(', ')}`);
      }
      const decoratorWithDefaults = this.validator.applyDefaults(decorator);
      if (this.decorators.has(decoratorWithDefaults.sid)) {
        throw new Error(`Decorator with id '${decoratorWithDefaults.sid}' already exists`);
      }
      this.decorators.set(decoratorWithDefaults.sid, decoratorWithDefaults);
      this.emit('decorator:added', decoratorWithDefaults);
    } else {
      if (this.decorators.has(decorator.sid)) {
        throw new Error(`Decorator with id '${decorator.sid}' already exists`);
      }
      this.decorators.set(decorator.sid, decorator);
      this.emit('decorator:added', decorator);
    }
  }

  update(id: string, updates: Partial<Decorator>, options: DecoratorUpdateOptions = {}): void {
    const existing = this.decorators.get(id);
    if (!existing) {
      throw new Error(`Decorator with id '${id}' not found`);
    }

    const updated =
      options.partial !== false ? ({ ...existing, ...updates } as Decorator) : ({ ...updates } as Decorator);
    updated.sid = existing.sid;

    if (this.validator) {
      const validation = this.validator.validateDecorator(updated);
      if (!validation.valid) {
        throw new Error(`Invalid decorator update: ${validation.errors.join(', ')}`);
      }
      const updatedWithDefaults = this.validator.applyDefaults(updated);
      this.decorators.set(id, updatedWithDefaults);
      this.emit('decorator:updated', updatedWithDefaults);
    } else {
      this.decorators.set(id, updated);
      this.emit('decorator:updated', updated);
    }
  }

  remove(id: string): void {
    const decorator = this.decorators.get(id);
    if (!decorator) {
      throw new Error(`Decorator with id '${id}' not found`);
    }
    this.decorators.delete(id);
    this.emit('decorator:removed', id);
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const decorator = this.decorators.get(id);
    if (!decorator) return false;
    this.update(id, { enabled }, { partial: true });
    return true;
  }

  isEnabled(id: string): boolean {
    const decorator = this.decorators.get(id);
    return decorator?.enabled !== false;
  }

  get(id: string): Decorator | undefined {
    return this.decorators.get(id);
  }

  getAll(options: DecoratorQueryOptions = {}): Decorator[] {
    let list = Array.from(this.decorators.values());
    if (options.enabledOnly !== false) {
      list = list.filter((d) => d.enabled !== false);
    }
    if (options.type) list = list.filter((d) => d.stype === options.type);
    if (options.category) list = list.filter((d) => d.category === options.category);
    if (options.nodeId) {
      list = list.filter((d) => {
        if (d.target && 'sid' in d.target) return d.target.sid === options.nodeId;
        return false;
      });
    }
    if (options.sortBy) {
      const order = options.sortOrder ?? 'asc';
      list.sort((a, b) => {
        let aVal: string | undefined, bVal: string | undefined;
        switch (options.sortBy) {
          case 'id':
            aVal = a.sid;
            bVal = b.sid;
            break;
          case 'type':
            aVal = a.stype;
            bVal = b.stype;
            break;
          case 'category':
            aVal = a.category;
            bVal = b.category;
            break;
          default:
            return 0;
        }
        if (aVal! < bVal!) return order === 'asc' ? -1 : 1;
        if (aVal! > bVal!) return order === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return list;
  }

  getByType(type: string): Decorator[] {
    return this.getAll({ type });
  }

  getByCategory(category: 'layer' | 'inline' | 'block'): Decorator[] {
    return this.getAll({ category });
  }

  getByNode(nodeId: string): Decorator[] {
    return this.getAll({ nodeId });
  }

  getLayerDecorators(): LayerDecorator[] {
    return this.getByCategory('layer') as LayerDecorator[];
  }

  getInlineDecorators(): InlineDecorator[] {
    return this.getByCategory('inline') as InlineDecorator[];
  }

  getBlockDecorators(): BlockDecorator[] {
    return this.getByCategory('block') as BlockDecorator[];
  }

  has(id: string): boolean {
    return this.decorators.has(id);
  }

  size(): number {
    return this.decorators.size;
  }

  clear(): void {
    const ids = Array.from(this.decorators.keys());
    this.decorators.clear();
    ids.forEach((id) => this.emit('decorator:removed', id));
  }

  clearByNode(nodeId: string): void {
    this.getByNode(nodeId).forEach((d) => this.remove(d.sid));
  }

  clearByType(type: string): void {
    this.getByType(type).forEach((d) => this.remove(d.sid));
  }

  clearByCategory(category: 'layer' | 'inline' | 'block'): void {
    this.getByCategory(category).forEach((d) => this.remove(d.sid));
  }

  updateData(id: string, dataUpdates: Record<string, unknown>): void {
    const existing = this.decorators.get(id);
    if (!existing) throw new Error(`Decorator with id '${id}' not found`);
    this.update(id, { data: { ...existing.data, ...dataUpdates } as Record<string, unknown> });
  }

  addMany(decorators: Decorator[]): void {
    decorators.forEach((d) => this.add(d));
  }

  removeMany(ids: string[]): void {
    ids.forEach((id) => this.remove(id));
  }
}
