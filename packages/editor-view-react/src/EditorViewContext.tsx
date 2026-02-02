import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@barocss/editor-core';
import type { Decorator } from '@barocss/shared';
import {
  DecoratorManager,
  RemoteDecoratorManager,
  PatternDecoratorConfigManager,
  DecoratorGeneratorManager,
  runPatternFromModel,
} from '@barocss/shared';
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
  decoratorManagerRef: React.RefObject<DecoratorManager | null>;
  remoteDecoratorManagerRef: React.RefObject<RemoteDecoratorManager | null>;
  patternDecoratorConfigManagerRef: React.RefObject<PatternDecoratorConfigManager | null>;
  decoratorGeneratorManagerRef: React.RefObject<DecoratorGeneratorManager | null>;
  /** Merged decorators for rendering: local + remote + pattern-from-model + generator-from-model. */
  getMergedDecorators: (model: unknown) => Decorator[];
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
  const remoteDecoratorManagerRef = useRef<RemoteDecoratorManager | null>(null);
  if (remoteDecoratorManagerRef.current === null) {
    remoteDecoratorManagerRef.current = new RemoteDecoratorManager();
  }
  const patternDecoratorConfigManagerRef = useRef<PatternDecoratorConfigManager | null>(null);
  if (patternDecoratorConfigManagerRef.current === null) {
    patternDecoratorConfigManagerRef.current = new PatternDecoratorConfigManager();
  }
  const decoratorGeneratorManagerRef = useRef<DecoratorGeneratorManager | null>(null);
  if (decoratorGeneratorManagerRef.current === null) {
    decoratorGeneratorManagerRef.current = new DecoratorGeneratorManager();
  }

  const [decoratorVersion, setDecoratorVersion] = useState(0);
  const bumpDecoratorVersion = useCallback(() => setDecoratorVersion((v) => v + 1), []);

  useEffect(() => {
    const manager = decoratorManagerRef.current;
    if (!manager) return;
    manager.on('decorator:added', bumpDecoratorVersion);
    manager.on('decorator:updated', bumpDecoratorVersion);
    manager.on('decorator:removed', bumpDecoratorVersion);
    return () => {
      manager.off('decorator:added', bumpDecoratorVersion);
      manager.off('decorator:updated', bumpDecoratorVersion);
      manager.off('decorator:removed', bumpDecoratorVersion);
    };
  }, [bumpDecoratorVersion]);

  useEffect(() => {
    const remote = remoteDecoratorManagerRef.current;
    if (!remote) return;
    remote.on('change', bumpDecoratorVersion);
    return () => remote.off('change', bumpDecoratorVersion);
  }, [bumpDecoratorVersion]);

  const getMergedDecorators = useCallback((model: unknown): Decorator[] => {
    const local = decoratorManagerRef.current?.getAll() ?? [];
    const remote = remoteDecoratorManagerRef.current?.getAll() ?? [];
    const patternConfigs = patternDecoratorConfigManagerRef.current?.getConfigs(true) ?? [];
    const patternDecorators = runPatternFromModel(model as Record<string, unknown>, patternConfigs);
    const genManager = decoratorGeneratorManagerRef.current;
    let generatorDecorators: Decorator[] = [];
    if (genManager && model && typeof model === 'object') {
      const doc = model as Record<string, unknown>;
      const traverse = (node: Record<string, unknown>): void => {
        const text = typeof node.text === 'string' ? node.text : null;
        generatorDecorators.push(
          ...genManager.generateDecorators(node as Parameters<DecoratorGeneratorManager['generateDecorators']>[0], text, {
            documentModel: doc,
          })
        );
        const children = (node.children ?? node.content) as Record<string, unknown>[] | undefined;
        if (Array.isArray(children)) {
          for (const child of children) {
            if (child && typeof child === 'object') traverse(child);
          }
        }
      };
      traverse(doc);
    }
    return [...local, ...remote, ...patternDecorators, ...generatorDecorators];
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
      remoteDecoratorManagerRef,
      patternDecoratorConfigManagerRef,
      decoratorGeneratorManagerRef,
      getMergedDecorators,
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
      remoteDecoratorManagerRef,
      patternDecoratorConfigManagerRef,
      decoratorGeneratorManagerRef,
      getMergedDecorators,
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
