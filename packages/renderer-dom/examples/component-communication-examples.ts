/**
 * Component communication via registry events (emit/on)
 */

import { element, renderer } from '../src/template-builders';
import { reconcileVNodes } from '../src/reconcile';
import { buildVNode } from '../src/factory';
import { getGlobalRegistry } from '../src/template-builders';

export function renderPubSub(container: HTMLElement) {
  const registry = getGlobalRegistry();
  let last = '';

  // Publisher - 새로운 통합 문법
  renderer('publisher', (props, ctx) => {
    return element('div', [
      element('button', { onClick: () => registry.emit('bus:message', { text: props.text || 'hello' }) }, 'Publish')
    ]);
  });

  // Subscriber - 새로운 통합 문법
  renderer('subscriber', (props, ctx) => {
    return element('div', [ element('p', `Last: ${props.last || ''}`) ]);
  });

  // Register main container renderer
  renderer('document', element('div', [
    element('publisher', { text: 'ping' }),
    element('subscriber', { last })
  ]));

  function render() {
    const view = buildVNode('document', {});
    reconcileVNodes(null, view, container);
  }

  // subscribe once outside of render to avoid accumulation
  const onMessage = (data: any) => {
    last = data.text;
    render();
  };
  registry.on('bus:message', onMessage);

  render();
}


