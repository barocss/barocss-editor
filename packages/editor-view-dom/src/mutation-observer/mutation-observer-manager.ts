import { MutationObserverManager } from '../types';
import { Editor } from '@barocss/editor-core';
import { InputHandlerImpl } from '../event-handlers/input-handler';
import { MutationObserverManagerImpl as BaseMutationObserverManager } from '@barocss/dom-observer';

export class MutationObserverManagerImpl implements MutationObserverManager {
  private editor: Editor;
  private inputHandler: InputHandlerImpl;
  private baseManager: BaseMutationObserverManager;
  private observer: MutationObserver | null = null;
  private pendingMutations: MutationRecord[] = [];
  private mutationTimer: number | null = null;

  constructor(editor: Editor, inputHandler: InputHandlerImpl) {
    this.editor = editor;
    this.inputHandler = inputHandler;
    this.baseManager = new BaseMutationObserverManager();
    
    // Set up event handlers
    this.baseManager.setEventHandlers({
      onStructureChange: (event) => {
        this.editor.emit('editor:node.change', event);
      },
      onNodeUpdate: (event) => {
        this.editor.emit('editor:node.update', event);
      },
      onTextChange: (event) => {
        console.log('[MO] onTextChange: CALLED', { oldText: event.oldText, newText: event.newText, targetNodeType: event.target.nodeType });
        
        // Note: handleDomMutations takes priority,
        // onTextChange is only used as fallback when handleDomMutations cannot handle it
        // Currently handleDomMutations handles all characterData changes,
        // so onTextChange is disabled or only performs minimal logging
        
        // TODO: This path can be removed once fully migrated to handleDomMutations
        console.log('[MO] onTextChange: SKIP - handled by handleDomMutations');
        
        // Existing logic is commented out (can be enabled as fallback if needed)
        /*
        // Only process changes to nodes same as current selection's anchorNode
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          console.log('[MO] onTextChange: SKIP - no selection');
          return;
        }
        
        const anchorNode = selection.anchorNode;
        if (!anchorNode) {
          console.log('[MO] onTextChange: SKIP - no anchorNode');
          return;
        }
        
        // Only process when event.target equals selection.anchorNode
        if (event.target !== anchorNode) {
          console.log('[MO] onTextChange: SKIP - target !== anchorNode', { 
            targetNodeType: event.target.nodeType,
            anchorNodeType: anchorNode.nodeType,
            targetIsSame: event.target === anchorNode
          });
          return;
        }
        
        console.log('[MO] onTextChange: PROCESSING - calling handleTextContentChange');
        await this.inputHandler.handleTextContentChange(event.oldText, event.newText, event.target);
        */
      }
    });
  }

  setup(contentEditableElement: HTMLElement): void {
    // Also set up BaseMutationObserverManager (maintain backward compatibility)
    this.baseManager.setup(contentEditableElement);

    // Set up MutationObserver directly for handleDomMutations
    this.observer = new MutationObserver((mutations) => {
      console.log('[MO] MutationObserver callback: mutations received', {
        count: mutations.length,
        types: mutations.map(m => m.type)
      });

      // Collect mutations in batch
      this.pendingMutations.push(...mutations);

      // Process in batch after short delay (collect all mutations in same event loop)
      if (this.mutationTimer) {
        clearTimeout(this.mutationTimer);
      }

      this.mutationTimer = window.setTimeout(() => {
        if (this.pendingMutations.length > 0) {
          console.log('[MO] Processing batched mutations', {
            count: this.pendingMutations.length
          });

          // Call handleDomMutations
          if (this.inputHandler.handleDomMutations) {
            this.inputHandler.handleDomMutations([...this.pendingMutations]);
          }

          this.pendingMutations = [];
        }
        this.mutationTimer = null;
      }, 0);
    });

    // Set MutationObserver options
    this.observer.observe(contentEditableElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-bc-edit', 'data-bc-value', 'data-bc-sid', 'data-bc-stype'],
      characterDataOldValue: true,
      attributeOldValue: true
    });
  }

  disconnect(): void {
    this.baseManager.disconnect();
    
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.mutationTimer) {
      clearTimeout(this.mutationTimer);
      this.mutationTimer = null;
    }

    this.pendingMutations = [];
  }

  handleMutation(mutation: MutationRecord): void {
    this.baseManager.handleMutation(mutation);
  }
}
