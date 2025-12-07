import { InputHandler, IEditorViewDOM } from '../types';
import { Editor } from '@barocss/editor-core';
import { handleEfficientEdit } from '../utils/efficient-edit-handler';
import { type MarkRange } from '../utils/edit-position-converter';
import { classifyDomChange, type ClassifiedChange, type InputHint } from '../dom-sync/dom-change-classifier';
import { analyzeTextChanges } from '@barocss/text-analyzer';
import { getKeyString } from '@barocss/shared';

/**
 * Input processing debug information (for Devtool)
 * Uses the same structure as LastInputDebug in editor-view-dom
 */
interface LastInputDebug {
  case: 'C1' | 'C2' | 'C3' | 'C4' | 'IME_INTERMEDIATE' | 'UNKNOWN';
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
   * - Used for contentRange correction in dom-change-classifier (C1/C2).
   */
  private _pendingInsertHint: InputHint | null = null;

  constructor(editor: Editor, editorViewDOM: IEditorViewDOM) {
    this.editor = editor;
    this.editorViewDOM = editorViewDOM;
    // Track active node after DOM selection is applied
    (this.editor as any).on('editor:selection.dom.applied', (e: any) => {
      this.activeTextNodeId = e?.activeNodeId || null;
    });
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
  handleKeyDown(event: KeyboardEvent): void {
    const key = event.key;
    const code = event.code;
    const ctrlKey = event.ctrlKey;
    const metaKey = event.metaKey;
    const shiftKey = event.shiftKey;
    const altKey = event.altKey;
    
    console.log('[InputHandler] handleKeyDown: CALLED', {
      key,
      code,
      ctrlKey,
      metaKey,
      shiftKey,
      altKey,
      // Generate key string (for future use in KeyBindingManager)
      keyString: getKeyString(event)
    });
    
    // TODO: When KeyBindingManager is introduced, move keydown handling logic to this method.
    // Currently handled via keymapManager in EditorViewDOM.handleKeydown
  }


  /**
   * Handle DOM changes (called from MutationObserver)
   * Receives MutationRecord[] and calls case classification module (dom-change-classifier)
   */
  async handleDomMutations(mutations: MutationRecord[]): Promise<void> {
    console.log('[InputHandler] handleDomMutations: CALLED', {
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

    // Ignore DOM changes during Model-First changes (prevent infinite loop)
    if ((this.editorViewDOM as any)._isModelDrivenChange) {
      console.log('[InputHandler] handleDomMutations: SKIP - model-driven change');
      return;
    }

    // Ignore DOM changes during rendering (prevent infinite loop)
    if ((this.editorViewDOM as any)._isRendering) {
      console.log('[InputHandler] handleDomMutations: SKIP - rendering');
      return;
    }

    // Classify DOM changes
    const selection = window.getSelection();
    
    // Convert DOM selection to model selection (used in C2/C3/C4)
    let modelSelection: any = null;
    if (selection && selection.rangeCount > 0) {
      try {
        // Use EditorViewDOM's convertDOMSelectionToModel
        modelSelection = (this.editorViewDOM as any).convertDOMSelectionToModel?.(selection);
        console.log('[InputHandler] handleDomMutations: model selection converted', {
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
    const modelSelectionInfo = modelSelection && modelSelection.type === 'range' ? {
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

    console.log('[InputHandler] handleDomMutations: classified', {
      case: classified.case,
      nodeId: classified.nodeId
    });

    // Handle by case
    switch (classified.case) {
      case 'C1':
        await this.handleC1(classified);
        break;
      case 'C2':
        await this.handleC2(classified);
        break;
      case 'C3':
        this.handleC3(classified);
        break;
      case 'C4':
      case 'C4_AUTO_CORRECT':
      case 'C4_AUTO_LINK':
      case 'C4_DND':
        this.handleC4(classified);
        break;
      case 'UNKNOWN':
        console.warn('[InputHandler] handleDomMutations: UNKNOWN case', { mutations });
        break;
    }
  }

  /**
   * C1: Handle pure text changes within a single inline-text
   */
  private async handleC1(classified: ClassifiedChange): Promise<void> {
    console.log('[InputHandler] handleC1: CALLED', { nodeId: classified.nodeId });

    if (!classified.nodeId || !classified.prevText || !classified.newText) {
      console.error('[InputHandler] handleC1: missing required data', classified);
      return;
    }

    // Analyze text diff
    const selection = window.getSelection();
    const selectionOffset = selection && selection.rangeCount > 0 
      ? selection.getRangeAt(0).startOffset 
      : 0;

    const textChanges = analyzeTextChanges({
      oldText: classified.prevText,
      newText: classified.newText,
      selectionOffset,
      selectionLength: 0
    });

    if (textChanges.length === 0) {
      console.log('[InputHandler] handleC1: SKIP - no text changes');
      return;
    }

    // Process only the first change (C1 typically has only one change)
    const change = textChanges[0];
    console.log('[InputHandler] handleC1: text change', {
      type: change.type,
      start: change.start,
      end: change.end,
      text: change.text,
      confidence: change.confidence
    });

    // DataStore operation
    const dataStore = (this.editor as any).dataStore;
    if (!dataStore) {
      console.error('[InputHandler] handleC1: dataStore not found');
      return;
    }

    // Determine contentRange
    // Priority 1: Use classified.contentRange if InputHint exists
    // Priority 2: Use analyzeTextChanges result (always accurate)
    let contentRange;
    if (classified.contentRange && classified.metadata?.usedInputHint) {
      // classified.contentRange is more accurate when InputHint is used
      contentRange = classified.contentRange;
      console.log('[InputHandler] handleC1: using classified.contentRange (InputHint)', contentRange);
    } else {
      // Use analyzeTextChanges result (when InputHint is not available or inaccurate)
      // analyzeTextChanges compares prevText and newText to calculate accurate change position
      contentRange = {
        startNodeId: classified.nodeId,
        startOffset: change.start,
        endNodeId: classified.nodeId,
        endOffset: change.end
      };
      console.log('[InputHandler] handleC1: using analyzeTextChanges result', {
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
        console.warn('[InputHandler] handleC1: DELETE detected via MutationObserver (should be handled by beforeinput)', {
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
              console.warn('[InputHandler] handleC1: fallback deleteText command failed', { contentRange });
              return;
            }
          } else {
            // Cross-node deletion
            const success = await this.editor.executeCommand('deleteCrossNode', { range: contentRange });
            if (!success) {
              console.warn('[InputHandler] handleC1: fallback deleteCrossNode command failed', { contentRange });
              return;
            }
          }
        } catch (error) {
          console.error('[InputHandler] handleC1: fallback delete command execution failed', { error, contentRange });
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
          console.log('[InputHandler] handleC1: fallback delete completed', modelSelection);
        } catch (error) {
          console.warn('[InputHandler] handleC1: failed to update selection after fallback delete', { error });
        }
      } else {
        console.log('[InputHandler] handleC1: calling replaceText command', {
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
            console.warn('[InputHandler] handleC1: replaceText command failed', { contentRange, text: change.text });
            return;
          }
        } catch (error) {
          console.error('[InputHandler] handleC1: replaceText command execution failed', { error, contentRange, text: change.text });
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
          console.log('[InputHandler] handleC1: updated selection after replace (model-based)', modelSelection);
        } catch (error) {
          console.warn('[InputHandler] handleC1: failed to update selection after replace', { error });
        }
      }

      // Create LastInputDebug object
      const inputDebug: LastInputDebug = {
        case: 'C1',
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
        from: 'MutationObserver-C1',
        content: (this.editor as any).document,
        transaction: { type: 'text_replace', nodeId: classified.nodeId },
        inputDebug
      });

      // Also store in editor instance (for access from Devtool)
      (this.editor as any).__lastInputDebug = inputDebug;

      // Text change was successfully applied in C1, so clear Insert Hint
      this._pendingInsertHint = null;
    } catch (error) {
      console.error('[InputHandler] handleC1: failed to replace text', { error, contentRange });
    }
  }

  /**
   * C2: 여러 inline-text에 걸친 텍스트 변경 처리
   */
  private async handleC2(classified: ClassifiedChange): Promise<void> {
    console.log('[InputHandler] handleC2: CALLED', {
      startNodeId: classified.contentRange?.startNodeId,
      endNodeId: classified.contentRange?.endNodeId,
      metadata: classified.metadata
    });

    if (!classified.contentRange || !classified.newText) {
      console.error('[InputHandler] handleC2: missing required data', classified);
      return;
    }

    // Handle range spanning multiple nodes
    const contentRange = classified.contentRange;
    const { startNodeId, endNodeId } = contentRange;
    const isMultiNode = startNodeId !== endNodeId;

    console.log('[InputHandler] handleC2: processing', {
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
      console.error('[InputHandler] handleC2: dataStore not found');
      return;
    }

    // replaceText automatically handles cases spanning multiple nodes
    // (processed internally as deleteText + insertText)
    // Single node cases can also be handled with replaceText

    try {
      // Handle range spanning multiple nodes with replaceText
      // replaceText automatically handles multi-node cases (deleteText + insertText)
      console.log('[InputHandler] handleC2: calling replaceText command', {
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
          console.warn('[InputHandler] handleC2: replaceText command failed', { 
            contentRange, 
            text: classified.newText 
          });
          return;
        }
      } catch (error) {
        console.error('[InputHandler] handleC2: replaceText command execution failed', { 
          error, 
          contentRange, 
          text: classified.newText 
        });
        return;
      }

      // Create LastInputDebug object
      const inputDebug: LastInputDebug = {
        case: 'C2',
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
        from: 'MutationObserver-C2',
        content: (this.editor as any).document,
        transaction: { 
          type: isMultiNode ? 'text_replace_multi' : 'text_replace',
          startNodeId,
          endNodeId
        },
        inputDebug
      });

      // Also store in editor instance (for access from Devtool)
      (this.editor as any).__lastInputDebug = inputDebug;

      // Text change was successfully applied in C2, so clear Insert Hint
      this._pendingInsertHint = null;
    } catch (error) {
      console.error('[InputHandler] handleC2: failed to replace text', { error, contentRange });
    }
  }

  /**
   * C3: 블록 구조 변경 처리
   * 
   * 원칙: 구조 변경은 beforeinput에서 처리하지만,
   * 브라우저/플랫폼 차이로 beforeinput이 오지 않은 경우를 대비
   */
  private async handleC3(classified: ClassifiedChange): Promise<void> {
    console.log('[InputHandler] handleC3: CALLED', {
      pattern: classified.metadata?.pattern,
      command: classified.metadata?.command,
      affectedNodes: classified.metadata?.affectedNodeIds
    });

    // Reinterpret as command if possible
    const command = classified.metadata?.command;
    if (command) {
      console.log('[InputHandler] handleC3: executing command', { command });
      try {
        this.editor.executeCommand(command);
        
        // Create LastInputDebug object
        const inputDebug: LastInputDebug = {
          case: 'C3',
          inputType: this._pendingInsertHint?.inputType,
          usedInputHint: false, // C3 is structure change, so InputHint is not used
          inputHintRange: this._pendingInsertHint?.contentRange,
          classifiedContentRange: classified.contentRange,
          timestamp: Date.now(),
          status: 'ok',
          notes: [`Command executed: ${command}`]
        };

        // Ignore DOM created by browser and re-render with command result
        this.editor.emit('editor:content.change', {
          skipRender: false, // render needed
          from: 'MutationObserver-C3-command',
          content: (this.editor as any).document,
          transaction: { type: 'block_structure_change', command },
          inputDebug
        });

        // Also store in editor instance (for Devtool access)
        (this.editor as any).__lastInputDebug = inputDebug;

        // Clear Insert Hint since structure change command was executed in C3
        this._pendingInsertHint = null;
        return;
      } catch (error) {
        console.error('[InputHandler] handleC3: command execution failed', { command, error });
        // proceed with fallback
      }
    }

    // When cannot be expressed as command: fallback policy
    // Safely process by extracting only allowed text/inline
    console.log('[InputHandler] handleC3: using fallback policy');
    
    // Fallback policy:
    // 1. Ignore DOM structure created by browser
    // 2. Extract only text and insert at current selection position
    // 3. Maintain block structure according to model rules (do not change)
    
    const dataStore = (this.editor as any).dataStore;
    if (!dataStore) {
      console.error('[InputHandler] handleC3: dataStore not found');
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
        
        console.log('[InputHandler] handleC3: fallback - inserting text only', {
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
            console.warn('[InputHandler] handleC3: fallback replaceText command failed', { 
              insertRange, 
              text: classified.newText 
            });
            return;
          }
        } catch (error) {
          console.error('[InputHandler] handleC3: fallback replaceText command execution failed', { 
            error, 
            insertRange, 
            text: classified.newText 
          });
          return;
        }
        
        // Create LastInputDebug object
        const inputDebug: LastInputDebug = {
          case: 'C3',
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
          from: 'MutationObserver-C3-fallback',
          content: (this.editor as any).document,
          transaction: { type: 'block_structure_change_fallback' },
          inputDebug
        });
        
        // Also store in editor instance (for Devtool access)
        (this.editor as any).__lastInputDebug = inputDebug;
        
        // Clear Insert Hint since fallback was executed in C3
        this._pendingInsertHint = null;
      } catch (error) {
        console.error('[InputHandler] handleC3: fallback failed', { error, classified });
      }
    } else {
      console.warn('[InputHandler] handleC3: fallback - insufficient data', { 
        hasNewText: !!classified.newText,
        hasContentRange: !!classified.contentRange
      });
    }
  }

  /**
   * C4: Handle mark/style/decorator changes
   * 
   * Convert styles/tags directly created by browser to model marks
   */
  private handleC4(classified: ClassifiedChange): void {
    console.log('[InputHandler] handleC4: CALLED', {
      markChanges: classified.metadata?.markChanges,
      specialCase: classified.metadata?.specialCase
    });

    const markChanges = classified.metadata?.markChanges as Array<{
      nodeId: string;
      markType: string;
      range?: [number, number];
    }> | undefined;

    if (!markChanges || markChanges.length === 0) {
      console.log('[InputHandler] handleC4: SKIP - no mark changes');
      return;
    }

    const dataStore = (this.editor as any).dataStore;
    if (!dataStore) {
      console.error('[InputHandler] handleC4: dataStore not found');
      return;
    }

    // Handle each mark change
    for (const change of markChanges) {
      try {
        const { nodeId, markType } = change;
        
        // Check model node
        const modelNode = dataStore.getNode(nodeId);
        if (!modelNode || modelNode.stype !== 'inline-text') {
          console.log('[InputHandler] handleC4: SKIP - not inline-text node', { nodeId });
          continue;
        }

        // Get selection range (use full text if not available)
        const selection = window.getSelection();
        let startOffset = 0;
        let endOffset = modelNode.text?.length || 0;

        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
          // Use selection range if available
          // TODO: Accurately convert DOM selection to model offset
          // Currently handled simply (range will be used later)
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

        console.log('[InputHandler] handleC4: toggling mark', {
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
          from: 'MutationObserver-C4',
          content: (this.editor as any).document,
          transaction: { type: 'mark_change', nodeId, markType }
        });
      } catch (error) {
        console.error('[InputHandler] handleC4: failed to toggle mark', { error, change });
      }
    }

    // Render only once after all mark changes (re-emit with skipRender: false)
    // Replace DOM structure created by browser with our normalized structure
    this.editor.emit('editor:content.change', {
      skipRender: false, // Render needed (replace with normalized structure)
      from: 'MutationObserver-C4-normalize',
      content: (this.editor as any).document,
      transaction: { type: 'mark_normalize' }
    });
  }

  // Method called from MutationObserver (maintains backward compatibility)
  // Note: oldValue/newValue are values of individual text nodes,
  // but actual comparison should be done on full text by sid (because it's split by mark/decorator)
  async handleTextContentChange(oldValue: string | null, newValue: string | null, target: Node): Promise<void> {
    console.log('[Input] handleTextContentChange: CALLED', { oldValue, newValue, targetNodeType: target.nodeType, targetNodeName: target.nodeName });
    
    // Ignore DOM changes during rendering (prevent infinite loop)
    if ((this.editorViewDOM as any)._isRendering) {
      console.log('[Input] handleTextContentChange: SKIP - rendering');
      return;
    }
    
    // Skip if filler <br> is present (stabilize cursor)
    if (target.nodeType === Node.ELEMENT_NODE) {
      const el = target as Element;
      const hasFiller = el.querySelector('br[data-bc-filler="true"]');
      if (hasFiller) {
        console.log('[Input] handleTextContentChange: SKIP - filler');
        this.editor.emit('editor:input.skip_filler', { target: el });
        return;
      }
    }

    const selection = this.getCurrentSelection();
    const textNodeId = this.resolveModelTextNodeId(target);

    if (!textNodeId) {
      console.log('[Input] handleTextContentChange: SKIP - no textNodeId');
      this.editor.emit('editor:input.untracked_text', { target, oldValue, newValue });
      return;
    }


    // When not composing: only handle collapsed
    if (selection.length !== 0) {
      console.log('[Input] handleTextContentChange: SKIP - range selection', { selectionLength: selection.length });
      this.editor.emit('editor:input.skip_range_selection', selection);
      return;
    }

    // Ignore changes in other nodes (prevent cursor jumping)
    if (this.activeTextNodeId && textNodeId && textNodeId !== this.activeTextNodeId) {
      console.log('[Input] handleTextContentChange: SKIP - inactive node', { textNodeId, activeTextNodeId: this.activeTextNodeId });
      this.editor.emit('editor:input.skip_inactive_node', { textNodeId, activeTextNodeId: this.activeTextNodeId });
      return;
    }
    
    console.log('[Input] handleTextContentChange: PROCESSING', { textNodeId });

    // Query model by textNodeId (data-bc-sid at cursor position is the model)
    const modelNode = this.editor.dataStore?.getNode?.(textNodeId);
    if (!modelNode) {
      this.editor.emit('editor:input.node_not_found', { textNodeId });
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
    
    const decorators = (this.editorViewDOM as any).getDecorators?.() || [];

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
    console.log('[Input] handleTextContentChange: calling handleEfficientEdit', { textNodeId, oldModelTextLength: oldModelText.length });
    const editResult = handleEfficientEdit(
      textNode,
      oldModelText,  // Model text based on sid (comparison target)
      modelMarks,
      decorators,
      dataStore  // Passed to use dataStore.decorators.adjustRanges
    );

    if (!editResult) {
      console.log('[Input] handleTextContentChange: SKIP - no editResult');
      return;
    }
    
    console.log('[Input] handleTextContentChange: editResult received', { 
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
      console.log('[Input] handleTextContentChange: calling replaceText', { 
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
      
      console.log('[Input] handleTextContentChange: replaceText completed', {
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
    // updateDecorators is handled in editorViewDOM (not in dataStore)
    const decoratorsChanged = JSON.stringify(editResult.adjustedDecorators) !== JSON.stringify(decorators);
    if (decoratorsChanged) {
      // TODO: convert adjustedDecorators to decorator format and update
    }

    // Manually emit editor:content.change event
    // ⚠️ Important: changes detected by MutationObserver must always be handled with skipRender: true
    // If render() is called, DOM changes → MutationObserver re-detects → infinite loop occurs
    console.log('[Input] handleTextContentChange: emitting editor:content.change', { textNodeId });
    this.editor.emit('editor:content.change', {
      skipRender: true, // Required: MutationObserver changes do not call render()
      from: 'MutationObserver', // For debugging: indicate change source
      content: (this.editor as any).document,
      transaction: { type: 'text_replace', nodeId: textNodeId }
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
    
    console.log('[InputHandler] handleBeforeInput: CALLED', { inputType, data: event.data });
    
    // 1) Handle structural change/history-related inputTypes with existing policy
    if (this.shouldPreventDefault(inputType)) {
      console.log('[InputHandler] handleBeforeInput: preventDefault', { inputType });
      event.preventDefault();
      this.executeStructuralCommand(inputType);
      // Structural changes do not use Insert Range hint, so reset
      this._pendingInsertHint = null;
      return;
    }

    // 2) Handle format-related inputTypes (formatBold, formatItalic, formatUnderline, etc.)
    if (this.shouldHandleFormat(inputType)) {
      console.log('[InputHandler] handleBeforeInput: preventDefault for format', { inputType });
      event.preventDefault();
      this.executeFormatCommand(inputType);
      // Format changes do not use Insert Range hint, so reset
      this._pendingInsertHint = null;
      return;
    }

    // 3) Handle deletion (Model-First)
    // Allow browser default behavior during IME composition (MutationObserver handles it)
    if (this.shouldHandleDelete(inputType) && !event.isComposing) {
      console.log('[InputHandler] handleBeforeInput: preventDefault for delete', { inputType });
      event.preventDefault();
      this.handleDelete(event);
      // Deletion does not use Insert Range hint, so reset
      this._pendingInsertHint = null;
      return;
    }

    // 4) Generate Insert Range hint for Insert-type inputTypes
    this.updateInsertHintFromBeforeInput(event);

    // 5) For the rest (text input, etc.), let browser handle automatically,
    //    and MutationObserver detects DOM changes to update the model.
    console.log('[InputHandler] handleBeforeInput: ALLOW (will be handled by MutationObserver)', { inputType });
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

    const contentRange = {
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

    console.log('[InputHandler] updateInsertHintFromBeforeInput: hint updated', {
      inputType,
      contentRange,
      hasText: !!this._pendingInsertHint.text
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
    const deleteTypes = [
      'deleteContentBackward',  // Backspace
      'deleteContentForward',   // Delete
      'deleteWordBackward',     // Option+Backspace (Mac) / Ctrl+Backspace (Windows)
      'deleteWordForward',      // Option+Delete (Mac) / Ctrl+Delete (Windows)
      'deleteByCut',           // Ctrl+X / Cmd+X
      'deleteByDrag'           // Delete after drag selection
    ];
    return deleteTypes.includes(inputType);
  }

  /**
   * Handle deletion (Model-First)
   * Called after preventDefault() in beforeinput
   */
  private async handleDelete(event: InputEvent): Promise<void> {
    const inputType = event.inputType;
    console.log('[InputHandler] handleDelete: CALLED', { inputType });

    // 1. Read current model selection
    // At beforeinput time, convert DOM selection to model selection
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      console.warn('[InputHandler] handleDelete: no DOM selection');
      return;
    }

    let modelSelection: any = null;
    try {
      modelSelection = (this.editorViewDOM as any).convertDOMSelectionToModel?.(domSelection);
    } catch (error) {
      console.warn('[InputHandler] handleDelete: failed to convert DOM selection to model', { error });
      return;
    }

    if (!modelSelection || modelSelection.type !== 'range') {
      console.warn('[InputHandler] handleDelete: invalid model selection', { modelSelection });
      return;
    }

    // Update current selection so TransactionManager can have correct selectionBefore
    // (Ideally handled internally to minimize event emission, but currently using public API)
    this.editor.updateSelection(modelSelection);

    // 2. Calculate deletion range
    const contentRange = this.calculateDeleteRange(modelSelection, inputType, modelSelection.startNodeId);
    if (!contentRange) {
      console.warn('[InputHandler] handleDelete: failed to calculate delete range');
      return;
    }

    console.log('[InputHandler] handleDelete: calculated range', { contentRange, inputType });

    // 3. Business logic: decide which Command to call
    let success = false;
    
    if (contentRange._deleteNode && contentRange.nodeId) {
      // Delete entire node
      try {
        success = await this.editor.executeCommand('deleteNode', { 
          nodeId: contentRange.nodeId 
        });
      } catch (error) {
        console.error('[InputHandler] handleDelete: deleteNode failed', { error, contentRange });
        return;
      }
    } else if (contentRange.startNodeId !== contentRange.endNodeId) {
      // Cross-node deletion
      try {
        success = await this.editor.executeCommand('deleteCrossNode', { 
          range: contentRange 
        });
      } catch (error) {
        console.error('[InputHandler] handleDelete: deleteCrossNode failed', { error, contentRange });
        return;
      }
    } else {
      // Single node text deletion
      try {
        success = await this.editor.executeCommand('deleteText', { 
          range: contentRange 
        });
      } catch (error) {
        console.error('[InputHandler] handleDelete: deleteText failed', { error, contentRange });
        return;
      }
    }

    if (!success) {
      console.warn('[InputHandler] handleDelete: command failed', { contentRange });
      return;
    }
    console.log('[InputHandler] handleDelete: command completed', { contentRange });

    // 4. Calculate new selection based on model
    // Move selection to start position of deleted range
    const newModelSelection = {
      type: 'range' as const,
      startNodeId: contentRange.startNodeId,
      startOffset: contentRange.startOffset,
      endNodeId: contentRange.startNodeId,
      endOffset: contentRange.startOffset,
      collapsed: true
    };

    // 5. Update model selection
    this.editor.emit('editor:selection.change', {
      selection: newModelSelection,
      oldSelection: modelSelection
    });

    // 6. render() → DOM update
    // Set skipRender: false to update DOM
    this.editor.emit('editor:content.change', {
      skipRender: false,
      from: 'beforeinput-delete',
      content: (this.editor as any).document,
      transaction: { type: 'delete', contentRange }
    });

    // 7. Restore Selection after DOM update
    // DOM elements are replaced by rendering, so Selection must be set again
    // Use requestAnimationFrame twice to ensure execution after rendering and layout completion
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          (this.editorViewDOM as any).convertModelSelectionToDOM?.(newModelSelection);
          console.log('[InputHandler] handleDelete: DOM selection restored', newModelSelection);
        } catch (error) {
          console.warn('[InputHandler] handleDelete: failed to restore DOM selection', { error });
        }
      });
    });
  }

  /**
   * Calculate deletion range
   * Calculate range to delete based on model selection and inputType
   * 
   * @param modelSelection Current model selection
   * @param inputType inputType from beforeinput
   * @param currentNodeId Current node ID (for determining selection position when deleting node)
   */
  private calculateDeleteRange(modelSelection: any, inputType: string, currentNodeId: string): any | null {
    if (modelSelection.type !== 'range') {
      return null;
    }

    const { startNodeId, startOffset, endNodeId, endOffset, collapsed } = modelSelection;

    // If range selection: delete selected range
    if (!collapsed) {
      return {
        startNodeId,
        startOffset,
        endNodeId,
        endOffset
      };
    }

    // If collapsed selection: determine deletion range based on inputType
    switch (inputType) {
      case 'deleteContentBackward': // Backspace
        // Delete character before cursor
        if (startOffset > 0) {
          return {
            startNodeId,
            startOffset: startOffset - 1,
            endNodeId,
            endOffset: startOffset
          };
        }
        // At node start: delete last character of previous node
        return this.calculateCrossNodeDeleteRange(
          startNodeId,
          'backward',
          (this.editor as any).dataStore
        );

      case 'deleteContentForward': // Delete
        // Delete character after cursor
        const node = (this.editor as any).dataStore?.getNode?.(startNodeId);
        const textLength = node?.text?.length || 0;
        if (startOffset < textLength) {
          return {
            startNodeId,
            startOffset,
            endNodeId,
            endOffset: startOffset + 1
          };
        }
        // At node end: delete first character of next node
        return this.calculateCrossNodeDeleteRange(
          startNodeId,
          'forward',
          (this.editor as any).dataStore
        );

      case 'deleteWordBackward': // Option+Backspace
      case 'deleteWordForward':  // Option+Delete
        // Word deletion currently only deletes 1 character
        // TODO: implement word boundary detection
        return this.calculateDeleteRange(
          { ...modelSelection, type: 'range' },
          inputType === 'deleteWordBackward' ? 'deleteContentBackward' : 'deleteContentForward',
          currentNodeId
        );

      case 'deleteByCut':
      case 'deleteByDrag':
        // Delete selected range (already handled above)
        return {
          startNodeId,
          startOffset,
          endNodeId,
          endOffset
        };

      default:
        console.warn('[InputHandler] calculateDeleteRange: unknown inputType', { inputType });
        return null;
    }
  }

  /**
   * Calculate deletion range at node boundary
   * Delete character from previous/next node, or return null if conditions not met
   * 
   * @param currentNodeId Current node ID
   * @param direction 'backward' (previous node) or 'forward' (next node)
   * @param dataStore DataStore instance
   * @returns Deletion range or null
   */
  private calculateCrossNodeDeleteRange(
    currentNodeId: string,
    direction: 'backward' | 'forward',
    dataStore: any
  ): any | null {
    if (!dataStore) {
      console.warn('[InputHandler] calculateCrossNodeDeleteRange: dataStore not found');
      return null;
    }

    const currentNode = dataStore.getNode?.(currentNodeId);
    if (!currentNode) {
      console.warn('[InputHandler] calculateCrossNodeDeleteRange: current node not found', { currentNodeId });
      return null;
    }

    // Do not process if current node does not have .text field
    // inline-text, inline-image, etc. are all custom schemas, so do not check by type name
    if (currentNode.text === undefined || typeof currentNode.text !== 'string') {
      console.log('[InputHandler] calculateCrossNodeDeleteRange: current node has no text field', { currentNodeId, type: currentNode.type || currentNode.stype });
      return null;
    }

    const currentParent = dataStore.getParent?.(currentNodeId);
    if (!currentParent || !currentParent.content) {
      console.log('[InputHandler] calculateCrossNodeDeleteRange: current node has no parent or siblings', { currentNodeId });
      return null;
    }

    const currentIndex = currentParent.content.indexOf(currentNodeId);
    if (currentIndex === -1) {
      console.warn('[InputHandler] calculateCrossNodeDeleteRange: current node not found in parent content', { currentNodeId });
      return null;
    }

    let targetNodeId: string | null = null;

    if (direction === 'backward') {
      // Find previous sibling node
      if (currentIndex === 0) {
        // First sibling: no previous node
        console.log('[InputHandler] calculateCrossNodeDeleteRange: no previous sibling', { currentNodeId });
        return null;
      }
      targetNodeId = currentParent.content[currentIndex - 1] as string;
    } else {
      // Find next sibling node
      if (currentIndex >= currentParent.content.length - 1) {
        // Last sibling: no next node
        console.log('[InputHandler] calculateCrossNodeDeleteRange: no next sibling', { currentNodeId });
        return null;
      }
      targetNodeId = currentParent.content[currentIndex + 1] as string;
    }

    if (!targetNodeId) {
      return null;
    }

    const targetNode = dataStore.getNode?.(targetNodeId);
    if (!targetNode) {
      console.warn('[InputHandler] calculateCrossNodeDeleteRange: target node not found', { targetNodeId });
      return null;
    }

    // Verify target node's parent is same as current node's parent
    const targetParent = dataStore.getParent?.(targetNodeId);
    if (!targetParent || targetParent.sid !== currentParent.sid) {
      console.log('[InputHandler] calculateCrossNodeDeleteRange: target node has different parent', {
        targetNodeId,
        targetParentId: targetParent?.sid,
        currentParentId: currentParent.sid
      });
      return null;
    }

    // Handle based on target node type
    const targetNodeType = targetNode.type || targetNode.stype;
    
    // 1. If block node: do nothing (block boundary)
    const schema = (dataStore as any).schema;
    if (schema) {
      const nodeSpec = schema.getNodeType?.(targetNodeType);
      if (nodeSpec && nodeSpec.group === 'block') {
        console.log('[InputHandler] calculateCrossNodeDeleteRange: target node is a block node (no action)', { targetNodeId, type: targetNodeType });
        return null;
      }
    }

    // 2. If node has .text field: delete character
    // inline-text, inline-image, etc. are all custom schemas, so don't check by type name
    // Judge by .text field existence
    if (targetNode.text !== undefined && typeof targetNode.text === 'string') {
      // Continue existing logic (handled below)
    } else {
      // 3. If inline node without .text field (inline-image, etc.): delete entire node
      // Indicate node deletion with special flag
      console.log('[InputHandler] calculateCrossNodeDeleteRange: target node has no text field (delete entire node)', { targetNodeId, type: targetNodeType });
      return {
        _deleteNode: true, // Special flag
        nodeId: targetNodeId
      };
    }

    const targetText = targetNode.text || '';
    const targetTextLength = targetText.length;

    if (direction === 'backward') {
      // Delete last character of previous node
      if (targetTextLength === 0) {
        // Previous node is empty: do nothing in Phase 1
        // Node merging to be implemented in Phase 2
        console.log('[InputHandler] calculateCrossNodeDeleteRange: previous node is empty (merge not implemented)', { targetNodeId });
        return null;
      }
      return {
        startNodeId: targetNodeId,
        startOffset: targetTextLength - 1,
        endNodeId: targetNodeId,
        endOffset: targetTextLength
      };
    } else {
      // Delete first character of next node
      if (targetTextLength === 0) {
        // Next node is empty: do nothing in Phase 1
        // Node merging to be implemented in Phase 2
        console.log('[InputHandler] calculateCrossNodeDeleteRange: next node is empty (merge not implemented)', { targetNodeId });
        return null;
      }
      return {
        startNodeId: targetNodeId,
        startOffset: 0,
        endNodeId: targetNodeId,
        endOffset: 1
      };
    }
  }

  /**
   * Execute structural change command
   * Calls EditorViewDOM's method to actually process
   */
  private executeStructuralCommand(inputType: string): void {
    console.log('[InputHandler] executeStructuralCommand: CALLED', { inputType });
    
    switch (inputType) {
      case 'insertParagraph':
        console.log('[InputHandler] executeStructuralCommand: calling insertParagraph');
        this.editorViewDOM.insertParagraph();
        break;
        
      case 'insertLineBreak':
        console.log('[InputHandler] executeStructuralCommand: calling insertLineBreak');
        // insertLineBreak doesn't exist in IEditorViewDOM, so use insertText('\n')
        // TODO: Consider adding insertLineBreak method to IEditorViewDOM
        this.editorViewDOM.insertText('\n');
        break;
        
      case 'historyUndo':
        console.log('[InputHandler] executeStructuralCommand: calling historyUndo');
        this.editorViewDOM.historyUndo();
        break;
        
      case 'historyRedo':
        console.log('[InputHandler] executeStructuralCommand: calling historyRedo');
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
    console.log('[InputHandler] executeFormatCommand: CALLED', { inputType });
    
    // Map inputType to command name
    const commandMap: Record<string, string> = {
      'formatBold': 'toggleBold',
      'formatItalic': 'toggleItalic',
      'formatUnderline': 'toggleUnderline',
      'formatStrikeThrough': 'toggleStrikeThrough'
    };
    
    const command = commandMap[inputType];
    if (command) {
      console.log('[InputHandler] executeFormatCommand: executing command', { inputType, command });
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
