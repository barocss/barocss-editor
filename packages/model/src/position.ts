import { DataStore } from '@barocss/datastore';

/**
 * PositionCalculator is a utility class responsible for converting between absolute positions and nodeId + offset.
 * 
 * This class implements Barocss's Position system that includes node boundaries,
 * processing the entire document as a linear sequence similar to ProseMirror.
 * 
 * @example
 * ```typescript
 * const calculator = new PositionCalculator(dataStore);
 * 
 * // Convert nodeId + offset to absolute position
 * const absolutePos = calculator.calculateAbsolutePosition('text-1', 3);
 * 
 * // Convert absolute position to nodeId + offset
 * const nodePos = calculator.findNodeByAbsolutePosition(5);
 * ```
 */
export class PositionCalculator {
  private _dataStore: DataStore;

  constructor(dataStore: DataStore) {
    this._dataStore = dataStore;
  }

  /**
   * Converts absolute position to nodeId + offset.
   * 
   * This method treats the entire document as a linear sequence and returns
   * the node and offset within that node corresponding to the given absolute position.
   * 
   * @param absoluteOffset - Absolute position in the entire document (starting from 0)
   * @returns Node ID and offset at that position, or null (if position cannot be found)
   * 
   * @example
   * ```typescript
   * const result = calculator.findNodeByAbsolutePosition(7);
   * // { nodeId: 'text-1', offset: 4 } - 4th character in text-1 node
   * ```
   */
  findNodeByAbsolutePosition(absoluteOffset: number): { nodeId: string; offset: number } | null {
    let currentOffset = 0;
    
    const traverse = (nodeId: string): { nodeId: string; offset: number } | null => {
      const node = this._dataStore.getNode(nodeId);
      if (!node) return null;

      // Check node start position
      if (currentOffset === absoluteOffset) {
        return { nodeId: node.sid!, offset: 0 }; // Node start
      }
      currentOffset += 1;

      // If text node
      if (node.text) {
        const nodeLength = node.text.length;
        if (currentOffset + nodeLength > absoluteOffset) {
          return {
            nodeId: node.sid!,
            offset: Math.max(0, absoluteOffset - currentOffset)
          };
        }
        currentOffset += nodeLength;
      }

      // If container node, traverse children
      if (node.content) {
        for (const childId of node.content) {
          const result = traverse(childId as string);
          if (result) return result;
        }
      }

      // Check node end position
      if (currentOffset === absoluteOffset) {
        return { nodeId: node.sid!, offset: node.text ? node.text.length : 0 }; // Node end
      }
      currentOffset += 1;

      return null;
    };

    const rootNode = this._dataStore.getRootNode();
    if (!rootNode) return null;

    return traverse(rootNode.sid!);
  }

  /**
   * Converts nodeId + offset to absolute position.
   * 
   * This method converts the given node ID and offset within that node
   * to an absolute position in the entire document.
   * 
   * @param nodeId - ID of the target node
   * @param offset - Offset within the node (starting from 0)
   * @returns Absolute position in the entire document
   * 
   * @throws {Error} If node cannot be found
   * 
   * @example
   * ```typescript
   * const absolutePos = calculator.calculateAbsolutePosition('text-1', 3);
   * // 5 - Absolute position of the 3rd character in text-1 node
   * ```
   */
  calculateAbsolutePosition(nodeId: string, offset: number): number {
    if (offset < 0) {
      throw new Error(`Invalid offset: ${offset}. Offset must be non-negative.`);
    }

    let absoluteOffset = 0;
    let targetNodeFound = false;
    
    const traverse = (currentNodeId: string): boolean => {
      const node = this._dataStore.getNode(currentNodeId);
      if (!node) return false;

      // If current node is the target node
      if (node.sid === nodeId) {
        targetNodeFound = true;
        // Node start position + offset
        absoluteOffset += offset;
        return true;
      }

      // Add node start position (1)
      absoluteOffset += 1;

      // If text node, add text length
      if (node.text) {
        absoluteOffset += node.text.length;
      }

      // If container node, traverse children
      if (node.content) {
        for (const childId of node.content) {
          if (traverse(childId as string)) return true;
        }
      }

      // Add node end position (1)
      absoluteOffset += 1;

      return false;
    };

    const rootNode = this._dataStore.getRootNode();
    if (!rootNode) {
      throw new Error('Root node not found');
    }

    const found = traverse(rootNode.sid!);
    
    if (!found || !targetNodeFound) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    return absoluteOffset;
  }

  /**
   * Calculates the path of a node.
   * 
   * Returns the path from the document root to the specified node as an array.
   * 
   * @param nodeId - ID of the node to calculate path for
   * @returns Node path array (from root in order)
   * 
   * @example
   * ```typescript
   * const path = calculator.getNodePath('text-1');
   * // ['doc-1', 'para-1', 'text-1']
   * ```
   */
  getNodePath(nodeId: string): string[] {
    return this._dataStore.getNodePath(nodeId);
  }

  /**
   * Gets the parent ID of a node.
   * 
   * @param nodeId - ID of the node to find parent for
   * @returns Parent node ID, or undefined (if no parent)
   * 
   * @example
   * ```typescript
   * const parentId = calculator.getParentId('text-1');
   * // 'para-1'
   * ```
   */
  getParentId(nodeId: string): string | undefined {
    const node = this._dataStore.getNode(nodeId);
    return node?.parentId;
  }

  /**
   * Gets the order of a node among its siblings.
   * 
   * @param nodeId - ID of the node to find order for
   * @returns Order among sibling nodes (starting from 0)
   * 
   * @example
   * ```typescript
   * const index = calculator.getSiblingIndex('text-1');
   * // 0 - First sibling node
   * ```
   */
  getSiblingIndex(nodeId: string): number {
    return this._dataStore.getSiblingIndex(nodeId);
  }

  /**
   * Calculates the distance between two nodes.
   * 
   * @param nodeId1 - ID of the first node
   * @param nodeId2 - ID of the second node
   * @returns Absolute position distance between the two nodes
   * 
   * @example
   * ```typescript
   * const distance = calculator.calculateDistance('text-1', 'text-2');
   * // 15 - Absolute position difference between the two nodes
   * ```
   */
  calculateDistance(nodeId1: string, nodeId2: string): number {
    try {
      const pos1 = this.calculateAbsolutePosition(nodeId1, 0);
      const pos2 = this.calculateAbsolutePosition(nodeId2, 0);
      return Math.abs(pos2 - pos1);
    } catch (error) {
      return -1;
    }
  }

  /**
   * Returns the text length of a node.
   * 
   * @param nodeId - ID of the node to calculate text length for
   * @returns Text length, or 0 (if no text)
   * 
   * @example
   * ```typescript
   * const length = calculator.getTextLength('text-1');
   * // 11 - Length of "Hello World"
   * ```
   */
  getTextLength(nodeId: string): number {
    const node = this._dataStore.getNode(nodeId);
    return node?.text?.length || 0;
  }

  /**
   * Checks if a node is a text node.
   * 
   * @param nodeId - ID of the node to check
   * @returns Whether it is a text node
   * 
   * @example
   * ```typescript
   * const isText = calculator.isTextNode('text-1');
   * // true
   * ```
   */
  isTextNode(nodeId: string): boolean {
    const node = this._dataStore.getNode(nodeId);
    return !!(node?.text);
  }

  /**
   * Checks if a node is a container node.
   * 
   * @param nodeId - ID of the node to check
   * @returns Whether it is a container node
   * 
   * @example
   * ```typescript
   * const isContainer = calculator.isContainerNode('para-1');
   * // true
   * ```
   */
  isContainerNode(nodeId: string): boolean {
    const node = this._dataStore.getNode(nodeId);
    return !!(node?.content && node.content.length > 0);
  }
}
