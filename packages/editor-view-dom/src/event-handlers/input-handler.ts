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
          // selection이 있으면 그 범위 사용
          // TODO: DOM selection을 모델 offset으로 정확히 변환
          // 현재는 간단히 처리 (range는 나중에 사용 예정)
        } else if (change.range) {
          // metadata에 range가 있으면 사용
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

        // mark 토글 (기존에 있으면 제거, 없으면 추가)
        dataStore.range.toggleMark(contentRange, markType);

        // editor:content.change 이벤트 발생 (skipRender: true)
        // 브라우저가 만든 DOM은 무시하고, 모델 mark로 정규화한 후 render
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

    // 모든 mark 변경 후 한 번만 render (skipRender: false로 재발생)
    // 브라우저가 만든 DOM 구조를 우리의 정규화된 구조로 교체
    this.editor.emit('editor:content.change', {
      skipRender: false, // render 필요 (정규화된 구조로 교체)
      from: 'MutationObserver-C4-normalize',
      content: (this.editor as any).document,
      transaction: { type: 'mark_normalize' }
    });
  }

  // MutationObserver에서 호출되는 메서드 (기존 호환성 유지)
  // 주의: oldValue/newValue는 개별 text node의 값이지만,
  // 실제 비교는 sid 기준 전체 텍스트로 해야 함 (mark/decorator로 분리되기 때문)
  async handleTextContentChange(oldValue: string | null, newValue: string | null, target: Node): Promise<void> {
    console.log('[Input] handleTextContentChange: CALLED', { oldValue, newValue, targetNodeType: target.nodeType, targetNodeName: target.nodeName });
    
    // 렌더링 중 발생하는 DOM 변경은 무시 (무한루프 방지)
    if ((this.editorViewDOM as any)._isRendering) {
      console.log('[Input] handleTextContentChange: SKIP - rendering');
      return;
    }
    
    // filler <br>가 들어간 경우: 건너뜀 (커서 안정화)
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


    // 조합이 아닐 때: collapsed만 처리
    if (selection.length !== 0) {
      console.log('[Input] handleTextContentChange: SKIP - range selection', { selectionLength: selection.length });
      this.editor.emit('editor:input.skip_range_selection', selection);
      return;
    }

    // 다른 노드에서의 변경은 무시 (커서 튀는 현상 방지)
    if (this.activeTextNodeId && textNodeId && textNodeId !== this.activeTextNodeId) {
      console.log('[Input] handleTextContentChange: SKIP - inactive node', { textNodeId, activeTextNodeId: this.activeTextNodeId });
      this.editor.emit('editor:input.skip_inactive_node', { textNodeId, activeTextNodeId: this.activeTextNodeId });
      return;
    }
    
    console.log('[Input] handleTextContentChange: PROCESSING', { textNodeId });

    // textNodeId 기준으로 모델 조회 (커서 위치의 data-bc-sid가 바로 모델)
    const modelNode = this.editor.dataStore?.getNode?.(textNodeId);
    if (!modelNode) {
      this.editor.emit('editor:input.node_not_found', { textNodeId });
      return;
    }

    const oldModelText = modelNode.text || '';
    // modelNode.marks를 MarkRange[] 형식으로 정규화
    // range가 없는 경우 전체 텍스트 범위로 설정
    // IMark는 stype을 사용하고, MarkRange는 type을 사용하므로 변환 필요
    const rawMarks = modelNode.marks || [];
      const modelMarks: MarkRange[] = rawMarks
        .filter((mark: any) => mark && (mark.type || mark.stype))
        .map((mark: any) => {
          const markType = mark.type || mark.stype; // IMark는 stype, MarkRange는 type
          // range가 없으면 전체 텍스트 범위로 설정
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

    // 텍스트 노드 찾기 (target이 Text 노드가 아닐 수 있음)
    let textNode: Text | null = null;
    if (target.nodeType === Node.TEXT_NODE) {
      textNode = target as Text;
    } else if (target.nodeType === Node.ELEMENT_NODE) {
      // Element인 경우 첫 번째 text node 찾기
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

    // dataStore에 직접 업데이트 (transaction 사용하지 않음)
    const dataStore = (this.editor as any).dataStore;
    if (!dataStore) {
      console.error('[Input] dataStore not found');
      return;
    }

    // 효율적인 편집 처리 (marks/decorator 범위 자동 조정)
    // handleEfficientEdit 내부에서 sid 기준 전체 텍스트를 재구성하여 비교함
    // actualTextNodeId를 사용하여 올바른 inline-text 노드를 찾도록 함
    console.log('[Input] handleTextContentChange: calling handleEfficientEdit', { textNodeId, oldModelTextLength: oldModelText.length });
    const editResult = handleEfficientEdit(
      textNode,
      oldModelText,  // sid 기준 모델 텍스트 (비교 대상)
      modelMarks,
      decorators,
      dataStore  // dataStore.decorators.adjustRanges 사용을 위해 전달
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

    // 범위 기반 텍스트 업데이트 (전체 문자열 교체 대신)
    const editInfo = editResult.editInfo;
    const startOffset = editInfo.editPosition;
    const endOffset = editInfo.editPosition + editInfo.deletedLength;
    
    // ContentRange 생성
    const contentRange = {
      startNodeId: textNodeId,
      startOffset: startOffset,
      endNodeId: textNodeId,
      endOffset: endOffset
    };
    
    // 업데이트 전 모델 상태 확인
    const nodeBefore = dataStore.getNode(textNodeId);
    const textBefore = nodeBefore?.text || '';
    
    // RangeOperations.replaceText를 사용하여 범위 기반 업데이트
    // 이 메서드는 marks를 자동으로 조정하므로 별도 marks 업데이트 불필요
    try {
      console.log('[Input] handleTextContentChange: calling replaceText', { 
        textNodeId, 
        contentRange, 
        insertedText: editInfo.insertedText,
        textBefore 
      });
      
      // Command 호출로 변경
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
        
        // replacedText는 operation 결과에서 가져올 수 있지만, 
        // 현재는 성공 여부만 확인하고 넘어감
        replacedText = editInfo.insertedText;
      } catch (error) {
        console.error('[Input] handleTextContentChange: replaceText command execution failed', { 
          error, 
          contentRange, 
          text: editInfo.insertedText 
        });
        return;
      }
      
      // 업데이트 후 모델 상태 확인
      const nodeAfter = dataStore.getNode(textNodeId);
      const textAfter = nodeAfter?.text || '';
      
      console.log('[Input] handleTextContentChange: replaceText completed', {
        textNodeId,
        textBefore,
        textAfter,
        replacedText,
        changed: textBefore !== textAfter
      });
      
      // 디버깅: 모델 업데이트 확인
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

    // Marks는 RangeOperations.replaceText가 자동으로 조정하므로 별도 업데이트 불필요

    // Decorators 업데이트 (변경된 경우만)
    // updateDecorators는 editorViewDOM에서 처리 (dataStore가 아님)
    const decoratorsChanged = JSON.stringify(editResult.adjustedDecorators) !== JSON.stringify(decorators);
    if (decoratorsChanged) {
      // TODO: adjustedDecorators를 decorator 형식으로 변환하여 업데이트
    }

    // editor:content.change 이벤트 수동 발생
    // ⚠️ 중요: MutationObserver에서 감지한 변경은 항상 skipRender: true로 처리
    // render()가 호출되면 DOM 변경 → MutationObserver 재감지 → 무한 루프 발생
    console.log('[Input] handleTextContentChange: emitting editor:content.change', { textNodeId });
    this.editor.emit('editor:content.change', {
      skipRender: true, // 필수: MutationObserver 변경은 render() 호출 안 함
      from: 'MutationObserver', // 디버깅용: 변경 출처 표시
      content: (this.editor as any).document,
      transaction: { type: 'text_replace', nodeId: textNodeId }
    });
  }


  private resolveModelTextNodeId(target: Node): string | null {
    // 목표: 커서 위치에서 가장 가까운 data-bc-sid를 찾아 반환
    // 커서 위치의 data-bc-sid가 바로 모델이므로 타입 체크 불필요
    
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
    
    // 가장 가까운 data-bc-sid 찾기
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
    
    // 1) 구조 변경/히스토리 관련 inputType은 기존 정책대로 처리
    if (this.shouldPreventDefault(inputType)) {
      console.log('[InputHandler] handleBeforeInput: preventDefault', { inputType });
      event.preventDefault();
      this.executeStructuralCommand(inputType);
      // 구조 변경은 Insert Range 힌트를 사용하지 않으므로 초기화
      this._pendingInsertHint = null;
      return;
    }

    // 2) 포맷 관련 inputType 처리 (formatBold, formatItalic, formatUnderline 등)
    if (this.shouldHandleFormat(inputType)) {
      console.log('[InputHandler] handleBeforeInput: preventDefault for format', { inputType });
      event.preventDefault();
      this.executeFormatCommand(inputType);
      // 포맷 변경은 Insert Range 힌트를 사용하지 않으므로 초기화
      this._pendingInsertHint = null;
      return;
    }

    // 3) 삭제 처리 (Model-First)
    // IME 조합 중에는 브라우저 기본 동작 허용 (MutationObserver가 처리)
    if (this.shouldHandleDelete(inputType) && !event.isComposing) {
      console.log('[InputHandler] handleBeforeInput: preventDefault for delete', { inputType });
      event.preventDefault();
      this.handleDelete(event);
      // 삭제는 Insert Range 힌트를 사용하지 않으므로 초기화
      this._pendingInsertHint = null;
      return;
    }

    // 4) Insert 계열 inputType에 대해 Insert Range 힌트 생성
    this.updateInsertHintFromBeforeInput(event);

    // 5) 나머지 (텍스트 입력 등)는 브라우저가 자동 처리하도록 두고,
    //    MutationObserver가 DOM 변경을 감지하여 모델을 업데이트한다.
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

    // 대상이 아닌 inputType은 힌트 생성하지 않음
    const insertTypes = new Set<string>([
      'insertText',
      'insertFromPaste',
      'insertReplacementText',
      // 'insertCompositionText', // IME용은 추후 단계에서 안전하게 도입
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

    // DOM selection → 모델 selection 변환
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
   * _pendingInsertHint의 유효성을 검사하여 반환
   * - IME 조합 중에는 사용하지 않는다 (조합 완료 후 최종 DOM 변경만 신뢰)
   * - 너무 오래된 힌트는 무시한다 (기본 500ms)
   */
  private getValidInsertHint(isComposing: boolean): InputHint | null {
    const hint = this._pendingInsertHint;
    if (!hint) return null;

    // IME 조합 중에는 힌트를 사용하지 않는다.
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
   * preventDefault()가 필요한 inputType인지 확인
   * 설계 문서에 따르면 구조 변경(insertParagraph, insertLineBreak)과 히스토리(historyUndo, historyRedo)만 처리
   */
  private shouldPreventDefault(inputType: string): boolean {
    const structuralTypes = [
      'insertParagraph',  // Enter 키
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
      'deleteByDrag'           // 드래그로 선택 후 삭제
    ];
    return deleteTypes.includes(inputType);
  }

  /**
   * 삭제 처리 (Model-First)
   * beforeinput에서 preventDefault() 후 호출
   */
  private async handleDelete(event: InputEvent): Promise<void> {
    const inputType = event.inputType;
    console.log('[InputHandler] handleDelete: CALLED', { inputType });

    // 1. 현재 모델 selection 읽기
    // beforeinput 시점에서는 DOM selection을 모델 selection으로 변환
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

    // TransactionManager가 올바른 selectionBefore를 가질 수 있도록 현재 selection 업데이트
    // (이벤트 발생을 최소화하기 위해 내부적으로 처리되면 좋겠지만, 현재는 공개 API 사용)
    this.editor.updateSelection(modelSelection);

    // 2. 삭제 범위 계산
    const contentRange = this.calculateDeleteRange(modelSelection, inputType, modelSelection.startNodeId);
    if (!contentRange) {
      console.warn('[InputHandler] handleDelete: failed to calculate delete range');
      return;
    }

    console.log('[InputHandler] handleDelete: calculated range', { contentRange, inputType });

    // 3. 비즈니스 로직: 어떤 Command를 호출할지 결정
    let success = false;
    
    if (contentRange._deleteNode && contentRange.nodeId) {
      // 노드 전체 삭제
      try {
        success = await this.editor.executeCommand('deleteNode', { 
          nodeId: contentRange.nodeId 
        });
      } catch (error) {
        console.error('[InputHandler] handleDelete: deleteNode failed', { error, contentRange });
        return;
      }
    } else if (contentRange.startNodeId !== contentRange.endNodeId) {
      // Cross-node 삭제
      try {
        success = await this.editor.executeCommand('deleteCrossNode', { 
          range: contentRange 
        });
      } catch (error) {
        console.error('[InputHandler] handleDelete: deleteCrossNode failed', { error, contentRange });
        return;
      }
    } else {
      // 단일 노드 텍스트 삭제
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

    // 4. 모델 기준으로 새 selection 계산
    // 삭제된 범위의 시작 위치로 selection 이동
    const newModelSelection = {
      type: 'range' as const,
      startNodeId: contentRange.startNodeId,
      startOffset: contentRange.startOffset,
      endNodeId: contentRange.startNodeId,
      endOffset: contentRange.startOffset,
      collapsed: true
    };

    // 5. 모델 selection 업데이트
    this.editor.emit('editor:selection.change', {
      selection: newModelSelection,
      oldSelection: modelSelection
    });

    // 6. render() → DOM 업데이트
    // skipRender: false로 설정하여 DOM 업데이트
    this.editor.emit('editor:content.change', {
      skipRender: false,
      from: 'beforeinput-delete',
      content: (this.editor as any).document,
      transaction: { type: 'delete', contentRange }
    });

    // 7. DOM 업데이트 후 Selection 복구
    // 렌더링으로 인해 DOM 요소가 교체되므로 Selection을 다시 설정해야 함
    // requestAnimationFrame을 이중으로 사용하여 렌더링 및 레이아웃 완료 후 실행 보장
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
   * 삭제 범위 계산
   * 모델 selection과 inputType을 기반으로 삭제할 범위를 계산
   * 
   * @param modelSelection 현재 모델 selection
   * @param inputType beforeinput의 inputType
   * @param currentNodeId 현재 노드 ID (노드 삭제 시 selection 위치 결정용)
   */
  private calculateDeleteRange(modelSelection: any, inputType: string, currentNodeId: string): any | null {
    if (modelSelection.type !== 'range') {
      return null;
    }

    const { startNodeId, startOffset, endNodeId, endOffset, collapsed } = modelSelection;

    // Range selection인 경우: 선택된 범위 삭제
    if (!collapsed) {
      return {
        startNodeId,
        startOffset,
        endNodeId,
        endOffset
      };
    }

    // Collapsed selection인 경우: inputType에 따라 삭제 범위 결정
    switch (inputType) {
      case 'deleteContentBackward': // Backspace
        // 커서 앞의 문자 삭제
        if (startOffset > 0) {
          return {
            startNodeId,
            startOffset: startOffset - 1,
            endNodeId,
            endOffset: startOffset
          };
        }
        // 노드 시작 위치: 이전 노드의 마지막 문자 삭제
        return this.calculateCrossNodeDeleteRange(
          startNodeId,
          'backward',
          (this.editor as any).dataStore
        );

      case 'deleteContentForward': // Delete
        // 커서 뒤의 문자 삭제
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
        // 노드 끝 위치: 다음 노드의 첫 문자 삭제
        return this.calculateCrossNodeDeleteRange(
          startNodeId,
          'forward',
          (this.editor as any).dataStore
        );

      case 'deleteWordBackward': // Option+Backspace
      case 'deleteWordForward':  // Option+Delete
        // 단어 단위 삭제는 현재 단순히 1글자만 삭제
        // TODO: 단어 경계 감지 구현
        return this.calculateDeleteRange(
          { ...modelSelection, type: 'range' },
          inputType === 'deleteWordBackward' ? 'deleteContentBackward' : 'deleteContentForward',
          currentNodeId
        );

      case 'deleteByCut':
      case 'deleteByDrag':
        // 선택된 범위 삭제 (이미 위에서 처리됨)
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
   * 노드 경계에서 삭제 범위 계산
   * 이전/다음 노드의 문자를 삭제하거나, 조건 불만족 시 null 반환
   * 
   * @param currentNodeId 현재 노드 ID
   * @param direction 'backward' (이전 노드) 또는 'forward' (다음 노드)
   * @param dataStore DataStore 인스턴스
   * @returns 삭제 범위 또는 null
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

    // 현재 노드가 .text 필드를 가진 노드가 아니면 처리하지 않음
    // inline-text, inline-image 등은 모두 커스텀 schema이므로 타입 이름으로 체크하지 않음
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
      // 이전 형제 노드 찾기
      if (currentIndex === 0) {
        // 첫 번째 형제: 이전 노드 없음
        console.log('[InputHandler] calculateCrossNodeDeleteRange: no previous sibling', { currentNodeId });
        return null;
      }
      targetNodeId = currentParent.content[currentIndex - 1] as string;
    } else {
      // 다음 형제 노드 찾기
      if (currentIndex >= currentParent.content.length - 1) {
        // 마지막 형제: 다음 노드 없음
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

    // 대상 노드의 부모가 현재 노드의 부모와 같은지 확인
    const targetParent = dataStore.getParent?.(targetNodeId);
    if (!targetParent || targetParent.sid !== currentParent.sid) {
      console.log('[InputHandler] calculateCrossNodeDeleteRange: target node has different parent', {
        targetNodeId,
        targetParentId: targetParent?.sid,
        currentParentId: currentParent.sid
      });
      return null;
    }

    // 대상 노드 타입에 따른 처리
    const targetNodeType = targetNode.type || targetNode.stype;
    
    // 1. block 노드인 경우: 아무 동작도 하지 않음 (블록 경계)
    const schema = (dataStore as any).schema;
    if (schema) {
      const nodeSpec = schema.getNodeType?.(targetNodeType);
      if (nodeSpec && nodeSpec.group === 'block') {
        console.log('[InputHandler] calculateCrossNodeDeleteRange: target node is a block node (no action)', { targetNodeId, type: targetNodeType });
        return null;
      }
    }

    // 2. .text 필드가 있는 노드인 경우: 문자 삭제
    // inline-text, inline-image 등은 모두 커스텀 schema이므로 타입 이름으로 체크하지 않음
    // .text 필드 존재 여부로 판단
    if (targetNode.text !== undefined && typeof targetNode.text === 'string') {
      // 기존 로직 계속 (아래에서 처리)
    } else {
      // 3. .text 필드가 없는 inline 노드 (inline-image 등)인 경우: 노드 자체 삭제
      // 특별한 플래그로 노드 삭제를 나타냄
      console.log('[InputHandler] calculateCrossNodeDeleteRange: target node has no text field (delete entire node)', { targetNodeId, type: targetNodeType });
      return {
        _deleteNode: true, // 특별한 플래그
        nodeId: targetNodeId
      };
    }

    const targetText = targetNode.text || '';
    const targetTextLength = targetText.length;

    if (direction === 'backward') {
      // 이전 노드의 마지막 문자 삭제
      if (targetTextLength === 0) {
        // 이전 노드가 비어있음: Phase 1에서는 아무 동작도 하지 않음
        // Phase 2에서 노드 병합 구현 예정
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
      // 다음 노드의 첫 문자 삭제
      if (targetTextLength === 0) {
        // 다음 노드가 비어있음: Phase 1에서는 아무 동작도 하지 않음
        // Phase 2에서 노드 병합 구현 예정
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
   * 구조 변경 명령 실행
   * EditorViewDOM의 메서드를 호출하여 실제 처리
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
        // IEditorViewDOM에 insertLineBreak가 없으므로 insertText('\n') 사용
        // TODO: IEditorViewDOM에 insertLineBreak 메서드 추가 고려
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
   * 포맷 명령 실행
   * beforeInput에서 preventDefault() 후 커맨드를 실행
   */
  private executeFormatCommand(inputType: string): void {
    console.log('[InputHandler] executeFormatCommand: CALLED', { inputType });
    
    // inputType을 커맨드 이름으로 매핑
    const commandMap: Record<string, string> = {
      'formatBold': 'toggleBold',
      'formatItalic': 'toggleItalic',
      'formatUnderline': 'toggleUnderline',
      'formatStrikeThrough': 'toggleStrikeThrough'
    };
    
    const command = commandMap[inputType];
    if (command) {
      console.log('[InputHandler] executeFormatCommand: executing command', { inputType, command });
      // editor:command.execute 이벤트 발생 (테스트에서 기대하는 형태)
      this.editor.emit('editor:command.execute', { command, data: undefined });
      // 실제 커맨드 실행
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

    // 텍스트 노드인 경우
    if (startContainer.nodeType === Node.TEXT_NODE) {
      return {
        offset: startOffset,
        length: endOffset - startOffset
      };
    }

    // 요소 노드인 경우 - 텍스트 자식들을 순회하여 오프셋 계산
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
        // 다른 컨테이너인 경우 복잡한 계산 필요
        // 간단히 처리
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
