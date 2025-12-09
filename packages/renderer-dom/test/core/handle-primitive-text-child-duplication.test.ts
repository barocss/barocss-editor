/**
 * Test for handlePrimitiveTextChild text duplication issue
 * 
 * Problem: Text is duplicated and displayed as "dyellow"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handlePrimitiveTextChild } from '../../src/reconcile/utils/text-node-handlers';

describe('handlePrimitiveTextChild - Text Duplication', () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement('span');
    parent.className = 'custom-bg-color';
  });

  it('should update existing text node without duplication', () => {
    // Create initial text node
    const initialText = document.createTextNode('yellow background');
    parent.appendChild(initialText);

    // Update text
    handlePrimitiveTextChild(parent, 'yellow bㅁackground', 0);

    // Verify text is updated
    expect(parent.textContent).toBe('yellow bㅁackground');
    expect(parent.childNodes.length).toBe(1);
    expect(parent.firstChild).toBe(initialText);
  });

  it('should not duplicate text when text node already exists', () => {
    // Create initial text node
    const initialText = document.createTextNode('yellow');
    parent.appendChild(initialText);

    // Update text
    handlePrimitiveTextChild(parent, 'yellow bㅁackground', 0);

    // Verify text is not duplicated
    expect(parent.textContent).toBe('yellow bㅁackground');
    expect(parent.childNodes.length).toBe(1);
    expect(parent.firstChild).toBe(initialText);
  });

  it('should handle text update when childIndex is provided', () => {
    // Create initial text node
    const initialText = document.createTextNode('yellow background');
    parent.appendChild(initialText);

    // Update text with childIndex 0
    handlePrimitiveTextChild(parent, 'yellow bㅁackground', 0);

    // Verify text is updated correctly
    expect(parent.textContent).toBe('yellow bㅁackground');
    expect(parent.childNodes.length).toBe(1);
  });

  it('should not create duplicate text nodes', () => {
    // Create initial text node
    const initialText = document.createTextNode('yellow background');
    parent.appendChild(initialText);

    // Update multiple times
    handlePrimitiveTextChild(parent, 'yellow bㅁackground', 0);
    handlePrimitiveTextChild(parent, 'yellow bㅁackground', 0);

    // Verify only one text node exists
    expect(parent.childNodes.length).toBe(1);
    expect(parent.textContent).toBe('yellow bㅁackground');
  });
});

