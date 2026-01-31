/**
 * MutationObserver manager for editor-view-react.
 * Observes contentEditableElement and calls onMutations (e.g. inputHandler.handleDomMutations).
 * Same role as editor-view-dom's MutationObserverManagerImpl; does not depend on editor-view-dom.
 */
export interface ReactMutationObserverManager {
  setup(contentEditableElement: HTMLElement): void;
  disconnect(): void;
}

type OnMutations = (mutations: MutationRecord[]) => void;

export function createMutationObserverManager(onMutations: OnMutations): ReactMutationObserverManager {
  let observer: MutationObserver | null = null;
  let pendingMutations: MutationRecord[] = [];
  let mutationTimer: number | null = null;

  return {
    setup(contentEditableElement: HTMLElement) {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (mutationTimer != null) {
        clearTimeout(mutationTimer);
        mutationTimer = null;
      }
      pendingMutations = [];

      observer = new MutationObserver((mutations: MutationRecord[]) => {
        pendingMutations.push(...mutations);
        if (mutationTimer != null) clearTimeout(mutationTimer);
        mutationTimer = window.setTimeout(() => {
          if (pendingMutations.length > 0) {
            onMutations([...pendingMutations]);
            pendingMutations = [];
          }
          mutationTimer = null;
        }, 0);
      });

      observer.observe(contentEditableElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-bc-edit', 'data-bc-value', 'data-bc-sid', 'data-bc-stype'],
        characterDataOldValue: true,
        attributeOldValue: true,
      });
    },

    disconnect() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (mutationTimer != null) {
        clearTimeout(mutationTimer);
        mutationTimer = null;
      }
      pendingMutations = [];
    },
  };
}
