/**
 * RemoteDecoratorManager
 * 
 * 외부 사용자/AI의 decorator를 관리하는 매니저
 * Selection 정보 공유와 유사한 패턴으로 별도 채널로 관리
 */

import type { Decorator } from './types.js';

/**
 * Decorator 소유자 정보
 */
export interface DecoratorOwner {
  userId: string;
  agentId?: string; // AI인 경우
  sessionId: string;
}

/**
 * RemoteDecoratorManager 클래스
 * 
 * 외부 decorator를 관리하며, 소유자 정보를 포함합니다.
 */
export class RemoteDecoratorManager {
  private remoteDecorators = new Map<string, Decorator>();
  private ownerMap = new Map<string, DecoratorOwner>(); // sid → owner
  
  /**
   * 외부 decorator 추가/업데이트
   * 동시 편집 시스템에서 호출됨
   */
  setRemoteDecorator(
    decorator: Decorator,
    owner: DecoratorOwner
  ): void {
    const key = decorator.sid;
    this.remoteDecorators.set(key, {
      ...decorator,
      // owner 정보는 별도 맵에 저장 (decorator 자체에는 포함하지 않음)
      // 필요시 data 필드에 메타데이터로 포함 가능
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

