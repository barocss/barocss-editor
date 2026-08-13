import { InputHandler, IEditorViewDOM } from '../types';
import { Editor, type ModelSelection } from '@barocss/editor-core';
import { handleEfficientEdit } from '../utils/efficient-edit-handler';
import { type MarkRange, type DecoratorRange } from '../utils/edit-position-converter';
import { classifyDomChange, type ClassifiedChange, type InputHint } from '../dom-sync/dom-change-classifier';
import { analyzeTextChanges } from '@barocss/text-analyzer';
import { type Decorator, getKeyString, isTypingKey, FILLER_ATTR, stripFiller } from '@barocss/shared';
import { logger, LogCategory } from '@barocss/renderer-dom';

/**
 * What each delete intent means, as a command.
 *
 * Cut and drag always carry a selection, so they are an ordinary range delete —
 * which is what `backspace` does when the selection is not collapsed.
 */
const DELETE_COMMANDS: Record<string, string> = {
  deleteContentBackward: 'backspace',
  deleteContentForward: 'deleteForward',
  deleteWordBackward: 'deleteWordBackward',
  deleteWordForward: 'deleteWordForward',
  deleteByCut: 'backspace',
  deleteByDrag: 'backspace'
};

/**
 * Input processing debug information (for Devtool)
 * Uses the same structure as LastInputDebug in editor-view-dom
 */
interface LastInputDebug {
  case: 'text-in-one-run' | 'text-across-runs' | 'block-structure' | 'inline-markup' | 'ime-intermediate' | 'unknown';
  inputType?: string;
  usedInputHint?: boolean;
  inputHintRange?: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
  classifiedContentRange?: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
  appliedContentRange?: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
  modelSelectionAtInput?: any;
  timestamp: number;
  status?: 'ok' | 'mismatch' | 'skipped';
  notes?: string[];
}

export class InputHandlerImpl implements InputHandler {
  private editor: Editor;
  private editorViewDOM: IEditorViewDOM;
  private activeTextNodeId: string | null = null;
  /**
   * Insert Range hint collected at beforeinput stage
   * - For insertText / insertFromPaste / insertReplacementText, etc.,
   *   estimates contentRange based on DOM selection and inputType.
   * - Used for contentRange correction in dom-change-classifier (text-in-one-run and text-across-runs).
   */
  private _pendingInsertHint: InputHint | null = null;
  private _contentChangeTxSeq = 0;

  /**
   * Where the next character of a burst goes.
   *
   * `getTargetRanges` describes the DOM as it stands, and typing is applied
   * model-first: the browser's own edit is prevented, a transaction commits, the
   * render rewrites the text node and the caret is restored after it. A burst
   * outruns that — measured with the CPU at an eighth speed, the offsets
   * reported for successive keystrokes went 23, 24, 24, 25, 27 while the text
   * grew by one each time, so two characters were written to the same place and
   * one to a place two along.
   *
   * This is the position the last accepted keystroke leaves the caret at,
   * advanced as each one is accepted rather than as each one lands. It is used
   * only when the DOM is demonstrably behind it; see the beforeinput handler.
   */
  private _burstCaret: { nodeId: string; offset: number; at: number } | null = null;

  constructor(editor: Editor, editorViewDOM: IEditorViewDOM) {
    this.editor = editor;
    this.editorViewDOM = editorViewDOM;
    // Track active node after DOM selection is applied
    (this.editor as any).on('editor:selection.dom.applied', (e: any) => {
      this.activeTextNodeId = e?.activeNodeId || null;
    });
  }

  private _buildDebugTransaction(operations: any[] = [], description?: string) {
    return {
      sid: `tx-viewdom-${Date.now()}-${++this._contentChangeTxSeq}`,
      timestamp: new Date(),
      operations,
      description
    };
  }

  private getDecoratorsFromView(): DecoratorRange[] {
    const source = (this.editor as any).getDecorators?.() ?? (this.editorViewDOM as any).getDecorators?.();
    if (!Array.isArray(source)) {
      return [];
    }

    return source
      .filter((item: any): item is DecoratorRange => {
        return Boolean(
          item &&
          typeof item.sid === 'string' &&
          item.target &&
          typeof item.target.sid === 'string' &&
          typeof item.target.startOffset === 'number' &&
          typeof item.target.endOffset === 'number' &&
          typeof item.stype === 'string' &&
          ['inline', 'block', 'layer'].includes(item.category)
        );
      })
      .map((item: DecoratorRange) => item);
  }

  private isSameDecoratorRange(a: DecoratorRange, b: DecoratorRange): boolean {
    return (
      a.sid === b.sid &&
      a.stype === b.stype &&
      a.category === b.category &&
      a.target.sid === b.target.sid &&
      a.target.startOffset === b.target.startOffset &&
      a.target.endOffset === b.target.endOffset
    );
  }

  private toDecoratorUpdate(decorator: DecoratorRange): Partial<Decorator> {
    return {
      stype: decorator.stype,
      category: decorator.category,
      target: {
        sid: decorator.target.sid,
        startOffset: decorator.target.startOffset,
        endOffset: decorator.target.endOffset
      }
    };
  }

  private syncDecorators(previous: DecoratorRange[], next: DecoratorRange[]): void {
    const previousById = new Map(previous.map((decorator) => [decorator.sid, decorator]));
    const nextById = new Map(next.map((decorator) => [decorator.sid, decorator]));

    const updateDecorator = (this.editorViewDOM as any).updateDecorator;
    if (typeof updateDecorator === 'function') {
      for (const [sid, updatedDecorator] of nextById) {
        const currentDecorator = previousById.get(sid);
        if (!currentDecorator) {
          // New decorators are not expected from efficient edit adjustment; ignore safely.
          continue;
        }
        if (this.isSameDecoratorRange(currentDecorator, updatedDecorator)) {
          continue;
        }

        try {
          const ok = updateDecorator.call(this.editorViewDOM, sid, this.toDecoratorUpdate(updatedDecorator));
          if (!ok) {
            this.editor.emit('editor:input.debug', {
              type: 'updateDecorator_failed',
              sid,
              updatedDecorator
            });
          }
        } catch (error) {
          console.warn('[Input] handleTextContentChange: updateDecorator failed', { sid, error });
        }
      }
    }

    const removeDecorator = (this.editorViewDOM as any).removeDecorator;
    if (typeof removeDecorator === 'function') {
      for (const [sid] of previousById) {
        if (nextById.has(sid)) {
          continue;
        }
        try {
          const ok = removeDecorator.call(this.editorViewDOM, sid);
          if (!ok) {
            this.editor.emit('editor:input.debug', {
              type: 'removeDecorator_failed',
              sid
            });
          }
        } catch (error) {
          console.warn('[Input] handleTextContentChange: removeDecorator failed', { sid, error });
        }
      }
    }
  }

  handleInput(event: InputEvent): void {
    // input event is only used for logging
    // Actual changes are handled by MutationObserver
    this.editor.emit('editor:input.detected', {
      inputType: event.inputType,
      data: event.data,
      target: event.target
    });
  }

  // composition event handler removed
  // Track IME composition state using isComposing property of beforeinput event
  // Actual processing is handled by MutationObserver

  /**
   * Handle keydown event
   * 
   * Current structure:
   * - Actual shortcut handling is done via KeymapManager in EditorViewDOM.handleKeydown
   * - This method only logs debug info, actual processing is done in EditorViewDOM
   * 
   * Future plans:
   * - When KeyBindingManager is introduced, shortcut handling logic can be moved to this method
   * - Currently uses KeymapManager (KeyBindingManager in docs is a future expansion plan)
   */
  /**
   * The caret was moved by the reader rather than by their typing.
   *
   * A click, an arrow key, Home, Enter: after any of them the DOM is the only
   * thing that knows where the caret is, so what was remembered about where a
   * burst had reached has to go. Without this a click a few characters back into
   * the same run, moments after typing, would look exactly like the DOM lagging
   * behind — and the next character would be written where the burst ended
   * instead of where the reader put the caret.
   */
  caretMovedByUser(): void {
    this._burstCaret = null;
  }

  /**
   * Whether characters are still being typed one after another.
   *
   * True from the first character of a burst until something moves the caret
   * that is not another character. The observer uses it to tell its own renders
   * apart from a reader's edits: during a burst there is no other writer, and a
   * batch of records that arrives then describes a page the model has already
   * moved past.
   */
  get isTypingBurst(): boolean {
    return this._burstCaret !== null;
  }

  handleKeyDown(event: KeyboardEvent): void {
    const key = event.key;

    // Anything that is not a character being typed moves the caret or changes
    // the shape of the text around it.
    if (!isTypingKey(event)) {
      this.caretMovedByUser();
    }
    const code = event.code;
    const ctrlKey = event.ctrlKey;
    const metaKey = event.metaKey;
    const shiftKey = event.shiftKey;
    const altKey = event.altKey;
    
    logger.debug(LogCategory.TEXT_INPUT, 'handleKeyDown: CALLED', {
      key,
      code,
      ctrlKey,
      metaKey,
      shiftKey,
      altKey,
      // Generate key string (for future use in KeyBindingManager)
      keyString: getKeyString(event)
    });
    
    // Kept as-is because command shortcuts are currently routed through keymapManager in EditorViewDOM.handleKeydown.
  }


  /**
   * Handle DOM changes (called from MutationObserver)
   * Receives MutationRecord[] and calls case classification module (dom-change-classifier)
   */
  async handleDomMutations(mutations: MutationRecord[]): Promise<void> {
    logger.debug(LogCategory.TEXT_INPUT, 'handleDomMutations: CALLED', {
      mutationsCount: mutations.length,
      mutations: mutations.map(m => ({
        type: m.type,
        target: m.target,
        addedNodes: m.addedNodes.length,
        removedNodes: m.removedNodes.length,
        attributeName: m.attributeName,
        oldValue: m.oldValue
      }))
    });

    // Scoping to the caret is the observer's job and is done before these
    // arrive — there used to be a second, narrower version of it here, which
    // stopped at the nearest element with an id (an inline span) rather than at
    // the block, so a change that crossed a mark boundary inside the caret's own
    // paragraph was judged to be somewhere else. One rule, in one place.
    //
    // A render's own output is turned away further down, by content: if the DOM
    // already says what the model says, there is nothing to import. Judging it by
    // timing instead does not work here — this runs from a batching timeout, by
    // which time the render that produced the records has finished and any
    // `_isRendering` flag reads false.
    //
    // Draining the observer at the end of each render *would* catch it by timing,
    // and was tried: it also throws away the records the base manager turns into
    // `editor:node.change`, which is how a comment finds out the text it was
    // attached to has gone. The orphaned-comment test failed one run in five.
    // Content is the safe discriminator; timing is not.

    // Classify DOM changes
    const selection = window.getSelection();
    
    // Convert DOM selection to model selection (used in text-across-runs/block-structure/inline-markup)
    let modelSelection: any = null;
    if (selection && selection.rangeCount > 0) {
      try {
        // Use EditorViewDOM's convertDOMSelectionToModel
        modelSelection = (this.editorViewDOM as any).convertDOMSelectionToModel?.(selection);
        logger.debug(LogCategory.TEXT_INPUT, 'handleDomMutations: model selection converted', {
          modelSelection: modelSelection?.type === 'range' ? {
            startNodeId: modelSelection.startNodeId,
            startOffset: modelSelection.startOffset,
            endNodeId: modelSelection.endNodeId,
            endOffset: modelSelection.endOffset,
            collapsed: modelSelection.collapsed
          } : modelSelection
        });
      } catch (error) {
        console.warn('[InputHandler] handleDomMutations: failed to convert selection', { error });
      }
    }

    // Check if IME composition is in progress (use EditorViewDOM state)
    const isComposing =
      (this.editorViewDOM as any)._isComposing === true;

    // Validate Insert Range hint collected from beforeinput
    const inputHint = this.getValidInsertHint(isComposing);

    // Include model selection information in ClassifyOptions
    const modelSelectionInfo: ModelSelection | undefined = modelSelection && modelSelection.type === 'range' ? {
      type: 'range',
      startNodeId: modelSelection.startNodeId,
      startOffset: modelSelection.startOffset,
      endNodeId: modelSelection.endNodeId,
      endOffset: modelSelection.endOffset,
      collapsed: modelSelection.collapsed
    } : undefined;

    const classified = classifyDomChange(mutations, {
      editor: this.editor,
      selection: selection || undefined,
      modelSelection: modelSelectionInfo,
      inputHint: inputHint || undefined,
      isComposing
    });

    logger.debug(LogCategory.TEXT_INPUT, 'handleDomMutations: classified', {
      case: classified.case,
      nodeId: classified.nodeId
    });

    // Our own render is not input. A keystroke goes model-first through
    // beforeinput, we render the result, and the render writes the caret's text
    // node — a characterData record at exactly the place we refuse to filter by
    // position, because that is where typing happens. Judge it by content
    // instead: if the DOM already says what the model says, there is nothing to
    // import. Measured in the browser, this is what removed the second
    // (`replaceText`) transaction every keystroke was producing.
    if (this._alreadyInModel(classified)) {
      logger.debug(LogCategory.TEXT_INPUT, 'handleDomMutations: SKIP - DOM already matches the model', {
        nodeId: classified.nodeId
      });
      return;
    }


    // Handle by case
    switch (classified.case) {
      case 'text-in-one-run':
        await this.handleTextInOneRun(classified);
        break;
      case 'text-across-runs':
        await this.handleTextAcrossRuns(classified);
        break;
      case 'block-structure':
        this.handleBlockStructure(classified);
        break;
      case 'inline-markup':
      case 'auto-correct':
      case 'auto-link':
      case 'drag-and-drop':
        this.handleInlineMarkup(classified);
        break;
      case 'unknown':
        console.warn('[InputHandler] handleDomMutations: unknown case', { mutations });
        break;
    }
  }


  /**
   * True when the classified change carries no information the model lacks.
   *
   * Only text cases are judged — a structural change has no single text to
   * compare, and an unknown case must stay loud rather than be swallowed here.
   */
  private _alreadyInModel(classified: ClassifiedChange): boolean {
    if (classified.case !== 'text-in-one-run' && classified.case !== 'text-across-runs') return false;
    if (!classified.nodeId || classified.newText == null) return false;

    const modelNode = (this.editor as any).dataStore?.getNode(classified.nodeId);
    if (!modelNode || modelNode.stype !== 'inline-text') return false;

    return (modelNode.text ?? '') === classified.newText;
  }

  /**
   * text-in-one-run: Handle pure text changes within a single inline-text
   */
  private async handleTextInOneRun(classified: ClassifiedChange): Promise<void> {
    logger.debug(LogCategory.TEXT_INPUT, 'handleTextInOneRun: CALLED', { nodeId: classified.nodeId });

    // NOTE: '' is a legitimate value here (typing into the empty block a fresh
    // Enter creates, or deleting the last character), so this falsy check is
    // wrong in principle. It is kept deliberately: relaxing it makes IME
    // composition into an empty block sync a DOM that still holds the browser's
    // own text node next to our rendered span — the reconciler only removes
    // stale *elements* carrying data-bc-sid, never untracked bare text nodes —
    // so each sync re-reads both and the composed syllable multiplies.
    // Non-IME typing into an empty block is unaffected: it goes model-first via
    // beforeinput/getTargetRanges, not through this path.
    // Fix the untracked-child cleanup in the reconciler before relaxing this.
    if (classified.nodeId == null || classified.prevText == null || classified.newText == null) {
      console.error('[InputHandler] handleTextInOneRun: missing required data', classified);
      return;
    }

    // Analyze text diff.
    // analyzeTextChanges works in MODEL coordinates (prevText/newText are the
    // filler-stripped model text), so the hint must be a model offset too. A raw
    // DOM offset is off by the filler length in an empty block, which makes the
    // diff pick the wrong edit position and leaves a stray character behind.
    const selection = window.getSelection();
    let selectionOffset = 0;
    if (selection && selection.rangeCount > 0) {
      try {
        const modelSel = this.editorViewDOM.convertDOMSelectionToModel?.(selection);
        selectionOffset = modelSel && modelSel.type === 'range'
          ? modelSel.startOffset
          : selection.getRangeAt(0).startOffset;
      } catch {
        selectionOffset = selection.getRangeAt(0).startOffset;
      }
    }

    const textChanges = analyzeTextChanges({
      oldText: classified.prevText,
      newText: classified.newText,
      selectionOffset,
      selectionLength: 0
    });

    if (textChanges.length === 0) {
      logger.debug(LogCategory.TEXT_INPUT, 'handleTextInOneRun: SKIP - no text changes');
      return;
    }

    // Process only the first change (text-in-one-run typically has only one change)
    const change = textChanges[0];
    logger.debug(LogCategory.TEXT_INPUT, 'handleTextInOneRun: text change', {
      type: change.type,
      start: change.start,
      end: change.end,
      text: change.text,
      confidence: change.confidence
    });

    // DataStore operation
    const dataStore = (this.editor as any).dataStore;
    if (!dataStore) {
      console.error('[InputHandler] handleTextInOneRun: dataStore not found');
      return;
    }

    // Determine contentRange
    // Priority 1: Use classified.contentRange if InputHint exists
    // Priority 2: Use analyzeTextChanges result (always accurate)
    let contentRange;
    if (classified.contentRange && classified.metadata?.usedInputHint) {
      // classified.contentRange is more accurate when InputHint is used
      contentRange = classified.contentRange;
      logger.debug(LogCategory.TEXT_INPUT, 'handleTextInOneRun: using classified.contentRange (InputHint)', contentRange);
    } else {
      // Use analyzeTextChanges result (when InputHint is not available or inaccurate)
      // analyzeTextChanges compares prevText and newText to calculate accurate change position
      contentRange = {
        startNodeId: classified.nodeId,
        startOffset: change.start,
        endNodeId: classified.nodeId,
        endOffset: change.end
      };
      logger.debug(LogCategory.TEXT_INPUT, 'handleTextInOneRun: using analyzeTextChanges result', {
        contentRange,
        changeType: change.type,
        changeText: change.text,
        prevTextLength: classified.prevText.length,
        newTextLength: classified.newText.length
      });
    }

    try {
      // Delete cases should be handled Model-First in beforeinput
      // However, during IME composition, browser default behavior is allowed, so MutationObserver can detect it
      // Handle as fallback in this case (with warning log)
      if (change.type === 'delete') {
        console.warn('[InputHandler] handleTextInOneRun: DELETE detected via MutationObserver (should be handled by beforeinput)', {
          contentRange,
          note: 'This may be an IME composition case or beforeinput was not triggered'
        });

        // Fallback handling when IME composition is in progress or beforeinput was not triggered
        // Changed to command call
        try {
          // Check if single node deletion
          if (contentRange.startNodeId === contentRange.endNodeId) {
            const success = await this.editor.executeCommand('deleteText', { range: contentRange });
            if (!success) {
              console.warn('[InputHandler] handleTextInOneRun: fallback deleteText command failed', { contentRange });
              return;
            }
          } else {
            // Cross-node deletion
            const success = await this.editor.executeCommand('deleteCrossNode', { range: contentRange });
            if (!success) {
              console.warn('[InputHandler] handleTextInOneRun: fallback deleteCrossNode command failed', { contentRange });
              return;
            }
          }
        } catch (error) {
          console.error('[InputHandler] handleTextInOneRun: fallback delete command execution failed', { error, contentRange });
          return;
        }

        // Calculate selection based on model after deletion
        const modelSelection = {
          type: 'range' as const,
          startNodeId: contentRange.startNodeId,
          startOffset: contentRange.startOffset,
          endNodeId: contentRange.startNodeId,
          endOffset: contentRange.startOffset,
          collapsed: true
        };

        // Convert model selection to DOM selection and apply
        try {
          (this.editorViewDOM as any).convertModelSelectionToDOM?.(modelSelection);
          this.editor.emit('editor:selection.change', {
            selection: modelSelection,
            oldSelection: (this.editor as any).selection || null
          });
          logger.debug(LogCategory.TEXT_INPUT, 'handleTextInOneRun: fallback delete completed', modelSelection);
        } catch (error) {
          console.warn('[InputHandler] handleTextInOneRun: failed to update selection after fallback delete', { error });
        }
      } else {
        logger.debug(LogCategory.TEXT_INPUT, 'handleTextInOneRun: calling replaceText command', {
          contentRange,
          insertedText: change.text
        });

        // Call command
        try {
          const success = await this.editor.executeCommand('replaceText', {
            range: contentRange,
            text: change.text
          });
          
          if (!success) {
            console.warn('[InputHandler] handleTextInOneRun: replaceText command failed', { contentRange, text: change.text });
            return;
          }
        } catch (error) {
          console.error('[InputHandler] handleTextInOneRun: replaceText command execution failed', { error, contentRange, text: change.text });
          return;
        }

        // Calculate selection based on model after insert/replace
        // Move selection to end position of inserted text
        const insertedLength = change.text?.length || 0;
        const modelSelection = {
          type: 'range' as const,
          startNodeId: contentRange.startNodeId,
          startOffset: contentRange.startOffset + insertedLength,
          endNodeId: contentRange.startNodeId,
          endOffset: contentRange.startOffset + insertedLength,
          collapsed: true
        };

        // Convert model selection to DOM selection and apply
        try {
          (this.editorViewDOM as any).convertModelSelectionToDOM?.(modelSelection);
          // Also update model selection
          this.editor.emit('editor:selection.change', {
            selection: modelSelection,
            oldSelection: (this.editor as any).selection || null
          });
          logger.debug(LogCategory.TEXT_INPUT, 'handleTextInOneRun: updated selection after replace (model-based)', modelSelection);
        } catch (error) {
          console.warn('[InputHandler] handleTextInOneRun: failed to update selection after replace', { error });
        }
      }

      // Create LastInputDebug object
      const inputDebug: LastInputDebug = {
        case: 'text-in-one-run',
        inputType: this._pendingInsertHint?.inputType,
        usedInputHint: classified.metadata?.usedInputHint === true,
        inputHintRange: this._pendingInsertHint?.contentRange,
        classifiedContentRange: classified.contentRange,
        appliedContentRange: contentRange,
        timestamp: Date.now(),
        status: 'ok',
        notes: []
      };

      // Rule validation: compare classifiedContentRange and appliedContentRange
      if (classified.contentRange) {
        const classifiedRange = classified.contentRange;
        if (classifiedRange.startNodeId !== contentRange.startNodeId ||
            classifiedRange.startOffset !== contentRange.startOffset ||
            classifiedRange.endNodeId !== contentRange.endNodeId ||
            classifiedRange.endOffset !== contentRange.endOffset) {
          inputDebug.status = 'mismatch';
          inputDebug.notes?.push(
            `Range mismatch: classified [${classifiedRange.startNodeId}:${classifiedRange.startOffset}-${classifiedRange.endNodeId}:${classifiedRange.endOffset}] vs applied [${contentRange.startNodeId}:${contentRange.startOffset}-${contentRange.endNodeId}:${contentRange.endOffset}]`
          );
        }
      }

      // The `replaceText` command above has already announced its transaction.
      // Saying it again as a second content.change made every listener — the
      // toolbar recomputes each control over the document on that event — run
      // twice for one composed syllable. What is genuinely ours to report is the
      // debug record, so that goes out under its own name.
      this.editor.emit('editor:input.debug', { from: 'MutationObserver-text-in-one-run', inputDebug });

      // Also store in editor instance (for access from Devtool)
      (this.editor as any).__lastInputDebug = inputDebug;

      // Text change was successfully applied in text-in-one-run, so clear Insert Hint
      this._pendingInsertHint = null;
    } catch (error) {
      console.error('[InputHandler] handleTextInOneRun: failed to replace text', { error, contentRange });
    }
  }

  /**
   * text-across-runs: 여러 inline-text에 걸친 텍스트 변경 처리
   */
  private async handleTextAcrossRuns(classified: ClassifiedChange): Promise<void> {
    // Converted only if a listener reads it — see the transaction's own emit.
    const editorForPayload = this.editor;
    logger.debug(LogCategory.TEXT_INPUT, 'handleTextAcrossRuns: CALLED', {
      startNodeId: classified.contentRange?.startNodeId,
      endNodeId: classified.contentRange?.endNodeId,
      metadata: classified.metadata
    });

    if (!classified.contentRange || !classified.newText) {
      console.error('[InputHandler] handleTextAcrossRuns: missing required data', classified);
      return;
    }

    // Handle range spanning multiple nodes
    const contentRange = classified.contentRange;
    const { startNodeId, endNodeId } = contentRange;
    const isMultiNode = startNodeId !== endNodeId;

    logger.debug(LogCategory.TEXT_INPUT, 'handleTextAcrossRuns: processing', {
      isMultiNode,
      startNodeId,
      endNodeId,
      startOffset: contentRange.startOffset,
      endOffset: contentRange.endOffset,
      prevTextLength: classified.prevText?.length || 0,
      newTextLength: classified.newText.length
    });

    // DataStore operation
    const dataStore = (this.editor as any).dataStore;
    if (!dataStore) {
      console.error('[InputHandler] handleTextAcrossRuns: dataStore not found');
      return;
    }

    // replaceText automatically handles cases spanning multiple nodes
    // (processed internally as deleteText + insertText)
    // Single node cases can also be handled with replaceText

    try {
      // Handle range spanning multiple nodes with replaceText
      // replaceText automatically handles multi-node cases (deleteText + insertText)
      logger.debug(LogCategory.TEXT_INPUT, 'handleTextAcrossRuns: calling replaceText command', {
        contentRange,
        newText: classified.newText,
        isMultiNode
      });

      // Call command
      try {
        const success = await this.editor.executeCommand('replaceText', {
          range: contentRange,
          text: classified.newText
        });
        
        if (!success) {
          console.warn('[InputHandler] handleTextAcrossRuns: replaceText command failed', { 
            contentRange, 
            text: classified.newText 
          });
          return;
        }
      } catch (error) {
        console.error('[InputHandler] handleTextAcrossRuns: replaceText command execution failed', { 
          error, 
          contentRange, 
          text: classified.newText 
        });
        return;
      }

      // Create LastInputDebug object
      const inputDebug: LastInputDebug = {
        case: 'text-across-runs',
        inputType: this._pendingInsertHint?.inputType,
        usedInputHint: classified.metadata?.usedInputHint === true,
        inputHintRange: this._pendingInsertHint?.contentRange,
        classifiedContentRange: classified.contentRange,
        appliedContentRange: contentRange,
        timestamp: Date.now(),
        status: 'ok',
        notes: []
      };

      // Rule validation: compare classifiedContentRange and appliedContentRange
      if (classified.contentRange) {
        const classifiedRange = classified.contentRange;
        if (classifiedRange.startNodeId !== contentRange.startNodeId ||
            classifiedRange.startOffset !== contentRange.startOffset ||
            classifiedRange.endNodeId !== contentRange.endNodeId ||
            classifiedRange.endOffset !== contentRange.endOffset) {
          inputDebug.status = 'mismatch';
          inputDebug.notes?.push(
            `Range mismatch: classified [${classifiedRange.startNodeId}:${classifiedRange.startOffset}-${classifiedRange.endNodeId}:${classifiedRange.endOffset}] vs applied [${contentRange.startNodeId}:${contentRange.startOffset}-${contentRange.endNodeId}:${contentRange.endOffset}]`
          );
        }
      }

      // Emit editor:content.change event (skipRender: true)
      this.editor.emit('editor:content.change', {
        skipRender: true,
        from: 'MutationObserver-text-across-runs',
        get content() { return (editorForPayload as any).document; },
        transaction: this._buildDebugTransaction([
          {
            type: 'replaceText',
            payload: {
              range: {
                startNodeId,
                startOffset: contentRange.startOffset,
                endNodeId,
                endOffset: contentRange.endOffset
              },
              newText: ''
            }
          }
        ], 'MutationObserver-text-across-runs'),
        inputDebug
      });

      // Also store in editor instance (for access from Devtool)
      (this.editor as any).__lastInputDebug = inputDebug;

      // Text change was successfully applied in text-across-runs, so clear Insert Hint
      this._pendingInsertHint = null;
    } catch (error) {
      console.error('[InputHandler] handleTextAcrossRuns: failed to replace text', { error, contentRange });
    }
  }

  /**
   * block-structure: 블록 구조 변경 처리
   * 
   * 원칙: 구조 변경은 beforeinput에서 처리하지만,
   * 브라우저/플랫폼 차이로 beforeinput이 오지 않은 경우를 대비
   */
  private async handleBlockStructure(classified: ClassifiedChange): Promise<void> {
    // Converted only if a listener reads it — see the transaction's own emit.
    const editorForPayload = this.editor;
    logger.debug(LogCategory.TEXT_INPUT, 'handleBlockStructure: CALLED', {
      pattern: classified.metadata?.pattern,
      command: classified.metadata?.command,
      affectedNodes: classified.metadata?.affectedNodeIds
    });

    // Reinterpret as command if possible
    const command = classified.metadata?.command;
    if (command) {
      logger.debug(LogCategory.TEXT_INPUT, 'handleBlockStructure: executing command', { command });
      try {
        this.editor.executeCommand(command);
        
        // Create LastInputDebug object
        const inputDebug: LastInputDebug = {
          case: 'block-structure',
          inputType: this._pendingInsertHint?.inputType,
          usedInputHint: false, // block-structure is structure change, so InputHint is not used
          inputHintRange: this._pendingInsertHint?.contentRange,
          classifiedContentRange: classified.contentRange,
          timestamp: Date.now(),
          status: 'ok',
          notes: [`Command executed: ${command}`]
        };

        // Ignore DOM created by browser and re-render with command result
        this.editor.emit('editor:content.change', {
          skipRender: false, // render needed
          from: 'MutationObserver-block-structure-command',
          get content() { return (editorForPayload as any).document; },
          transaction: this._buildDebugTransaction([], `MutationObserver-block-structure command:${command}`),
          inputDebug
        });

        // Also store in editor instance (for Devtool access)
        (this.editor as any).__lastInputDebug = inputDebug;

        // Clear Insert Hint since structure change command was executed in block-structure
        this._pendingInsertHint = null;
        return;
      } catch (error) {
        console.error('[InputHandler] handleBlockStructure: command execution failed', { command, error });
        // proceed with fallback
      }
    }

    // When cannot be expressed as command: fallback policy
    // Safely process by extracting only allowed text/inline
    logger.debug(LogCategory.TEXT_INPUT, 'handleBlockStructure: using fallback policy');
    
    // Fallback policy:
    // 1. Ignore DOM structure created by browser
    // 2. Extract only text and insert at current selection position
    // 3. Maintain block structure according to model rules (do not change)
    
    const dataStore = (this.editor as any).dataStore;
    if (!dataStore) {
      console.error('[InputHandler] handleBlockStructure: dataStore not found');
      return;
    }
    
    // Extract changed text from DOM (simple fallback)
    // Actually need more sophisticated text extraction logic,
    // but for now use classified.newText if available
    if (classified.newText && classified.contentRange) {
      try {
        // Safely insert text only (maintain block structure)
        // Insert text at start position of contentRange
        const insertRange = {
          startNodeId: classified.contentRange.startNodeId,
          startOffset: classified.contentRange.startOffset,
          endNodeId: classified.contentRange.startNodeId,
          endOffset: classified.contentRange.startOffset
        };
        
        logger.debug(LogCategory.TEXT_INPUT, 'handleBlockStructure: fallback - inserting text only', {
          insertRange,
          text: classified.newText
        });
        
        // Changed to command call
        try {
          const success = await this.editor.executeCommand('replaceText', {
            range: insertRange,
            text: classified.newText
          });
          
          if (!success) {
            console.warn('[InputHandler] handleBlockStructure: fallback replaceText command failed', { 
              insertRange, 
              text: classified.newText 
            });
            return;
          }
        } catch (error) {
          console.error('[InputHandler] handleBlockStructure: fallback replaceText command execution failed', { 
            error, 
            insertRange, 
            text: classified.newText 
          });
          return;
        }
        
        // Create LastInputDebug object
        const inputDebug: LastInputDebug = {
          case: 'block-structure',
          inputType: this._pendingInsertHint?.inputType,
          usedInputHint: false,
          inputHintRange: this._pendingInsertHint?.contentRange,
          classifiedContentRange: classified.contentRange,
          appliedContentRange: insertRange,
          timestamp: Date.now(),
          status: 'ok',
          notes: ['Fallback policy: text only inserted, block structure preserved']
        };
        
        // Ignore DOM created by browser and re-render with fallback result
        this.editor.emit('editor:content.change', {
          skipRender: false, // render needed
          from: 'MutationObserver-block-structure-fallback',
          get content() { return (editorForPayload as any).document; },
          transaction: this._buildDebugTransaction([
            {
              type: 'replaceText',
              payload: {
                range: {
                  startNodeId: insertRange.startNodeId,
                  startOffset: insertRange.startOffset,
                  endNodeId: insertRange.endNodeId,
                  endOffset: insertRange.endOffset
                },
                newText: classified.newText
              }
            }
          ], 'MutationObserver-block-structure-fallback'),
          inputDebug
        });
        
        // Also store in editor instance (for Devtool access)
        (this.editor as any).__lastInputDebug = inputDebug;
        
        // Clear Insert Hint since fallback was executed in block-structure
        this._pendingInsertHint = null;
      } catch (error) {
        console.error('[InputHandler] handleBlockStructure: fallback failed', { error, classified });
      }
    } else {
      console.warn('[InputHandler] handleBlockStructure: fallback - insufficient data', { 
        hasNewText: !!classified.newText,
        hasContentRange: !!classified.contentRange
      });
    }
  }

  /**
   * inline-markup: Handle mark/style/decorator changes
   * 
   * Convert styles/tags directly created by browser to model marks
   */
  private handleInlineMarkup(classified: ClassifiedChange): void {
    // Converted only if a listener reads it — see the transaction's own emit.
    const editorForPayload = this.editor;
    logger.debug(LogCategory.TEXT_INPUT, 'handleInlineMarkup: CALLED', {
      markChanges: classified.metadata?.markChanges,
      specialCase: classified.metadata?.specialCase
    });

    const markChanges = classified.metadata?.markChanges as Array<{
      nodeId: string;
      markType: string;
      range?: [number, number];
    }> | undefined;

    if (!markChanges || markChanges.length === 0) {
      logger.debug(LogCategory.TEXT_INPUT, 'handleInlineMarkup: SKIP - no mark changes');
      return;
    }

    const dataStore = (this.editor as any).dataStore;
    if (!dataStore) {
      console.error('[InputHandler] handleInlineMarkup: dataStore not found');
      return;
    }

    // Handle each mark change
    for (const change of markChanges) {
      try {
        const { nodeId, markType } = change;
        
        // Check model node
        const modelNode = dataStore.getNode(nodeId);
        if (!modelNode || modelNode.stype !== 'inline-text') {
          logger.debug(LogCategory.TEXT_INPUT, 'handleInlineMarkup: SKIP - not inline-text node', { nodeId });
          continue;
        }

        // Get selection range (use full text if not available)
        const selection = window.getSelection();
        let startOffset = 0;
        let endOffset = modelNode.text?.length || 0;

        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
          // Use selection range if available
          // Use runtime offsets from current selection as-is for now.
        } else if (change.range) {
          // Use range from metadata if available
          [startOffset, endOffset] = change.range;
        }

        const contentRange = {
          startNodeId: nodeId,
          startOffset,
          endNodeId: nodeId,
          endOffset
        };

        logger.debug(LogCategory.TEXT_INPUT, 'handleInlineMarkup: toggling mark', {
          nodeId,
          markType,
          contentRange
        });

        // Toggle mark (remove if exists, add if not)
        dataStore.range.toggleMark(contentRange, markType);

        // Emit editor:content.change event (skipRender: true)
        // Ignore DOM created by browser, normalize with model mark then render
        this.editor.emit('editor:content.change', {
          skipRender: true,
          from: 'MutationObserver-inline-markup',
          get content() { return (editorForPayload as any).document; },
          transaction: this._buildDebugTransaction([
            {
              type: 'toggleMark',
              payload: {
                markType,
                range: {
                  startNodeId: nodeId,
                  startOffset,
                  endNodeId: nodeId,
                  endOffset
                }
              }
            }
          ], `MutationObserver-inline-markup mark:${markType}`)
        });
      } catch (error) {
        console.error('[InputHandler] handleInlineMarkup: failed to toggle mark', { error, change });
      }
    }

    // Render only once after all mark changes (re-emit with skipRender: false)
    // Replace DOM structure created by browser with our normalized structure
    this.editor.emit('editor:content.change', {
      skipRender: false, // Render needed (replace with normalized structure)
      from: 'MutationObserver-inline-markup-normalize',
      get content() { return (editorForPayload as any).document; },
      transaction: this._buildDebugTransaction([], 'MutationObserver-inline-markup-normalize')
    });
  }

  // Method called from MutationObserver (maintains backward compatibility)
  // Note: oldValue/newValue are values of individual text nodes,
  // but actual comparison should be done on full text by sid (because it's split by mark/decorator)
  async handleTextContentChange(oldValue: string | null, newValue: string | null, target: Node): Promise<void> {
    // Converted only if a listener reads it — see the transaction's own emit.
    const editorForPayload = this.editor;
    logger.debug(LogCategory.TEXT_INPUT, 'handleTextContentChange: CALLED', { oldValue, newValue, targetNodeType: target.nodeType, targetNodeName: target.nodeName });
    
    // Ignore DOM changes during rendering (prevent infinite loop)
    if ((this.editorViewDOM as any)._isRendering) {
      logger.debug(LogCategory.TEXT_INPUT, 'handleTextContentChange: SKIP - rendering');
      return;
    }
    
    // Skip a filler that still holds nothing but its zero-width character — that
    // mutation is the renderer placing the caret anchor, not the user typing.
    // Once real text arrives (the browser types and composes INTO the filler
    // node) this must NOT skip, or the keystroke is lost. stripFiller() is what
    // distinguishes the two.
    if (target.nodeType === Node.ELEMENT_NODE) {
      const el = target as Element;
      const filler = el.querySelector(`[${FILLER_ATTR}="true"]`);
      if (filler && !stripFiller(el.textContent ?? '')) {
        logger.debug(LogCategory.TEXT_INPUT, 'handleTextContentChange: SKIP - filler only');
        this.editor.emit('editor:input.skip_filler', { target: el });
        return;
      }
    }

    const selection = this.getCurrentSelection();
    const textNodeId = this.resolveModelTextNodeId(target);

    if (!textNodeId) {
      logger.debug(LogCategory.TEXT_INPUT, 'handleTextContentChange: SKIP - no textNodeId');
      this.editor.emit('editor:input.untracked_text', { target, oldValue, newValue });
      return;
    }


    // When not composing: only handle collapsed
    if (selection.length !== 0) {
      logger.debug(LogCategory.TEXT_INPUT, 'handleTextContentChange: SKIP - range selection', { selectionLength: selection.length });
      this.editor.emit('editor:input.skip_range_selection', selection);
      return;
    }

    // Ignore changes in other nodes (prevent cursor jumping)
    if (this.activeTextNodeId && textNodeId && textNodeId !== this.activeTextNodeId) {
      logger.debug(LogCategory.TEXT_INPUT, 'handleTextContentChange: SKIP - inactive node', { textNodeId, activeTextNodeId: this.activeTextNodeId });
      this.editor.emit('editor:input.skip_inactive_node', { textNodeId, activeTextNodeId: this.activeTextNodeId });
      return;
    }
    
    logger.debug(LogCategory.TEXT_INPUT, 'handleTextContentChange: PROCESSING', { textNodeId });

    // Query model by textNodeId (data-bc-sid at cursor position is the model)
    const modelNode = this.editor.dataStore?.getNode?.(textNodeId);
    if (!modelNode) {
      this.editor.emit('editor:input.node_not_found', { textNodeId });
      return;
    }
    // Text is always rendered under inline-text span. If closest [data-bc-sid] is not inline-text,
    // the text node was created at a boundary (e.g. directly under a block). Do not update model.
    // See docs/input-and-composition-review.md §5.4.
    const nodeType = (modelNode as { stype?: string }).stype ?? (modelNode as { type?: string }).type;
    if (nodeType !== 'inline-text') {
      logger.debug(LogCategory.TEXT_INPUT, 'handleTextContentChange: SKIP - boundary text (closest sid is not inline-text)', { textNodeId, nodeType });
      this.editor.emit('editor:input.boundary_text', { target, textNodeId, nodeType, oldValue, newValue });
      return;
    }

    const oldModelText = modelNode.text || '';
    // Normalize modelNode.marks to MarkRange[] format
    // If range is missing, set to full text range
    // IMark uses stype, MarkRange uses type, so conversion is needed
    const rawMarks = modelNode.marks || [];
    const modelMarks: MarkRange[] = rawMarks
        .filter((mark: any) => mark && (mark.type || mark.stype))
        .map((mark: any) => {
          const markType = mark.type || mark.stype; // IMark uses stype, MarkRange uses type
          // If range is missing, set to full text range
          if (!mark.range || !Array.isArray(mark.range) || mark.range.length !== 2) {
            return {
              type: markType,
              range: [0, oldModelText.length] as [number, number],
              attrs: mark.attrs || mark.attributes || {}
            };
          }
          return {
            type: markType,
            range: mark.range as [number, number],
            attrs: mark.attrs || mark.attributes || {}
          };
        });
    
    const decorators = this.getDecoratorsFromView();

    // Find text node (target may not be a Text node)
    let textNode: Text | null = null;
    if (target.nodeType === Node.TEXT_NODE) {
      textNode = target as Text;
    } else if (target.nodeType === Node.ELEMENT_NODE) {
      // If Element, find first text node
      const walker = document.createTreeWalker(
        target as Element,
        NodeFilter.SHOW_TEXT,
        null
      );
      textNode = walker.nextNode() as Text | null;
    }

    if (!textNode) {
      this.editor.emit('editor:input.text_node_not_found', { target });
      return;
    }

    // Update dataStore directly (not using transaction)
    const dataStore = (this.editor as any).dataStore;
    if (!dataStore) {
      console.error('[Input] dataStore not found');
      return;
    }

    // Efficient edit processing (automatic marks/decorator range adjustment)
    // handleEfficientEdit internally reconstructs full text based on sid for comparison
    // Use actualTextNodeId to find correct inline-text node
    logger.debug(LogCategory.TEXT_INPUT, 'handleTextContentChange: calling handleEfficientEdit', { textNodeId, oldModelTextLength: oldModelText.length });
    const editResult = handleEfficientEdit(
      textNode,
      oldModelText,  // Model text based on sid (comparison target)
      modelMarks,
      decorators,
      dataStore  // Passed to use dataStore.decorators.adjustRanges
    );

    if (!editResult) {
      logger.debug(LogCategory.TEXT_INPUT, 'handleTextContentChange: SKIP - no editResult');
      return;
    }
    
    logger.debug(LogCategory.TEXT_INPUT, 'handleTextContentChange: editResult received', { 
      editPosition: editResult.editInfo.editPosition, 
      deletedLength: editResult.editInfo.deletedLength,
      insertedLength: editResult.editInfo.insertedLength,
      insertedText: editResult.editInfo.insertedText
    });
    if (!dataStore) {
      console.error('[Input] dataStore not found');
      return;
    }

    // Range-based text update (instead of full string replacement)
    const editInfo = editResult.editInfo;
    const startOffset = editInfo.editPosition;
    const endOffset = editInfo.editPosition + editInfo.deletedLength;
    
    // Create ContentRange
    const contentRange = {
      startNodeId: textNodeId,
      startOffset: startOffset,
      endNodeId: textNodeId,
      endOffset: endOffset
    };
    
    // Check model state before update
    const nodeBefore = dataStore.getNode(textNodeId);
    const textBefore = nodeBefore?.text || '';
    
    // Use RangeOperations.replaceText for range-based update
    // This method automatically adjusts marks, so separate marks update is not needed
    try {
      logger.debug(LogCategory.TEXT_INPUT, 'handleTextContentChange: calling replaceText', { 
        textNodeId, 
        contentRange, 
        insertedText: editInfo.insertedText,
        textBefore 
      });
      
      // Change to command call
      let replacedText: string | null = null;
      try {
        const success = await this.editor.executeCommand('replaceText', {
          range: contentRange,
          text: editInfo.insertedText
        });
        
        if (!success) {
          console.warn('[Input] handleTextContentChange: replaceText command failed', { 
            contentRange, 
            text: editInfo.insertedText 
          });
          return;
        }
        
        // replacedText can be obtained from operation result, 
        // but currently only check success and continue
        replacedText = editInfo.insertedText;
      } catch (error) {
        console.error('[Input] handleTextContentChange: replaceText command execution failed', { 
          error, 
          contentRange, 
          text: editInfo.insertedText 
        });
        return;
      }
      
      // Verify model state after update
      const nodeAfter = dataStore.getNode(textNodeId);
      const textAfter = nodeAfter?.text || '';
      
      logger.debug(LogCategory.TEXT_INPUT, 'handleTextContentChange: replaceText completed', {
        textNodeId,
        textBefore,
        textAfter,
        replacedText,
        changed: textBefore !== textAfter
      });
      
      // Debug: verify model update
      if (textBefore === textAfter) {
        console.warn('[Input] Model text unchanged after replaceText', {
          nodeId: textNodeId,
          contentRange,
          insertedText: editInfo.insertedText,
          textBefore,
          textAfter,
          replacedText
        });
      }
    } catch (error) {
      console.error('[Input] failed to replace text using range', { 
        nodeId: textNodeId, 
        contentRange,
        insertedText: editInfo.insertedText,
        error 
      });
      return;
    }

    // Marks are automatically adjusted by RangeOperations.replaceText, so no separate update needed

    // Update decorators (only if changed)
    const decoratorsChanged = JSON.stringify(editResult.adjustedDecorators) !== JSON.stringify(decorators);
    if (decoratorsChanged) {
      this.syncDecorators(decorators, editResult.adjustedDecorators);
    }

    // Manually emit editor:content.change event
    // ⚠️ Important: changes detected by MutationObserver must always be handled with skipRender: true
    // If render() is called, DOM changes → MutationObserver re-detects → infinite loop occurs
    logger.debug(LogCategory.TEXT_INPUT, 'handleTextContentChange: emitting editor:content.change', { textNodeId });
    this.editor.emit('editor:content.change', {
      skipRender: true, // Required: MutationObserver changes do not call render()
      from: 'MutationObserver', // For debugging: indicate change source
      get content() { return (editorForPayload as any).document; },
      transaction: this._buildDebugTransaction([
        {
          type: 'replaceText',
          payload: {
            nodeId: textNodeId,
            range: contentRange
          }
        }
      ], 'handleTextContentChange')
    });
  }


  private resolveModelTextNodeId(target: Node): string | null {
    // Goal: find and return the closest data-bc-sid from cursor position
    // data-bc-sid at cursor position is the model itself, so type check is unnecessary
    
    let el: Element | null = null;
    if (target.nodeType === Node.TEXT_NODE) {
      el = (target.parentElement as Element | null);
    } else if (target.nodeType === Node.ELEMENT_NODE) {
      el = target as Element;
    }
    
    if (!el) {
      this.editor.emit('editor:input.unresolved_text_node', { target });
      return null;
    }
    
    // Find closest data-bc-sid
    const foundEl = el.closest('[data-bc-sid]');
    if (foundEl) {
      const sid = foundEl.getAttribute('data-bc-sid');
      if (sid) {
        return sid;
      }
    }
    
    this.editor.emit('editor:input.unresolved_text_node', { target });
    return null;
  }

  /**
   * beforeinput 이벤트 처리
   * 설계 문서에 따르면 insertParagraph, insertLineBreak, historyUndo, historyRedo만 preventDefault() 처리
   * 나머지는 브라우저가 자동 처리하고 MutationObserver가 감지
   * 
   * 추가: formatBold, formatItalic, formatUnderline 등 포맷 관련 inputType도 beforeInput에서 처리
   */
  handleBeforeInput(event: InputEvent): void {
    const inputType = event.inputType;
    
    logger.debug(LogCategory.TEXT_INPUT, 'handleBeforeInput: CALLED', { inputType, data: event.data });
    
    // 1) Handle structural change/history-related inputTypes with existing policy
    if (this.shouldPreventDefault(inputType)) {
      logger.debug(LogCategory.TEXT_INPUT, 'handleBeforeInput: preventDefault', { inputType });
      event.preventDefault();
      this.executeStructuralCommand(inputType);
      // Structural changes do not use Insert Range hint, so reset
      this._pendingInsertHint = null;
      return;
    }

    // 2) Handle format-related inputTypes (formatBold, formatItalic, formatUnderline, etc.)
    if (this.shouldHandleFormat(inputType)) {
      logger.debug(LogCategory.TEXT_INPUT, 'handleBeforeInput: preventDefault for format', { inputType });
      event.preventDefault();
      this.executeFormatCommand(inputType);
      // Format changes do not use Insert Range hint, so reset
      this._pendingInsertHint = null;
      return;
    }

    // 3) Handle deletion (Model-First)
    // Allow browser default behavior during IME composition (MutationObserver handles it)
    if (this.shouldHandleDelete(inputType) && !event.isComposing) {
      logger.debug(LogCategory.TEXT_INPUT, 'handleBeforeInput: preventDefault for delete', { inputType });
      event.preventDefault();
      this.handleDelete(event);
      // Deletion does not use Insert Range hint, so reset
      this._pendingInsertHint = null;
      return;
    }

    // 4) getTargetRanges() path for insert types: define input region before browser modifies DOM
    const handledByGetTargetRanges = this.tryHandleInsertViaGetTargetRanges(event);
    if (handledByGetTargetRanges) {
      this._pendingInsertHint = null;
      return;
    }

    // 5) Generate Insert Range hint for Insert-type inputTypes (fallback when getTargetRanges unused)
    this.updateInsertHintFromBeforeInput(event);

    // 6) For the rest (text input, etc.), let browser handle automatically,
    //    and MutationObserver detects DOM changes to update the model.
    logger.debug(LogCategory.TEXT_INPUT, 'handleBeforeInput: ALLOW (will be handled by MutationObserver)', { inputType });
  }

  /**
   * Try to handle insert-type beforeinput using getTargetRanges().
   * If getTargetRanges is available and the target range maps to inline-text, we preventDefault,
   * update model only (replaceText), then trigger render and update selection.
   * Returns true if the event was handled (caller should return); false to fall back to MutationObserver path.
   */
  private tryHandleInsertViaGetTargetRanges(event: InputEvent): boolean {
    const inputType = event.inputType;
    const insertTypes = new Set<string>(['insertText', 'insertFromPaste', 'insertReplacementText']);
    if (!insertTypes.has(inputType)) return false;

    // During IME composition use existing path (MutationObserver + hint)
    if (event.isComposing) return false;

    const getTargetRanges = (event as InputEvent & { getTargetRanges?: () => StaticRange[] }).getTargetRanges;
    if (typeof getTargetRanges !== 'function') return false;

    const ranges = getTargetRanges.call(event);
    if (!ranges?.length) return false;

    const staticRange = ranges[0];
    const modelRange = this.editorViewDOM.convertStaticRangeToModel?.(staticRange) ?? null;

    const dataStore = this.editor.dataStore;
    if (!dataStore) return false;

    const startNode = modelRange?.type === 'range' ? dataStore.getNode(modelRange.startNodeId) : undefined;
    const endNode = modelRange?.type === 'range' ? dataStore.getNode(modelRange.endNodeId) : undefined;
    const isEditable =
      startNode?.stype === 'inline-text' &&
      endNode?.stype === 'inline-text';

    /**
     * A character is never dropped while we know where the typing is.
     *
     * The DOM range is resolved against a page the render may be part way
     * through rewriting, and it can land on a node that holds no text — the
     * paragraph rather than the run inside it. That used to end the keystroke
     * here: the browser's edit was prevented and nothing replaced it, so the
     * character was simply gone, and on a slow machine several in a burst went
     * that way together. The reader had typed them.
     *
     * A burst knows where it has reached. When it does, that is a better answer
     * than a position the DOM could not resolve at all.
     */
    const burstFallback = this._burstCaret;
    if (!isEditable && !burstFallback) {
      if (!modelRange || modelRange.type !== 'range') return false;
      event.preventDefault();
      this.editor.emit('editor:input.boundary_text', {
        target: event.target,
        textNodeId: null,
        nodeType: startNode?.stype ?? endNode?.stype ?? 'unknown',
        reason: 'getTargetRanges range not in inline-text'
      });
      return true;
    }

    const text = event.data ?? '';
    const rangeForReplace: ModelSelection = isEditable
      ? {
          type: 'range',
          startNodeId: modelRange!.startNodeId,
          startOffset: modelRange!.startOffset,
          endNodeId: modelRange!.endNodeId,
          endOffset: modelRange!.endOffset
        }
      : {
          type: 'range',
          startNodeId: burstFallback!.nodeId,
          startOffset: burstFallback!.offset,
          endNodeId: burstFallback!.nodeId,
          endOffset: burstFallback!.offset
        };

    event.preventDefault();

    /**
     * Use what we know when the DOM is behind it.
     *
     * "Behind" and not "a moment ago": the position is the question, not the
     * timing. If the DOM puts the caret earlier than where the last accepted
     * keystroke left it, in the same run and within the span of a burst, then it
     * is describing a document that has already moved on. Anywhere else — a
     * different run, further along, or after a pause long enough for a person to
     * have moved the caret themselves — the DOM is right and this is discarded.
     */
    const burst = this._burstCaret;
    const domIsBehind =
      burst !== null &&
      rangeForReplace.startNodeId === burst.nodeId &&
      (rangeForReplace.startOffset ?? 0) < burst.offset;

    const range: ModelSelection = domIsBehind
      ? {
          type: 'range',
          startNodeId: burst!.nodeId,
          startOffset: burst!.offset,
          endNodeId: burst!.nodeId,
          endOffset: burst!.offset
        }
      : rangeForReplace;

    this._burstCaret = {
      nodeId: range.startNodeId,
      offset: (range.startOffset ?? 0) + text.length,
      at: Date.now()
    };

    this.editor.executeCommand('replaceText', { range, text }).then((success) => {
      if (!success) {
        console.warn('[InputHandler] tryHandleInsertViaGetTargetRanges: replaceText failed');
        return;
      }
      // Where the caret goes is the operation's answer, not this one's.
      //
      // This used to work it out again from the range it had passed in, and
      // overwrite what the transaction had already decided. The two agree while
      // the range is right; when it is one behind — which is what a stale
      // DOM-to-model conversion gives — the recomputed caret is one behind too,
      // and it lands *after* the correct one and wins. Every character then goes
      // to the same offset and a word arrives backwards.
      const newCaret =
        (this.editor as any).selection ??
        ({
          type: 'range',
          startNodeId: range.startNodeId,
          startOffset: (range.startOffset ?? 0) + text.length,
          endNodeId: range.startNodeId,
          endOffset: (range.startOffset ?? 0) + text.length
        } as ModelSelection);
      // No content.change is emitted here. `replaceText` is a command: its
      // transaction has already announced itself and already rendered, ~60ms
      // before this promise settles. Announcing it a second time bought a second
      // full render of the document per keystroke — measured in the browser as
      // two transactions and four render passes for one character — and told
      // every content.change listener the document had changed twice.
      //
      /**
       * Restore the DOM selection only if it has actually drifted, and only to
       * where the caret is *now*.
       *
       * Two frames from now the reader may well have typed again. Replaying the
       * caret this keystroke ended at would then drag theirs backwards — the
       * very thing that makes continuous input lose its place, and one of the
       * ways a burst came apart: each character's restore fought the character
       * after it, and the page ended up describing a document three keystrokes
       * old while the model was right.
       *
       * So nothing remembered is replayed. If the typing has moved on, the
       * keystroke that moved it owns the caret and will assert its own; this one
       * is over. If it has not, the model's current selection is the truth, and
       * the only question is whether the DOM has drifted from it — which happens
       * when a render replaces the text node underneath.
       */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            const burst = this._burstCaret;
            const movedOn =
              burst !== null &&
              (burst.nodeId !== newCaret.startNodeId || burst.offset !== newCaret.startOffset);
            if (movedOn) return;

            const view = this.editorViewDOM as any;
            const wanted = ((this.editor as any).selection ?? newCaret) as ModelSelection;
            const domSelection = window.getSelection();
            const current = domSelection ? view.convertDOMSelectionToModel?.(domSelection) : null;
            if (
              current &&
              current.type === 'range' &&
              current.startNodeId === wanted.startNodeId &&
              current.startOffset === wanted.startOffset
            ) {
              return;
            }
            view.convertModelSelectionToDOM?.(wanted);
          } catch (err) {
            console.warn('[InputHandler] tryHandleInsertViaGetTargetRanges: failed to restore DOM selection', err);
          }
        });
      });
    }).catch((err) => {
      console.error('[InputHandler] tryHandleInsertViaGetTargetRanges: replaceText error', err);
    });

    return true;
  }

  /**
   * beforeinput 단계에서 Insert Range 힌트를 계산하여 _pendingInsertHint에 저장
   * - insertText / insertFromPaste / insertReplacementText / (선택적으로 insertCompositionText)를 대상으로 한다.
   * - 현재는 DOM selection → 모델 selection 변환을 사용하고,
   *   getTargetRanges / IME 조합 보정은 추후 단계(B2 확장)에서 추가한다.
   */
  private updateInsertHintFromBeforeInput(event: InputEvent): void {
    const inputType = event.inputType;

    // Do not generate hint for non-target inputTypes
    const insertTypes = new Set<string>([
      'insertText',
      'insertFromPaste',
      'insertReplacementText',
      // 'insertCompositionText', // IME support will be safely introduced in a later stage
      // 'insertFromComposition'
    ]);

    if (!insertTypes.has(inputType)) {
      this._pendingInsertHint = null;
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      this._pendingInsertHint = null;
      return;
    }

    // Convert DOM selection → model selection
    let modelSelection: any = null;
    try {
      modelSelection = (this.editorViewDOM as any).convertDOMSelectionToModel?.(selection);
    } catch (error) {
      console.warn('[InputHandler] updateInsertHintFromBeforeInput: failed to convert selection', { error });
      this._pendingInsertHint = null;
      return;
    }

    if (!modelSelection || modelSelection.type !== 'range') {
      this._pendingInsertHint = null;
      return;
    }

    const contentRange: ModelSelection = {
      type: 'range',
      startNodeId: modelSelection.startNodeId,
      startOffset: modelSelection.startOffset,
      endNodeId: modelSelection.endNodeId,
      endOffset: modelSelection.endOffset
    };

    this._pendingInsertHint = {
      inputType,
      contentRange,
      text: event.data ?? undefined,
      timestamp: Date.now()
    };

    logger.debug(LogCategory.TEXT_INPUT, 'updateInsertHintFromBeforeInput: hint updated', {
      inputType,
      contentRange,
      hasText: !!this._pendingInsertHint?.text
    });
  }

  /**
   * Validate and return _pendingInsertHint
   * - Do not use during IME composition (only trust final DOM changes after composition completes)
   * - Ignore hints that are too old (default 500ms)
   */
  private getValidInsertHint(isComposing: boolean): InputHint | null {
    const hint = this._pendingInsertHint;
    if (!hint) return null;

    // Do not use hint during IME composition
    if (isComposing) {
      return null;
    }

    const now = Date.now();
    const MAX_AGE_MS = 500;
    if (now - hint.timestamp > MAX_AGE_MS) {
      return null;
    }

    return hint;
  }

  /**
   * Check if inputType requires preventDefault()
   * According to design document, only handle structural changes (insertParagraph, insertLineBreak) and history (historyUndo, historyRedo)
   */
  private shouldPreventDefault(inputType: string): boolean {
    const structuralTypes = [
      'insertParagraph',  // Enter key
      'insertLineBreak'  // Shift+Enter
    ];
    
    const historyTypes = [
      'historyUndo',  // Ctrl+Z / Cmd+Z
      'historyRedo'  // Ctrl+Y / Cmd+Y / Ctrl+Shift+Z / Cmd+Shift+Z
    ];
    
    return structuralTypes.includes(inputType) || historyTypes.includes(inputType);
  }

  /**
   * 포맷 관련 inputType인지 확인
   * beforeInput에서 preventDefault() 후 커맨드를 실행해야 하는 포맷 타입들
   */
  private shouldHandleFormat(inputType: string): boolean {
    const formatTypes = [
      'formatBold',        // Ctrl+B / Cmd+B
      'formatItalic',      // Ctrl+I / Cmd+I
      'formatUnderline',   // Ctrl+U / Cmd+U
      'formatStrikeThrough' // Ctrl+Shift+S / Cmd+Shift+S
    ];
    return formatTypes.includes(inputType);
  }

  /**
   * 삭제 관련 inputType인지 확인
   * Model-First로 처리할 삭제 타입들
   */
  private shouldHandleDelete(inputType: string): boolean {
    return inputType in DELETE_COMMANDS;
  }

  /**
   * Turn a delete intent into a command.
   *
   * beforeinput is the only complete source of these: a physical Backspace also
   * arrives as a keydown that the key map resolves, but an IME, a mobile
   * keyboard, autocorrect, a drag and a cut do not produce one. So this path
   * stays — what it must not do is decide what deleting *means*.
   *
   * It used to. It computed the range itself: previous sibling, node type, block
   * boundary — the same decision tree `DeleteExtension` already implements, only
   * less completely, and it won because it ran first and called preventDefault.
   * At the start of a block it found no previous sibling and gave up, which is
   * why Backspace could not merge two blocks. None of that code was covered by a
   * test, and it was quietly overriding code that was.
   */
  private async handleDelete(event: InputEvent): Promise<void> {
    const command = DELETE_COMMANDS[event.inputType];
    if (!command) return;

    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) return;

    let modelSelection: any = null;
    try {
      modelSelection = (this.editorViewDOM as any).convertDOMSelectionToModel?.(domSelection);
    } catch (error) {
      console.warn('[InputHandler] handleDelete: failed to convert DOM selection to model', { error });
      return;
    }

    if (!modelSelection || modelSelection.type !== 'range') return;

    // The command reads the selection from its payload, but the transaction
    // records `selectionBefore` from the editor, and undo needs it to be this one.
    this.editor.updateSelection(modelSelection);
    await this.editor.executeCommand(command, { selection: modelSelection });
  }

  /**
   * Execute structural change command
   * Calls EditorViewDOM's method to actually process
   */
  private executeStructuralCommand(inputType: string): void {
    logger.debug(LogCategory.TEXT_INPUT, 'executeStructuralCommand: CALLED', { inputType });
    
    switch (inputType) {
      case 'insertParagraph':
        logger.debug(LogCategory.TEXT_INPUT, 'executeStructuralCommand: calling insertParagraph');
        this.editorViewDOM.insertParagraph();
        break;
        
      case 'insertLineBreak':
        logger.debug(LogCategory.TEXT_INPUT, 'executeStructuralCommand: calling insertLineBreak');
        this.editorViewDOM.insertLineBreak();
        break;
        
      case 'historyUndo':
        logger.debug(LogCategory.TEXT_INPUT, 'executeStructuralCommand: calling historyUndo');
        this.editorViewDOM.historyUndo();
        break;
        
      case 'historyRedo':
        logger.debug(LogCategory.TEXT_INPUT, 'executeStructuralCommand: calling historyRedo');
        this.editorViewDOM.historyRedo();
        break;
        
      default:
        console.warn('[InputHandler] executeStructuralCommand: unknown inputType', { inputType });
    }
  }

  /**
   * Execute format command
   * Executes command after preventDefault() in beforeInput
   */
  private executeFormatCommand(inputType: string): void {
    logger.debug(LogCategory.TEXT_INPUT, 'executeFormatCommand: CALLED', { inputType });
    
    // Map inputType to command name
    const commandMap: Record<string, string> = {
      'formatBold': 'toggleBold',
      'formatItalic': 'toggleItalic',
      'formatUnderline': 'toggleUnderline',
      'formatStrikeThrough': 'toggleStrikeThrough'
    };
    
    const command = commandMap[inputType];
    if (command) {
      logger.debug(LogCategory.TEXT_INPUT, 'executeFormatCommand: executing command', { inputType, command });
      // Emit editor:command.execute event (form expected in tests)
      this.editor.emit('editor:command.execute', { command, data: undefined });
      // Actually execute command
      void this.editor.executeCommand(command, {});
    } else {
      console.warn('[InputHandler] executeFormatCommand: unknown format inputType', { inputType });
    }
  }

  private getCurrentSelection(): { offset: number; length: number } {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return { offset: 0, length: 0 };
    }

    const range = selection.getRangeAt(0);
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;

    // If text node
    if (startContainer.nodeType === Node.TEXT_NODE) {
      return {
        offset: startOffset,
        length: endOffset - startOffset
      };
    }

    // If element node - traverse text children to calculate offset
    if (startContainer.nodeType === Node.ELEMENT_NODE) {
      const element = startContainer as Element;
      const textNodes = this.getTextNodes(element);
      
      let offset = 0;
      for (let i = 0; i < textNodes.length; i++) {
        const textNode = textNodes[i];
        if (textNode === startContainer) {
          offset += startOffset;
          break;
        }
        offset += textNode.textContent?.length || 0;
      }
      
      let length = 0;
      if (startContainer === endContainer) {
        length = endOffset - startOffset;
      } else {
        // If different container, complex calculation needed
        // Handle simply
        length = endOffset - startOffset;
      }
      
      return { offset, length };
    }

    return { offset: 0, length: 0 };
  }

  private getTextNodes(element: Element): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }
    
    return textNodes;
  }

}
