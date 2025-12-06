import { evaluateWhenExpression } from './when-expression';
import { normalizeKeyString, expandModKey } from '@barocss/shared';

export type KeybindingSource = 'core' | 'extension' | 'user';

export interface Keybinding {
  key: string;
  command: string;
  args?: unknown;
  when?: string;
  source?: KeybindingSource;
}

export interface ContextProvider {
  getContext(): Record<string, unknown>;
}

export interface KeybindingRegistry {
  register(binding: Keybinding): void;
  unregister(binding: Keybinding): void;
  clear(source?: KeybindingSource): void;
  resolve(
    key: string,
    context?: Record<string, unknown>
  ): Array<{ command: string; args?: unknown }>;
  setContextProvider(provider: ContextProvider | null): void;
  setCurrentSource(source: KeybindingSource | null): void;
}

type InternalBinding = Keybinding & { id: number };

export class KeybindingRegistryImpl implements KeybindingRegistry {
  private _bindings: InternalBinding[] = [];
  private _nextId = 1;
  private _contextProvider: ContextProvider | null = null;
  private _currentSource: KeybindingSource | null = null;

  setCurrentSource(source: KeybindingSource | null): void {
    this._currentSource = source;
  }

  register(binding: Keybinding): void {
    // Source determination priority:
    // 1. Current context (value set via setCurrentSource)
    // 2. Explicitly specified source
    // 3. Default: 'user' (when setCurrentSource is not explicitly called)
    let source: KeybindingSource = this._currentSource ?? binding.source ?? 'user';
    
    // Warn if Extension registration has source set to 'user'
    if (this._currentSource === 'extension' && binding.source === 'user') {
      console.warn(`[KeybindingRegistry] Extension cannot set source to 'user'. It will be set to 'extension'.`);
      source = 'extension';
    }
    
    // Warn if Core registration has source set to a different value
    if (this._currentSource === 'core' && binding.source && binding.source !== 'core') {
      console.warn(`[KeybindingRegistry] During Core keybinding registration, source can only be set to 'core'. It will be ignored.`);
      source = 'core';
    }
    
    // Normalize key string (case-insensitive)
    const normalizedKey = this._normalizeKeyString(binding.key);
    
    const enriched: InternalBinding = {
      ...binding,
      key: normalizedKey,
      source,
      id: this._nextId++
    };
    this._bindings.push(enriched);
  }

  unregister(binding: Keybinding): void {
    this._bindings = this._bindings.filter(
      b =>
        !(
          b.key === binding.key &&
          b.command === binding.command &&
          (binding.source ? b.source === binding.source : true)
        )
    );
  }

  clear(source?: KeybindingSource): void {
    if (!source) {
      this._bindings = [];
      return;
    }
    this._bindings = this._bindings.filter(b => b.source !== source);
  }

  setContextProvider(provider: ContextProvider | null): void {
    this._contextProvider = provider;
  }

  resolve(
    key: string,
    context?: Record<string, unknown>
  ): Array<{ command: string; args?: unknown }> {
    // Get context from contextProvider if not provided
    const effectiveContext = context ?? this._contextProvider?.getContext() ?? {};
    
    // Normalize input key
    const normalizedKey = this._normalizeKeyString(key);
    
    // Expand Mod key: If Mod+b keybinding exists, also match Ctrl+b (Windows/Linux) or Cmd+b (Mac)
    // Conversely, keys entered as Ctrl+b or Cmd+b also match Mod+b keybinding
    const keyVariants = this._expandModKey(normalizedKey);
    
    // Try matching for all variants (direct comparison since already normalized)
    const candidates = this._bindings.filter(b => {
      const bindingKeyVariants = this._expandModKey(b.key);
      const matches = keyVariants.some(k => bindingKeyVariants.includes(k));
      return matches && this._matchWhen(b.when, effectiveContext);
    });

    if (!candidates.length) {
      return [];
    }

    // Source priority: user > extension > core
    const priority: Record<KeybindingSource, number> = {
      user: 3,
      extension: 2,
      core: 1
    };

    const sorted = [...candidates].sort((a, b) => {
      const pa = priority[a.source ?? 'extension'];
      const pb = priority[b.source ?? 'extension'];
      if (pa !== pb) return pb - pa;
      // Within the same source, prioritize recent registrations (id descending)
      return b.id - a.id;
    });

    return sorted.map(b => ({ command: b.command, args: b.args }));
  }

  /**
   * Expand Mod key by platform
   * - Mod+b → [Mod+b, Ctrl+b, Cmd+b] (to match on all platforms)
   * - Ctrl+b → [Ctrl+b, Mod+b] (also matches Mod+b keybinding)
   * - Cmd+b → [Cmd+b, Mod+b] (also matches Mod+b keybinding)
   */
  private _expandModKey(key: string): string[] {
    return expandModKey(key);
  }

  /**
   * Normalize key string (case-insensitive)
   * - Modifier: keep only first letter uppercase
   * - Key name: normalize to lowercase
   * Example: 'Ctrl+B' → 'Ctrl+b', 'CMD+SHIFT+Z' → 'Cmd+Shift+z'
   */
  private _normalizeKeyString(key: string): string {
    return normalizeKeyString(key);
  }

  private _matchWhen(when: string | undefined, context: Record<string, unknown>): boolean {
    if (!when || !when.trim()) return true;
    try {
      return evaluateWhenExpression(when, context);
    } catch (e) {
      console.warn('[KeybindingRegistry] Failed to evaluate when expression:', when, e);
      return false;
    }
  }
}
