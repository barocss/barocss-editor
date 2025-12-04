/**
 * className normalization examples
 */

import { element, renderer } from '../src/template-builders';
import { reconcileVNodes } from '../src/reconcile';
import { buildVNode } from '../src/factory';

export function renderClasses(container: HTMLElement) {
  // Register document renderer (automatically goes to global registry)
  renderer('document', element('div', [
    element('div', { className: 'box' }, ['string']),
    element('div', { className: ['box', 'rounded'] }, ['array']),
    element('div', { className: { active: true, hidden: false } }, ['map']),
    element('div', { className: ['box', { selected: true }, ['mt-2', { light: true }]] }, ['mixed'])
  ]));

  // Build VNode using global builder
  const samples = buildVNode('document', {});
  
  reconcileVNodes(null, samples, container);
}
