import type { INode, IMark } from '../types';
import type { DataStore } from '../data-store';

/**
 * Split & Merge 연산들
 * 
 * 텍스트 노드와 블록 노드의 분할 및 병합 기능들을 담당합니다.
 */
export class SplitMergeOperations {
  constructor(private dataStore: DataStore) {}

  /**
   * 텍스트 노드를 지정된 위치에서 분할
   * 
   * Spec splitTextNode:
   * - Splits a text node at the specified position into two nodes.
   * - Creates a new node with the right portion of the text.
   * - Updates the original node with the left portion of the text.
   * - Adjusts marks ranges to maintain proper formatting.
   * - Inserts the new node after the original in the parent's content.
   * - Throws error for non-text nodes or invalid split positions.
   * 
   * @param nodeId 분할할 텍스트 노드 ID
   * @param splitPosition 분할 위치 (0-based)
   * @returns 새로 생성된 오른쪽 노드의 ID
   */
  splitTextNode(nodeId: string, splitPosition: number): string {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    if (typeof node.text !== 'string') {
      throw new Error(`Node is not a text node: ${node.stype}`);
    }

    const text = node.text || '';
    if (splitPosition < 0 || splitPosition > text.length) {
      throw new Error(`Invalid split position: ${splitPosition}`);
    }

    if (splitPosition === 0 || splitPosition === text.length) {
      throw new Error(`Split position must be between 0 and ${text.length}`);
    }

    // 원본 노드의 텍스트를 분할
    const leftText = text.substring(0, splitPosition);
    const rightText = text.substring(splitPosition);

    // 마크 범위 조정
    const leftMarks: IMark[] = [];
    const rightMarks: IMark[] = [];

    if (node.marks) {
      for (const mark of node.marks) {
        const [start, end] = mark.range || [0, text.length];
        
        if (start < splitPosition && end > splitPosition) {
          leftMarks.push({
            ...mark,
            range: [start, splitPosition] as [number, number]
          });
          
          rightMarks.push({
            ...mark,
            range: [0, end - splitPosition] as [number, number]
          });
        }
        else if (end <= splitPosition) {
          leftMarks.push({
            ...mark,
            range: [start, end] as [number, number]
          });
        }
        else if (start >= splitPosition) {
          rightMarks.push({
            ...mark,
            range: [start - splitPosition, end - splitPosition] as [number, number]
          });
        }
      }
    }

    // 원본 노드 업데이트
    this.dataStore.updateNode(nodeId, { text: leftText, marks: leftMarks } as Partial<INode>, false);

    // 새 노드 생성
    const newNode: INode = {
      stype: node.stype,
      text: rightText,
      attributes: { ...node.attributes },
      marks: rightMarks,
      parentId: node.parentId
    };

    const newNodeId = this.dataStore.generateId();
    newNode.sid = newNodeId;
    this.dataStore.setNode(newNode, false);

    // 부모의 content 배열에 새 노드 추가
    if (node.parentId) {
      const parent = this.dataStore.getNode(node.parentId);
      if (parent && parent.content) {
        const currentIndex = parent.content.indexOf(nodeId);
        if (currentIndex !== -1) {
          const newContent = [...parent.content];
          newContent.splice(currentIndex + 1, 0, newNodeId);
          this.dataStore.updateNode(parent.sid!, { content: newContent }, false);
        }
      }
    }

    return newNodeId;
  }

  /**
   * 두 개의 텍스트 노드를 병합
   * 
   * Spec mergeTextNodes:
   * - Merges two adjacent text nodes into a single node.
   * - Combines text content and adjusts marks ranges.
   * - Removes the right node and updates the left node.
   * - Removes the right node from parent's content.
   * - Throws error for non-text nodes or non-existent nodes.
   * 
   * @param leftNodeId 왼쪽 텍스트 노드 ID
   * @param rightNodeId 오른쪽 텍스트 노드 ID
   * @returns 병합된 노드의 ID (왼쪽 노드)
   */
  mergeTextNodes(leftNodeId: string, rightNodeId: string): string {
    const leftNode = this.dataStore.getNode(leftNodeId);
    const rightNode = this.dataStore.getNode(rightNodeId);

    if (!leftNode || !rightNode) {
      throw new Error(`Node not found: ${leftNodeId} or ${rightNodeId}`);
    }

    if (typeof leftNode.text !== 'string') {
      throw new Error(`Left node is not a text node: ${leftNode.stype}`);
    }

    if (typeof rightNode.text !== 'string') {
      throw new Error(`Right node is not a text node: ${rightNode.stype}`);
    }

    // 텍스트 병합 (사전 뮤테이션 금지: 업데이트 값 계산 후 updateNode 사용)
    const leftText = leftNode.text || '';
    const rightText = rightNode.text || '';
    const mergedText = leftText + rightText;

    // 왼쪽 노드의 marks에 range가 없는 경우 range 추가
    if (leftNode.marks) {
      leftNode.marks = leftNode.marks.map(mark => ({
        ...mark,
        range: mark.range || [0, leftText.length] as [number, number]
      }));
    }

    // 마크 병합
    if (rightNode.marks) {
      const leftTextLength = leftText.length;
      
      const adjustedRightMarks = rightNode.marks.map(mark => ({
        ...mark,
        range: mark.range ? [
          mark.range[0] + leftTextLength,
          mark.range[1] + leftTextLength
        ] as [number, number] : [leftTextLength, leftTextLength + rightText.length] as [number, number]
      }));

      if (leftNode.marks) {
        leftNode.marks.push(...adjustedRightMarks);
      } else {
        leftNode.marks = adjustedRightMarks;
      }
    }

    // 왼쪽 노드 업데이트 (updateNode 경로로만 기록)
    this.dataStore.updateNode(leftNodeId, { text: mergedText, marks: leftNode.marks } as Partial<INode>, false);

    // 부모의 content 배열에서 오른쪽 노드 제거
    if (leftNode.parentId) {
      const parent = this.dataStore.getNode(leftNode.parentId);
      if (parent && parent.content) {
        const rightIndex = parent.content.indexOf(rightNodeId);
        if (rightIndex !== -1) {
          const newContent = [...parent.content];
          newContent.splice(rightIndex, 1);
          this.dataStore.updateNode(parent.sid!, { content: newContent }, false);
        }
      }
    }

    // 오른쪽 노드 제거
    this.dataStore.deleteNode(rightNodeId);

    return leftNodeId;
  }

  /**
   * 블록 노드를 지정된 위치에서 분할
   * 
   * Spec splitBlockNode:
   * - Splits a block node at the specified position into two nodes.
   * - Creates a new block node with the same type and attributes.
   * - Moves right-side children to the new block node.
   * - Updates parent content to insert new block after the original.
   * - Updates moved children's parentId to the new block.
   * - Throws error for nodes without content or invalid split positions.
   * 
   * @param nodeId 분할할 블록 노드 ID
   * @param splitPosition 분할 위치 (0-based, content 배열 인덱스)
   * @returns 새로 생성된 오른쪽 블록 노드의 ID
   */
  splitBlockNode(nodeId: string, splitPosition: number): string {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    if (!node.content || node.content.length === 0) {
      throw new Error(`Node has no content to split: ${nodeId}`);
    }

    if (splitPosition < 0 || splitPosition > node.content.length) {
      throw new Error(`Invalid split position: ${splitPosition}`);
    }

    if (splitPosition === 0 || splitPosition === node.content.length) {
      throw new Error(`Split position must be between 0 and ${node.content.length}`);
    }

    // 새 블록 노드 생성
    const newNode: INode = {
      stype: node.stype,
      attributes: { ...node.attributes },
      content: [],
      parentId: node.parentId
    };

    const newNodeId = this.dataStore.generateId();
    newNode.sid = newNodeId;
    this.dataStore.setNode(newNode, false);

    // 자식 노드들을 분할
    const rightChildren = node.content.splice(splitPosition);
    // 정책: 새 노드에 우측 자식들을 포함
    newNode.content = rightChildren;
    this.dataStore.updateNode(newNodeId, { content: rightChildren } as Partial<INode>, false);

    // 오른쪽 자식들의 부모 ID 업데이트
    for (const childId of rightChildren) {
      const child = this.dataStore.getNode(childId as string);
      if (child) {
        this.dataStore.updateNode(childId as string, { parentId: newNodeId } as Partial<INode>, false);
      }
    }

    // 원본 노드 업데이트
    this.dataStore.updateNode(nodeId, { content: node.content } as Partial<INode>, false);

    // 부모의 content 배열에 새 노드 추가
    if (node.parentId) {
      const parent = this.dataStore.getNode(node.parentId);
      if (parent && parent.content) {
        const currentIndex = parent.content.indexOf(nodeId);
        if (currentIndex !== -1) {
          const newContent = [...parent.content];
          newContent.splice(currentIndex + 1, 0, newNodeId);
          this.dataStore.updateNode(parent.sid!, { content: newContent }, false);
        }
      }
    }

    return newNodeId;
  }

  /**
   * 두 개의 블록 노드를 병합
   * 
   * Spec mergeBlockNodes:
   * - Merges two adjacent block nodes into a single node.
   * - Moves all children from the right node to the left node.
   * - Updates children's parentId to the left node.
   * - Removes the right node from parent's content.
   * - Throws error for different node types or non-existent nodes.
   * 
   * @param leftNodeId 왼쪽 블록 노드 ID
   * @param rightNodeId 오른쪽 블록 노드 ID
   * @returns 병합된 노드의 ID (왼쪽 노드)
   */
  mergeBlockNodes(leftNodeId: string, rightNodeId: string): string {
    const leftNode = this.dataStore.getNode(leftNodeId);
    const rightNode = this.dataStore.getNode(rightNodeId);

    if (!leftNode || !rightNode) {
      throw new Error(`Node not found: ${leftNodeId} or ${rightNodeId}`);
    }

    if (leftNode.stype !== rightNode.stype) {
      throw new Error(`Cannot merge different node types: ${leftNode.stype} and ${rightNode.stype}`);
    }

    // 오른쪽 노드의 자식들을 왼쪽 노드로 이동
    if (rightNode.content && rightNode.content.length > 0) {
      if (!leftNode.content) {
        leftNode.content = [];
      }
      
      for (const childId of rightNode.content) {
        const child = this.dataStore.getNode(childId as string);
        if (child) {
          this.dataStore.updateNode(childId as string, { parentId: leftNodeId } as Partial<INode>, false);
        }
      }

      leftNode.content.push(...rightNode.content);
    }

    // 왼쪽 노드 업데이트
    this.dataStore.updateNode(leftNodeId, { content: leftNode.content } as Partial<INode>, false);

    // 오른쪽 노드 제거
    this.dataStore.deleteNode(rightNodeId);

    return leftNodeId;
  }

  /**
   * 텍스트 범위를 지정된 위치에서 분할
   * 
   * Spec splitTextRange:
   * - Splits a text node at two positions to extract a range.
   * - Creates two splits: one at startPosition, one at endPosition.
   * - Returns the ID of the middle node containing the extracted range.
   * - Throws error for non-text nodes or invalid ranges.
   * 
   * @param nodeId 분할할 텍스트 노드 ID
   * @param startPosition 시작 분할 위치 (0-based)
   * @param endPosition 끝 분할 위치 (0-based)
   * @returns 추출된 범위를 포함하는 중간 노드의 ID
   */
  splitTextRange(nodeId: string, startPosition: number, endPosition: number): string {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    if (typeof node.text !== 'string') {
      throw new Error(`Node is not a text node: ${node.stype}`);
    }

    const text = node.text || '';
    if (startPosition < 0 || endPosition > text.length || startPosition >= endPosition) {
      throw new Error(`Invalid range: ${startPosition}-${endPosition}`);
    }

    // 첫 번째 분할: startPosition에서
    const firstSplitId = this.splitTextNode(nodeId, startPosition);
    
    // 두 번째 분할: (endPosition - startPosition)에서
    const secondSplitId = this.splitTextNode(firstSplitId, endPosition - startPosition);

    return firstSplitId;
  }

  /**
   * 인접한 텍스트 노드들을 자동으로 병합
   * 
   * Spec autoMergeTextNodes:
   * - Automatically merges adjacent text nodes of the same type.
   * - Merges leftward and rightward from the given node.
   * - Continues merging until no more adjacent text nodes are found.
   * - Returns the ID of the final merged node.
   * - Useful for maintaining text node consistency after operations.
   * 
   * @param nodeId 기준 텍스트 노드 ID
   * @returns 최종 병합된 노드의 ID
   */
  autoMergeTextNodes(nodeId: string): string {
    const node = this.dataStore.getNode(nodeId);
    if (!node || !node.parentId) {
      return nodeId;
    }

    if (typeof node.text !== 'string') {
      return nodeId;
    }

    let parent = this.dataStore.getNode(node.parentId);
    if (!parent || !parent.content) {
      return nodeId;
    }

    let currentIndex = parent.content.indexOf(nodeId);
    if (currentIndex === -1) {
      return nodeId;
    }

    let mergedNodeId = nodeId;

    // 왼쪽 노드들과 연속으로 병합
    while (currentIndex > 0) {
      const leftNodeId = parent.content[currentIndex - 1];
      const leftNode = this.dataStore.getNode(leftNodeId as string);
      
      if (leftNode && typeof leftNode.text === 'string') {
        mergedNodeId = this.mergeTextNodes(leftNodeId as string, mergedNodeId);
        parent = this.dataStore.getNode(node.parentId);
        if (parent && parent.content) {
          currentIndex = parent.content.indexOf(mergedNodeId);
          if (currentIndex <= 0) break;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    // 오른쪽 노드들과 연속으로 병합
    while (true) {
      const currentParent = this.dataStore.getNode(node.parentId);
      if (!currentParent || !currentParent.content) {
        break;
      }

      const currentIndex = currentParent.content.indexOf(mergedNodeId);
      if (currentIndex === -1 || currentIndex >= currentParent.content.length - 1) {
        break;
      }

      const rightNodeId = currentParent.content[currentIndex + 1];
      const rightNode = this.dataStore.getNode(rightNodeId as string);
      
      if (rightNode && typeof rightNode.text === 'string') {
        mergedNodeId = this.mergeTextNodes(mergedNodeId, rightNodeId as string);
      } else {
        break;
      }
    }

    return mergedNodeId;
  }

  /**
   * 텍스트 노드에서 지정된 범위의 텍스트를 삭제
   * 
   * Spec deleteTextRange:
   * - Deletes text within the specified range from a text node.
   * - Adjusts marks ranges to maintain proper formatting.
   * - Returns the deleted text content.
   * - Throws error for non-text nodes or invalid ranges.
   * 
   * @param nodeId 텍스트 노드 ID
   * @param startPosition 삭제 시작 위치 (0-based)
   * @param endPosition 삭제 끝 위치 (0-based)
   * @returns 삭제된 텍스트 내용
   */
  deleteTextRange(nodeId: string, startPosition: number, endPosition: number): string {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    if (typeof node.text !== 'string') {
      throw new Error(`Node is not a text node: ${node.stype}`);
    }

    const text = node.text || '';
    if (startPosition < 0 || endPosition > text.length || startPosition >= endPosition) {
      throw new Error(`Invalid range: [${startPosition}, ${endPosition}] for text of length ${text.length}`);
    }

    const deletedText = text.substring(startPosition, endPosition);
    const deltaLength = endPosition - startPosition;

    const newText = text.substring(0, startPosition) + text.substring(endPosition);
    node.text = newText;

    // 마크 범위 조정
    if (node.marks) {
      node.marks = node.marks
        .map(mark => {
          if (!mark.range) return mark;

          const [markStart, markEnd] = mark.range;

          if (markStart < endPosition && markEnd > startPosition) {
            if (markStart >= startPosition && markEnd <= endPosition) {
              return null;
            }
            else if (markStart < startPosition && markEnd > endPosition) {
              return [
                { ...mark, range: [markStart, startPosition] as [number, number] },
                { ...mark, range: [markEnd - deltaLength, markEnd - deltaLength] as [number, number] }
              ];
            }
            else if (markStart < startPosition && markEnd <= endPosition) {
              return { ...mark, range: [markStart, startPosition] as [number, number] };
            }
            else if (markStart >= startPosition && markEnd > endPosition) {
              return { ...mark, range: [markStart - deltaLength, markEnd - deltaLength] as [number, number] };
            }
          }
          else if (markStart >= endPosition) {
            return { ...mark, range: [markStart - deltaLength, markEnd - deltaLength] as [number, number] };
          }
          else {
            return mark;
          }
        })
        .flat()
        .filter(Boolean) as IMark[];
    }

    this.dataStore.setNodeInternal(node);
    return deletedText;
  }

  /**
   * 텍스트 노드에서 지정된 범위의 텍스트를 새로운 텍스트로 교체
   * 
   * Spec replaceTextRange:
   * - Replaces text within the specified range with new text.
   * - Adjusts marks ranges to maintain proper formatting.
   * - Returns the original text that was replaced.
   * - Throws error for non-text nodes or invalid ranges.
   * 
   * @param nodeId 텍스트 노드 ID
   * @param startPosition 교체 시작 위치 (0-based)
   * @param endPosition 교체 끝 위치 (0-based)
   * @param newText 새로운 텍스트
   * @returns 교체된 원본 텍스트
   */
  replaceTextRange(nodeId: string, startPosition: number, endPosition: number, newText: string): string {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    if (typeof node.text !== 'string') {
      throw new Error(`Node is not a text node: ${node.stype}`);
    }

    const text = node.text || '';
    if (startPosition < 0 || endPosition > text.length || startPosition > endPosition) {
      throw new Error(`Invalid range: [${startPosition}, ${endPosition}] for text of length ${text.length}`);
    }

    const replacedText = text.substring(startPosition, endPosition);
    const deltaLength = newText.length - (endPosition - startPosition);

    // 텍스트 교체
    const updatedText = text.substring(0, startPosition) + newText + text.substring(endPosition);
    node.text = updatedText;

    // 마크 범위 조정
    if (node.marks) {
      node.marks = node.marks
        .map(mark => {
          if (!mark.range) return mark;

          const [markStart, markEnd] = mark.range;

          // 삭제 범위와 겹치는 마크 처리
          if (markStart < endPosition && markEnd > startPosition) {
            if (markStart >= startPosition && markEnd <= endPosition) {
              // 마크가 완전히 교체 범위 내에 있는 경우 - 마크 제거
              return null;
            }
            else if (markStart < startPosition && markEnd > endPosition) {
              // 마크가 교체 범위를 포함하는 경우 - 분할
              return [
                { ...mark, range: [markStart, startPosition] as [number, number] },
                { ...mark, range: [startPosition + newText.length, markEnd - (endPosition - startPosition) + newText.length] as [number, number] }
              ];
            }
            else if (markStart < startPosition && markEnd <= endPosition) {
              // 마크가 교체 범위 시작 이전에서 끝나는 경우
              return { ...mark, range: [markStart, startPosition] as [number, number] };
            }
            else if (markStart >= startPosition && markEnd > endPosition) {
              // 마크가 교체 범위 시작 이후에서 끝나는 경우
              return { ...mark, range: [startPosition + newText.length, markEnd - (endPosition - startPosition) + newText.length] as [number, number] };
            }
          }
          else if (markStart >= endPosition) {
            // 마크가 교체 범위 이후에 있는 경우 - 오프셋 조정
            return { ...mark, range: [markStart + deltaLength, markEnd + deltaLength] as [number, number] };
          }
          else {
            // 마크가 교체 범위 이전에 있는 경우 - 변경 없음
            return mark;
          }
        })
        .flat()
        .filter(Boolean) as IMark[];
    }

    this.dataStore.setNodeInternal(node);
    return replacedText;
  }

  /**
   * 텍스트 노드의 지정된 위치에 텍스트를 삽입
   * 
   * Spec insertText:
   * - Inserts text at the specified position in a text node.
   * - Adjusts marks ranges to maintain proper formatting.
   * - Returns the inserted text.
   * - Throws error for non-text nodes or invalid positions.
   * 
   * @param nodeId 텍스트 노드 ID
   * @param position 삽입 위치 (0-based)
   * @param text 삽입할 텍스트
   * @returns 삽입된 텍스트
   */
  insertText(nodeId: string, position: number, text: string): string {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    if (typeof node.text !== 'string') {
      throw new Error(`Node is not a text node: ${node.stype}`);
    }

    const currentText = node.text || '';
    if (position < 0 || position > currentText.length) {
      throw new Error(`Invalid position: ${position} for text of length ${currentText.length}`);
    }

    const newText = currentText.substring(0, position) + text + currentText.substring(position);
    node.text = newText;

    // 마크 범위 조정
    if (node.marks) {
      node.marks = node.marks.map(mark => {
        if (!mark.range) return mark;

        const [markStart, markEnd] = mark.range;

        if (markStart >= position) {
          return {
            ...mark,
            range: [markStart + text.length, markEnd + text.length] as [number, number]
          };
        }
        else if (markEnd > position) {
          return {
            ...mark,
            range: [markStart, markEnd + text.length] as [number, number]
          };
        }
        else {
          return mark;
        }
      });
    }

    this.dataStore.setNodeInternal(node);
    return text;
  }
}
