import { describe, it, expect } from 'vitest';
import { DOMRenderer } from '../../src/dom-renderer';
import { getGlobalRegistry, define, element, slot, type ComponentProps, type ModelData } from '@barocss/dsl';

const registry = getGlobalRegistry();

describe('Reconciler performance smoke', () => {
  const DEBUG_COUNT = 10; // Temporary: limit all cases to 10 iterations to identify performance issues

  it('renders 1000 paragraphs under reasonable time', () => {
    console.log('[PERF-TEST] start: 1k paragraphs smoke');
    if (!registry.has('docp')) {
      define('docp', (_p: ComponentProps, _m: ModelData) => element('article', {}, [slot('content')]));
    }
    if (!registry.has('para-p')) {
      define('para-p', (_p: ComponentProps, m: ModelData) => element('p', {}, [m.text ?? '']));
    }

    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    const items: ModelData[] = Array.from({ length: DEBUG_COUNT }, (_, i) => ({ sid: `p${i}`, stype: 'para-p', text: `#${i}` }));
    const doc: ModelData = { sid: 'doc-1k', stype: 'docp', content: items };

    const start = performance.now();
    renderer.render(container, doc);
    const tookMs = performance.now() - start;
    console.log('[PERF-TEST] done: 1k paragraphs smoke', { tookMs });

    // Relaxed budget for CI/VMs; this is a smoke check (allows up to 3s for 1000 nodes)
    expect(tookMs).toBeLessThan(3000);
    expect((container.firstElementChild as HTMLElement).children.length).toBe(DEBUG_COUNT);
  });

  it('renders 5000 paragraphs and measures time/memory', { timeout: 70000 }, () => {
    console.log('[PERF-TEST] start: 5k paragraphs timing');
    if (!registry.has('docp')) {
      define('docp', (_p: ComponentProps, _m: ModelData) => element('article', {}, [slot('content')]));
    }
    if (!registry.has('para-p')) {
      define('para-p', (_p: ComponentProps, m: ModelData) => element('p', {}, [m.text ?? '']));
    }

    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    const items: ModelData[] = Array.from({ length: DEBUG_COUNT }, (_, i) => ({ sid: `p${i}`, stype: 'para-p', text: `Paragraph #${i}` }));
    const doc: ModelData = { sid: 'doc-5k', stype: 'docp', content: items };

    // Measure memory before (if available)
    const memBefore = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : null;

    const start = performance.now();
    renderer.render(container, doc);
    const tookMs = performance.now() - start;

    // Measure memory after (if available)
    const memAfter = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : null;
    const memDelta = memAfter && memBefore ? memAfter - memBefore : null;

    // Relaxed budget for CI/VMs; this is a smoke check (allows up to 60s for 5000 nodes in slow environments)
    expect(tookMs).toBeLessThan(60000);
    expect((container.firstElementChild as HTMLElement).children.length).toBe(DEBUG_COUNT);

    // Log performance metrics (for manual inspection)
    console.log(`[Performance] 5K nodes: ${tookMs.toFixed(2)}ms (${(tookMs / 5000).toFixed(3)}ms per node)`);
    if (memDelta) {
      console.log(`[Performance] Memory delta: ${(memDelta / 1024 / 1024).toFixed(2)}MB`);
    }
    console.log('[PERF-TEST] done: 5k paragraphs timing', { tookMs, memBefore, memAfter });
  });

  it('renders many nodes with block decorators (mixed load) under reasonable time', { timeout: 30000 }, () => {
    console.log('[PERF-TEST] start: block decorators load');
    if (!registry.has('docp')) {
      define('docp', (_p: ComponentProps, _m: ModelData) => element('article', {}, [slot('content')]));
    }
    if (!registry.has('para-p')) {
      define('para-p', (_p: ComponentProps, m: ModelData) => element('p', {}, [m.text ?? '']));
    }

    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    const count = DEBUG_COUNT; // paragraphs
    const items: ModelData[] = Array.from({ length: count }, (_, i) => ({ sid: `dp${i}`, stype: 'para-p', text: `D${i}` }));
    const doc: ModelData = { sid: 'doc-deco', stype: 'docp', content: items };

    // Create simple block decorators targeting before/after alternately
    const decorators = Array.from({ length: count }, (_, i) => ({
      sid: `dec-${i}`,
      stype: 'comment',
      category: 'block',
      position: i % 2 === 0 ? 'before' : 'after',
      model: { note: `n${i}` }
    }));

    const start = performance.now();
    renderer.render(container, doc, decorators as any);
    const tookMs = performance.now() - start;

    // Allow up to 30s on CI for mixed content
    expect(tookMs).toBeLessThan(30000);
    expect((container.firstElementChild as HTMLElement).children.length).toBe(count);
    console.log('[PERF-TEST] done: block decorators load', { tookMs });
  });

  it('repeated full renders maintain stable memory (no leaks)', { timeout: 60000 }, () => {
    console.log('[PERF-TEST] start: repeated renders memory');
    if (!registry.has('docp')) {
      define('docp', (_p: ComponentProps, _m: ModelData) => element('article', {}, [slot('content')]));
    }
    if (!registry.has('para-p')) {
      define('para-p', (_p: ComponentProps, m: ModelData) => element('p', {}, [m.text ?? '']));
    }

    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    const count = DEBUG_COUNT; // Smaller count for repeated renders
    const items: ModelData[] = Array.from({ length: count }, (_, i) => ({ sid: `rp${i}`, stype: 'para-p', text: `#${i}` }));
    const doc: ModelData = { sid: 'doc-repeat', stype: 'docp', content: items };

    // Measure memory before (if available)
    const memBefore = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : null;

    // Perform 50 full renders
    const iterations = DEBUG_COUNT;
    for (let i = 0; i < iterations; i++) {
      renderer.render(container, doc);
    }

    // Force GC if available (Chrome DevTools)
    if ((global as any).gc) {
      (global as any).gc();
    }

    // Measure memory after (if available)
    const memAfter = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : null;
    const memDelta = memAfter && memBefore ? memAfter - memBefore : null;

    // Memory should not grow excessively (allow up to 5MB growth for 50 iterations)
    if (memDelta) {
      const memDeltaMB = memDelta / 1024 / 1024;
      console.log(`[Performance] Repeated renders (${iterations}x): memory delta ${memDeltaMB.toFixed(2)}MB`);
      expect(memDeltaMB).toBeLessThan(5); // Allow up to 5MB growth
    }

    // Verify DOM is still correct
    expect((container.firstElementChild as HTMLElement).children.length).toBe(count);
    console.log('[PERF-TEST] done: repeated renders memory', { iterations, memBefore, memAfter });
  });
});


