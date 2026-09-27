import { expect, it, vi } from 'vitest';
import { Editor } from '../src/editor';

it('restores the current document when loading the next one fails after changing the store', () => {
  const editor = new Editor();
  editor.loadDocument({ sid: 'b-root', stype: 'document', attributes: { validator: (value: number) => value > 0 }, content: [
    { sid: 'b-paragraph', stype: 'paragraph', text: 'B original' }
  ] }, 'current');
  const before = editor.exportDocument();
  const currentSession = editor.dataStore.getSessionId();
  const changed = vi.fn();
  const operations = vi.fn();
  editor.on('editor:content.change', changed);
  editor.dataStore.onOperation(operations);
  const setNode = editor.dataStore.setNode.bind(editor.dataStore);
  let calls = 0;
  const injection = vi.spyOn(editor.dataStore, 'setNode').mockImplementation((...args) => {
    setNode(...args);
    if (++calls === 2) throw new Error('Injected child load failure');
  });

  expect(() => editor.loadDocument({ sid: 'a-root', stype: 'document', content: [
    { sid: 'a-paragraph', stype: 'paragraph', text: 'A target' }
  ] }, 'next')).toThrow('Injected child load failure');
  injection.mockRestore();

  expect(editor.exportDocument()).toEqual(before);
  expect(editor.getRootId()).toBe('b-root');
  expect(editor.dataStore.getRootNodeId()).toBe('b-root');
  expect(editor.dataStore.getSessionId()).toBe(currentSession);
  expect(changed).not.toHaveBeenCalled();
  expect(operations).not.toHaveBeenCalled();
  editor.dataStore.setNode({ ...editor.dataStore.getNode('b-paragraph')!, text: 'B next' });
  expect(editor.exportDocument().content[0].text).toBe('B next');
  expect(operations).toHaveBeenCalledOnce();
});

it('can replace a document whose node attributes include a function', () => {
  const editor = new Editor();
  const validator = (value: number) => value > 0;
  editor.loadDocument({ sid: 'root', stype: 'document', attributes: { validator }, content: [
    { sid: 'paragraph', stype: 'paragraph', text: 'Original' }
  ] }, 'current');
  const operations = vi.fn();
  editor.dataStore.onOperation(operations);
  expect(() => editor.loadDocument({ sid: 'next-root', stype: 'document', content: [
    { sid: 'next-paragraph', stype: 'paragraph', text: 'Next' }
  ] }, 'next')).not.toThrow();
  expect(editor.getRootId()).toBe('next-root');
  expect(operations).not.toHaveBeenCalled();
});

it('refuses to replace a document inside an active transaction', () => {
  const editor = new Editor();
  editor.loadDocument({ sid: 'root', stype: 'document', content: [
    { sid: 'paragraph', stype: 'paragraph', text: 'Original' }
  ] }, 'current');
  const before = editor.exportDocument();
  editor.dataStore.begin();
  expect(() => editor.loadDocument({ sid: 'next-root', stype: 'document', content: [
    { sid: 'next-paragraph', stype: 'paragraph', text: 'Next' }
  ] }, 'next')).toThrow('active transaction');
  expect(editor.dataStore.isTransactionActive()).toBe(true);
  expect(editor.exportDocument()).toEqual(before);
  editor.dataStore.rollback();
});
