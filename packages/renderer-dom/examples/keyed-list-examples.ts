/**
 * Keyed list reordering/mutation examples
 */

import { element } from '../src/template-builders';
import { reconcileVNodes } from '../src/reconcile';

export function renderKeyed(container: HTMLElement) {
  let ids = ['a','b','c'];
  let prev: any = null;

  function view() {
    return element('ul', ids.map((id) => element('li', { 'data-bc-sid': id }, `item ${id}`)));
  }

  function mount() {
    const next = view();
    reconcileVNodes(prev, next as any, container);
    prev = next;
  }

  (window as any).shuffle = function() { ids = ['c','a','b']; mount(); };
  (window as any).append = function() { ids = [...sids, Math.random().toString(36).slice(2,5)]; mount(); };
  (window as any).removeFirst = function() { ids = ids.slice(1); mount(); };

  mount();
}


