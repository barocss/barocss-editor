/**
 * RemoteDecoratorManager
 * 
 * Manager for managing decorators from external users/AI
 * Managed in separate channel similar to selection information sharing pattern
 */

import type { Decorator } from './types.js';

/**
 * Decorator owner information
 */
export interface DecoratorOwner {
  userId: string;
  agentId?: string; // If AI
  sessionId: string;
}

/**
 * RemoteDecoratorManager class
 * 
 * Manages external decorators and includes owner information.
 */
export class RemoteDecoratorManager {
  private remoteDecorators = new Map<string, Decorator>();
  private ownerMap = new Map<string, DecoratorOwner>(); // sid → owner
  
  /**
   * Add/update external decorator
   * Called from collaborative editing system
   */
  setRemoteDecorator(
    decorator: Decorator,
    owner: DecoratorOwner
  ): void {
    const key = decorator.sid;
    this.remoteDecorators.set(key, {
      ...decorator,
      // Store owner info in separate map (not included in decorator itself)
      // Can be included as metadata in data field if needed
      data: {
        ...decorator.data,
        _remoteOwner: {
          userId: owner.userId,
          agentId: owner.agentId,
          sessionId: owner.sessionId
        }
      }
    });
    this.ownerMap.set(key, owner);
  }
  
  /**
   * 외부 decorator 제거
   */
  removeRemoteDecorator(sid: string): void {
    this.remoteDecorators.delete(sid);
    this.ownerMap.delete(sid);
  }
  
  /**
   * 특정 사용자의 decorator 모두 제거
   * (사용자가 연결 해제된 경우)
   */
  removeByOwner(userId: string): void {
    const toRemove: string[] = [];
    
    for (const [sid, decorator] of this.remoteDecorators.entries()) {
      const owner = this.ownerMap.get(sid);
      if (owner?.userId === userId) {
        toRemove.push(sid);
      }
    }
    
    toRemove.forEach(sid => this.removeRemoteDecorator(sid));
  }
  
  /**
   * 특정 사용자의 AI decorator 제거
   */
  removeByAgent(agentId: string): void {
    const toRemove: string[] = [];
    
    for (const [sid, decorator] of this.remoteDecorators.entries()) {
      const owner = this.ownerMap.get(sid);
      if (owner?.agentId === agentId) {
        toRemove.push(sid);
      }
    }
    
    toRemove.forEach(sid => this.removeRemoteDecorator(sid));
  }
  
  /**
   * 특정 세션의 decorator 모두 제거
   */
  removeBySession(sessionId: string): void {
    const toRemove: string[] = [];
    
    for (const [sid, decorator] of this.remoteDecorators.entries()) {
      const owner = this.ownerMap.get(sid);
      if (owner?.sessionId === sessionId) {
        toRemove.push(sid);
      }
    }
    
    toRemove.forEach(sid => this.removeRemoteDecorator(sid));
  }
  
  /**
   * 모든 외부 decorator 조회
   */
  getAll(): Decorator[] {
    return Array.from(this.remoteDecorators.values());
  }
  
  /**
   * 특정 사용자의 decorator 조회
   */
  getByOwner(userId: string): Decorator[] {
    return Array.from(this.remoteDecorators.values())
      .filter(d => {
        const owner = this.ownerMap.get(d.sid);
        return owner?.userId === userId;
      });
  }
  
  /**
   * 특정 AI의 decorator 조회
   */
  getByAgent(agentId: string): Decorator[] {
    return Array.from(this.remoteDecorators.values())
      .filter(d => {
        const owner = this.ownerMap.get(d.sid);
        return owner?.agentId === agentId;
      });
  }
  
  /**
   * 특정 decorator의 소유자 정보 조회
   */
  getOwner(sid: string): DecoratorOwner | undefined {
    return this.ownerMap.get(sid);
  }
  
  /**
   * 특정 decorator 조회
   */
  get(sid: string): Decorator | undefined {
    return this.remoteDecorators.get(sid);
  }
  
  /**
   * Decorator 존재 여부 확인
   */
  has(sid: string): boolean {
    return this.remoteDecorators.has(sid);
  }
  
  /**
   * 전체 decorator 개수
   */
  size(): number {
    return this.remoteDecorators.size;
  }
  
  /**
   * 모든 외부 decorator 제거
   */
  clear(): void {
    this.remoteDecorators.clear();
    this.ownerMap.clear();
  }
  
  /**
   * 디버깅용 정보 출력
   */
  debug(): void {
    console.group('RemoteDecoratorManager Debug Info');
    console.log('Total remote decorators:', this.size());
    
    const byOwner = new Map<string, number>();
    const byAgent = new Map<string, number>();
    
    for (const [sid, owner] of this.ownerMap.entries()) {
      byOwner.set(owner.userId, (byOwner.get(owner.userId) || 0) + 1);
      if (owner.agentId) {
        byAgent.set(owner.agentId, (byAgent.get(owner.agentId) || 0) + 1);
      }
    }
    
    console.log('By owner:', Object.fromEntries(byOwner));
    console.log('By agent:', Object.fromEntries(byAgent));
    
    const allDecorators = this.getAll();
    console.table(allDecorators.map(d => {
      const owner = this.ownerMap.get(d.sid);
      return {
        id: d.sid,
        category: d.category,
        type: d.stype,
        userId: owner?.userId,
        agentId: owner?.agentId,
        sessionId: owner?.sessionId
      };
    }));
    
    console.groupEnd();
  }
}

