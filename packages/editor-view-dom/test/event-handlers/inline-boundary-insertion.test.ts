import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputHandlerImpl } from '../../src/event-handlers/input-handler';

afterEach(() => { window.getSelection()?.removeAllRanges(); document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('collapsed insertion after a nested inline', () => {
  it.each([
    { name: 'preserves the visible caret outside a nested inline', nested: true, collapsed: true, agrees: true, expected: 'after' },
    { name: 'keeps replacement target ranges authoritative', nested: true, collapsed: false, agrees: true, expected: 'inside' },
    { name: 'does not override a target from a newer caret', nested: true, collapsed: true, agrees: false, expected: 'inside' },
    { name: 'retains ordinary adjacent run affinity', nested: false, collapsed: true, agrees: true, expected: 'inside' },
  ])('$name', ({ nested, collapsed, agrees, expected }) => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(0);
    const scope = document.createElement('div'), text = document.createTextNode(' after');
    scope.append(text); document.body.append(scope);
    window.getSelection()!.collapse(text, 0);
    const visible = { type: 'range', startNodeId: 'after', endNodeId: 'after', startOffset: 0, endOffset: 0, collapsed: true };
    const target = { type: 'range', startNodeId: 'inside', endNodeId: 'inside', startOffset: collapsed ? 3 : 0, endOffset: 3, collapsed };
    const nodes: Record<string, object> = {
      after: { sid: 'after', stype: 'inline-text', text: ' after', parentId: 'paragraph' },
      inside: { sid: 'inside', stype: 'inline-text', text: 'x+2', parentId: nested ? 'math' : 'paragraph' },
      math: { sid: 'math', stype: 'inline', parentId: 'paragraph' },
      paragraph: { sid: 'paragraph', stype: 'paragraph' },
    };
    const executeCommand = vi.fn().mockResolvedValue(true);
    const handler = new InputHandlerImpl({
      selection: agrees ? visible : target,
      dataStore: { getNode: (id: string) => nodes[id] },
      executeCommand, updateSelection: vi.fn(), emit: vi.fn(), on: vi.fn(), off: vi.fn(), getDecorators: () => [],
    } as never, {
      contentEditableElement: scope,
      convertStaticRangeToModel: () => target,
      convertDOMSelectionToModel: () => visible,
      convertModelSelectionToDOM: vi.fn(), getDecorators: () => [],
    } as never);
    const event = new InputEvent('beforeinput', { inputType: 'insertText', data: ' ', cancelable: true });
    Object.defineProperty(event, 'getTargetRanges', { value: () => [{ collapsed }] });
    handler.handleBeforeInput(event);
    expect(event.defaultPrevented).toBe(true);
    expect(executeCommand).toHaveBeenCalledWith('replaceText', expect.objectContaining({ range: expect.objectContaining({ startNodeId: expected }) }));
  });
});
