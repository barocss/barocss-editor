import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@barocss/editor-core';
import { DecoratorManager } from '@barocss/shared';
import type { ReactSelectionHandler } from './selection-handler';
import type { ReactInputHandler } from './input-handler';
import type { ReactMutationObserverManager } from './mutation-observer-manager';
import { ReactSelectionHandler as ReactSelectionHandlerClass } from './selection-handler';
import { ReactInputHandler as ReactInputHandlerClass } from './input-handler';
import { createMutationObserverManager } from './mutation-observer-manager';

export interface EditorViewViewState {
  isModelDrivenChange: boolean;
  isRendering: boolean;
  isComposing: boolean;
  /** When true, next editor:content.change (from model commit during MO C1) must not trigger refresh (data-only update). */
  skipNextRenderFromMO: boolean;
  /** When true, editor:selection.model must not call convertModelSelectionToDOM (selection came from DOM input; leave DOM selection as-is). */
  skipApplyModelSelectionToDOM: boolean;
}

export interface EditorViewContextValue {
  editor: Editor;
  viewStateRef: React.MutableRefObject<EditorViewViewState>;
  selectionHandler: ReactSelectionHandler;
  inputHandler: ReactInputHandler;
  mutationObserverManager: ReactMutationObserverManager;
  setContentEditableElement: (el: HTMLElement | null) => void;
  /** Internal decorator manager (uncontrolled mode). Stable ref. */
  decoratorManagerRef: React.RefObject<DecoratorManager | null>;
  /** Increments when decoratorManager emits added/updated/removed; used to trigger content re-render. */
  decoratorVersion: number;
}

const EditorViewContext = createContext<EditorViewContextValue | null>(null);

export function useEditorViewContext(): EditorViewContextValue {
  const value = useContext(EditorViewContext);
  if (!value) {
    throw new Error('useEditorViewContext must be used within EditorViewContext.Provider');
  }
  return value;
}

export function useOptionalEditorViewContext(): EditorViewContextValue | null {
  return useContext(EditorViewContext);
}

export function EditorViewContextProvider({ editor, children }: { editor: Editor; children: ReactNode }) {
  const viewStateRef = useRef<EditorViewViewState>({
    isModelDrivenChange: false,
    isRendering: false,
    isComposing: false,
    skipNextRenderFromMO: false,
    skipApplyModelSelectionToDOM: false,
  });

  const contentEditableRef = useRef<HTMLElement | null>(null);
  const getContentEditableElement = useCallback(() => contentEditableRef.current, []);

  const decoratorManagerRef = useRef<DecoratorManager | null>(null);
  if (decoratorManagerRef.current === null) {
    decoratorManagerRef.current = new DecoratorManager();
  }
  const [decoratorVersion, setDecoratorVersion] = useState(0);
  useEffect(() => {
    const manager = decoratorManagerRef.current;
    if (!manager) return;
    const bump = () => setDecoratorVersion((v) => v + 1);
    manager.on('decorator:added', bump);
    manager.on('decorator:updated', bump);
    manager.on('decorator:removed', bump);
    return () => {
      manager.off('decorator:added', bump);
      manager.off('decorator:updated', bump);
      manager.off('decorator:removed', bump);
    };
  }, []);

  const selectionHandler = useMemo(
    () => new ReactSelectionHandlerClass(editor, getContentEditableElement),
    [editor, getContentEditableElement]
  );

  const inputHandler = useMemo(
    () => new ReactInputHandlerClass(editor, selectionHandler, viewStateRef),
    [editor, selectionHandler]
  );

  const mutationObserverManager = useMemo(
    () =>
      createMutationObserverManager((mutations) => {
        void inputHandler.handleDomMutations(mutations);
      }),
    [inputHandler]
  );

  const setContentEditableElement = useCallback(
    (el: HTMLElement | null) => {
      if (contentEditableRef.current === el) return;
      if (contentEditableRef.current) {
        mutationObserverManager.disconnect();
      }
      contentEditableRef.current = el;
      if (el) {
        mutationObserverManager.setup(el);
      }
    },
    [mutationObserverManager]
  );

  useEffect(() => {
    const onSelectionChange = () => selectionHandler.handleSelectionChange();
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [selectionHandler]);

  const value = useMemo<EditorViewContextValue>(
    () => ({
      editor,
      viewStateRef,
      selectionHandler,
      inputHandler,
      mutationObserverManager,
      setContentEditableElement,
      decoratorManagerRef,
      decoratorVersion,
    }),
    [
      editor,
      viewStateRef,
      selectionHandler,
      inputHandler,
      mutationObserverManager,
      setContentEditableElement,
      decoratorManagerRef,
      decoratorVersion,
    ]
  );

  return (
    <EditorViewContext.Provider value={value}>
      {children}
    </EditorViewContext.Provider>
  );
}

export { EditorViewContext };
