import type { MutableRefObject } from 'react';
import type { Editor } from '@barocss/editor-core';
import { getKeyString } from '@barocss/shared';
import { analyzeTextChanges } from '@barocss/text-analyzer';
import type { ReactSelectionHandler } from './selection-handler';
import { classifyDomChangeC1, type ClassifiedChangeC1, type InputHint } from './dom-sync/classify-c1';
import { findClosestInlineTextNode, reconstructModelTextFromDOM } from './dom-sync/edit-position';
import type { EditorViewViewState } from './EditorViewContext';

type ModelSelectionRange = {
  type: 'range';
  startNodeId: string;
  startOffset: number;
  endNodeId: string;
  endOffset: number;
  collapsed?: boolean;
};

type ContentRange = ModelSelectionRange & { _deleteNode?: boolean; nodeId?: string };

function shouldPreventDefaultStructural(inputType: string): boolean {
  const structural = ['insertParagraph', 'insertLineBreak'];
  const history = ['historyUndo', 'historyRedo'];
  return structural.includes(inputType) || history.includes(inputType);
}

function shouldHandleFormat(inputType: string): boolean {
  return ['formatBold', 'formatItalic', 'formatUnderline', 'formatStrikeThrough'].includes(inputType);
}

function shouldHandleDelete(inputType: string): boolean {
  return [
    'deleteContentBackward',
    'deleteContentForward',
    'deleteWordBackward',
    'deleteWordForward',
    'deleteByCut',
    'deleteByDrag',
  ].includes(inputType);
}

/**
 * Input handler for React editor view: beforeinput/keydown handling and model updates.
 * Uses ReactSelectionHandler for DOM↔model selection. Does not depend on editor-view-dom.
 */
export class ReactInputHandler {
  private editor: Editor;
  private selectionHandler: ReactSelectionHandler;
  private viewStateRef: MutableRefObject<EditorViewViewState>;
  private _isComposing = false;
  private _pendingInsertHint: InputHint | null = null;
  private readonly _compositionWindowMs = 120;
  private _compositionGeneration = 0;
  private _compositionSyncToken = 0;
  private _isCompositionSyncScheduled = false;
  private _contentChangeTxSeq = 0;

  private _buildDebugTransaction(operations: any[] = [], description?: string) {
    return {
      sid: `tx-viewreact-${Date.now()}-${++this._contentChangeTxSeq}`,
      timestamp: new Date(),
      operations,
      description
    };
  }

  private markPostCompositionWindow(): void {
    this.viewStateRef.current.compositionWindowUntil = Date.now() + this._compositionWindowMs;
  }

  private clearPostCompositionWindow(): void {
    this.viewStateRef.current.compositionWindowUntil = 0;
  }

  private isPostCompositionWindowActive(): boolean {
    return this.viewStateRef.current.compositionWindowUntil > Date.now();
  }

  private isImePhase(isComposing?: boolean): boolean {
    if (this._isComposing || this.viewStateRef.current.isComposing) return true;
    if (isComposing) return true;
    return this.isPostCompositionWindowActive();
  }

  private setImeComposingState(isComposing: boolean, clearWindow = true): void {
    const wasComposing = this._isComposing;

    if (wasComposing !== isComposing) {
      this._compositionGeneration += 1;
      this._compositionSyncToken = this._compositionGeneration;

      if (isComposing) {
        this._isCompositionSyncScheduled = false;
        if (clearWindow) {
          this.clearPostCompositionWindow();
        }
      } else {
        this._isCompositionSyncScheduled = true;
        this.markPostCompositionWindow();
      }
    }

    this._isComposing = isComposing;
    this.viewStateRef.current.isComposing = isComposing;
  }

  private requestCompositionEndSync(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void this.syncFocusedTextNodeAfterComposition();
      });
    });
  }

  constructor(
    editor: Editor,
    selectionHandler: ReactSelectionHandler,
    viewStateRef: MutableRefObject<EditorViewViewState>
  ) {
    this.editor = editor;
    this.selectionHandler = selectionHandler;
    this.viewStateRef = viewStateRef;
  }

  /** Set IME composition state. Called from beforeinput and compatibility keydown 229. */
  setComposing(isComposing: boolean): void {
    const wasComposing = this._isComposing;
    this.setImeComposingState(isComposing);

    if (wasComposing && !isComposing) {
      this.requestCompositionEndSync();
    }
  }

  handleInput(event: InputEvent): void {
    const wasComposing = this._isComposing;

    if (event.isComposing !== undefined) {
      this.setImeComposingState(event.isComposing);
      if (wasComposing && !event.isComposing) {
        this.requestCompositionEndSync();
      }
    }
  }

  handlePaste(event: ClipboardEvent): void {
    if (this.isImePhase()) return;

    event.preventDefault();

    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const html = clipboardData.getData('text/html');
    const text = clipboardData.getData('text/plain');

    if (!html && !text) return;

    this.editor.executeCommand('paste', {
      clipboardHtml: html || undefined,
      clipboardText: text || undefined,
    });
  }

  handleDrop(event: DragEvent): void {
    if (this.isImePhase()) return;

    event.preventDefault();

    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;

    const html = dataTransfer.getData('text/html');
    const text = dataTransfer.getData('text/plain');

    if (!html && !text) return;

    this.editor.executeCommand('paste', {
      clipboardHtml: html || undefined,
      clipboardText: text || undefined,
    });
  }

  /**
   * Sync model to DOM for the focused inline-text node. Call once after compositionend so the final composed text is applied (no intermediate C1).
   */
  async syncFocusedTextNodeAfterComposition(): Promise<void> {
    const syncToken = this._compositionSyncToken;
    const generation = this._compositionGeneration;
    const completeSync = (): void => {
      if (syncToken === this._compositionSyncToken && generation === this._compositionGeneration) {
        this._isCompositionSyncScheduled = false;
        this._compositionSyncToken += 1;
      }
    };

    if (!this._isCompositionSyncScheduled) return;
    if (this._isComposing || this.viewStateRef.current.isComposing) return;
    const view = this.viewStateRef.current;
    if (syncToken !== this._compositionSyncToken || generation !== this._compositionGeneration) return;
    if (view.isModelDrivenChange || view.isRendering) return;

    if (this.isPostCompositionWindowActive()) {
      setTimeout(() => {
        void this.syncFocusedTextNodeAfterComposition();
      }, Math.max(0, view.compositionWindowUntil - Date.now()));
      return;
    }

    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.anchorNode) {
      completeSync();
      return;
    }

    const inlineEl = findClosestInlineTextNode(selection.anchorNode);
    if (!inlineEl) return;

    const nodeId = inlineEl.getAttribute('data-bc-sid');
    if (!nodeId) {
      completeSync();
      return;
    }

    const dataStore = this.editor.dataStore;
    const modelNode = dataStore?.getNode?.(nodeId) as { stype?: string; text?: string } | undefined;
    if (!modelNode || modelNode.stype !== 'inline-text') {
      completeSync();
      return;
    }

    const prevText = modelNode.text ?? '';
    const newText = reconstructModelTextFromDOM(inlineEl);
    if (prevText === newText) {
      completeSync();
      return;
    }

    const contentRange: ContentRange = {
      type: 'range',
      startNodeId: nodeId,
      startOffset: 0,
      endNodeId: nodeId,
      endOffset: prevText.length,
    };

    this.viewStateRef.current.skipNextRenderFromMO = true;
    let success = false;
    try {
      success = await this.editor.executeCommand('replaceText', {
        range: contentRange,
        text: newText,
      });
    } finally {
      this.viewStateRef.current.skipNextRenderFromMO = false;
    }
    if (!success) {
      completeSync();
      return;
    }

    const selAfter = window.getSelection();
    if (selAfter?.rangeCount) {
      this.viewStateRef.current.skipApplyModelSelectionToDOM = true;
      try {
        const modelSel = this.selectionHandler.convertDOMSelectionToModel(selAfter);
        if (modelSel.type === 'range') {
          const newSel: ModelSelectionRange = {
            type: 'range',
            startNodeId: modelSel.startNodeId,
            startOffset: modelSel.startOffset,
            endNodeId: modelSel.endNodeId,
            endOffset: modelSel.endOffset,
            collapsed: modelSel.startNodeId === modelSel.endNodeId && modelSel.startOffset === modelSel.endOffset,
          };
          this.editor.updateSelection?.(newSel);
        }
      } catch {
        // keep browser selection as-is
      } finally {
        setTimeout(() => {
          this.viewStateRef.current.skipApplyModelSelectionToDOM = false;
        }, 0);
      }
    }

    this.editor.emit?.('editor:content.change', {
      skipRender: true,
      from: 'compositionend-sync',
      content: (this.editor as { document?: unknown }).document,
      transaction: this._buildDebugTransaction([
        {
          type: 'replaceText',
          payload: {
            nodeId,
            range: contentRange
          }
        }
      ], 'compositionend-sync')
    });

    completeSync();
  }

  /**
   * Called from MutationObserver (same role as editor-view-dom InputHandler.handleDomMutations).
   * Classifies DOM changes (C1 for single-node text) and updates model; emit editor:content.change with skipRender.
   * During IME composition we skip C1 and sync once on compositionend via syncFocusedTextNodeAfterComposition.
   * Set skipNextRenderFromMO so the model's content.change (no skipRender) does not trigger React refresh (data-only update).
   */
  async handleDomMutations(mutations: MutationRecord[]): Promise<void> {
    const view = this.viewStateRef.current;
    if (view.isModelDrivenChange || view.isRendering) return;
    if (this.isImePhase()) return;

    this.viewStateRef.current.skipNextRenderFromMO = true;
    try {
      await this.handleDomMutationsInner(mutations);
    } finally {
      this.viewStateRef.current.skipNextRenderFromMO = false;
    }
  }

  private async handleDomMutationsInner(mutations: MutationRecord[]): Promise<void> {
    const view = this.viewStateRef.current;
    const selection = window.getSelection();
    let modelSelection: ModelSelectionRange | undefined;
    if (selection?.rangeCount) {
      try {
        const sel = this.selectionHandler.convertDOMSelectionToModel(selection);
        if (sel.type === 'range')
          modelSelection = {
            type: 'range',
            startNodeId: sel.startNodeId,
            startOffset: sel.startOffset,
            endNodeId: sel.endNodeId,
            endOffset: sel.endOffset,
          };
      } catch {
        // ignore
      }
    }

    const inputHint = this.getValidInsertHint(view.isComposing || this.isPostCompositionWindowActive());
    const classified = classifyDomChangeC1(mutations, {
      editor: this.editor,
      selection: selection ?? undefined,
      modelSelection,
      inputHint: inputHint ?? undefined,
      isComposing: view.isComposing,
    });

    if (classified?.case === 'C1') {
      await this.handleC1(classified);
    }
  }

  private getValidInsertHint(isComposing: boolean): InputHint | null {
    const hint = this._pendingInsertHint;
    if (!hint || isComposing) return null;
    const MAX_AGE_MS = 500;
    if (Date.now() - hint.timestamp > MAX_AGE_MS) return null;
    return hint;
  }

  private async handleC1(classified: ClassifiedChangeC1): Promise<void> {
    if (!classified.nodeId || !classified.prevText || classified.newText === undefined) return;

    const selection = window.getSelection();
    const selectionOffset = selection?.rangeCount ? selection.getRangeAt(0).startOffset : 0;
    const textChanges = analyzeTextChanges({
      oldText: classified.prevText,
      newText: classified.newText,
      selectionOffset,
      selectionLength: 0,
    });
    if (textChanges.length === 0) return;

    const change = textChanges[0];
    const contentRange = classified.contentRange && classified.metadata?.usedInputHint
      ? classified.contentRange
      : {
          startNodeId: classified.nodeId,
          startOffset: change.start,
          endNodeId: classified.nodeId,
          endOffset: change.end,
        };

    this.viewStateRef.current.skipApplyModelSelectionToDOM = true;
    try {
      if (change.type === 'delete') {
        const success =
          contentRange.startNodeId === contentRange.endNodeId
            ? await this.editor.executeCommand('deleteText', { range: contentRange })
            : await this.editor.executeCommand('deleteCrossNode', { range: contentRange });
        if (!success) return;
        const newSel: ModelSelectionRange = {
          type: 'range',
          startNodeId: contentRange.startNodeId,
          startOffset: contentRange.startOffset,
          endNodeId: contentRange.startNodeId,
          endOffset: contentRange.startOffset,
          collapsed: true,
        };
        this.editor.updateSelection?.(newSel);
      } else {
        const success = await this.editor.executeCommand('replaceText', {
          range: contentRange,
          text: change.text ?? '',
        });
        if (!success) return;
        const insertedLen = (change.text ?? '').length;
        const newSel: ModelSelectionRange = {
          type: 'range',
          startNodeId: contentRange.startNodeId,
          startOffset: contentRange.startOffset + insertedLen,
          endNodeId: contentRange.startNodeId,
          endOffset: contentRange.startOffset + insertedLen,
          collapsed: true,
        };
        this.editor.updateSelection?.(newSel);
      }
    } finally {
      setTimeout(() => {
        this.viewStateRef.current.skipApplyModelSelectionToDOM = false;
      }, 0);
    }

    this.editor.emit?.('editor:content.change', {
      skipRender: true,
      from: 'MutationObserver-C1',
      content: (this.editor as { document?: unknown }).document,
      transaction: this._buildDebugTransaction([
        {
          type: 'replaceText',
          payload: {
            nodeId: classified.nodeId,
            range: classified.contentRange
          }
        }
      ], 'MutationObserver-C1')
    });
    this._pendingInsertHint = null;
  }

  handleBeforeInput(event: InputEvent): void {
    const isComposing = event.isComposing;
    const wasComposing = this._isComposing;

    if (isComposing !== undefined) {
      this.setImeComposingState(isComposing);

      if (isComposing && !this.selectionHandler.isSelectionInsideEditableText()) {
        event.preventDefault();
        return;
      }

      if (wasComposing && !isComposing) {
        this.clearPostCompositionWindow();
        this.requestCompositionEndSync();
      }
    }

    const isIme = this.isImePhase(isComposing);
    const inputType = event.inputType;

    if (shouldPreventDefaultStructural(inputType)) {
      event.preventDefault();
      this.executeStructuralCommand(inputType);
      return;
    }

    if (shouldHandleFormat(inputType)) {
      event.preventDefault();
      this.executeFormatCommand(inputType);
      return;
    }

    if (shouldHandleDelete(inputType) && !isIme) {
      event.preventDefault();
      this.handleDelete(event);
      return;
    }

    // insertText: never preventDefault. Browser updates DOM, MutationObserver syncs model and emits skipRender: true → no React re-render during typing (cursor stays).
    if (inputType === 'insertText') {
      this.updateInsertHintFromBeforeInput(event);
      return;
    }
    // insertFromPaste / insertReplacementText: may preventDefault and update model so view can re-render once.
    if (['insertFromPaste', 'insertReplacementText'].includes(inputType)) {
      if (this.tryHandleInsertViaGetTargetRanges(event)) return;
      this.updateInsertHintFromBeforeInput(event);
    }
  }

  private updateInsertHintFromBeforeInput(event: InputEvent): void {
    if (this.isImePhase(event.isComposing)) return;

    const selection = window.getSelection();
    if (!selection?.rangeCount) {
      this._pendingInsertHint = null;
      return;
    }
    try {
      const modelSelection = this.selectionHandler.convertDOMSelectionToModel(selection);
      if (modelSelection.type !== 'range') {
        this._pendingInsertHint = null;
        return;
      }
      this._pendingInsertHint = {
        contentRange: {
          startNodeId: modelSelection.startNodeId,
          startOffset: modelSelection.startOffset,
          endNodeId: modelSelection.endNodeId,
          endOffset: modelSelection.endOffset,
        },
        timestamp: Date.now(),
      };
    } catch {
      this._pendingInsertHint = null;
    }
  }

  /**
   * Keydown: keybindings only (Enter, Backspace, Delete, etc.). Do not insert characters here so IME works.
   * Character input is handled in beforeinput via tryHandleInsertViaGetTargetRanges (non-IME) or MutationObserver (IME).
   */
  handleKeydown(event: KeyboardEvent): void {
    if (this._isComposing) return;
    if (event.keyCode === 229) {
      this.markPostCompositionWindow();
      this.setImeComposingState(true, false);
      return;
    }

    if (this.isImePhase()) return;

    const isCharacterKey =
      event.key.length === 1 &&
      !['Enter', 'Tab', 'Escape'].includes(event.key) &&
      !event.ctrlKey &&
      !event.metaKey;
    if (isCharacterKey && event.keyCode !== 229 && !this.selectionHandler.isSelectionInsideEditableText()) {
      event.preventDefault();
      return;
    }

    const key = getKeyString(event);
    // Plain Space must not be prevented so the browser can insert it; beforeinput insertText then MO syncs model.
    if (key === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey) return;

    const resolved = this.editor.keybindings?.resolve?.(key);
    if (resolved?.length) {
      const { command, args } = resolved[0];
      event.preventDefault();

      // The resolved selection has to travel with the command. Most editing
      // commands declare `canExecute: payload => !!payload.selection`, so
      // dispatching with an empty payload made every keyboard shortcut resolve,
      // preventDefault, and then quietly decline to run — Enter, headings,
      // blockquote and lists all did nothing while the key was still swallowed.
      let selection: ModelSelectionRange | undefined;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        try {
          const modelSel = this.selectionHandler.convertDOMSelectionToModel(sel);
          if (modelSel && modelSel.type === 'range') {
            selection = modelSel as ModelSelectionRange;
            this.editor.updateSelection?.(modelSel);
          }
        } catch {
          // ignore conversion errors
        }
      }
      void this.editor.executeCommand(command, { ...(args ?? {}), ...(selection ? { selection } : {}) });
    }
  }

  private insertTextAtSelection(text: string): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const modelSelection = this.selectionHandler.convertDOMSelectionToModel(selection);
    if (!modelSelection || modelSelection.type !== 'range') return;

    const rangeForReplace: ModelSelectionRange = {
      type: 'range',
      startNodeId: modelSelection.startNodeId,
      startOffset: modelSelection.startOffset,
      endNodeId: modelSelection.endNodeId,
      endOffset: modelSelection.endOffset,
    };

    this.editor.executeCommand('replaceText', { range: rangeForReplace, text }).then((success) => {
      if (!success) return;
      const newCaret: ModelSelectionRange = {
        type: 'range',
        startNodeId: modelSelection.startNodeId,
        startOffset: modelSelection.startOffset + text.length,
        endNodeId: modelSelection.startNodeId,
        endOffset: modelSelection.startOffset + text.length,
      };
      this.editor.updateSelection?.(newCaret);
      this.applyModelSelectionAfterRender(newCaret);
    }).catch(() => {});
  }

  private tryHandleInsertViaGetTargetRanges(event: InputEvent): boolean {
    const inputType = event.inputType;
    if (!['insertText', 'insertFromPaste', 'insertReplacementText'].includes(inputType)) return false;
    if (this.isImePhase(event.isComposing)) return false;

    const getTargetRanges = (event as InputEvent & { getTargetRanges?: () => StaticRange[] }).getTargetRanges;
    if (typeof getTargetRanges !== 'function') return false;

    const ranges = getTargetRanges.call(event);
    if (!ranges?.length) return false;

    const staticRange = ranges[0];
    const modelRange = this.selectionHandler.convertStaticRangeToModel(staticRange);
    if (!modelRange || modelRange.type !== 'range') return false;

    const dataStore = this.editor.dataStore;
    if (!dataStore) return false;

    const startNode = dataStore.getNode(modelRange.startNodeId);
    const endNode = dataStore.getNode(modelRange.endNodeId);
    const isEditable =
      (startNode as { stype?: string })?.stype === 'inline-text' &&
      (endNode as { stype?: string })?.stype === 'inline-text';

    if (!isEditable) {
      event.preventDefault();
      return true;
    }

    const text = event.data ?? '';
    const rangeForReplace: ModelSelectionRange = {
      type: 'range',
      startNodeId: modelRange.startNodeId,
      startOffset: modelRange.startOffset,
      endNodeId: modelRange.endNodeId,
      endOffset: modelRange.endOffset,
    };

    event.preventDefault();

    this.editor.executeCommand('replaceText', { range: rangeForReplace, text }).then((success) => {
      if (!success) return;
      const textLen = text.length;
      const newCaret: ModelSelectionRange = {
        type: 'range',
        startNodeId: modelRange.startNodeId,
        startOffset: modelRange.startOffset + textLen,
        endNodeId: modelRange.startNodeId,
        endOffset: modelRange.startOffset + textLen,
      };
      this.editor.updateSelection?.(newCaret);
      this.editor.emit?.('editor:content.change', {
        skipRender: false,
        from: 'getTargetRanges',
        content: (this.editor as { document?: unknown }).document,
        transaction: this._buildDebugTransaction([
          {
            type: 'replaceText',
            payload: {
              ...rangeForReplace
            }
          }
        ], 'getTargetRanges')
      });
      this.applyModelSelectionAfterRender(newCaret);
    }).catch(() => {});

    return true;
  }

  private applyModelSelectionAfterRender(modelSelection: ModelSelectionRange): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.selectionHandler.convertModelSelectionToDOM(modelSelection);
      });
    });
  }

  private async handleDelete(event: InputEvent): Promise<void> {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    let modelSelection: unknown = null;
    try {
      modelSelection = this.selectionHandler.convertDOMSelectionToModel(selection);
    } catch {
      return;
    }

    if (!modelSelection || (modelSelection as { type?: string }).type !== 'range') return;

    const sel = modelSelection as ModelSelectionRange;
    this.editor.updateSelection?.(sel);

    const contentRange = this.calculateDeleteRange(sel, event.inputType, sel.startNodeId);
    if (!contentRange) return;

    let success = false;

    if ((contentRange as ContentRange)._deleteNode && (contentRange as ContentRange).nodeId) {
      success = await this.editor.executeCommand('deleteNode', {
        nodeId: (contentRange as ContentRange).nodeId,
      });
    } else if (contentRange.startNodeId !== contentRange.endNodeId) {
      success = await this.editor.executeCommand('deleteCrossNode', { range: contentRange });
    } else {
      success = await this.editor.executeCommand('deleteText', { range: contentRange });
    }

    if (!success) return;

    const newModelSelection: ModelSelectionRange = {
      type: 'range',
      startNodeId: contentRange.startNodeId,
      startOffset: contentRange.startOffset,
      endNodeId: contentRange.startNodeId,
      endOffset: contentRange.startOffset,
      collapsed: true,
    };

    this.editor.emit?.('editor:selection.change', {
      selection: newModelSelection,
      oldSelection: modelSelection,
    });

    this.editor.emit?.('editor:content.change', {
      skipRender: false,
      from: 'beforeinput-delete',
      content: (this.editor as { document?: unknown }).document,
      transaction: this._buildDebugTransaction([
        {
          type: 'deleteText',
          payload: {
            range: contentRange
          }
        }
      ], 'beforeinput-delete')
    });

    this.applyModelSelectionAfterRender(newModelSelection);
  }

  private calculateDeleteRange(
    modelSelection: ModelSelectionRange,
    inputType: string,
    currentNodeId: string
  ): ContentRange | null {
    const { startNodeId, startOffset, endNodeId, endOffset } = modelSelection;
    const collapsed = startNodeId === endNodeId && startOffset === endOffset;

    if (!collapsed) {
      return { type: 'range', startNodeId, startOffset, endNodeId, endOffset };
    }

    switch (inputType) {
      case 'deleteContentBackward':
        if (startOffset > 0) {
          return {
            type: 'range',
            startNodeId,
            startOffset: startOffset - 1,
            endNodeId,
            endOffset: startOffset,
          };
        }
        return this.calculateCrossNodeDeleteRange(startNodeId, 'backward');

      case 'deleteContentForward': {
        const node = this.editor.dataStore?.getNode?.(startNodeId) as { text?: string } | undefined;
        const textLength = node?.text?.length ?? 0;
        if (startOffset < textLength) {
          return {
            type: 'range',
            startNodeId,
            startOffset,
            endNodeId,
            endOffset: startOffset + 1,
          };
        }
        return this.calculateCrossNodeDeleteRange(startNodeId, 'forward');
      }

      case 'deleteWordBackward':
      case 'deleteWordForward':
        return this.calculateDeleteRange(
          modelSelection,
          inputType === 'deleteWordBackward' ? 'deleteContentBackward' : 'deleteContentForward',
          currentNodeId
        );

      case 'deleteByCut':
      case 'deleteByDrag':
        return { type: 'range', startNodeId, startOffset, endNodeId, endOffset };

      default:
        return null;
    }
  }

  private calculateCrossNodeDeleteRange(
    currentNodeId: string,
    direction: 'backward' | 'forward'
  ): ContentRange | null {
    const dataStore = this.editor.dataStore;
    if (!dataStore?.getNode || !dataStore?.getParent) return null;

    const currentNode = dataStore.getNode(currentNodeId) as { text?: string; stype?: string } | undefined;
    if (!currentNode) return null;
    if (currentNode.text === undefined || typeof currentNode.text !== 'string') return null;

    const currentParent = dataStore.getParent(currentNodeId) as { content?: string[]; sid?: string } | undefined;
    if (!currentParent?.content) return null;

    const currentIndex = currentParent.content.indexOf(currentNodeId);
    if (currentIndex === -1) return null;

    const targetIndex = direction === 'backward' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentParent.content.length) return null;

    const targetNodeId = currentParent.content[targetIndex] as string;
    const targetNode = dataStore.getNode(targetNodeId) as { text?: string; stype?: string; type?: string } | undefined;
    if (!targetNode) return null;

    const targetParent = dataStore.getParent(targetNodeId) as { sid?: string } | undefined;
    if (!targetParent || targetParent.sid !== currentParent.sid) return null;

    const schema = (dataStore as { schema?: { getNodeType?: (t: string) => { group?: string } } }).schema;
    if (schema?.getNodeType) {
      const type = targetNode.stype ?? targetNode.type;
      const spec = type ? schema.getNodeType(type) : undefined;
      if (spec?.group === 'block') return null;
    }

    if (targetNode.text === undefined || typeof targetNode.text !== 'string') {
      return { type: 'range', startNodeId: '', startOffset: 0, endNodeId: '', endOffset: 0, _deleteNode: true, nodeId: targetNodeId };
    }

    const targetTextLength = (targetNode.text ?? '').length;
    if (direction === 'backward') {
      if (targetTextLength === 0) return null;
      return {
        type: 'range',
        startNodeId: targetNodeId,
        startOffset: targetTextLength - 1,
        endNodeId: targetNodeId,
        endOffset: targetTextLength,
      };
    }
    if (targetTextLength === 0) return null;
    return {
      type: 'range',
      startNodeId: targetNodeId,
      startOffset: 0,
      endNodeId: targetNodeId,
      endOffset: 1,
    };
  }

  private executeStructuralCommand(inputType: string): void {
    switch (inputType) {
      case 'insertParagraph':
        this.insertParagraph();
        break;
      case 'insertLineBreak':
        this.insertText('\n');
        break;
      case 'historyUndo':
        void this.editor.executeCommand('historyUndo', {});
        break;
      case 'historyRedo':
        void this.editor.executeCommand('historyRedo', {});
        break;
    }
  }

  private insertParagraph(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      void this.editor.executeCommand('insertParagraph', {}).catch(() => {});
      return;
    }
    let modelSelection;
    try {
      modelSelection = this.selectionHandler.convertDOMSelectionToModel(selection);
    } catch {
      void this.editor.executeCommand('insertParagraph', {}).catch(() => {});
      return;
    }
    if (!modelSelection || modelSelection.type === 'none') {
      void this.editor.executeCommand('insertParagraph', {}).catch(() => {});
      return;
    }
    this.editor.updateSelection?.(modelSelection);
    void this.editor.executeCommand('insertParagraph', { selection: modelSelection }).catch(() => {});
  }

  private insertText(text: string): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      void this.editor.executeCommand('insertText', { text });
      return;
    }
    const modelSelection = this.selectionHandler.convertDOMSelectionToModel(selection);
    if (!modelSelection || modelSelection.type === 'none') {
      void this.editor.executeCommand('insertText', { text });
      return;
    }
    void this.editor.executeCommand('insertText', { text, selection: modelSelection });
  }

  private executeFormatCommand(inputType: string): void {
    const commandMap: Record<string, string> = {
      formatBold: 'toggleBold',
      formatItalic: 'toggleItalic',
      formatUnderline: 'toggleUnderline',
      formatStrikeThrough: 'toggleStrikeThrough',
    };
    const command = commandMap[inputType];
    if (command) {
      this.editor.emit?.('editor:command.execute', { command, data: undefined });
      void this.editor.executeCommand(command, {});
    }
  }
}
