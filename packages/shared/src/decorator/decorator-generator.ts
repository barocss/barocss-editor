/**
 * Decorator generator: function-based decorator creation (shared).
 * Used by editor-view-dom and editor-view-react.
 */

import type { Decorator } from './types.js';

/** Model shape for generator: optional text, content/children for traversal. */
export type GeneratorModelLike = Record<string, unknown>;

export interface DecoratorGenerator {
  sid: string;
  name?: string;
  generate(
    model: GeneratorModelLike,
    text: string | null,
    context?: DecoratorGeneratorContext
  ): Decorator[];
  priority?: number;
  enabled?: boolean;
  onDidChange?(callback: () => void): () => void;
}

export interface DecoratorGeneratorContext {
  documentModel?: GeneratorModelLike;
  parentModel?: GeneratorModelLike;
  siblings?: GeneratorModelLike[];
  [key: string]: unknown;
}

export class DecoratorGeneratorManager {
  private generators = new Map<string, DecoratorGenerator>();
  private changeCallbacks = new Map<string, () => void>();

  registerGenerator(generator: DecoratorGenerator, onChangeCallback?: () => void): void {
    this.generators.set(generator.sid, generator);
    if (generator.onDidChange && onChangeCallback) {
      const cleanup = generator.onDidChange(onChangeCallback);
      this.changeCallbacks.set(generator.sid, cleanup);
    }
  }

  unregisterGenerator(sid: string): boolean {
    const cleanup = this.changeCallbacks.get(sid);
    if (cleanup) {
      cleanup();
      this.changeCallbacks.delete(sid);
    }
    return this.generators.delete(sid);
  }

  getGenerator(sid: string): DecoratorGenerator | undefined {
    return this.generators.get(sid);
  }

  getAllGenerators(enabledOnly: boolean = false): DecoratorGenerator[] {
    const list = Array.from(this.generators.values());
    if (enabledOnly) return list.filter((g) => g.enabled !== false);
    return list;
  }

  setGeneratorEnabled(sid: string, enabled: boolean): boolean {
    const g = this.generators.get(sid);
    if (g) {
      g.enabled = enabled;
      return true;
    }
    return false;
  }

  isGeneratorEnabled(sid: string): boolean {
    return this.generators.get(sid)?.enabled !== false;
  }

  clear(): void {
    for (const cleanup of this.changeCallbacks.values()) cleanup();
    this.changeCallbacks.clear();
    this.generators.clear();
  }

  generateDecorators(
    model: GeneratorModelLike,
    text: string | null,
    context?: DecoratorGeneratorContext
  ): Decorator[] {
    const generators = this.getAllGenerators(true).sort(
      (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
    );
    const out: Decorator[] = [];
    for (const g of generators) {
      try {
        out.push(...g.generate(model, text, context));
      } catch (err) {
        console.error(`[DecoratorGeneratorManager] Error in generator '${g.sid}':`, err);
      }
    }
    return out;
  }
}
