import type { AwarenessState, AwarenessManager, CursorPosition } from './types';

/**
 * Default AwarenessManager implementation.
 * Manages local + remote presence state and cursor positions.
 */
export class DefaultAwarenessManager implements AwarenessManager {
  private _localState: AwarenessState | null = null;
  private _remoteStates: Map<string, AwarenessState> = new Map();
  private _listeners: Set<(states: Map<string, AwarenessState>) => void> = new Set();
  private _cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private _staleThresholdMs: number;

  constructor(options?: { staleThresholdMs?: number }) {
    this._staleThresholdMs = options?.staleThresholdMs ?? 30_000;
    this._cleanupInterval = setInterval(() => this._cleanupStale(), 10_000);
  }

  getLocalState(): AwarenessState | null {
    return this._localState;
  }

  setLocalState(state: Partial<AwarenessState>): void {
    if (this._localState) {
      this._localState = { ...this._localState, ...state, lastActive: Date.now() };
    } else {
      this._localState = {
        clientId: state.clientId || 'local',
        user: state.user || { id: 'local' },
        cursor: state.cursor ?? null,
        lastActive: Date.now(),
        ...state
      } as AwarenessState;
    }
  }

  setLocalCursor(anchor: CursorPosition, head: CursorPosition): void {
    if (!this._localState) return;
    this._localState = {
      ...this._localState,
      cursor: { anchor, head },
      lastActive: Date.now()
    };
  }

  clearLocalCursor(): void {
    if (!this._localState) return;
    this._localState = { ...this._localState, cursor: null, lastActive: Date.now() };
  }

  getRemoteStates(): Map<string, AwarenessState> {
    return new Map(this._remoteStates);
  }

  applyRemoteState(clientId: string, state: AwarenessState): void {
    this._remoteStates.set(clientId, state);
    this._notifyListeners();
  }

  removeRemoteState(clientId: string): void {
    this._remoteStates.delete(clientId);
    this._notifyListeners();
  }

  onRemoteChange(callback: (states: Map<string, AwarenessState>) => void): () => void {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  destroy(): void {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    this._listeners.clear();
    this._remoteStates.clear();
    this._localState = null;
  }

  private _notifyListeners(): void {
    const states = this.getRemoteStates();
    for (const listener of this._listeners) {
      try { listener(states); } catch { /* ignore */ }
    }
  }

  private _cleanupStale(): void {
    const now = Date.now();
    let changed = false;
    for (const [clientId, state] of this._remoteStates) {
      if (now - state.lastActive > this._staleThresholdMs) {
        this._remoteStates.delete(clientId);
        changed = true;
      }
    }
    if (changed) this._notifyListeners();
  }
}
