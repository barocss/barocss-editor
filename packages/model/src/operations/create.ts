import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import type { INode } from '@barocss/datastore';

// CreateOperation type definition (uses INode)
// runtime only; DSL moved to operations-dsl/create.ts


/**
 * Node creation Operation
 * 
 * Utilizes DataStore's createNodeWithChildren method to:
 * 1. Create nested node structure at once
 * 2. Automatic ID generation (Figma style)
 * 3. Perform schema validation
 * 4. Emit atomic Operation events
 */
defineOperation('create', 
  async (operation: any, context: TransactionContext) => {
  const { node: originalNode, options } = operation.payload as { node: INode; options?: any };
  // Copy original node to use (prevent reference issues)
  const node = JSON.parse(JSON.stringify(originalNode));
  
  try {
    // 1. DataStore update (use INode directly)
    const schema = context.dataStore.getActiveSchema();
    // Copy node for processing (prevent modifying original node)
    const nodeCopy = JSON.parse(JSON.stringify(node));
    const processedNode = context.dataStore.createNodeWithChildren(nodeCopy, schema);
    
    // createNodeWithChildren already sets parent-child relationships, so no additional work needed
    
    // Set root node (if it's the first node)
    if (!context.dataStore.getRootNode()) {
      context.dataStore.setRootNodeId(processedNode.sid!);
    }
    
    // 3. Selection mapping after DataStore changes complete
    // create operation does not change Selection (preserve)
    
    // Return created node + inverse (return copy)
    const resultData = JSON.parse(JSON.stringify(processedNode));
    return {
      ok: true,
      data: resultData,
      inverse: { type: 'delete', payload: { nodeId: processedNode.sid! } }
    };
    
  } catch (error) {
    // Handle schema validation failure or other errors
    throw new Error(`Failed to create node: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});
