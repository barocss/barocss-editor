import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  handleVNodeTextProperty,
  handlePrimitiveTextChild,
  handleTextOnlyVNode,
  updateHostTextContent,
} from '../../src/reconcile/utils/text-node-handlers';
import { VNode } from '../../src/vnode/types';

describe('reconcile-utils: text-node-handlers', () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
  });

  afterEach(() => {
    document.body.removeChild(parent);
  });

  describe('handleVNodeTextProperty', () => {
    it('should render text when vnode has text and no children', () => {
      const nextVNode: VNode = {
        tag: 'div',
        text: 'text content',
        children: [],
      } as VNode;

      const result = handleVNodeTextProperty(parent, nextVNode, undefined);
      expect(result).toBe(true);
      expect(parent.firstChild).toBeInstanceOf(Text);
      expect(parent.firstChild?.textContent).toBe('text content');
    });

    it('should return false if vnode has children', () => {
      const nextVNode: VNode = {
        tag: 'div',
        text: 'text content',
        children: [{ tag: 'span' } as VNode],
      } as VNode;

      const result = handleVNodeTextProperty(parent, nextVNode, undefined);
      expect(result).toBe(false);
    });

    it('should return false if vnode has no text', () => {
      const nextVNode: VNode = {
        tag: 'div',
      } as VNode;

      const result = handleVNodeTextProperty(parent, nextVNode, undefined);
      expect(result).toBe(false);
    });

    it('should reuse existing text node if prevVNode has text', () => {
      const existingText = document.createTextNode('old text');
      parent.appendChild(existingText);

      const prevVNode: VNode = {
        tag: 'div',
        text: 'old text',
      } as VNode;

      const nextVNode: VNode = {
        tag: 'div',
        text: 'new text',
      } as VNode;

      handleVNodeTextProperty(parent, nextVNode, prevVNode);

      expect(parent.firstChild).toBe(existingText);
      expect(parent.firstChild?.textContent).toBe('new text');
    });

    it('should remove all children and create new text node if no existing text node', () => {
      const existingElement = document.createElement('span');
      parent.appendChild(existingElement);

      const nextVNode: VNode = {
        tag: 'div',
        text: 'text content',
      } as VNode;

      handleVNodeTextProperty(parent, nextVNode, undefined);

      expect(parent.children.length).toBe(0);
      expect(parent.firstChild).toBeInstanceOf(Text);
      expect(parent.firstChild?.textContent).toBe('text content');
    });
  });

  describe('handlePrimitiveTextChild', () => {
    it('should create text node for string', () => {
      const result = handlePrimitiveTextChild(parent, 'hello');
      expect(result).toBeInstanceOf(Text);
      expect(result.textContent).toBe('hello');
      expect(parent.firstChild).toBe(result);
    });

    it('should create text node for number', () => {
      const result = handlePrimitiveTextChild(parent, 123);
      expect(result).toBeInstanceOf(Text);
      expect(result.textContent).toBe('123');
    });

    it('should reuse existing text node', () => {
      const existingText = document.createTextNode('old');
      parent.appendChild(existingText);

      const result = handlePrimitiveTextChild(parent, 'new');
      expect(result).toBe(existingText);
      expect(result.textContent).toBe('new');
    });

    it('should not update if content is same', () => {
      const existingText = document.createTextNode('same');
      parent.appendChild(existingText);

      const result = handlePrimitiveTextChild(parent, 'same');
      expect(result).toBe(existingText);
      expect(result.textContent).toBe('same');
    });
  });

  describe('handleTextOnlyVNode', () => {
    it('should create text node at correct position', () => {
      const childVNode: VNode = {
        text: 'text content',
      } as VNode;

      const result = handleTextOnlyVNode(parent, childVNode, 0);
      expect(result).toBeInstanceOf(Text);
      expect(result.textContent).toBe('text content');
      expect(parent.firstChild).toBe(result);
    });

    it('should reuse existing text node at same position', () => {
      const existingText = document.createTextNode('old');
      parent.appendChild(existingText);

      const childVNode: VNode = {
        text: 'new',
      } as VNode;

      const result = handleTextOnlyVNode(parent, childVNode, 0);
      expect(result).toBe(existingText);
      expect(result.textContent).toBe('new');
    });

    it('should move text node to correct position', () => {
      const el1 = document.createElement('div');
      const textNode = document.createTextNode('text');
      const el2 = document.createElement('div');

      parent.appendChild(el1);
      parent.appendChild(textNode);
      parent.appendChild(el2);

      const childVNode: VNode = {
        text: 'text',
      } as VNode;

      // Move to index 0
      const result = handleTextOnlyVNode(parent, childVNode, 0);
      // Result should be a text node with correct content
      expect(result).toBeInstanceOf(Text);
      expect(result.textContent).toBe('text');
      // Text node should be at index 0
      expect(parent.childNodes[0]).toBeInstanceOf(Text);
      expect(parent.childNodes[0].textContent).toBe('text');
    });

    it('should create new text node at correct position when not found', () => {
      const el1 = document.createElement('div');
      const el2 = document.createElement('div');
      parent.appendChild(el1);
      parent.appendChild(el2);

      const childVNode: VNode = {
        text: 'text',
      } as VNode;

      // Insert at index 1
      const result = handleTextOnlyVNode(parent, childVNode, 1);
      expect(result).toBeInstanceOf(Text);
      expect(parent.childNodes[1]).toBe(result);
    });

    it('should not update if content is same', () => {
      const existingText = document.createTextNode('same');
      parent.appendChild(existingText);

      const childVNode: VNode = {
        text: 'same',
      } as VNode;

      const result = handleTextOnlyVNode(parent, childVNode, 0);
      expect(result).toBe(existingText);
      expect(result.textContent).toBe('same');
    });
  });

  describe('updateHostTextContent', () => {
    it('should create text node when host is empty', () => {
      const host = document.createElement('div');
      const result = updateHostTextContent(host, 'text content');

      expect(result).toBeInstanceOf(Text);
      expect(result.textContent).toBe('text content');
      expect(host.firstChild).toBe(result);
    });

    it('should reuse existing text node', () => {
      const host = document.createElement('div');
      const existingText = document.createTextNode('old');
      host.appendChild(existingText);

      const result = updateHostTextContent(host, 'new');
      expect(result).toBe(existingText);
      expect(result.textContent).toBe('new');
    });

    it('should remove other children when updating text', () => {
      const host = document.createElement('div');
      const existingText = document.createTextNode('text');
      const existingElement = document.createElement('span');
      host.appendChild(existingText);
      host.appendChild(existingElement);

      const result = updateHostTextContent(host, 'new text');
      expect(result).toBe(existingText);
      expect(host.children.length).toBe(0);
      expect(host.childNodes.length).toBe(1);
    });

    it('should remove all children and create new text node if no text node exists', () => {
      const host = document.createElement('div');
      const existingElement = document.createElement('span');
      host.appendChild(existingElement);

      const result = updateHostTextContent(host, 'text content');
      expect(result).toBeInstanceOf(Text);
      expect(result.textContent).toBe('text content');
      expect(host.children.length).toBe(0);
    });

    it('should not update if content is same', () => {
      const host = document.createElement('div');
      const existingText = document.createTextNode('same');
      host.appendChild(existingText);

      const result = updateHostTextContent(host, 'same');
      expect(result).toBe(existingText);
      expect(result.textContent).toBe('same');
    });
  });
});

