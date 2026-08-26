/**
 * MutationObserver 통합 테스트
 *
 * MutationObserver → InputHandler → Editor 트랜잭션 흐름을 검증합니다.
 *
 * 일부 테스트는 it.skip: DOM 텍스트 변경 시 InputHandler가 UNKNOWN으로 분류하여
 * handleTextContentChange가 호출되지 않음. MO→InputHandler 흐름 수정 후 unskip.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { DataStore } from '@barocss/datastore';
import { define, element, data, slot, getGlobalRegistry } from '@barocss/dsl';
import { DOMRenderer } from '@barocss/renderer-dom';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { MutationObserverManagerImpl } from '../../src/mutation-observer/mutation-observer-manager';
import { InputHandlerImpl } from '../../src/event-handlers/input-handler';

/** First text node under element (renderer wraps text in inner span). */
function findFirstTextNode(node: Node | null): Text | null {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  for (const child of node.childNodes) {
    const t = findFirstTextNode(child);
    if (t) return t;
  }
  return null;
}

describe('MutationObserver Integration', () => {
  let editor: Editor;
  let editorView: EditorViewDOM;
  let container: HTMLElement;
  let registry: any;

  beforeEach(() => {
    // Initialize Registry
    registry = getGlobalRegistry();
    
    // Define basic components
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', {
      className: 'text',
      'data-bc-sid': (data: any) => data.sid || '',
      'data-bc-stype': (data: any) => data.stype || ''
    }, [data('text')]));

    /*
   * A **real** editor with a real store, not a hand-rolled one.
     *
   * There was a mock here with eight methods on it, and five of this file's tests were
   * `it.skip`ped. Enabled to find out why, every one failed with `this.editor.executeCommand is not
   * a function` — the mock had eight methods and the editor has grown more. A fake that has to keep
   * up with a real type is the same fault as a cast that hides one: it drifts, and the drift shows
   * up as a skipped test rather than as a failure.
     *
   * `executeTransaction` is still spied on, because what these tests ask is *whether a DOM change
   * reaches the model* — and a spy on the real method answers that without replacing the editor.
   */
    const dataStore = new DataStore(undefined as never, undefined as never);
    editor = new Editor({ editable: true, dataStore } as never);
    editor.loadDocument({ sid: 'doc1', stype: 'document', content: [] } as never, 'mutation-test');
    vi.spyOn(editor, 'executeTransaction');

    // Create DOM container
    container = document.createElement('div');
    document.body.appendChild(container);

    // Create EditorViewDOM
    editorView = new EditorViewDOM(editor, {
      container,
      registry,
      autoRender: false
    });
  });

  afterEach(() => {
    if (editorView) {
      editorView.destroy();
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.clearAllMocks();
  });

  /*
   * ── Five tests were here, on a route that was retired ──────────────────
     *
   * They asserted that a DOM text change reaches `InputHandler.handleTextContentChange`, and it
   * does not: `mutation-observer-manager.ts` says so in its own comment — *"onTextChange is
   * disabled … handleDomMutations path is authoritative for text content changes."* The route was
   * replaced and the tests were `it.skip`ped rather than moved, so five checks sat switched off
   * describing a path the product had left.
     *
   * That was not why they were skipped, though, and the difference is worth keeping. Enabled, they
   * failed first on `this.editor.executeCommand is not a function` — a **hand-rolled mock editor**
   * with eight methods on it, which the real `Editor` had outgrown. A fake that has to keep up with
   * a real type is the same fault as a cast that hides one: it drifts, and here the drift showed up
   * as tests being switched off rather than as a failure anybody saw.
     *
   * The mock is gone (this file builds a real editor over a real store now) and the live route is
   * held in `editor-view-react/test/input-handler-ims.test.ts`, which asks `handleDomMutations`
   * directly. What is left below is what this file can honestly hold: that the observer is set up,
   * that a node the store has never seen writes nothing, and that a node with no sid is never even
   * reached.
   */

  describe('MutationObserverManager 직접 테스트', () => {
    it('MutationObserverManager가 설정되어야 함', () => {
      const mutationObserverManager = (editorView as any).mutationObserverManager as MutationObserverManagerImpl;
      expect(mutationObserverManager).toBeTruthy();
    });

  });

  describe('에러 처리', () => {
    it('모델 노드를 찾을 수 없을 때 에러 없이 처리되어야 함', async () => {
      // Set initial model
      const model = {
        stype: 'document',
        sid: 'doc1',
        content: [
          {
            stype: 'paragraph',
            sid: 'p1',
            content: [
              {
                stype: 'inline-text',
                sid: 't1',
                text: 'Hello'
              }
            ]
          }
        ]
      };

      /*
     * A node the **store really does not have**, rather than a `getNode` stubbed to lie.
       *
     * The document is rendered from `model` and never loaded, so the DOM carries sids the store has
     * never seen — which is the situation being described, arrived at instead of faked. A stub
     * would also have made every *other* lookup in this render return null, which is a different
     * and much stranger document than the one the test is named after.
     */

      // Render EditorViewDOM
      await editorView.render(model as any);

      // Find text node in DOM (content may be wrapped in inner span)
      const textElement = container.querySelector('[data-bc-sid="t1"]') as HTMLElement;
      const textNode = findFirstTextNode(textElement);
      expect(textNode).toBeTruthy();

      // Change text
      textNode!.textContent = 'Hello World';

      // Wait until MutationObserver detects change
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should handle without error (executeTransaction is not called)
      expect(editor.executeTransaction).not.toHaveBeenCalled();
    });

    it('data-bc-sid가 없는 노드는 무시되어야 함', async () => {
      // Create regular div element (no data-bc-sid)
      const div = document.createElement('div');
      div.textContent = 'Hello';
      container.appendChild(div);

      // Spy on InputHandler
      const inputHandler = (editorView as any).inputHandler as InputHandlerImpl;
      const handleTextContentChangeSpy = vi.spyOn(inputHandler, 'handleTextContentChange');

      // Change text
      div.textContent = 'Hello World';

      // Wait until MutationObserver detects change
      await new Promise((resolve) => setTimeout(resolve, 100));

      /*
     * The spy was set up and never asked, and three comments hedged about what should happen —
     * *"may be called … Actually … it may be called … But …"*. A test that cannot say what it wants
     * asserts nothing, and this one did.
       *
     * What it wants is the invariant the observer exists for: text outside the document is not the
     * document.
       *
     * And the answer is better than the comments guessed. They hedged that the handler *"may be
     * called"* and would early-return; measured, it is **never reached** — the observer filters on
     * `data-bc-sid` before the handler is a question. Asserting the guess would have been asserting
     * something that is not true of this code, in a test named after the behaviour.
     */
      expect(handleTextContentChangeSpy).not.toHaveBeenCalled();
      expect(editor.executeTransaction).not.toHaveBeenCalled();
    });
  });
});

