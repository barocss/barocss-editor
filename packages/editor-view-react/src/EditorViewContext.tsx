import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import type { Editor } from '@barocss/editor-core';
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

  const value = useMemo<EditorViewContextValue>(
    () => ({
      editor,
      viewStateRef,
      selectionHandler,
      inputHandler,
      mutationObserverManager,
      setContentEditableElement,
    }),
    [editor, viewStateRef, selectionHandler, inputHandler, mutationObserverManager, setContentEditableElement]
  );

  return (
    <EditorViewContext.Provider value={value}>
      {children}
    </EditorViewContext.Provider>
  );
}

export { EditorViewContext };
