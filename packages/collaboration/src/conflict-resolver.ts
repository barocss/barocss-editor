import type { AtomicOperation } from '@barocss/datastore';
import type { ConflictResolutionConfig, ConflictStrategy } from './types';

/**
 * Resolves conflicts between concurrent operations.
 */
export class ConflictResolver {
  private _config: ConflictResolutionConfig;

  constructor(config?: Partial<ConflictResolutionConfig>) {
    this._config = {
      strategy: config?.strategy ?? 'last-writer-wins',
      customResolver: config?.customResolver,
    };
  }

  get strategy(): ConflictStrategy {
    return this._config.strategy;
  }

  resolve(local: AtomicOperation, remote: AtomicOperation): AtomicOperation {
    if (this._config.strategy === 'custom' && this._config.customResolver) {
      return this._config.customResolver(local, remote);
    }

    if (!this._isConflict(local, remote)) {
      return remote;
    }

    switch (this._config.strategy) {
      case 'last-writer-wins':
        return this._lastWriterWins(local, remote);
      case 'first-writer-wins':
        return this._firstWriterWins(local, remote);
      case 'merge':
        return this._merge(local, remote);
      default:
        return remote;
    }
  }

  private _isConflict(local: AtomicOperation, remote: AtomicOperation): boolean {
    if (local.nodeId !== remote.nodeId) return false;
    if (local.type === 'delete' && remote.type === 'delete') return true;
    if (local.type === 'update' && remote.type === 'update') return true;
    if ((local.type === 'delete' && remote.type === 'update') ||
        (local.type === 'update' && remote.type === 'delete')) return true;
    return false;
  }

  private _lastWriterWins(local: AtomicOperation, remote: AtomicOperation): AtomicOperation {
    const localTs = local.timestamp ?? 0;
    const remoteTs = remote.timestamp ?? 0;
    return remoteTs >= localTs ? remote : local;
  }

  private _firstWriterWins(local: AtomicOperation, remote: AtomicOperation): AtomicOperation {
    const localTs = local.timestamp ?? 0;
    const remoteTs = remote.timestamp ?? 0;
    return remoteTs <= localTs ? remote : local;
  }

  private _merge(local: AtomicOperation, remote: AtomicOperation): AtomicOperation {
    if (local.type === 'update' && remote.type === 'update' && local.data && remote.data) {
      return {
        ...remote,
        data: { ...local.data, ...remote.data },
        timestamp: Math.max(local.timestamp ?? 0, remote.timestamp ?? 0)
      };
    }
    return this._lastWriterWins(local, remote);
  }
}
