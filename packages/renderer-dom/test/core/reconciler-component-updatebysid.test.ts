import { describe, it, expect } from 'vitest';
import { DOMRenderer } from '../../src/dom-renderer';
import { getGlobalRegistry, define, element, slot } from '@barocss/dsl';
import { normalizeHTML } from '../utils/html';

const registry = getGlobalRegistry();

if (!registry.has('paragraph')) {
  define('paragraph', (_props: any, model: any) => element('p', {}, [model?.text ?? '']));
}
if (!registry.has('document')) {
  define('document', (_props: any, _model: any) => element('article', { className: 'document' }, [slot('content')]));
}

describe('Reconciler updateBySid behavior', () => {
  it('updates only target subtree via updateBySid', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    const p1 = { sid: 'p1', stype: 'paragraph', text: 'A' } as any;
    const p2 = { sid: 'p2', stype: 'paragraph', text: 'B' } as any;
    const doc = { sid: 'doc', stype: 'document', content: [p1, p2] } as any;

    renderer.render(container, doc);
    const before = normalizeHTML(container.firstElementChild as Element);
    expect(before).toContain('A');
    expect(before).toContain('B');

    // re-render with only p2 changed
    const p2Updated = { sid: 'p2', stype: 'paragraph', text: 'B2' } as any;
    const docUpdated = { sid: 'doc', stype: 'document', content: [p1, p2Updated] } as any;
    renderer.render(container, docUpdated);

    const after = normalizeHTML(container.firstElementChild as Element);
    expect(after).toContain('A');
    expect(after).toContain('B2');
    expect(after).not.toContain('>B<');
  });

  it('same sid re-render keeps other nodes unchanged', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    const p1 = { sid: 'p1', stype: 'paragraph', text: 'One' } as any;
    const p2 = { sid: 'p2', stype: 'paragraph', text: 'Two' } as any;
    const doc = { sid: 'doc', stype: 'document', content: [p1, p2] } as any;

    renderer.render(container, doc);
    const before = normalizeHTML(container.firstElementChild as Element);

    // re-render only p1 changed
    const p1New = { sid: 'p1', stype: 'paragraph', text: 'One!' } as any;
    const docUpdated = { sid: 'doc', stype: 'document', content: [p1New, p2] } as any;
    renderer.render(container, docUpdated);

    const after = normalizeHTML(container.firstElementChild as Element);
    expect(after).toContain('One!');
    expect(after).toContain('Two');
    expect(after.indexOf('One!') < after.indexOf('Two')).toBe(true);
  });

  it('two instances update independently', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    const p1 = { sid: 'p1', stype: 'paragraph', text: 'X' } as any;
    const p2 = { sid: 'p2', stype: 'paragraph', text: 'Y' } as any;
    const doc = { sid: 'doc', stype: 'document', content: [p1, p2] } as any;

    renderer.render(container, doc);
    const before = normalizeHTML(container.firstElementChild as Element);
    expect(before).toContain('X');
    expect(before).toContain('Y');

    renderer.render(container, { sid: 'doc', stype: 'document', content: [
      { sid: 'p1', stype: 'paragraph', text: 'X1' } as any,
      p2
    ] } as any);
    let mid = normalizeHTML(container.firstElementChild as Element);
    expect(mid).toContain('X1');
    expect(mid).toContain('Y');

    renderer.render(container, { sid: 'doc', stype: 'document', content: [
      { sid: 'p1', stype: 'paragraph', text: 'X1' } as any,
      { sid: 'p2', stype: 'paragraph', text: 'Y1' } as any
    ] } as any);
    const after = normalizeHTML(container.firstElementChild as Element);
    expect(after).toContain('X1');
    expect(after).toContain('Y1');
  });
});


