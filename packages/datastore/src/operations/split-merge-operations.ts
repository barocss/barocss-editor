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
  splitTextNode(nodeId: string, splitPosition: number, newNodeId?: string): string {
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

    // Split original node's text
    const leftText = text.substring(0, splitPosition);
    const rightText = text.substring(splitPosition);

    // Adjust mark ranges
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

    // Update original node
    this.dataStore.updateNode(nodeId, { text: leftText, marks: leftMarks } as Partial<INode>, false);

    // Create new node
    const newNode: INode = {
      stype: node.stype,
      text: rightText,
      attributes: { ...node.attributes },
      marks: rightMarks,
      parentId: node.parentId
    };

    /**
     * The id the right-hand half is to carry, when the caller names one.
     *
     * A fresh id is right for a reader splitting a run. It is wrong when this
     * split is undoing a *merge*: the merge consumed a node, and every inverse
     * collected before it that names that node — a reordering, a removal, a
     * move — can no longer find it. Undo then either throws or quietly leaves
     * the document in an order it was never in.
     *
     * Giving the half back its old id makes the merge and the split each
     * other's inverse in identity as well as in text.
     */
    const assignedId = newNodeId ?? this.dataStore.generateId();
    newNode.sid = assignedId;
    this.dataStore.setNode(newNode, false);

    // Add new node to parent's content array
    if (node.parentId) {
      const parent = this.dataStore.getNode(node.parentId);
      if (parent && parent.content) {
        const currentIndex = parent.content.indexOf(nodeId);
        if (currentIndex !== -1) {
          const newContent = [...parent.content];
          newContent.splice(currentIndex + 1, 0, assignedId);
          this.dataStore.updateNode(parent.sid!, { content: newContent }, false);
        }
      }
    }

    return assignedId;
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

    /**
     * Attributes are not consulted here, on purpose.
     *
     * This is the mechanism: a caller that names two nodes has decided they are
     * one. Marks survive — they name a range of characters, so they shift and
     * both sides keep what they had — while attributes belong to the node, so
     * joining two that differ keeps the left's and drops the right's.
     *
     * Deciding whether that is allowed is policy, and it lives where the policy
     * is: the `mergeTextNodes` *operation* refuses a join that would drop
     * attributes, and `autoMergeTextNodes` below stops at such a boundary
     * rather than sweeping through it.
     */

    // Merge text (no pre-mutation: calculate update value then use updateNode)
    const leftText = leftNode.text || '';
    const rightText = rightNode.text || '';
    const mergedText = leftText + rightText;

    // Add range to left node's marks if range is missing
    if (leftNode.marks) {
      leftNode.marks = leftNode.marks.map(mark => ({
        ...mark,
        range: mark.range || [0, leftText.length] as [number, number]
      }));
    }

    // Merge marks
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

    /**
     * Marks that meet at the seam and say the same thing are one mark.
     *
     * Splitting 'two' in the middle gives bold [0,1] and bold [0,2]; joining
     * them back shifts the second to [1,3] and leaves two marks where there had
     * been one. Nothing reads differently — but the document is not the document
     * it was, so undo cannot restore it, and every edit-and-undo leaves another
     * pair behind.
     *
     * Only marks of the same type carrying the same attributes, and only where
     * one ends exactly where the next begins.
     */
    leftNode.marks = coalesceMarks(leftNode.marks);

    // Update left node (record only through updateNode path)
    this.dataStore.updateNode(leftNodeId, { text: mergedText, marks: leftNode.marks } as Partial<INode>, false);

    // Remove right node from parent's content array
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

    // Remove right node
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
  splitBlockNode(nodeId: string, splitPosition: number, newNodeId?: string): string {
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

    // Create new block node
    const newNode: INode = {
      stype: node.stype,
      attributes: { ...node.attributes },
      content: [],
      parentId: node.parentId
    };

    /**
     * The id the right-hand block is to carry, when the caller names one.
     *
     * A fresh id is right for a reader dividing a paragraph. It is wrong when
     * this split is undoing a *merge*: the merge consumed a block, and every
     * inverse collected before it that names that block can no longer find it.
     * The same fault, and the same answer, as `splitTextNode`.
     */
    const assignedId = newNodeId ?? this.dataStore.generateId();
    newNode.sid = assignedId;
    this.dataStore.setNode(newNode, false);

    // Split child nodes
    const rightChildren = node.content.splice(splitPosition);
    // Policy: include right children in new node
    newNode.content = rightChildren;
    this.dataStore.updateNode(assignedId, { content: rightChildren } as Partial<INode>, false);

    // Update parent ID of right children
    for (const childId of rightChildren) {
      const child = this.dataStore.getNode(childId as string);
      if (child) {
        this.dataStore.updateNode(childId as string, { parentId: assignedId } as Partial<INode>, false);
      }
    }

    // Update original node
    this.dataStore.updateNode(nodeId, { content: node.content } as Partial<INode>, false);

    // Add new node to parent's content array
    if (node.parentId) {
      const parent = this.dataStore.getNode(node.parentId);
      if (parent && parent.content) {
        const currentIndex = parent.content.indexOf(nodeId);
        if (currentIndex !== -1) {
          const newContent = [...parent.content];
          newContent.splice(currentIndex + 1, 0, assignedId);
          this.dataStore.updateNode(parent.sid!, { content: newContent }, false);
        }
      }
    }

    return assignedId;
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

    // Move children from right node to left node
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

    // Update left node
    this.dataStore.updateNode(leftNodeId, { content: leftNode.content } as Partial<INode>, false);

    // Remove right node
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

    // First split: at startPosition
    const firstSplitId = this.splitTextNode(nodeId, startPosition);
    
    // Second split: at (endPosition - startPosition)
    this.splitTextNode(firstSplitId, endPosition - startPosition);

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
  /**
   * Whether two runs are the same run, told apart into two.
   *
   * Only the attributes are asked about: marks name a range of characters and
   * are carried across a join, so two runs differing only in their marks still
   * read the same joined. Attributes belong to the node and cannot be halved,
   * so a difference there is a boundary auto-merge must stop at rather than
   * a difference it may quietly resolve.
   */
  private canJoin(left: INode | undefined, right: INode | undefined): boolean {
    if (!left || !right) return false;
    if (left.stype !== right.stype) return false;
    const attributesOf = (node: INode) =>
      JSON.stringify(node.attributes ?? {}, Object.keys(node.attributes ?? {}).sort());
    return attributesOf(left) === attributesOf(right);
  }

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

    // Merge continuously with left nodes
    while (currentIndex > 0) {
      const leftNodeId = parent.content[currentIndex - 1];
      const leftNode = this.dataStore.getNode(leftNodeId as string);
      
      if (leftNode && typeof leftNode.text === 'string' && this.canJoin(leftNode, this.dataStore.getNode(mergedNodeId))) {
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

    // Merge continuously with right nodes
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
      
      if (rightNode && typeof rightNode.text === 'string' && this.canJoin(this.dataStore.getNode(mergedNodeId), rightNode)) {
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

    // Adjust mark ranges
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

    // Replace text
    const updatedText = text.substring(0, startPosition) + newText + text.substring(endPosition);
    node.text = updatedText;

    // Adjust mark ranges
    if (node.marks) {
      node.marks = node.marks
        .map(mark => {
          if (!mark.range) return mark;

          const [markStart, markEnd] = mark.range;

          // Handle marks overlapping with deletion range
          if (markStart < endPosition && markEnd > startPosition) {
            if (markStart >= startPosition && markEnd <= endPosition) {
              // Mark is completely within replacement range - remove mark
              return null;
            }
            else if (markStart < startPosition && markEnd > endPosition) {
              // Mark contains replacement range - split
              return [
                { ...mark, range: [markStart, startPosition] as [number, number] },
                { ...mark, range: [startPosition + newText.length, markEnd - (endPosition - startPosition) + newText.length] as [number, number] }
              ];
            }
            else if (markStart < startPosition && markEnd <= endPosition) {
              // Mark ends before replacement range start
              return { ...mark, range: [markStart, startPosition] as [number, number] };
            }
            else if (markStart >= startPosition && markEnd > endPosition) {
              // Mark starts after replacement range start
              return { ...mark, range: [startPosition + newText.length, markEnd - (endPosition - startPosition) + newText.length] as [number, number] };
            }
          }
          else if (markStart >= endPosition) {
            // Mark is after replacement range - adjust offset
            return { ...mark, range: [markStart + deltaLength, markEnd + deltaLength] as [number, number] };
          }
          else {
            // Mark is before replacement range - no change
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

    // Adjust mark ranges
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

/**
 * Join marks that touch and agree, leaving everything else alone.
 *
 * Sorted by where they start, so that two halves of a mark that was cut are
 * next to each other however they were pushed together.
 */
function coalesceMarks(marks: any[] | undefined): any[] | undefined {
  if (!Array.isArray(marks) || marks.length < 2) return marks;
  const keyOf = (mark: any) =>
    `${mark.stype ?? mark.type}:${JSON.stringify(mark.attrs ?? {}, Object.keys(mark.attrs ?? {}).sort())}`;
  const sorted = [...marks].sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0));
  const joined: any[] = [];
  for (const mark of sorted) {
    const last = joined[joined.length - 1];
    if (
      last &&
      keyOf(last) === keyOf(mark) &&
      Array.isArray(last.range) &&
      Array.isArray(mark.range) &&
      last.range[1] === mark.range[0]
    ) {
      last.range = [last.range[0], mark.range[1]];
      continue;
    }
    joined.push({ ...mark, ...(Array.isArray(mark.range) ? { range: [...mark.range] } : {}) });
  }
  return joined;
}
