import { useSyncExternalStore, type ComponentType } from 'react';

// The integrated host supplies navigation before mounting a product. Standalone
// products have no workspace dependency and leave this slot empty.
export interface EditorNavigationProps { product: 'Note' | 'Word' | 'Slides' | 'Site' }
let navigation: ComponentType<EditorNavigationProps> | undefined;
let registration = 0;
let location: ComponentType<EditorNavigationProps> | undefined;
const listeners = new Set<() => void>();
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
export function registerEditorNavigation(component: ComponentType<EditorNavigationProps>, context?: ComponentType<EditorNavigationProps>) {
  const current = ++registration;
  navigation = component;
  location = context;
  listeners.forEach(notify => notify());
  return () => {
    if (registration !== current) return;
    navigation = undefined;
    location = undefined;
    listeners.forEach(notify => notify());
  };
}
export function useEditorNavigation() {
  return useSyncExternalStore(subscribe, () => navigation, () => undefined);
}

/** Read-only host location; it does not establish ownership or change navigation scope. */
export function useEditorLocation() {
  return useSyncExternalStore(subscribe, () => location, () => undefined);
}
