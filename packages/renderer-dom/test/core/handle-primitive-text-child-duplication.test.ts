/**
 * Test for handlePrimitiveTextChild text duplication issue
 * 
 * 문제: 텍스트가 중복되어 "dyellow"로 표시됨
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
    // 초기 텍스트 노드 생성
    const initialText = document.createTextNode('yellow background');
    parent.appendChild(initialText);

    // 텍스트 업데이트
    handlePrimitiveTextChild(parent, 'yellow bㅁackground', 0);

    // 텍스트가 업데이트되었는지 확인
    expect(parent.textContent).toBe('yellow bㅁackground');
    expect(parent.childNodes.length).toBe(1);
    expect(parent.firstChild).toBe(initialText);
  });

  it('should not duplicate text when text node already exists', () => {
    // 초기 텍스트 노드 생성
    const initialText = document.createTextNode('yellow');
    parent.appendChild(initialText);

    // 텍스트 업데이트
    handlePrimitiveTextChild(parent, 'yellow bㅁackground', 0);

    // 텍스트가 중복되지 않았는지 확인
    expect(parent.textContent).toBe('yellow bㅁackground');
    expect(parent.childNodes.length).toBe(1);
    expect(parent.firstChild).toBe(initialText);
  });

  it('should handle text update when childIndex is provided', () => {
    // 초기 텍스트 노드 생성
    const initialText = document.createTextNode('yellow background');
    parent.appendChild(initialText);

    // childIndex 0으로 텍스트 업데이트
    handlePrimitiveTextChild(parent, 'yellow bㅁackground', 0);

    // 텍스트가 올바르게 업데이트되었는지 확인
    expect(parent.textContent).toBe('yellow bㅁackground');
    expect(parent.childNodes.length).toBe(1);
  });

  it('should not create duplicate text nodes', () => {
    // 초기 텍스트 노드 생성
    const initialText = document.createTextNode('yellow background');
    parent.appendChild(initialText);

    // 여러 번 업데이트
    handlePrimitiveTextChild(parent, 'yellow bㅁackground', 0);
    handlePrimitiveTextChild(parent, 'yellow bㅁackground', 0);

    // 텍스트 노드가 하나만 있는지 확인
    expect(parent.childNodes.length).toBe(1);
    expect(parent.textContent).toBe('yellow bㅁackground');
  });
});

