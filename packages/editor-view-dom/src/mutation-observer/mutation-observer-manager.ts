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

  /**
   * The block the caret sits in — the only region a mutation may speak for.
   *
   * A keystroke makes the browser touch one text node. Our own render, in the
   * same tick, rewrites the sheets, the page furniture and the table of
   * contents: a measured 320 childList records against the caret's 1. Handing
   * that lot to the input handler makes it read our own output back as if the
   * user had typed it, which is where the second (`replaceText`) transaction
   * per keystroke came from. So the observer is scoped to the caret's block and
   * everything else is our own writing, by definition.
   *
   * Returns null when there is no caret to scope to (no selection yet, or a
   * selection outside the editor); the caller then falls back to the whole
   * batch rather than silently dropping input.
   */
  private caretRegion(root: HTMLElement): Element | null {
    const selection = window.getSelection();
    const focus = selection?.focusNode ?? selection?.anchorNode ?? null;
    if (!focus || !root.contains(focus)) return null;

    let element: Element | null =
      focus.nodeType === Node.TEXT_NODE ? focus.parentElement : (focus as Element);

    // Climb to the nearest identified block. `.w-text` and friends are inline
    // spans inside the paragraph; the paragraph is the unit of text editing.
    while (element && element !== root) {
      if (element.hasAttribute('data-bc-sid') && !this.isInline(element)) return element;
      element = element.parentElement;
    }
    return null;
  }

  private isInline(element: Element): boolean {
    const display = element.ownerDocument.defaultView?.getComputedStyle(element).display;
    return display === 'inline' || display === 'inline-block';
  }

  private inRegion(mutation: MutationRecord, region: Element): boolean {
    if (region.contains(mutation.target)) return true;
    // A text node the browser just detached is no longer under the region, so
    // ask the record where it was taken from instead.
    return mutation.type === 'childList' && region.contains(mutation.previousSibling ?? mutation.nextSibling ?? null);
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
    this.observer = new MutationObserver((records) => {
      const region = this.caretRegion(contentEditableElement);

      const view = (this.inputHandler as any).editorViewDOM;

      /**
       * During a burst of typing, a render's records are the render's own.
       *
       * They were meant to be turned away further down by content, on the
       * grounds that the DOM then says what the model says. Under load it does
       * not: records are delivered a batch at a time, so a batch describing the
       * page as it stood three characters ago arrives while the model holds all
       * four, reads as a difference, and is imported — writing the older text
       * back over the newer. Typed at a quarter speed, "abcd" came back as "a".
       *
       * Narrow on purpose. Skipping *every* model-driven record breaks the work
       * that legitimately depends on them — deleting text that a comment was
       * attached to stopped orphaning the comment — so this asks the narrower
       * question: are characters being typed one after another right now? Then
       * nothing else is writing to the DOM, and a record can only be ours.
       *
       * That question alone, and not "is a render still settling" as well. A
       * render's claim is released a task after it finishes, and under load the
       * records outlive it: one batch in eight arrived just after the release,
       * passed the guard, and wrote four characters back over ten. Which is the
       * whole reason the burst is the thing being asked about — it lasts as long
       * as the typing does, not as long as any one render.
       *
       * Composition is excluded from the other side: an IME writes to the DOM
       * itself and the view does not render underneath it, so there is no render
       * for its records to be confused with.
       */
      if (view?._isComposing !== true && (this.inputHandler as any).isTypingBurst === true) {
        logger.debug(LogCategory.TEXT_INPUT, 'MutationObserver callback: SKIP - mid-burst');
        return;
      }

      // No caret to scope to, and a render in flight: these are the renderer's
      // own, and there is nothing to compare them against. Letting them through
      // is not harmless — Replace moves the caret out of the text it rewrote, so
      // every record of that rewrite arrived unscoped and was read back as if
      // somebody had typed it, which cost the replacement one of its matches.
      if (!region && view?.isModelDrivenChange) {
        logger.debug(LogCategory.TEXT_INPUT, 'MutationObserver callback: SKIP - render output, no caret');
        return;
      }

      const mutations = region ? records.filter(m => this.inRegion(m, region)) : records;

      logger.debug(LogCategory.TEXT_INPUT, 'MutationObserver callback: mutations received', {
        seen: records.length,
        kept: mutations.length,
        scopedTo: region?.getAttribute('data-bc-sid') ?? '(unscoped)',
        types: mutations.map(m => m.type)
      });

      if (mutations.length === 0) return;

      for (const mutation of mutations) this.baseManager.handleMutation(mutation);

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
