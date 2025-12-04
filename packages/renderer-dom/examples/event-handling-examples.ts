/**
 * Event handling examples (inline handlers)
 */

import { element } from '../src/template-builders';
import { reconcileVNodes } from '../src/reconcile';

export function renderCounter(container: HTMLElement) {
  let count = 0;
  const view = () => element('div', { className: 'counter' }, [
    element('span', `Count: ${count}`),
    element('button', { onClick: () => { count++; mount(); } }, '+'),
    element('button', { onClick: () => { count = Math.max(0, count - 1); mount(); } }, '-')
  ]);
  function mount() { reconcileVNodes(null, view() as any, container); }
  mount();
}

export function renderForm(container: HTMLElement) {
  let name = '';
  const view = () => element('form', { onSubmit: (ev: Event) => ev.preventDefault() }, [
    element('input', { value: name, onInput: (ev: any) => { name = ev.target.value; mount(); } }),
    element('button', { type: 'submit' }, 'Submit'),
    element('p', `Hello, ${name || '...'}`)
  ]);
  function mount() { reconcileVNodes(null, view() as any, container); }
  mount();
}


