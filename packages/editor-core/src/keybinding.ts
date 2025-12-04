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
    // source 결정 우선순위:
    // 1. 현재 컨텍스트 (setCurrentSource로 설정된 값)
    // 2. 명시적으로 지정된 source
    // 3. 기본값: 'user' (명시적으로 setCurrentSource를 호출하지 않은 경우)
    let source: KeybindingSource = this._currentSource ?? binding.source ?? 'user';
    
    // Extension 등록 중인데 source가 'user'로 지정된 경우 경고
    if (this._currentSource === 'extension' && binding.source === 'user') {
      console.warn(`[KeybindingRegistry] Extension은 source를 'user'로 지정할 수 없습니다. 'extension'으로 설정됩니다.`);
      source = 'extension';
    }
    
    // Core 등록 중인데 source가 다른 값으로 지정된 경우 경고
    if (this._currentSource === 'core' && binding.source && binding.source !== 'core') {
      console.warn(`[KeybindingRegistry] Core keybinding 등록 중에는 source를 'core'로만 설정할 수 있습니다. 무시됩니다.`);
      source = 'core';
    }
    
    // 키 문자열 정규화 (대소문자 무시)
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
    // context가 제공되지 않으면 contextProvider에서 가져옴
    const effectiveContext = context ?? this._contextProvider?.getContext() ?? {};
    
    // 입력 키 정규화
    const normalizedKey = this._normalizeKeyString(key);
    
    // Mod 키 확장: Mod+b keybinding이 있으면 Ctrl+b (Windows/Linux) 또는 Cmd+b (Mac)도 매칭
    // 반대로 Ctrl+b 또는 Cmd+b로 들어온 키는 Mod+b keybinding도 매칭
    const keyVariants = this._expandModKey(normalizedKey);
    
    // 모든 변형에 대해 매칭 시도 (이미 정규화되어 있으므로 직접 비교)
    const candidates = this._bindings.filter(b => {
      const bindingKeyVariants = this._expandModKey(b.key);
      const matches = keyVariants.some(k => bindingKeyVariants.includes(k));
      return matches && this._matchWhen(b.when, effectiveContext);
    });

    if (!candidates.length) {
      return [];
    }

    // source 우선순위: user > extension > core
    const priority: Record<KeybindingSource, number> = {
      user: 3,
      extension: 2,
      core: 1
    };

    const sorted = [...candidates].sort((a, b) => {
      const pa = priority[a.source ?? 'extension'];
      const pb = priority[b.source ?? 'extension'];
      if (pa !== pb) return pb - pa;
      // 같은 source 내에서는 최근 등록 우선 (id 내림차순)
      return b.id - a.id;
    });

    return sorted.map(b => ({ command: b.command, args: b.args }));
  }

  /**
   * Mod 키를 플랫폼별로 확장
   * - Mod+b → [Mod+b, Ctrl+b, Cmd+b] (모든 플랫폼에서 매칭 가능하도록)
   * - Ctrl+b → [Ctrl+b, Mod+b] (Mod+b keybinding도 매칭)
   * - Cmd+b → [Cmd+b, Mod+b] (Mod+b keybinding도 매칭)
   */
  private _expandModKey(key: string): string[] {
    return expandModKey(key);
  }

  /**
   * 키 문자열 정규화 (대소문자 무시)
   * - Modifier는 첫 글자만 대문자로 유지
   * - 키 이름은 소문자로 정규화
   * 예: 'Ctrl+B' → 'Ctrl+b', 'CMD+SHIFT+Z' → 'Cmd+Shift+z'
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
