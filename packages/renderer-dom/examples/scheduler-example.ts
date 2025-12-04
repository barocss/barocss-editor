import { data, define, element } from '../src/template-builders';
import { build } from '../src/factory';
import { render } from '../src/reconcile';
import { ReconcileScheduler } from '../src/scheduler';

// Define a trivial template
define('counter-view', element('div', { className: 'counter' }, [
  element('span', ['Count: ']),
  element('strong', [ data('count') ])
]));

// Build function from model
function fromModel(model: { count: number }) {
  return build('counter-view', { id: 'counter', type: 'counter', count: model.count });
}

// Render wrapper
const doRender = (prev: any, next: any, container: HTMLElement) => {
  render(prev, next, container);
};

// Create scheduler (microtask coalescing)
const scheduler = new ReconcileScheduler(doRender, 'microtask');

// Example usage
export function runSchedulerExample(container: HTMLElement) {
  let prev: any = null;
  let model = { count: 0 };

  function enqueueRender() {
    const next = fromModel(model);
    scheduler.enqueue(prev, next, container);
    prev = next;
  }

  // Simulate multiple rapid updates
  model = { count: 1 }; enqueueRender();
  model = { count: 2 }; enqueueRender();
  model = { count: 3 }; enqueueRender();
}


