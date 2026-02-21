import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DevtoolOptions, EventLog, ModelTreeNode, ExecutionFlow, Trace, Span } from '../src/types';

describe('Devtool types', () => {
  it('DevtoolOptions has required fields', () => {
    const opts: DevtoolOptions = {
      editor: {
        on: vi.fn(),
        emit: vi.fn(),
        getDocumentProxy: vi.fn(),
        selection: null,
      } as any,
      maxEvents: 100,
      debug: true,
    };
    expect(opts.editor).toBeDefined();
    expect(opts.maxEvents).toBe(100);
    expect(opts.debug).toBe(true);
  });

  it('EventLog has correct shape', () => {
    const log: EventLog = {
      id: 'evt-1',
      timestamp: Date.now(),
      type: 'editor:content.change',
      data: { foo: 'bar' },
      category: 'editor',
    };
    expect(log.id).toBe('evt-1');
    expect(log.type).toBe('editor:content.change');
    expect(log.category).toBe('editor');
  });

  it('ModelTreeNode supports text and children', () => {
    const node: ModelTreeNode = {
      id: 'node-1',
      type: 'paragraph',
      text: 'Hello',
      children: [
        { id: 'node-2', type: 'inline-text', text: 'World' }
      ],
      marks: [{ type: 'bold', range: [0, 5] }],
    };
    expect(node.id).toBe('node-1');
    expect(node.children).toHaveLength(1);
    expect(node.marks![0].type).toBe('bold');
  });

  it('ModelTreeNode supports textRuns', () => {
    const node: ModelTreeNode = {
      id: 'text-1',
      type: 'inline-text',
      textRuns: [
        { text: 'Hello', start: 0, end: 5, marks: ['bold'], decorators: [] },
        { text: ' World', start: 5, end: 11, marks: [], decorators: ['highlight'] },
      ],
    };
    expect(node.textRuns).toHaveLength(2);
    expect(node.textRuns![0].marks).toContain('bold');
    expect(node.textRuns![1].decorators).toContain('highlight');
  });

  it('ModelTreeNode supports selection', () => {
    const node: ModelTreeNode = {
      id: 'text-1',
      type: 'inline-text',
      selection: { start: 2, end: 5 },
    };
    expect(node.selection!.start).toBe(2);
    expect(node.selection!.end).toBe(5);
  });

  it('Span has correct structure', () => {
    const span: Span = {
      spanId: 'span-1',
      operationName: 'insertText',
      startTime: Date.now(),
      className: 'TransactionContext',
      package: '@barocss/model',
    };
    expect(span.spanId).toBe('span-1');
    expect(span.operationName).toBe('insertText');
    expect(span.endTime).toBeUndefined();
  });

  it('ExecutionFlow extends Trace', () => {
    const flow: ExecutionFlow = {
      traceId: 'trace-1',
      spans: [
        {
          spanId: 'span-1',
          operationName: 'transaction',
          startTime: 1000,
          endTime: 1050,
          duration: 50,
        }
      ],
      startTime: 1000,
      endTime: 1050,
      duration: 50,
      command: {
        name: 'toggleBold',
        payload: {},
        success: true,
      },
    };
    expect(flow.traceId).toBe('trace-1');
    expect(flow.command!.name).toBe('toggleBold');
    expect(flow.spans).toHaveLength(1);
  });
});

describe('AutoTracer exports', () => {
  it('module exports AutoTracer', async () => {
    const mod = await import('../src/index');
    expect(mod.AutoTracer).toBeDefined();
  });

  it('module exports Devtool', async () => {
    const mod = await import('../src/index');
    expect(mod.Devtool).toBeDefined();
  });
});
