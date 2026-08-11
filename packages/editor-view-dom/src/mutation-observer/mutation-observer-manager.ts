import { MutationObserverManager } from '../types';
import { Editor } from '@barocss/editor-core';
import { InputHandlerImpl } from '../event-handlers/input-handler';
import { MutationObserverManagerImpl as BaseMutationObserverManager } from '@barocss/dom-observer';
import { logger, LogCategory } from '@barocss/renderer-dom';

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
        logger.debug(LogCategory.TEXT_INPUT, 'onTextChange: CALLED', { oldText: event.oldText, newText: event.newText, targetNodeType: event.target.nodeType });
        
        // Note: handleDomMutations takes priority,
        // onTextChange is only used as fallback when handleDomMutations cannot handle it
        // Currently handleDomMutations handles all characterData changes,
        // so onTextChange is disabled or only performs minimal logging
        
        // handleDomMutations path is authoritative for text content changes.
        logger.debug(LogCategory.TEXT_INPUT, 'onTextChange: SKIP - handled by handleDomMutations');
      }
    });
  }

  setup(contentEditableElement: HTMLElement): void {
    // One observer on the element, with two consumers.
    //
    // There used to be two observers — this one and the base manager's, which
    // set up its own on the same element "for backward compatibility". Every
    // change was therefore delivered twice, down two different paths, and the
    // base manager's text handler had already been turned into a comment saying
    // the other path was the authoritative one. A second pair of eyes that has
    // been told not to look is a second pair of eyes.
    //
    // The base manager still classifies — it is what turns a raw record into
    // `editor:node.change` and `editor:node.update` — so it is handed the
    // records instead of collecting its own.
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) this.baseManager.handleMutation(mutation);
      logger.debug(LogCategory.TEXT_INPUT, 'MutationObserver callback: mutations received', {
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
          logger.debug(LogCategory.TEXT_INPUT, 'Processing batched mutations', {
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
