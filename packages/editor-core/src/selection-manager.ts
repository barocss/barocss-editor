/**
 * Model 레벨에서만 Selection을 관리하는 SelectionManager
 * DOM과는 완전히 분리되어 있으며, editor-view-dom에서 DOM ↔ Model 변환을 처리합니다.
 * 
 * 이 클래스는 순수하게 Model 레벨에서 Selection 상태만 관리하며,
 * DOM 조작이나 이벤트 처리는 하지 않습니다.
 */

import { DataStore } from "@barocss/datastore";
import type { ModelSelection } from './types';

export interface SelectionManagerOptions {
  dataStore?: DataStore;
}

export class SelectionManager {
  private _currentSelection: ModelSelection | null = null;
  private _dataStore: any | null = null;

  constructor(options: SelectionManagerOptions = {}) {
    if (options.dataStore) {
      this._dataStore = options.dataStore;
    }
  }

  // ===== 기본 Selection 관리 =====

  get startNodeId(): string | null {
    return this._currentSelection?.startNodeId || null;
  }

  get startOffset(): number | null {
    return this._currentSelection?.startOffset || null;
  }
  
  get endNodeId(): string | null {
    return this._currentSelection?.endNodeId || null;
  }

  get endOffset(): number | null {
    return this._currentSelection?.endOffset || null;
  }

  /**
   * 현재 Selection 반환
   */
  getCurrentSelection(): ModelSelection | null {
    return this._currentSelection;
  }

  /**
   * Selection 설정
   */
  setSelection(selection: ModelSelection | null): void {
    this._currentSelection = selection;
  }

  /**
   * Selection 클리어
   */
  clearSelection(): void {
    this._currentSelection = null;
  }

  // ===== Selection 상태 확인 =====

  /**
   * Selection이 비어있는지 확인
   */
  isEmpty(): boolean {
    return this._currentSelection === null;
  }

  /**
   * Selection이 특정 노드에 있는지 확인 (anchor 또는 focus가 해당 노드)
   */
  isInNode(nodeId: string): boolean {
    if (!this._currentSelection) return false;
    return this._currentSelection.startNodeId === nodeId || this._currentSelection.endNodeId === nodeId;
  }

  /**
   * Selection이 특정 위치에 있는지 확인 (collapsed)
   */
  isAtPosition(nodeId: string, position: number): boolean {
    if (!this._currentSelection) return false;
    return this._currentSelection.startNodeId === nodeId && 
           this._currentSelection.startOffset === position && 
           this._currentSelection.endNodeId === nodeId &&
           this._currentSelection.endOffset === position;
  }

  /**
   * Selection이 특정 범위에 있는지 확인 (단일 노드 내에서)
   */
  isInRange(nodeId: string, start: number, end: number): boolean {
    if (!this._currentSelection) return false;
    
    // 단일 노드 내에서만 범위 확인 가능
    if (this._currentSelection.startNodeId !== nodeId || this._currentSelection.endNodeId !== nodeId) {
      return false;
    }
    
    const selectionStart = Math.min(this._currentSelection.startOffset, this._currentSelection.endOffset);
    const selectionEnd = Math.max(this._currentSelection.startOffset, this._currentSelection.endOffset);
    
    return selectionStart >= start && selectionEnd <= end;
  }

  /**
   * Selection이 특정 범위와 겹치는지 확인 (단일 노드 내에서)
   */
  overlapsWith(nodeId: string, start: number, end: number): boolean {
    if (!this._currentSelection) return false;
    
    // 단일 노드 내에서만 겹침 확인 가능
    if (this._currentSelection.startNodeId !== nodeId || this._currentSelection.endNodeId !== nodeId) {
      return false;
    }
    
    const selectionStart = Math.min(this._currentSelection.startOffset, this._currentSelection.endOffset);
    const selectionEnd = Math.max(this._currentSelection.startOffset, this._currentSelection.endOffset);
    
    return !(selectionEnd <= start || selectionStart >= end);
  }

  /**
   * Selection 길이 반환 (단일 노드 내에서만)
   */
  getLength(): number {
    if (!this._currentSelection) return 0;
    
    // 단일 노드 내에서만 길이 계산 가능
    if (this._currentSelection.startNodeId !== this._currentSelection.endNodeId) {
      return 0; // 또는 다른 처리 방식
    }
    
    return Math.abs(this._currentSelection.endOffset - this._currentSelection.startOffset);
  }

  /**
   * Selection이 collapsed인지 확인 (anchor === focus)
   */
  isCollapsed(): boolean {
    if (!this._currentSelection) return true;
    return this._currentSelection.startNodeId === this._currentSelection.endNodeId && 
           this._currentSelection.startOffset === this._currentSelection.endOffset;
  }

  // ===== Selection 조작 =====

  /**
   * Selection을 특정 위치로 이동 (collapsed)
   */
  moveTo(nodeId: string, position: number): void {
    this._currentSelection = {
      type: 'range',
      startNodeId: nodeId,
      startOffset: position,
      endNodeId: nodeId,
      endOffset: position
    };
  }

  /**
   * Selection을 특정 범위로 설정 (단일 노드 내에서)
   */
  selectRange(nodeId: string, start: number, end: number): void {
    this._currentSelection = {
      type: 'range',
      startNodeId: nodeId,
      startOffset: start,
      endNodeId: nodeId,
      endOffset: end
    };
  }

  /**
   * Selection을 특정 범위로 설정 (다중 노드 지원)
   */
  selectRangeMulti(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number): void {
    this._currentSelection = {
      type: 'range',
      startNodeId,
      startOffset,
      endNodeId,
      endOffset
    };
  }

  /**
   * Selection을 확장 (focus만 이동)
   */
  extendTo(nodeId: string, position: number): void {
    if (!this._currentSelection) {
      this.moveTo(nodeId, position);
      return;
    }

    this._currentSelection = {
      type: 'range',
      startNodeId: this._currentSelection.startNodeId,
      startOffset: this._currentSelection.startOffset,
      endNodeId: nodeId,
      endOffset: position
    };
  }

  /**
   * Selection을 축소 (anchor를 focus로)
   */
  collapseToStart(): void {
    if (!this._currentSelection) return;
    
    this._currentSelection = {
      type: 'range',
      startNodeId: this._currentSelection.startNodeId,
      startOffset: this._currentSelection.startOffset,
      endNodeId: this._currentSelection.startNodeId,
      endOffset: this._currentSelection.startOffset
    };
  }

  /**
   * Selection을 축소 (focus를 anchor로)
   */
  collapseToEnd(): void {
    if (!this._currentSelection) return;
    
    this._currentSelection = {
      type: 'range',
      startNodeId: this._currentSelection.endNodeId,
      startOffset: this._currentSelection.endOffset,
      endNodeId: this._currentSelection.endNodeId,
      endOffset: this._currentSelection.endOffset
    };
  }

  // ===== 고급 Selection 기능 =====

  /**
   * 전체 노드 선택
   */
  selectNode(nodeId: string): void {
    // 노드의 전체 내용을 선택 (텍스트 길이를 알아야 함)
    // DataStore에서 노드 정보를 가져와야 함
    if (!this._dataStore) {
      throw new Error('DataStore not set');
    }
    
    const node = this._dataStore.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    
    // 텍스트 노드인 경우 텍스트 길이를 사용
    const textLength = node.text ? node.text.length : 0;
    
    this._currentSelection = {
      type: 'range',
      startNodeId: nodeId,
      startOffset: 0,
      endNodeId: nodeId,
      endOffset: textLength
    };
  }

  /**
   * 모든 텍스트 선택 (루트 노드부터)
   */
  selectAll(): void {
      if (!this._dataStore) {
      throw new Error('DataStore not set');
    }
    
    const rootNode = this._dataStore.getRootNode();
    if (!rootNode) {
      return;
    }
    
    // 루트 노드의 첫 번째 텍스트 노드부터 마지막까지 선택
    const allNodes = this._dataStore.getAllNodes();
    const textNodes = allNodes.filter(node => node.text !== undefined);
    
    if (textNodes.length === 0) {
      return;
    }
    
    const firstNode = textNodes[0];
    const lastNode = textNodes[textNodes.length - 1];
    
    this._currentSelection = {
      type: 'range',
      startNodeId: firstNode.sid!,
      startOffset: 0,
      endNodeId: lastNode.sid!,
      endOffset: lastNode.text!.length
    };
  }

  /**
   * 현재 위치에서 노드 시작까지 선택
   */
  selectToStart(): void {
    if (!this._currentSelection) return;
    
    this._currentSelection = {
      type: 'range',
      startNodeId: this._currentSelection.startNodeId,
      startOffset: 0,
      endNodeId: this._currentSelection.startNodeId,
      endOffset: this._currentSelection.startOffset
    };
  }

  /**
   * 현재 위치에서 노드 끝까지 선택
   */
  selectToEnd(): void {
    if (!this._currentSelection || !this._dataStore) return;
    
    const node = this._dataStore.getNode(this._currentSelection.startNodeId);
    if (!node || !node.text) return;
    
    this._currentSelection = {
      type: 'range',
      startNodeId: this._currentSelection.startNodeId,
      startOffset: this._currentSelection.startOffset,
      endNodeId: this._currentSelection.startNodeId,
      endOffset: node.text.length
    };
  }

  /**
   * 노드 시작으로 이동
   */
  moveToStart(nodeId: string): void {
    this.moveTo(nodeId, 0);
  }

  /**
   * 노드 끝으로 이동
   */
  moveToEnd(nodeId: string): void {
    if (!this._dataStore) {
      throw new Error('DataStore not set');
    }
    
    const node = this._dataStore.getNode(nodeId);
    if (!node || !node.text) {
      throw new Error(`Text node not found: ${nodeId}`);
    }
    
    this.moveTo(nodeId, node.text.length);
  }

  /**
   * 상대적 위치로 이동
   */
  moveBy(offset: number): void {
    if (!this._currentSelection) return;
    
    const newOffset = Math.max(0, this._currentSelection.startOffset + offset);
    this.moveTo(this._currentSelection.startNodeId, newOffset);
  }

  /**
   * 상대적 범위로 확장
   */
  extendBy(offset: number): void {
    if (!this._currentSelection) return;
    
    const newOffset = Math.max(0, this._currentSelection.endOffset + offset);
    this.extendTo(this._currentSelection.endNodeId, newOffset);
  }

  /**
   * 단어 선택 (현재 위치 기준)
   */
  selectWord(nodeId: string, position: number): void {
    if (!this._dataStore) {
      throw new Error('DataStore not set');
    }
    
    const node = this._dataStore.getNode(nodeId);
    if (!node || !node.text) {
      throw new Error(`Text node not found: ${nodeId}`);
    }
    
    const text = node.text;
    const wordRegex = /\w+/g;
    let match;
    let wordStart = -1;
    let wordEnd = -1;
    
    // 현재 위치가 포함된 단어 찾기
    while ((match = wordRegex.exec(text)) !== null) {
      if (position >= match.index && position < match.index + match[0].length) {
        wordStart = match.index;
        wordEnd = match.index + match[0].length;
        break;
      }
    }
    
    if (wordStart !== -1 && wordEnd !== -1) {
      this.selectRange(nodeId, wordStart, wordEnd);
    } else {
      // 단어가 없으면 현재 위치로 collapsed
      this._currentSelection = {
      type: 'range',
        startNodeId: nodeId,
        startOffset: position,
        endNodeId: nodeId,
        endOffset: position
      };
    }
  }

  /**
   * 라인 선택 (현재 위치 기준)
   */
  selectLine(nodeId: string, position: number): void {
    if (!this._dataStore) {
      throw new Error('DataStore not set');
    }
    
    const node = this._dataStore.getNode(nodeId);
    if (!node || !node.text) {
      throw new Error(`Text node not found: ${nodeId}`);
    }
    
    const text = node.text;
    const lines = text.split('\n');
    let currentPos = 0;
    let lineStart = 0;
    let lineEnd = 0;
    
    // 현재 위치가 포함된 라인 찾기
    for (let i = 0; i < lines.length; i++) {
      const lineLength = lines[i].length;
      lineEnd = currentPos + lineLength;
      
      if (position >= currentPos && position <= lineEnd) {
        lineStart = currentPos;
        break;
      }
      
      currentPos = lineEnd + 1; // +1 for newline character
    }
    
    this.selectRange(nodeId, lineStart, lineEnd);
  }

  // ===== Selection 변환 =====

  /**
   * 텍스트 삽입 후 Selection 위치 조정
   */
  adjustForTextInsert(nodeId: string, position: number, insertedLength: number): void {
    if (!this._currentSelection) return;

    let newAnchorOffset = this._currentSelection.startOffset;
    let newFocusOffset = this._currentSelection.endOffset;

    // anchor가 해당 노드에 있고 삽입 위치 이후에 있는 경우
    if (this._currentSelection.startNodeId === nodeId && this._currentSelection.startOffset >= position) {
      newAnchorOffset = this._currentSelection.startOffset + insertedLength;
    }

    // focus가 해당 노드에 있고 삽입 위치 이후에 있는 경우
    if (this._currentSelection.endNodeId === nodeId && this._currentSelection.endOffset >= position) {
      newFocusOffset = this._currentSelection.endOffset + insertedLength;
    }

    this._currentSelection = {
      type: 'range',
      startNodeId: this._currentSelection.startNodeId,
      startOffset: newAnchorOffset,
      endNodeId: this._currentSelection.endNodeId,
      endOffset: newFocusOffset
    };
  }

  /**
   * 텍스트 삭제 후 Selection 위치 조정
   */
  adjustForTextDelete(nodeId: string, startPos: number, endPos: number): void {
    if (!this._currentSelection) return;

    const deletedLength = endPos - startPos;
    let newAnchorOffset = this._currentSelection.startOffset;
    let newFocusOffset = this._currentSelection.endOffset;

    // anchor가 해당 노드에 있는 경우
    if (this._currentSelection.startNodeId === nodeId) {
      if (this._currentSelection.startOffset >= endPos) {
        // 삭제 범위 이후에 있는 경우
        newAnchorOffset = this._currentSelection.startOffset - deletedLength;
      } else if (this._currentSelection.startOffset > startPos) {
        // 삭제 범위 내에 있는 경우
        newAnchorOffset = startPos;
      }
    }

    // focus가 해당 노드에 있는 경우
    if (this._currentSelection.endNodeId === nodeId) {
      if (this._currentSelection.endOffset >= endPos) {
        // 삭제 범위 이후에 있는 경우
        newFocusOffset = this._currentSelection.endOffset - deletedLength;
      } else if (this._currentSelection.endOffset > startPos) {
        // 삭제 범위 내에 있는 경우
        newFocusOffset = startPos;
      }
    }

    this._currentSelection = {
      type: 'range',
      startNodeId: this._currentSelection.startNodeId,
      startOffset: newAnchorOffset,
      endNodeId: this._currentSelection.endNodeId,
      endOffset: newFocusOffset
    };
  }

  /**
   * 노드 분할 후 Selection 위치 조정
   */
  adjustForNodeSplit(nodeId: string, splitPosition: number): void {
    if (!this._currentSelection) return;

    // anchor가 해당 노드에 있는 경우 분할 지점으로 이동
    if (this._currentSelection.startNodeId === nodeId) {
      this._currentSelection = {
      type: 'range',
        startNodeId: nodeId,
        startOffset: splitPosition,
        endNodeId: nodeId,
        endOffset: splitPosition
      };
    }
  }

  // ===== 유틸리티 메서드 =====

  /**
   * Selection이 특정 노드에 완전히 포함되어 있는지 확인
   */
  isFullyInNode(nodeId: string): boolean {
    if (!this._currentSelection) return false;
    return this._currentSelection.startNodeId === nodeId && this._currentSelection.endNodeId === nodeId;
  }

  /**
   * Selection이 특정 노드와 겹치는지 확인
   */
  overlapsWithNode(nodeId: string): boolean {
    if (!this._currentSelection) return false;
    return this._currentSelection.startNodeId === nodeId || this._currentSelection.endNodeId === nodeId;
  }

  /**
   * Selection의 시작 위치 반환
   */
  getStartPosition(): { nodeId: string; offset: number } | null {
    if (!this._currentSelection) return null;
    
    const isReversed = this._currentSelection.startOffset > this._currentSelection.endOffset ||
                      (this._currentSelection.startOffset === this._currentSelection.endOffset && 
                       this._currentSelection.startNodeId > this._currentSelection.endNodeId);
    
    return {
      nodeId: isReversed ? this._currentSelection.endNodeId : this._currentSelection.startNodeId,
      offset: isReversed ? this._currentSelection.endOffset : this._currentSelection.startOffset
    };
  }

  /**
   * Selection의 끝 위치 반환
   */
  getEndPosition(): { nodeId: string; offset: number } | null {
    if (!this._currentSelection) return null;
    
    const isReversed = this._currentSelection.startOffset > this._currentSelection.endOffset ||
                      (this._currentSelection.startOffset === this._currentSelection.endOffset && 
                       this._currentSelection.startNodeId > this._currentSelection.endNodeId);
    
    return {
      nodeId: isReversed ? this._currentSelection.startNodeId : this._currentSelection.endNodeId,
      offset: isReversed ? this._currentSelection.startOffset : this._currentSelection.endOffset
    };
  }

  /**
   * Selection이 뒤집혀 있는지 확인 (anchor가 focus보다 뒤에 있음)
   */
  isReversed(): boolean {
    if (!this._currentSelection) return false;
    
    return this._currentSelection.startOffset > this._currentSelection.endOffset ||
           (this._currentSelection.startOffset === this._currentSelection.endOffset && 
            this._currentSelection.startNodeId > this._currentSelection.endNodeId);
  }

  /**
   * Selection을 정규화 (anchor가 항상 focus보다 앞에 오도록)
   */
  normalize(): void {
    if (!this._currentSelection) return;
    
    if (this.isReversed()) {
      this._currentSelection = {
      type: 'range',
        startNodeId: this._currentSelection.endNodeId,
        startOffset: this._currentSelection.endOffset,
        endNodeId: this._currentSelection.startNodeId,
        endOffset: this._currentSelection.startOffset
      };
    }
  }

  /**
   * Selection의 텍스트 내용 반환 (단일 노드 내에서만)
   */
  getSelectedText(): string | null {
    if (!this._currentSelection || !this._dataStore) return null;
    
    // 단일 노드 내에서만 텍스트 반환 가능
    if (this._currentSelection.startNodeId !== this._currentSelection.endNodeId) {
      return null;
    }
    
    const node = this._dataStore.getNode(this._currentSelection.startNodeId);
    if (!node || !node.text) return null;
    
    const start = Math.min(this._currentSelection.startOffset, this._currentSelection.endOffset);
    const end = Math.max(this._currentSelection.startOffset, this._currentSelection.endOffset);
    
    return node.text.substring(start, end);
  }

  // ===== DataStore 설정 =====

  /**
   * DataStore 설정
   */
  setDataStore(dataStore: any): void {
    this._dataStore = dataStore;
  }

  /**
   * 현재 SelectionManager를 복제하여 새로운 SelectionManager를 반환합니다.
   * @returns new SelectionManager
   */
  clone(): SelectionManager {
    const newSelectionManager = new SelectionManager({
      dataStore: this._dataStore
    });

    const currentSelection = this._currentSelection;
    if (currentSelection) {
      newSelectionManager.setSelection(currentSelection);
    }

    return newSelectionManager;
  }
}