/**
 * Event-Based Extension Example
 * 
 * Demonstrates how to use editor.on() events instead of after hooks.
 * This shows the recommended approach for non-core model changes.
 */

import { Extension, Editor } from '@barocss/editor-core';

export interface EventBasedExtensionOptions {
  enabled?: boolean;
}

export class EventBasedExtension implements Extension {
  name = 'eventBased';
  priority = 100;
  
  private _options: EventBasedExtensionOptions;
  private _cleanup: (() => void)[] = [];
  
  constructor(options: EventBasedExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }
  
  onCreate(editor: Editor): void {
    if (!this._options.enabled) {
      return;
    }
    
    // Node events (not available as hooks)
    const nodeCreateHandler = (data: any) => {
      console.log('[EventBased] Node created:', data.node);
    };
    editor.on('editor:node.create', nodeCreateHandler);
    this._cleanup.push(() => editor.off('editor:node.create', nodeCreateHandler));
    
    const nodeUpdateHandler = (data: any) => {
      console.log('[EventBased] Node updated:', data.node);
    };
    editor.on('editor:node.update', nodeUpdateHandler);
    this._cleanup.push(() => editor.off('editor:node.update', nodeUpdateHandler));
    
    // Command events (not available as hooks)
    const commandHandler = (data: any) => {
      console.log('[EventBased] Command executed:', data.command, data.success);
    };
    editor.on('editor:command.execute', commandHandler);
    this._cleanup.push(() => editor.off('editor:command.execute', commandHandler));
    
    // History events (not available as hooks)
    const historyHandler = (data: any) => {
      console.log('[EventBased] History changed:', data.canUndo, data.canRedo);
    };
    editor.on('editor:history.change', historyHandler);
    this._cleanup.push(() => editor.off('editor:history.change', historyHandler));
    
    // Alternative: Use events instead of after hooks for core model changes
    // (More flexible, but less type-safe than hooks)
    const contentChangeHandler = (data: any) => {
      console.log('[EventBased] Content changed (via event):', data.content);
    };
    editor.on('editor:content.change', contentChangeHandler);
    this._cleanup.push(() => editor.off('editor:content.change', contentChangeHandler));
    
    // Custom events
    const customHandler = (data: any) => {
      console.log('[EventBased] Custom event:', data);
    };
    editor.on('plugin:myPlugin.action', customHandler);
    this._cleanup.push(() => editor.off('plugin:myPlugin.action', customHandler));
  }
  
  onDestroy(_editor: Editor): void {
    // Cleanup event listeners
    this._cleanup.forEach(cleanup => cleanup());
    this._cleanup = [];
  }
}

// Convenience function
export function createEventBasedExtension(
  options?: EventBasedExtensionOptions
): EventBasedExtension {
  return new EventBasedExtension(options);
}
