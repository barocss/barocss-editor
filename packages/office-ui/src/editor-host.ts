import { useSyncExternalStore, type ComponentType } from 'react';

// The integrated host supplies navigation before mounting a product. Standalone
// products have no workspace dependency and leave this slot empty.
export interface EditorNavigationProps { product: 'Note' | 'Word' | 'Slides' | 'Site' }
let navigation: ComponentType<EditorNavigationProps> | undefined;
const listeners = new Set<() => void>();
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
export function registerEditorNavigation(component: ComponentType<EditorNavigationProps>) {
  navigation = component;
  listeners.forEach(notify => notify());
  return () => {
    if (navigation !== component) return;
    navigation = undefined;
    listeners.forEach(notify => notify());
  };
}
export function useEditorNavigation() {
  return useSyncExternalStore(subscribe, () => navigation, () => undefined);
}
