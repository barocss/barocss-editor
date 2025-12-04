/**
 * Minimal SSR + Hydration example
 */

import { element, renderer } from '../src/template-builders';
import { renderToString, hydrate } from '../src/ssr';
import { getGlobalRegistry } from '../src/template-builders';

export function buildRegistry() {
  const registry = getGlobalRegistry();
  
  // 새로운 통합 문법으로 ExternalComponent 등록
  renderer('card', {
    managesDOM: false,
    mount(container, props) {
      const el = document.createElement('div');
      el.className = 'card';
      container.appendChild(el);
      return el;
    },
    update() {},
    unmount(instance) { instance.element.remove(); }
  });
  
  return registry;
}

export function serverHTML(registry: any) {
  renderer('document', element('section', { className: ['page', { light: true }] }, [
    element('h2', 'SSR Demo'),
    element('card', { title: 'Hello' }, element('p', 'Card content'))
  ]));
  
  const page = element('document', {});
  return renderToString(page as any, registry);
}

export function clientHydrate(registry: any, container: HTMLElement) {
  renderer('document', element('section', { className: ['page', { light: true }] }, [
    element('h2', 'SSR Demo'),
    element('card', { title: 'Hello' }, element('p', 'Card content'))
  ]));
  
  const page = element('document', {});
  hydrate(page as any, container, registry);
}


