import { SchemaRegistry } from './registry.js';
import { createSchema } from './schema.js';
import type { SchemaDefinition } from './types';

/**
 * Manages multiple editor instances, each with its own schema registry
 * This allows multiple editors to coexist on the same page without schema conflicts
 */
export class EditorSchemaManager {
  private registries = new Map<string, SchemaRegistry>();

  /**
   * Create a new editor instance with its own schema registry
   * @param editorId Unique identifier for the editor
   * @returns New SchemaRegistry instance for the editor
   * @throws Error if editor with the same ID already exists
   */
  createEditor(editorId: string): SchemaRegistry {
    if (this.registries.has(editorId)) {
      throw new Error(`Editor with ID '${editorId}' already exists`);
    }
    const registry = new SchemaRegistry();
    this.registries.set(editorId, registry);
    return registry;
  }

  /**
   * Get an existing editor's schema registry
   * @param editorId Unique identifier for the editor
   * @returns SchemaRegistry instance or undefined if not found
   */
  getEditor(editorId: string): SchemaRegistry | undefined {
    return this.registries.get(editorId);
  }

  /**
   * Remove an editor and its schema registry
   * @param editorId Unique identifier for the editor
   * @returns true if editor was removed, false if not found
   */
  removeEditor(editorId: string): boolean {
    return this.registries.delete(editorId);
  }

  /**
   * Get all editor IDs
   * @returns Array of all editor IDs
   */
  getAllEditorIds(): string[] {
    return Array.from(this.registries.keys());
  }

  /**
   * Check if an editor exists
   * @param editorId Unique identifier for the editor
   * @returns true if editor exists, false otherwise
   */
  hasEditor(editorId: string): boolean {
    return this.registries.has(editorId);
  }

  /**
   * Clear all editors and their registries
   */
  clearAllEditors(): void {
    this.registries.clear();
  }

  /**
   * Get the number of active editors
   * @returns Number of active editors
   */
  getEditorCount(): number {
    return this.registries.size;
  }

  /**
   * Check if any editors exist
   * @returns true if any editors exist, false otherwise
   */
  hasAnyEditors(): boolean {
    return this.registries.size > 0;
  }
}

/**
 * Global editor manager instance
 * This provides a singleton instance for managing multiple editors
 */
export const editorManager = new EditorSchemaManager();

/**
 * Create a namespaced schema to avoid naming conflicts
 * @param namespace The namespace prefix (e.g., 'social-media', 'blog')
 * @param name The schema name (e.g., 'post', 'page')
 * @param definition The schema definition
 * @returns Schema instance with namespaced name
 */
export function createNamespacedSchema(namespace: string, name: string, definition: SchemaDefinition) {
  // 통합 스키마 정의만 지원
  return createSchema(`${namespace}:${name}`, definition);
}

/**
 * Get all schemas in a registry that belong to a specific namespace
 * @param registry The schema registry to search
 * @param namespace The namespace to filter by
 * @returns Array of schemas that start with the namespace
 */
export function getNamespacedSchemas(registry: SchemaRegistry, namespace: string) {
  return registry.getAll().filter(schema => schema.name.startsWith(`${namespace}:`));
}

/**
 * Create a new editor manager instance
 * This is useful when you want to isolate editor management
 * @returns New EditorSchemaManager instance
 */
export function createEditorManager(): EditorSchemaManager {
  return new EditorSchemaManager();
}
