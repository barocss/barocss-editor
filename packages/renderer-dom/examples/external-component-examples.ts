/**
 * External component examples (registerComponent)
 */

import { element, renderer } from '../src/template-builders';
import { reconcileVNodes } from '../src/reconcile';
import { buildVNode } from '../src/factory';

export function renderExternalComponents(container: HTMLElement) {
  // External component that does NOT manage DOM (children rendered by reconcile) - 새로운 통합 문법
  renderer('panel', {
    managesDOM: false,
    mount(container, props) {
      const el = document.createElement('div');
      el.className = `panel ${props.variant || 'default'}`;
      el.style.border = '1px solid #e1e5e9';
      el.style.borderRadius = '8px';
      el.style.padding = '12px';
      container.appendChild(el);
      return el;
    },
    update() {},
    unmount(instance) { instance.element.remove(); }
  });

  // External component that DOES manage DOM (reconcile will not render children) - 새로운 통합 문법
  renderer('chart', {
    managesDOM: true,
    mount(container, props) {
      const el = document.createElement('div');
      el.className = 'chart';
      el.textContent = `Chart: ${props.series?.length || 0} points`;
      el.style.padding = '8px';
      el.style.background = '#f8fafc';
      container.appendChild(el);
      return el;
    },
    update(instance, prev, next) {
      instance.element.textContent = `Chart: ${next.series?.length || 0} points`;
    },
    unmount(instance) { instance.element.remove(); }
  });

  renderer('document', element('div', [
    element('panel', { variant: 'info' }, [ element('h3', 'Panel Title'), element('p', 'Panel body rendered by reconcile') ]),
    element('chart', { series: [1,2,3,4] })
  ]));

  const view = buildVNode('document', {});
  reconcileVNodes(null, view, container);
}


