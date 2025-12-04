/**
 * Context component examples (registerContextComponent)
 */

import { element, renderer } from '../src/template-builders';
import { reconcileVNodes } from '../src/reconcile';
import { buildVNode } from '../src/factory';
import { getGlobalRegistry } from '../src/template-builders';

export function renderContextCounter(container: HTMLElement) {

  // 새로운 통합 문법
  renderer('x-counter', (props, ctx) => {
    ctx.initState({ count: props.initial ?? 0 });
    return element('div', { className: 'x-counter' }, [
      element('span', `Count: ${ctx.state.count}`),
      element('button', { onClick: () => ctx.setState({ count: ctx.state.count + 1 }) }, '+'),
      element('button', { onClick: () => ctx.setState({ count: Math.max(0, ctx.state.count - 1) }) }, '-')
    ]);
  });

  renderer('document', element('div', [ element('x-counter', { initial: 2 }) ]));
  const view = buildVNode('document', {});
  reconcileVNodes(null, view, container);
}

export function renderContextTodoList(container: HTMLElement) {

  // 새로운 통합 문법
  renderer('todo-item', (props, ctx) => {
    ctx.initState({ done: !!props.done });
    const toggle = () => ctx.setState({ done: !ctx.state.done });
    return element('li', { className: ['todo', { done: ctx.state.done }] }, [
      element('input', { type: 'checkbox', checked: ctx.state.done, onChange: toggle }),
      element('span', { style: { marginLeft: '8px' } }, props.text)
    ]);
  });

  renderer('document', element('ul', [
    element('todo-item', { text: 'Context item 1' }),
    element('todo-item', { text: 'Context item 2', done: true })
  ]));
  const view = buildVNode('document', {});
  reconcileVNodes(null, view, container);
}


