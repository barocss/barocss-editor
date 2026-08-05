import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, getGlobalRegistry, slot } from '@barocss/dsl';
import { DOMRenderer } from '../src/dom-renderer';

/**
 * Templates receive the node they are drawing and nothing else, which is not
 * enough for a node whose appearance depends on the document around it — a Word
 * paragraph's style, a list counter, the page its text reached.
 *
 * Products solved that with module-level state, which quietly scopes the
 * document to the *module* rather than to the render: two editors on one page
 * read each other's. The environment travels with the render instead, so these
 * tests are mostly about isolation.
 */
describe('the environment templates render against', () => {
  beforeEach(() => {
    getGlobalRegistry().clear?.();
  });

  const model = { sid: 'n1', stype: 'note', content: [] };

  it('reaches an attribute function as its second argument', () => {
    define(
      'note',
      element('div', {
        className: (_d: any, env?: any) => `note-${env?.theme ?? 'none'}`
      })
    );

    const host = document.createElement('div');
    const renderer = new DOMRenderer(getGlobalRegistry(), { env: { theme: 'dark' } });
    renderer.render(host, model as any);

    expect(host.querySelector('div')?.className).toContain('note-dark');
  });

  it('reaches a style function too', () => {
    define(
      'note',
      element('div', {
        style: (_d: any, env?: any) => ({ color: (env?.colour as string) ?? 'black' })
      })
    );

    const host = document.createElement('div');
    new DOMRenderer(getGlobalRegistry(), { env: { colour: 'red' } }).render(host, model as any);

    expect((host.querySelector('div') as HTMLElement)?.style.color).toBe('red');
  });

  it('reaches a contextual component through ctx.env', () => {
    define('note', (_props: any, _model: any, ctx: any) =>
      element('div', { 'data-doc': String(ctx?.env?.docTitle ?? '') }, [slot('content')])
    );

    const host = document.createElement('div');
    new DOMRenderer(getGlobalRegistry(), { env: { docTitle: 'Report' } }).render(host, model as any);

    expect(host.querySelector('div')?.getAttribute('data-doc')).toBe('Report');
  });

  it('keeps two renderers from reading each other, which is the whole point', () => {
    define(
      'note',
      element('div', {
        className: (_d: any, env?: any) => `doc-${env?.docId ?? 'none'}`
      })
    );

    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    new DOMRenderer(getGlobalRegistry(), { env: { docId: 'A' } }).render(hostA, model as any);
    new DOMRenderer(getGlobalRegistry(), { env: { docId: 'B' } }).render(hostB, model as any);

    // The same node type, the same model, two documents
    expect(hostA.querySelector('div')?.className).toContain('doc-A');
    expect(hostB.querySelector('div')?.className).toContain('doc-B');
  });

  it('can be replaced between renders, because layout is computed from a render', () => {
    define(
      'note',
      element('div', {
        'data-page': (_d: any, env?: any) => String(env?.page ?? '')
      })
    );

    const host = document.createElement('div');
    const renderer = new DOMRenderer(getGlobalRegistry());

    // Nothing is known before the first render
    renderer.render(host, model as any);
    expect(host.querySelector('div')?.getAttribute('data-page')).toBe('');

    // ...and the measurement it produced can be put back in
    renderer.setEnv({ page: 2 });
    renderer.render(host, model as any);
    expect(host.querySelector('div')?.getAttribute('data-page')).toBe('2');
  });

  it('renders without one, so a template can be used before anything is measured', () => {
    define(
      'note',
      element('div', {
        className: (_d: any, env?: any) => (env?.theme ? `t-${env.theme}` : 'plain')
      })
    );

    const host = document.createElement('div');
    new DOMRenderer(getGlobalRegistry()).render(host, model as any);

    expect(host.querySelector('div')?.className).toContain('plain');
  });
});
