/**
 * Controlled inputs with inline/context components
 */

import { element, define } from '../src/template-builders';
import { render } from '../src/reconcile';
import { build } from '../src/factory';

export function renderInlineControlled(container: HTMLElement) {
  let value = '';
  
  // 새로운 통합 문법으로 inline 컴포넌트 등록
  define('inline-input', (props, ctx) => {
    ctx.initState({ value: value });
    return element('div', [
      element('input', { 
        value: value, 
        placeholder: 'Type here', 
        onInput: (ev: any) => { 
          value = ev.target.value; 
          ctx.setState({ value: value });
        } 
      }),
      element('p', `You typed: ${value || '...'}`)
    ]);
  });
  
  define('document', element('div', [ element('inline-input', {}) ]));
  
  function mount() { 
    const view = build('document', {});
    render(null, view, container); 
  }
  
  mount();
}

export function renderContextControlled(container: HTMLElement) {
  // 새로운 통합 문법
  define('text-input', (props, ctx) => {
    ctx.initState({ value: props.initial || '' });
    return element('div', [
      element('input', { value: ctx.state.value, placeholder: props.placeholder || 'Type...', onInput: (ev: any) => ctx.setState({ value: ev.target.value }) }),
      element('p', `Value: ${ctx.state.value || '...'}`)
    ]);
  });
  
  define('document', element('div', [ element('text-input', { initial: 'hello' }) ]));
  const view = build('document', {});
  render(null, view, container);
}


