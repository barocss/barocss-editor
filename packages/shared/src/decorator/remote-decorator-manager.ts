/**
 * RemoteDecoratorManager
 *
 * Manages decorators from external users/AI (e.g. collaboration).
 * Used by editor-view-dom and editor-view-react.
 */

import type { Decorator } from './types.js';
import { EventEmitter } from './event-emitter.js';

export interface DecoratorOwner {
  userId: string;
  agentId?: string;
  sessionId: string;
}

export interface RemoteDecoratorManagerEvents {
  change: () => void;
}

export class RemoteDecoratorManager extends EventEmitter<RemoteDecoratorManagerEvents> {
  private remoteDecorators = new Map<string, Decorator>();
  private ownerMap = new Map<string, DecoratorOwner>();

  setRemoteDecorator(decorator: Decorator, owner: DecoratorOwner): void {
    const key = decorator.sid;
    this.remoteDecorators.set(key, {
      ...decorator,
      data: {
        ...(decorator.data || {}),
        _remoteOwner: {
          userId: owner.userId,
          agentId: owner.agentId,
          sessionId: owner.sessionId,
        },
      } as Record<string, unknown>,
    });
    this.ownerMap.set(key, owner);
    this.emit('change');
  }

  removeRemoteDecorator(sid: string): void {
    this.remoteDecorators.delete(sid);
    this.ownerMap.delete(sid);
    this.emit('change');
  }

  removeByOwner(userId: string): void {
    const toRemove: string[] = [];
    for (const [sid, owner] of this.ownerMap.entries()) {
      if (owner?.userId === userId) toRemove.push(sid);
    }
    if (toRemove.length > 0) {
      toRemove.forEach((sid) => {
        this.remoteDecorators.delete(sid);
        this.ownerMap.delete(sid);
      });
      this.emit('change');
    }
  }

  removeByAgent(agentId: string): void {
    const toRemove: string[] = [];
    for (const [sid, owner] of this.ownerMap.entries()) {
      if (owner?.agentId === agentId) toRemove.push(sid);
    }
    if (toRemove.length > 0) {
      toRemove.forEach((sid) => {
        this.remoteDecorators.delete(sid);
        this.ownerMap.delete(sid);
      });
      this.emit('change');
    }
  }

  removeBySession(sessionId: string): void {
    const toRemove: string[] = [];
    for (const [sid, owner] of this.ownerMap.entries()) {
      if (owner?.sessionId === sessionId) toRemove.push(sid);
    }
    if (toRemove.length > 0) {
      toRemove.forEach((sid) => {
        this.remoteDecorators.delete(sid);
        this.ownerMap.delete(sid);
      });
      this.emit('change');
    }
  }

  getAll(): Decorator[] {
    return Array.from(this.remoteDecorators.values());
  }

  getByOwner(userId: string): Decorator[] {
    return this.getAll().filter((d) => this.ownerMap.get(d.sid)?.userId === userId);
  }

  getByAgent(agentId: string): Decorator[] {
    return this.getAll().filter((d) => this.ownerMap.get(d.sid)?.agentId === agentId);
  }

  getOwner(sid: string): DecoratorOwner | undefined {
    return this.ownerMap.get(sid);
  }

  get(sid: string): Decorator | undefined {
    return this.remoteDecorators.get(sid);
  }

  has(sid: string): boolean {
    return this.remoteDecorators.has(sid);
  }

  size(): number {
    return this.remoteDecorators.size;
  }

  clear(): void {
    if (this.remoteDecorators.size > 0 || this.ownerMap.size > 0) {
      this.remoteDecorators.clear();
      this.ownerMap.clear();
      this.emit('change');
    }
  }
}
