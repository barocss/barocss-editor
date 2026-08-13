import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { classifyDomChange } from '../../src/dom-sync/dom-change-classifier';

const makeMutation = (init: {
  type: 'characterData' | 'childList' | 'attributes';
  target: Node;
  addedNodes?: Node[];
  removedNodes?: Node[];
  oldValue?: string | null;
}): MutationRecord => {
  const fragment = document.createDocumentFragment();
  const added = document.createDocumentFragment();
  const removed = document.createDocumentFragment();

  init.addedNodes?.forEach(node => added.appendChild(node));
  init.removedNodes?.forEach(node => removed.appendChild(node));

  return {
    type: init.type,
    target: init.target,
    addedNodes: added.childNodes,
    removedNodes: removed.childNodes,
    previousSibling: null,
    nextSibling: null,
    oldValue: init.oldValue ?? null,
    newValue: null,
    attributeName: null,
    attributeNamespace: null,
    source: fragment,
    attributeOldValue: null
  } as MutationRecord;
};

describe('dom-change-classifier', () => {
  let container: HTMLElement;
  let nodeMap: Record<string, any>;

  const createEditor = () => ({
    dataStore: {
      getNode: (id: string) => nodeMap[id]
    }
  } as any);

  const appendTextNode = (sid: string, text: string): HTMLElement => {
    const node = document.createElement('span');
    node.setAttribute('data-bc-sid', sid);
    node.setAttribute('data-bc-stype', 'inline-text');
    node.textContent = text;
    container.appendChild(node);
    return node;
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    nodeMap = {
      doc: {
        sid: 'doc',
        stype: 'document',
        content: ['t1', 't2']
      },
      p1: {
        sid: 'p1',
        stype: 'paragraph',
        text: undefined,
        content: ['t1', 't2']
      },
      t1: {
        sid: 't1',
        stype: 'inline-text',
        text: 'Hello',
        parentId: 'p1'
      },
      t2: {
        sid: 't2',
        stype: 'inline-text',
        text: 'World',
        parentId: 'p1'
      }
    };
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    nodeMap = {};
  });

  it('text-across-runs에서 modelSelection이 없으면 DOM 선택 위치 기준으로 정확한 offset을 계산해야 함', () => {
    const text1 = container.appendChild(document.createTextNode('Hello'));
    const wrapper1 = document.createElement('span');
    wrapper1.setAttribute('data-bc-sid', 't1');
    wrapper1.setAttribute('data-bc-stype', 'inline-text');
    wrapper1.appendChild(text1);

    const text2 = container.appendChild(document.createTextNode('World'));
    const wrapper2 = document.createElement('span');
    wrapper2.setAttribute('data-bc-sid', 't2');
    wrapper2.setAttribute('data-bc-stype', 'inline-text');
    wrapper2.appendChild(text2);

    container.appendChild(wrapper1);
    container.appendChild(wrapper2);

    const selection = window.getSelection();
    expect(selection).toBeTruthy();

    const range = document.createRange();
    range.setStart(text1, 2);
    range.setEnd(text2, 3);
    selection!.removeAllRanges();
    selection!.addRange(range);

    const result = classifyDomChange([
      makeMutation({
        type: 'childList',
        target: container,
        addedNodes: [],
        removedNodes: []
      }),
      makeMutation({
        type: 'characterData',
        target: text1,
        oldValue: 'Hello'
      })
    ], {
      editor: createEditor(),
      selection: window.getSelection() || undefined
    });

    expect(result.case).toBe('text-across-runs');
    expect(result.contentRange).toMatchObject({
      startNodeId: 't1',
      startOffset: 2,
      endNodeId: 't2',
      endOffset: 3
    });
    expect(result.prevText).toBe('lloWor');
    expect(result.newText).toBe('lloWor');
  });

  it('text-across-runs에서 InputHint가 있으면 hint를 우선 사용해야 함', () => {
    const text1 = document.createTextNode('Hello');
    const text2 = document.createTextNode('World');

    const wrapper1 = document.createElement('span');
    wrapper1.setAttribute('data-bc-sid', 't1');
    wrapper1.setAttribute('data-bc-stype', 'inline-text');
    wrapper1.appendChild(text1);

    const wrapper2 = document.createElement('span');
    wrapper2.setAttribute('data-bc-sid', 't2');
    wrapper2.setAttribute('data-bc-stype', 'inline-text');
    wrapper2.appendChild(text2);

    container.appendChild(wrapper1);
    container.appendChild(wrapper2);

    // No DOM selection: rely on inputHint for text-across-runs (multi-node range)
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();

    const result = classifyDomChange([
      makeMutation({
        type: 'characterData',
        target: text1,
        oldValue: 'Hello'
      }),
      makeMutation({
        type: 'childList',
        target: container,
        addedNodes: [],
        removedNodes: []
      })
    ], {
      editor: createEditor(),
      selection: window.getSelection() || undefined,
      inputHint: {
        inputType: 'insertText',
        contentRange: {
          type: 'range',
          startNodeId: 't1',
          startOffset: 1,
          endNodeId: 't2',
          endOffset: 2
        },
        timestamp: Date.now()
      }
    });

    expect(result.case).toBe('text-across-runs');
    expect(result.contentRange?.startOffset).toBe(1);
    expect(result.contentRange?.endOffset).toBe(2);
    expect(result.metadata?.usedInputHint).toBe(true);
  });

  it('block-structure에서 블록 추가/분리가 있는 경우 패턴을 분석해야 함', () => {
    nodeMap['p2'] = { sid: 'p2', stype: 'paragraph', text: undefined, content: [] };

    const paragraph = document.createElement('p');
    paragraph.setAttribute('data-bc-sid', 'p1');
    paragraph.setAttribute('data-bc-stype', 'paragraph');

    const newBlock = document.createElement('p');
    newBlock.setAttribute('data-bc-sid', 'p2');
    newBlock.setAttribute('data-bc-stype', 'paragraph');

    container.appendChild(paragraph);

    const result = classifyDomChange([
      makeMutation({
        type: 'childList',
        target: paragraph,
        addedNodes: [newBlock],
        removedNodes: []
      })
    ], {
      editor: createEditor()
    });

    expect(result.case).toBe('block-structure');
    expect(result.metadata?.pattern).toBe('split');
    expect(result.metadata?.command).toBe('insertParagraph');
  });

  it('inline-markup에서 anchor 추가가 감지되면 auto-link 특수 케이스로 분기해야 함', () => {
    const inline = document.createElement('span');
    inline.setAttribute('data-bc-sid', 't1');
    inline.setAttribute('data-bc-stype', 'inline-text');

    const anchor = document.createElement('a');
    anchor.setAttribute('href', 'https://example.com');
    anchor.textContent = 'link';

    const result = classifyDomChange([
      makeMutation({
        type: 'childList',
        target: inline,
        addedNodes: [anchor],
        removedNodes: []
      })
    ], {
      editor: createEditor()
    });

    expect(result.case).toBe('auto-link');
    expect(result.metadata?.specialCase).toBe('auto-link');
  });
});
