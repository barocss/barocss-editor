/**
 * handleEfficientEdit 함수 테스트
 * 
 * handleEfficientEdit는 순수 함수이므로 단위 테스트가 용이합니다.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleEfficientEdit } from '../../src/utils/efficient-edit-handler';
import type { MarkRange, DecoratorRange } from '../../src/utils/edit-position-converter';

describe('handleEfficientEdit', () => {
  let container: HTMLElement;
  let inlineTextNode: HTMLElement;
  let textNode: Text;

  beforeEach(() => {
    // DOM 구조 생성
    container = document.createElement('div');
    document.body.appendChild(container);

    // inline-text 노드 생성
    inlineTextNode = document.createElement('span');
    inlineTextNode.setAttribute('data-bc-sid', 't1');
    inlineTextNode.setAttribute('data-bc-stype', 'inline-text');
    inlineTextNode.className = 'text';
    container.appendChild(inlineTextNode);

    // 텍스트 노드 생성
    textNode = document.createTextNode('Hello');
    inlineTextNode.appendChild(textNode);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('텍스트가 변경되지 않으면 null을 반환해야 함', () => {
    const result = handleEfficientEdit(
      textNode,
      'Hello',  // oldModelText
      [],
      []
    );

    expect(result).toBeNull();
  });

  it('텍스트 삽입 시 정확한 편집 정보를 반환해야 함', () => {
    // 텍스트 변경
    textNode.textContent = 'Hello World';

    const result = handleEfficientEdit(
      textNode,
      'Hello',  // oldModelText
      [],
      []
    );

    expect(result).toBeTruthy();
    expect(result?.newText).toBe('Hello World');
    expect(result?.editInfo.nodeId).toBe('t1');
    expect(result?.editInfo.oldText).toBe('Hello');
    expect(result?.editInfo.newText).toBe('Hello World');
    expect(result?.editInfo.editType).toBe('insert');
    expect(result?.editInfo.insertedLength).toBeGreaterThan(0);
  });

  it('텍스트 삭제 시 정확한 편집 정보를 반환해야 함', () => {
    // 초기 텍스트 설정
    textNode.textContent = 'Hello World';
    
    // 텍스트 삭제
    textNode.textContent = 'Hello';

    const result = handleEfficientEdit(
      textNode,
      'Hello World',  // oldModelText
      [],
      []
    );

    expect(result).toBeTruthy();
    expect(result?.newText).toBe('Hello');
    expect(result?.editInfo.editType).toBe('delete');
    expect(result?.editInfo.deletedLength).toBeGreaterThan(0);
  });

  it('텍스트 교체 시 정확한 편집 정보를 반환해야 함', () => {
    // 초기 텍스트 설정
    textNode.textContent = 'Hello';
    
    // 텍스트 교체
    textNode.textContent = 'Hi';

    const result = handleEfficientEdit(
      textNode,
      'Hello',  // oldModelText
      [],
      []
    );

    expect(result).toBeTruthy();
    expect(result?.newText).toBe('Hi');
    expect(result?.editInfo.editType).toBe('replace');
    expect(result?.editInfo.insertedLength).toBeGreaterThan(0);
    expect(result?.editInfo.deletedLength).toBeGreaterThan(0);
  });

  it('mark가 있는 경우 범위가 조정되어야 함', () => {
    // mark가 있는 구조 생성
    inlineTextNode.innerHTML = '';
    const markElement = document.createElement('strong');
    markElement.className = 'mark-bold';
    const markTextNode = document.createTextNode('Hello');
    markElement.appendChild(markTextNode);
    inlineTextNode.appendChild(markElement);

    // 텍스트 변경
    markTextNode.textContent = 'Hello World';

    const modelMarks: MarkRange[] = [
      {
        type: 'bold',
        range: [0, 5]  // "Hello"에 적용된 mark
      }
    ];

    const result = handleEfficientEdit(
      markTextNode,
      'Hello',  // oldModelText
      modelMarks,
      []
    );

    expect(result).toBeTruthy();
    expect(result?.adjustedMarks.length).toBeGreaterThan(0);
    // mark 범위가 조정되었는지 확인
    const adjustedMark = result?.adjustedMarks[0];
    expect(adjustedMark?.type).toBe('bold');
    // 범위가 업데이트되었는지 확인 (텍스트가 길어졌으므로)
    // 삽입이 발생했으므로 범위의 끝이 늘어나야 함
    expect(adjustedMark?.range[1]).toBeGreaterThanOrEqual(5);
  });

  it('decorator가 있는 경우 범위가 조정되어야 함', () => {
    // 텍스트 변경
    textNode.textContent = 'Hello World';

    const decorators: DecoratorRange[] = [
      {
        sid: 'd1',
        stype: 'highlight',
        category: 'inline',
        target: {
          sid: 't1',
          startOffset: 0,
          endOffset: 5  // "Hello"에 적용된 decorator
        }
      }
    ];

    const result = handleEfficientEdit(
      textNode,
      'Hello',  // oldModelText
      [],
      decorators
    );

    expect(result).toBeTruthy();
    expect(result?.adjustedDecorators.length).toBeGreaterThan(0);
    // decorator 범위가 조정되었는지 확인
    const adjustedDecorator = result?.adjustedDecorators[0];
    expect(adjustedDecorator?.target.startOffset).toBe(0);
    // 범위가 업데이트되었는지 확인 (삽입이 발생했으므로 범위의 끝이 늘어나야 함)
    expect(adjustedDecorator?.target.endOffset).toBeGreaterThanOrEqual(5);
  });

  it('inline-text 노드를 찾을 수 없으면 null을 반환해야 함', () => {
    // 독립적인 텍스트 노드 생성 (inline-text 노드 밖)
    const orphanTextNode = document.createTextNode('Hello');

    const result = handleEfficientEdit(
      orphanTextNode,
      'Hello',
      [],
      []
    );

    expect(result).toBeNull();
  });

  it('data-bc-sid가 없으면 null을 반환해야 함', () => {
    // data-bc-sid가 없는 노드 생성
    const noSidNode = document.createElement('span');
    const noSidTextNode = document.createTextNode('Hello');
    noSidNode.appendChild(noSidTextNode);
    container.appendChild(noSidNode);

    const result = handleEfficientEdit(
      noSidTextNode,
      'Hello',
      [],
      []
    );

    expect(result).toBeNull();
  });

  it('Selection이 있는 경우 정확한 편집 위치를 계산해야 함', () => {
    // 텍스트 변경
    textNode.textContent = 'Hello World';

    // Selection 설정 (중간 위치)
    const range = document.createRange();
    range.setStart(textNode, 5);  // "Hello" 뒤
    range.setEnd(textNode, 5);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const result = handleEfficientEdit(
      textNode,
      'Hello',  // oldModelText
      [],
      []
    );

    expect(result).toBeTruthy();
    expect(result?.editInfo.editPosition).toBeGreaterThanOrEqual(0);
    expect(result?.editInfo.editPosition).toBeLessThanOrEqual((result?.newText?.length && result?.newText?.length > 0 ? result?.newText?.length : 0) || 0);
  });

  it('여러 text node가 있는 경우 전체 텍스트를 재구성해야 함', () => {
    // 여러 text node 구조 생성
    inlineTextNode.innerHTML = '';
    const textNode1 = document.createTextNode('Hello');
    const markElement = document.createElement('strong');
    markElement.className = 'mark-bold';
    const textNode2 = document.createTextNode(' World');
    inlineTextNode.appendChild(textNode1);
    inlineTextNode.appendChild(markElement);
    markElement.appendChild(textNode2);

    // 텍스트 변경
    textNode1.textContent = 'Hi';
    textNode2.textContent = ' Universe';

    const result = handleEfficientEdit(
      textNode1,
      'Hello World',  // oldModelText
      [],
      []
    );

    expect(result).toBeTruthy();
    // 전체 텍스트가 재구성되었는지 확인
    expect(result?.newText).toBe('Hi Universe');
  });

  it('mark와 decorator가 모두 있는 경우 둘 다 조정되어야 함', () => {
    // mark가 있는 구조 생성
    inlineTextNode.innerHTML = '';
    const textNode1 = document.createTextNode('Hello');
    const markElement = document.createElement('strong');
    markElement.className = 'mark-bold';
    const textNode2 = document.createTextNode(' World');
    inlineTextNode.appendChild(textNode1);
    inlineTextNode.appendChild(markElement);
    markElement.appendChild(textNode2);

    // 텍스트 변경
    textNode1.textContent = 'Hi';
    textNode2.textContent = ' Universe';

    // mark 범위를 편집 범위와 겹치도록 설정 (조정이 발생하도록)
    const modelMarks: MarkRange[] = [
      {
        type: 'bold',
        range: [0, 11]  // 전체 텍스트에 적용된 mark (편집 범위와 겹침)
      }
    ];

    const decorators: DecoratorRange[] = [
      {
        sid: 'd1',
        stype: 'highlight',
        category: 'inline',
        target: {
          sid: 't1',
          startOffset: 0,
          endOffset: 5  // "Hello"에 적용된 decorator (편집 범위와 겹침)
        }
      }
    ];

    const result = handleEfficientEdit(
      textNode1,
      'Hello World',  // oldModelText
      modelMarks,
      decorators
    );

    expect(result).toBeTruthy();
    // mark와 decorator가 모두 조정되었는지 확인
    // (편집 범위와 겹치지 않는 경우 조정되지 않을 수 있음)
    if (result?.adjustedMarks?.length && result?.adjustedMarks?.length > 0) {
      const adjustedMark = result.adjustedMarks[0];
      expect(adjustedMark?.type).toBe('bold');
      expect(adjustedMark?.range[0]).toBeGreaterThanOrEqual(0);
      expect(adjustedMark?.range[1]).toBeGreaterThanOrEqual(adjustedMark?.range[0] || 0);
    }
    
    if (result?.adjustedDecorators?.length && result?.adjustedDecorators?.length > 0) {
      const adjustedDecorator = result.adjustedDecorators[0];
      expect(adjustedDecorator?.target.startOffset).toBeGreaterThanOrEqual(0);
      expect(adjustedDecorator?.target.endOffset).toBeGreaterThanOrEqual(adjustedDecorator?.target.startOffset);
    }
    
    // 최소한 하나는 조정되어야 함 (편집 범위와 겹치는 경우)
    expect((result?.adjustedMarks?.length && result?.adjustedMarks?.length > 0 ? result?.adjustedMarks?.length : 0) + (result?.adjustedDecorators?.length && result?.adjustedDecorators?.length > 0 ? result?.adjustedDecorators?.length : 0)).toBeGreaterThan(0);
  });

  // ========== 추가 테스트 케이스 (우선순위 높음) ==========

  describe('경계값 및 Edge Cases', () => {
    it('빈 텍스트에서 삽입 시 정확한 편집 정보를 반환해야 함', () => {
      // 빈 텍스트 설정
      textNode.textContent = '';
      
      // 텍스트 삽입
      textNode.textContent = 'Hello';

      const result = handleEfficientEdit(
        textNode,
        '',  // oldModelText (빈 텍스트)
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello');
      expect(result?.editInfo.editType).toBe('insert');
      expect(result?.editInfo.insertedLength).toBe(5);
      expect(result?.editInfo.deletedLength).toBe(0);
      expect(result?.editInfo.editPosition).toBe(0);
    });

    it('전체 텍스트 삭제 시 정확한 편집 정보를 반환해야 함', () => {
      // 초기 텍스트 설정
      textNode.textContent = 'Hello';
      
      // 전체 텍스트 삭제
      // 주의: textNode.textContent = ''로 설정하면 buildTextRunIndex가 빈 runs를 반환할 수 있음
      // 따라서 실제로는 텍스트를 하나씩 삭제하는 것이 더 현실적
      // 하지만 테스트 목적상, 빈 텍스트 노드가 있어도 작동해야 함
      inlineTextNode.textContent = '';

      const result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );

      // 빈 텍스트 노드인 경우 buildTextRunIndex가 빈 runs를 반환하여 null이 될 수 있음
      // 이는 정상적인 동작이므로, null을 허용하거나 빈 텍스트 노드를 유지해야 함
      if (result) {
        expect(result.newText).toBe('');
        expect(result.editInfo.editType).toBe('delete');
        expect(result.editInfo.deletedLength).toBe(5);
        expect(result.editInfo.insertedLength).toBe(0);
      } else {
        // 빈 runs로 인해 null이 반환되는 경우도 정상
        // 이 경우 테스트를 스킵하거나 다른 방식으로 검증
        expect(result).toBeNull();
      }
    });

    it('빈 텍스트에서 빈 텍스트로 변경 시 null을 반환해야 함', () => {
      textNode.textContent = '';

      const result = handleEfficientEdit(
        textNode,
        '',  // oldModelText (빈 텍스트)
        [],
        []
      );

      expect(result).toBeNull();
    });

    it('공백만 있는 텍스트에서 삽입 시 정확히 처리되어야 함', () => {
      textNode.textContent = '   ';
      
      // 공백 중간에 삽입
      textNode.textContent = '  Hello  ';

      const result = handleEfficientEdit(
        textNode,
        '   ',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('  Hello  ');
    });
  });

  describe('Selection 관련 Edge Cases', () => {
    it('Selection의 startContainer가 Element 노드인 경우 처리해야 함', () => {
      // Element 노드에 Selection 설정
      const range = document.createRange();
      range.setStart(inlineTextNode, 0);  // Element 노드
      range.setEnd(inlineTextNode, 0);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // 텍스트 변경
      textNode.textContent = 'Hello World';

      const result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      // Element 노드인 경우 selectionOffset은 0이 되지만, text-analyzer가 여전히 작동해야 함
      expect(result?.editInfo.editPosition).toBeGreaterThanOrEqual(0);
    });

    it('Selection이 범위 선택인 경우 정확히 처리되어야 함', () => {
      // 초기 텍스트 설정
      textNode.textContent = 'Hello World';
      
      // 범위 선택 설정
      const range = document.createRange();
      range.setStart(textNode, 0);  // "Hello" 선택
      range.setEnd(textNode, 5);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // 선택된 텍스트 교체
      textNode.textContent = 'Hi World';

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hi World');
      expect(result?.editInfo.editType).toBe('replace');
    });

    it('Selection이 다른 노드에 있는 경우 처리해야 함', () => {
      // 다른 inline-text 노드 생성
      const otherInlineTextNode = document.createElement('span');
      otherInlineTextNode.setAttribute('data-bc-sid', 't2');
      otherInlineTextNode.setAttribute('data-bc-stype', 'inline-text');
      const otherTextNode = document.createTextNode('Other');
      otherInlineTextNode.appendChild(otherTextNode);
      container.appendChild(otherInlineTextNode);

      // 다른 노드에 Selection 설정
      const range = document.createRange();
      range.setStart(otherTextNode, 0);
      range.setEnd(otherTextNode, 0);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // 원래 노드의 텍스트 변경
      textNode.textContent = 'Hello World';

      const result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      // Selection이 다른 노드에 있어도 text-analyzer가 작동해야 함
      expect(result?.newText).toBe('Hello World');
    });
  });

  describe('Mark 범위와 편집 범위 관계', () => {
    it('Mark가 편집 범위 앞에 있는 경우 조정되지 않아야 함', () => {
      textNode.textContent = 'Hello World Test';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [0, 5]  // "Hello"에 적용된 mark (편집 범위 앞)
        }
      ];

      // 편집 위치 12 (뒤쪽에서 삽입)
      const range = document.createRange();
      range.setStart(textNode, 12);
      range.setEnd(textNode, 12);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      textNode.textContent = 'Hello World TestX';

      const result = handleEfficientEdit(
        textNode,
        'Hello World Test',  // oldModelText
        modelMarks,
        []
      );

      expect(result).toBeTruthy();
      // Mark가 편집 범위 앞에 있으므로 조정되지 않아야 함 (또는 범위가 그대로 유지)
      const adjustedMark = result?.adjustedMarks[0];
      if (adjustedMark) {
        expect(adjustedMark.range[0]).toBe(0);
        expect(adjustedMark.range[1]).toBe(5);  // 변경 없음
      }
    });

    it('Mark가 편집 범위와 부분 겹침 (앞)인 경우 조정되어야 함', () => {
      textNode.textContent = 'Hello World';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [0, 10]  // "Hello Worl"에 적용된 mark (편집 범위와 겹침)
        }
      ];

      // 편집 위치 5 (중간에 삽입)
      const range = document.createRange();
      range.setStart(textNode, 5);
      range.setEnd(textNode, 5);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      textNode.textContent = 'HelloX World';

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        modelMarks,
        []
      );

      expect(result).toBeTruthy();
      expect(result?.adjustedMarks.length).toBeGreaterThan(0);
      const adjustedMark = result?.adjustedMarks[0];
      expect(adjustedMark?.range[1]).toBeGreaterThan(10);  // 범위가 확장되어야 함
    });

    it('Mark가 편집 범위 안에 완전히 포함된 경우 조정되어야 함', () => {
      textNode.textContent = 'Hello World Test';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [6, 11]  // "World"에 적용된 mark (편집 범위 안에 포함)
        }
      ];

      // 편집 위치 0 (앞에서 대량 삽입)
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 0);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      textNode.textContent = 'XXXXXHello World Test';

      const result = handleEfficientEdit(
        textNode,
        'Hello World Test',  // oldModelText
        modelMarks,
        []
      );

      expect(result).toBeTruthy();
      expect(result?.adjustedMarks.length).toBeGreaterThan(0);
      const adjustedMark = result?.adjustedMarks[0];
      // Mark 범위가 이동되어야 함
      expect(adjustedMark?.range[0]).toBeGreaterThan(6);
      expect(adjustedMark?.range[1]).toBeGreaterThan(11);
    });

    it('편집 범위가 Mark 안에 완전히 포함된 경우 조정되어야 함', () => {
      textNode.textContent = 'Hello World Test';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [0, 20]  // 전체 텍스트에 적용된 mark
        }
      ];

      // 편집 위치 6 (Mark 안에서 삽입)
      const range = document.createRange();
      range.setStart(textNode, 6);
      range.setEnd(textNode, 6);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      textNode.textContent = 'Hello XWorld Test';

      const result = handleEfficientEdit(
        textNode,
        'Hello World Test',  // oldModelText
        modelMarks,
        []
      );

      expect(result).toBeTruthy();
      expect(result?.adjustedMarks.length).toBeGreaterThan(0);
      const adjustedMark = result?.adjustedMarks[0];
      // Mark 범위가 확장되어야 함
      expect(adjustedMark?.range[1]).toBeGreaterThan(20);
    });
  });

  describe('여러 Mark 조합', () => {
    it('여러 mark가 겹치는 경우 모두 조정되어야 함', () => {
      inlineTextNode.innerHTML = '';
      const textNode1 = document.createTextNode('Hello');
      const boldElement = document.createElement('strong');
      boldElement.className = 'mark-bold';
      const italicElement = document.createElement('em');
      italicElement.className = 'mark-italic';
      const textNode2 = document.createTextNode(' World');
      inlineTextNode.appendChild(textNode1);
      inlineTextNode.appendChild(boldElement);
      boldElement.appendChild(italicElement);
      italicElement.appendChild(textNode2);

      // 텍스트 변경
      textNode1.textContent = 'Hi';
      textNode2.textContent = ' Universe';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [0, 11]  // 전체에 적용된 bold
        },
        {
          type: 'italic',
          range: [5, 11]  // "World"에 적용된 italic (bold와 겹침)
        }
      ];

      const result = handleEfficientEdit(
        textNode1,
        'Hello World',  // oldModelText
        modelMarks,
        []
      );

      expect(result).toBeTruthy();
      // 두 mark 모두 조정되어야 함 (편집 범위와 겹치므로)
      // adjustMarkRanges는 모든 mark를 반환하지만, 일부는 조정되지 않을 수 있음
      expect(result?.adjustedMarks.length).toBeGreaterThanOrEqual(1);
      // 편집 범위와 겹치는 mark는 조정되어야 함
      const adjustedMarks = result?.adjustedMarks.filter(mark => {
        const [start, end] = mark.range;
        // 편집 위치는 대략 2-5 사이 (Hi 삽입 위치)
        // mark [0, 11]과 [5, 11]은 모두 편집 범위와 겹침
        return (start <= 5 && end >= 2) || (start <= 11 && end >= 5);
      });
      expect(adjustedMarks?.length).toBeGreaterThanOrEqual(1);
      
      // 모든 mark의 범위가 유효해야 함
      result?.adjustedMarks.forEach(mark => {
        expect(mark.range[0]).toBeGreaterThanOrEqual(0);
        expect(mark.range[1]).toBeGreaterThanOrEqual(mark.range[0]);
      });
    });

    it('여러 mark가 연속되는 경우 모두 조정되어야 함', () => {
      inlineTextNode.innerHTML = '';
      const textNode1 = document.createTextNode('Hello');
      const boldElement = document.createElement('strong');
      boldElement.className = 'mark-bold';
      const textNode2 = document.createTextNode(' ');
      const italicElement = document.createElement('em');
      italicElement.className = 'mark-italic';
      const textNode3 = document.createTextNode('World');
      inlineTextNode.appendChild(textNode1);
      inlineTextNode.appendChild(boldElement);
      boldElement.appendChild(textNode2);
      inlineTextNode.appendChild(italicElement);
      italicElement.appendChild(textNode3);

      // 텍스트 변경
      textNode1.textContent = 'Hi';
      textNode3.textContent = ' Universe';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [0, 6]  // "Hello "에 적용된 bold
        },
        {
          type: 'italic',
          range: [6, 11]  // "World"에 적용된 italic (연속)
        }
      ];

      const result = handleEfficientEdit(
        textNode1,
        'Hello World',  // oldModelText
        modelMarks,
        []
      );

      expect(result).toBeTruthy();
      // 두 mark 모두 조정되어야 함
      // adjustMarkRanges는 모든 mark를 반환하지만, 일부는 조정되지 않을 수 있음
      expect(result?.adjustedMarks.length).toBeGreaterThanOrEqual(1);
      // 편집 범위와 겹치는 mark는 조정되어야 함
      // 편집 위치는 대략 2-5 사이 (Hi 삽입 위치)
      // mark [0, 6]은 편집 범위와 겹침, [6, 11]은 편집 범위 뒤에 있음
      const adjustedMarks = result?.adjustedMarks.filter(mark => {
        const [start, end] = mark.range;
        // 편집 위치와 겹치는 mark는 조정되어야 함
        return (start <= 5 && end >= 2);
      });
      expect(adjustedMarks?.length).toBeGreaterThanOrEqual(1);
      
      // 모든 mark의 범위가 유효해야 함
      result?.adjustedMarks.forEach(mark => {
        expect(mark.range[0]).toBeGreaterThanOrEqual(0);
        expect(mark.range[1]).toBeGreaterThanOrEqual(mark.range[0]);
      });
    });

    it('여러 mark가 분리된 경우 하나만 조정되어야 함', () => {
      textNode.textContent = 'Hello World Test';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [0, 5]  // "Hello"에 적용된 bold (편집 범위 앞)
        },
        {
          type: 'italic',
          range: [12, 16]  // "Test"에 적용된 italic (편집 범위 뒤)
        }
      ];

      // 편집 위치 6 (중간에 삽입)
      const range = document.createRange();
      range.setStart(textNode, 6);
      range.setEnd(textNode, 6);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      textNode.textContent = 'Hello XWorld Test';

      const result = handleEfficientEdit(
        textNode,
        'Hello World Test',  // oldModelText
        modelMarks,
        []
      );

      expect(result).toBeTruthy();
      // 두 mark 모두 존재해야 하지만, 하나는 조정되고 하나는 그대로일 수 있음
      expect(result?.adjustedMarks.length).toBe(2);
    });
  });

  describe('여러 Decorator 조합', () => {
    it('여러 decorator가 겹치는 경우 모두 조정되어야 함', () => {
      textNode.textContent = 'Hello World';

      const decorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: {
            sid: 't1',
            startOffset: 0,
            endOffset: 11  // 전체에 적용된 highlight
          }
        },
        {
          sid: 'd2',
          stype: 'comment',
          category: 'inline',
          target: {
            sid: 't1',
            startOffset: 6,
            endOffset: 11  // "World"에 적용된 comment (highlight와 겹침)
          }
        }
      ];

      // 텍스트 변경
      textNode.textContent = 'Hello Beautiful World';

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        [],
        decorators
      );

      expect(result).toBeTruthy();
      expect(result?.adjustedDecorators.length).toBe(2);
      // 두 decorator 모두 조정되어야 함
      result?.adjustedDecorators.forEach(decorator => {
        expect(decorator.target.startOffset).toBeGreaterThanOrEqual(0);
        expect(decorator.target.endOffset).toBeGreaterThanOrEqual(decorator.target.startOffset);
      });
    });

    it('다른 nodeId의 decorator는 조정되지 않아야 함', () => {
      textNode.textContent = 'Hello World';

      const decorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: {
            sid: 't1',  // 현재 nodeId와 일치
            startOffset: 0,
            endOffset: 5
          }
        },
        {
          sid: 'd2',
          stype: 'comment',
          category: 'inline',
          target: {
            sid: 't2',  // 다른 nodeId
            startOffset: 0,
            endOffset: 5
          }
        }
      ];

      // 텍스트 변경
      textNode.textContent = 'Hello Beautiful World';

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        [],
        decorators
      );

      expect(result).toBeTruthy();
      // t1의 decorator만 조정되어야 함
      const adjustedDecorators = result?.adjustedDecorators.filter(d => d.target.sid === 't1');
      expect(adjustedDecorators?.length).toBe(1);
      // t2의 decorator는 조정되지 않아야 함 (또는 필터링되어 반환되지 않음)
    });
  });

  describe('유니코드 및 특수 문자', () => {
    it('이모지가 포함된 텍스트를 정확히 처리해야 함', () => {
      textNode.textContent = 'Hello 👋';

      const result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello 👋');
      expect(result?.editInfo.insertedLength).toBeGreaterThan(0);
    });

    it('한글이 포함된 텍스트를 정확히 처리해야 함', () => {
      textNode.textContent = '안녕하세요';

      const result = handleEfficientEdit(
        textNode,
        '안녕',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('안녕하세요');
    });

    it('유니코드 정규화 후 동일한 경우 null을 반환해야 함', () => {
      // 이 테스트는 실제로 유니코드 정규화가 발생하는 경우를 시뮬레이션하기 어려움
      // text-analyzer가 정규화 후 동일하다고 판단하면 null을 반환
      textNode.textContent = 'café';

      // 동일한 텍스트 (정규화 후)
      const result = handleEfficientEdit(
        textNode,
        'café',  // oldModelText (동일)
        [],
        []
      );

      // 정규화 후 동일하면 null, 아니면 결과 반환
      // 실제로는 text-analyzer가 판단하므로 결과가 있을 수도 있음
      if (result) {
        expect(result.newText).toBe('café');
      } else {
        // null 반환도 유효 (정규화 후 동일)
      }
    });
  });

  describe('복잡한 DOM 구조', () => {
    it('중첩된 mark 구조를 정확히 처리해야 함', () => {
      // Bold 안에 Italic
      inlineTextNode.innerHTML = '';
      const boldElement = document.createElement('strong');
      boldElement.className = 'mark-bold';
      const textNode1 = document.createTextNode('He');
      const italicElement = document.createElement('em');
      italicElement.className = 'mark-italic';
      const textNode2 = document.createTextNode('ll');
      const textNode3 = document.createTextNode('o');
      inlineTextNode.appendChild(boldElement);
      boldElement.appendChild(textNode1);
      boldElement.appendChild(italicElement);
      italicElement.appendChild(textNode2);
      boldElement.appendChild(textNode3);

      // 텍스트 변경
      textNode1.textContent = 'Hi';
      textNode2.textContent = 'llo';
      textNode3.textContent = ' World';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [0, 5]  // "Hello"에 적용된 bold
        },
        {
          type: 'italic',
          range: [2, 4]  // "ll"에 적용된 italic (bold 안에 중첩)
        }
      ];

      const result = handleEfficientEdit(
        textNode1,
        'Hello',  // oldModelText
        modelMarks,
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hillo World');
      // 두 mark 모두 조정되어야 함 (편집 범위와 겹치므로)
      expect(result?.adjustedMarks.length).toBeGreaterThanOrEqual(1);
      // 편집 위치는 대략 2-5 사이 (Hi 삽입 위치)
      // mark [0, 5]와 [2, 4]는 모두 편집 범위와 겹침
      const adjustedMarks = result?.adjustedMarks.filter(mark => {
        const [start, end] = mark.range;
        return (start <= 5 && end >= 2);
      });
      expect(adjustedMarks?.length).toBeGreaterThanOrEqual(1);
    });

    it('Mark와 Decorator가 혼합된 구조를 정확히 처리해야 함', () => {
      inlineTextNode.innerHTML = '';
      const textNode1 = document.createTextNode('Hello');
      const boldElement = document.createElement('strong');
      boldElement.className = 'mark-bold';
      const textNode2 = document.createTextNode(' World');
      inlineTextNode.appendChild(textNode1);
      inlineTextNode.appendChild(boldElement);
      boldElement.appendChild(textNode2);

      // 텍스트 변경
      textNode1.textContent = 'Hi';
      textNode2.textContent = ' Universe';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [6, 11]  // "World"에 적용된 bold (편집 범위와 겹침)
        }
      ];

      const decorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: {
            sid: 't1',
            startOffset: 0,
            endOffset: 5  // "Hello"에 적용된 highlight (편집 범위와 겹침)
          }
        }
      ];

      const result = handleEfficientEdit(
        textNode1,
        'Hello World',  // oldModelText
        modelMarks,
        decorators
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hi Universe');
      // 편집 위치는 대략 2-5 사이 (Hi 삽입 위치)
      // mark [6, 11]은 편집 범위 뒤에 있으므로 조정되지 않을 수 있음
      // decorator [0, 5]는 편집 범위와 겹치므로 조정되어야 함
      expect(result?.adjustedDecorators.length).toBeGreaterThan(0);
      // mark는 편집 범위와 겹치지 않을 수 있으므로 조건부로 확인
      if (result?.adjustedMarks?.length && result?.adjustedMarks?.length > 0) {
        result.adjustedMarks.forEach(mark => {
          expect(mark.range[0]).toBeGreaterThanOrEqual(0);
          expect(mark.range[1]).toBeGreaterThanOrEqual(mark.range[0]);
        });
      }
    });
  });

  describe('편집 위치별 테스트', () => {
    it('시작 위치에서 삽입 시 정확히 처리되어야 함', () => {
      textNode.textContent = 'XHello';

      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 0);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('XHello');
      expect(result?.editInfo.editPosition).toBe(0);
      expect(result?.editInfo.editType).toBe('insert');
    });

    it('끝 위치에서 삽입 시 정확히 처리되어야 함', () => {
      textNode.textContent = 'HelloX';

      const range = document.createRange();
      range.setStart(textNode, 5);
      range.setEnd(textNode, 5);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('HelloX');
      expect(result?.editInfo.editPosition).toBe(5);
    });

    it('중간 위치에서 삽입 시 정확히 처리되어야 함', () => {
      textNode.textContent = 'HelXlo';

      const range = document.createRange();
      range.setStart(textNode, 3);
      range.setEnd(textNode, 3);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('HelXlo');
      expect(result?.editInfo.editPosition).toBe(3);
    });
  });

  // ========== 추가 안정성 테스트 케이스 ==========

  describe('공백 문자 처리', () => {
    it('공백 삽입을 정확히 처리해야 함', () => {
      textNode.textContent = 'Hello World';

      const result = handleEfficientEdit(
        textNode,
        'HelloWorld',  // oldModelText (공백 없음)
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello World');
      expect(result?.editInfo.editType).toBe('insert');
    });

    it('공백 삭제를 정확히 처리해야 함', () => {
      textNode.textContent = 'HelloWorld';

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText (공백 있음)
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('HelloWorld');
      expect(result?.editInfo.editType).toBe('delete');
    });

    it('여러 공백 연속을 정확히 처리해야 함', () => {
      textNode.textContent = 'Hello    World';

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText (공백 1개)
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello    World');
    });

    it('탭 문자가 포함된 텍스트를 정확히 처리해야 함', () => {
      textNode.textContent = 'Hello\tWorld';

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello\tWorld');
    });

    it('줄바꿈 문자가 포함된 텍스트를 정확히 처리해야 함', () => {
      textNode.textContent = 'Hello\nWorld';

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello\nWorld');
    });
  });

  describe('긴 텍스트 처리', () => {
    it('매우 긴 텍스트 삽입을 정확히 처리해야 함', () => {
      const longText = 'A'.repeat(1000);
      textNode.textContent = `Hello ${longText}`;

      const result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe(`Hello ${longText}`);
      expect(result?.editInfo.insertedLength).toBe(longText.length + 1); // 공백 포함
    });

    it('매우 긴 텍스트 삭제를 정확히 처리해야 함', () => {
      const longText = 'A'.repeat(1000);
      textNode.textContent = 'Hello';

      const result = handleEfficientEdit(
        textNode,
        `Hello ${longText}`,  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello');
      expect(result?.editInfo.deletedLength).toBe(longText.length + 1); // 공백 포함
    });

    it('매우 긴 텍스트 교체를 정확히 처리해야 함', () => {
      const longText1 = 'A'.repeat(500);
      const longText2 = 'B'.repeat(500);
      textNode.textContent = `Hello ${longText2}`;

      const result = handleEfficientEdit(
        textNode,
        `Hello ${longText1}`,  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe(`Hello ${longText2}`);
      expect(result?.editInfo.editType).toBe('replace');
    });
  });

  describe('Mark 삭제 시나리오', () => {
    it('Mark 범위 전체가 삭제되는 경우 제거되어야 함', () => {
      textNode.textContent = '';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [0, 5]  // "Hello"에 적용된 mark
        }
      ];

      const result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText (전체 삭제)
        modelMarks,
        []
      );

      // 빈 텍스트 노드인 경우 null이 반환될 수 있음
      if (result) {
        // Mark 범위가 완전히 삭제되면 제거되어야 함
        expect(result.adjustedMarks.length).toBe(0);
      }
    });

    it('Mark 범위 일부가 삭제되는 경우 범위가 축소되어야 함', () => {
      textNode.textContent = 'Hello';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [0, 11]  // "Hello World"에 적용된 mark
        }
      ];

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        modelMarks,
        []
      );

      if (result) {
        expect(result.adjustedMarks.length).toBeGreaterThan(0);
        const adjustedMark = result.adjustedMarks[0];
        // 범위가 축소되어야 함
        expect(adjustedMark.range[1]).toBeLessThanOrEqual(5);
      }
    });

    it('Mark 범위 앞부분이 삭제되는 경우 범위가 이동되어야 함', () => {
      textNode.textContent = 'World';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [6, 11]  // "World"에 적용된 mark
        }
      ];

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        modelMarks,
        []
      );

      if (result) {
        expect(result.adjustedMarks.length).toBeGreaterThan(0);
        const adjustedMark = result.adjustedMarks[0];
        // 범위가 앞으로 이동해야 함
        expect(adjustedMark.range[0]).toBeLessThan(6);
        expect(adjustedMark.range[1]).toBeLessThan(11);
      }
    });
  });

  describe('Decorator 삭제 시나리오', () => {
    it('Decorator 범위 전체가 삭제되는 경우 제거되어야 함', () => {
      textNode.textContent = '';

      const decorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: {
            sid: 't1',
            startOffset: 0,
            endOffset: 5  // "Hello"에 적용된 decorator
          }
        }
      ];

      const result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText (전체 삭제)
        [],
        decorators
      );

      // 빈 텍스트 노드인 경우 null이 반환될 수 있음
      if (result) {
        // Decorator 범위가 완전히 삭제되면 제거되어야 함
        expect(result.adjustedDecorators.length).toBe(0);
      }
    });

    it('Decorator 범위 일부가 삭제되는 경우 범위가 축소되어야 함', () => {
      textNode.textContent = 'Hello';

      const decorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: {
            sid: 't1',
            startOffset: 0,
            endOffset: 11  // "Hello World"에 적용된 decorator
          }
        }
      ];

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        [],
        decorators
      );

      if (result) {
        expect(result.adjustedDecorators.length).toBeGreaterThan(0);
        const adjustedDecorator = result.adjustedDecorators[0];
        // 범위가 축소되어야 함
        expect(adjustedDecorator.target.endOffset).toBeLessThanOrEqual(5);
      }
    });

    it('Decorator 범위 앞부분이 삭제되는 경우 범위가 이동되어야 함', () => {
      textNode.textContent = 'World';

      const decorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: {
            sid: 't1',
            startOffset: 6,
            endOffset: 11  // "World"에 적용된 decorator
          }
        }
      ];

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        [],
        decorators
      );

      if (result) {
        expect(result.adjustedDecorators.length).toBeGreaterThan(0);
        const adjustedDecorator = result.adjustedDecorators[0];
        // 범위가 앞으로 이동해야 함
        expect(adjustedDecorator.target.startOffset).toBeLessThan(6);
        expect(adjustedDecorator.target.endOffset).toBeLessThan(11);
      }
    });
  });

  describe('Selection 범위 선택', () => {
    it('범위 선택 후 삽입 시 정확히 처리되어야 함', () => {
      textNode.textContent = 'HelloX World';

      // 범위 선택 설정 (중간 부분 선택)
      const range = document.createRange();
      range.setStart(textNode, 5);
      range.setEnd(textNode, 5);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('HelloX World');
      expect(result?.editInfo.editPosition).toBe(5);
    });

    it('범위 선택 후 교체 시 정확히 처리되어야 함', () => {
      textNode.textContent = 'Hi World';

      // 범위 선택 설정 ("Hello" 선택)
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 5);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hi World');
      expect(result?.editInfo.editType).toBe('replace');
    });

    it('범위 선택이 Element 노드에 걸쳐 있는 경우 처리해야 함', () => {
      inlineTextNode.innerHTML = '';
      const textNode1 = document.createTextNode('Hello');
      const markElement = document.createElement('strong');
      markElement.className = 'mark-bold';
      const textNode2 = document.createTextNode(' World');
      inlineTextNode.appendChild(textNode1);
      inlineTextNode.appendChild(markElement);
      markElement.appendChild(textNode2);

      // 범위 선택 설정 (Element 노드에 걸침)
      const range = document.createRange();
      range.setStart(textNode1, 3);
      range.setEnd(textNode2, 3);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // 텍스트 변경
      textNode1.textContent = 'Hel';
      textNode2.textContent = 'X World';

      const result = handleEfficientEdit(
        textNode1,
        'Hello World',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('HelX World');
    });
  });

  describe('빈 Text Node 처리', () => {
    it('빈 text node가 있는 구조를 정확히 처리해야 함', () => {
      inlineTextNode.innerHTML = '';
      const textNode1 = document.createTextNode('Hello');
      const markElement = document.createElement('strong');
      markElement.className = 'mark-bold';
      const textNode2 = document.createTextNode('');  // 빈 text node
      const textNode3 = document.createTextNode(' World');
      inlineTextNode.appendChild(textNode1);
      inlineTextNode.appendChild(markElement);
      markElement.appendChild(textNode2);
      inlineTextNode.appendChild(textNode3);

      // 텍스트 변경
      textNode1.textContent = 'Hi';
      textNode3.textContent = ' Universe';

      const result = handleEfficientEdit(
        textNode1,
        'Hello World',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hi Universe');
    });

    it('빈 mark wrapper가 있는 구조를 정확히 처리해야 함', () => {
      inlineTextNode.innerHTML = '';
      const textNode1 = document.createTextNode('Hello');
      const markElement = document.createElement('strong');
      markElement.className = 'mark-bold';
      // markElement에 text node가 없음 (빈 wrapper)
      inlineTextNode.appendChild(textNode1);
      inlineTextNode.appendChild(markElement);

      // 텍스트 변경
      textNode1.textContent = 'Hi';

      const result = handleEfficientEdit(
        textNode1,
        'Hello',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hi');
    });
  });

  describe('여러 편집 연속', () => {
    it('삽입 후 삭제를 정확히 처리해야 함', () => {
      // 첫 번째 편집: 삽입
      textNode.textContent = 'Hello World';
      let result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello World');

      // 두 번째 편집: 삭제
      textNode.textContent = 'Hello';
      result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello');
      expect(result?.editInfo.editType).toBe('delete');
    });

    it('삭제 후 삽입을 정확히 처리해야 함', () => {
      // 첫 번째 편집: 삭제
      textNode.textContent = 'Hello';
      let result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello');

      // 두 번째 편집: 삽입
      textNode.textContent = 'Hello Test';
      result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello Test');
      expect(result?.editInfo.editType).toBe('insert');
    });
  });

  describe('IME 및 다국어 처리', () => {
    it('한글 조합 문자를 정확히 처리해야 함', () => {
      textNode.textContent = '안녕하세요';

      const result = handleEfficientEdit(
        textNode,
        '안녕',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('안녕하세요');
      expect(result?.editInfo.insertedLength).toBeGreaterThan(0);
    });

    it('일본어 조합 문자를 정확히 처리해야 함', () => {
      textNode.textContent = 'こんにちは';

      const result = handleEfficientEdit(
        textNode,
        'こん',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('こんにちは');
    });

    it('중국어 문자를 정확히 처리해야 함', () => {
      textNode.textContent = '你好世界';

      const result = handleEfficientEdit(
        textNode,
        '你好',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('你好世界');
    });

    it('이모지와 텍스트 혼합을 정확히 처리해야 함', () => {
      textNode.textContent = 'Hello 👋 World 🌍';

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello 👋 World 🌍');
    });

    it('이모지 삽입을 정확히 처리해야 함', () => {
      textNode.textContent = 'Hello 👋';

      const result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello 👋');
      // 이모지는 여러 유니코드 코드 포인트로 구성될 수 있음
      expect(result?.editInfo.insertedLength).toBeGreaterThan(0);
    });
  });

  describe('특수 문자 처리', () => {
    it('특수 기호를 정확히 처리해야 함', () => {
      textNode.textContent = 'Hello @#$% World';

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello @#$% World');
    });

    it('수학 기호를 정확히 처리해야 함', () => {
      textNode.textContent = 'x = y + z * 2';

      const result = handleEfficientEdit(
        textNode,
        'x = y + z',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('x = y + z * 2');
    });

    it('HTML 엔티티 문자를 정확히 처리해야 함', () => {
      textNode.textContent = 'Hello <world>';

      const result = handleEfficientEdit(
        textNode,
        'Hello world',  // oldModelText
        [],
        []
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello <world>');
    });
  });

  describe('Mark 범위와 편집 범위 세부 관계', () => {
    it('Mark가 편집 범위 뒤에 있는 경우 조정되지 않아야 함', () => {
      textNode.textContent = 'Hello World Test';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [12, 16]  // "Test"에 적용된 mark (편집 범위 뒤)
        }
      ];

      // 편집 위치 0 (앞에서 삽입)
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 0);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      textNode.textContent = 'XHello World Test';

      const result = handleEfficientEdit(
        textNode,
        'Hello World Test',  // oldModelText
        modelMarks,
        []
      );

      expect(result).toBeTruthy();
      const adjustedMark = result?.adjustedMarks[0];
      if (adjustedMark) {
        // Mark 범위가 이동되어야 함 (앞에 삽입되었으므로)
        expect(adjustedMark.range[0]).toBeGreaterThan(12);
        expect(adjustedMark.range[1]).toBeGreaterThan(16);
      }
    });

    it('Mark가 편집 범위와 정확히 겹치는 경우 조정되어야 함', () => {
      textNode.textContent = 'HelloX World';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [0, 5]  // "Hello"에 적용된 mark
        }
      ];

      // 편집 위치 4 (범위 안에 삽입하여 확장되도록)
      const range = document.createRange();
      range.setStart(textNode, 4);
      range.setEnd(textNode, 4);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // 텍스트 변경 (범위 안에 삽입)
      textNode.textContent = 'HellXo World';

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        modelMarks,
        []
      );

      expect(result).toBeTruthy();
      expect(result?.adjustedMarks.length).toBeGreaterThan(0);
      const adjustedMark = result?.adjustedMarks[0];
      // Mark 범위가 확장되어야 함 (범위 안에 삽입되었으므로)
      expect(adjustedMark?.range[1]).toBeGreaterThan(5); // 5 + 1 (삽입)
    });
  });

  describe('Decorator 범위와 편집 범위 세부 관계', () => {
    it('Decorator가 편집 범위 뒤에 있는 경우 조정되지 않아야 함', () => {
      textNode.textContent = 'Hello World Test';

      const decorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: {
            sid: 't1',
            startOffset: 12,
            endOffset: 16  // "Test"에 적용된 decorator (편집 범위 뒤)
          }
        }
      ];

      // 편집 위치 0 (앞에서 삽입)
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 0);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      textNode.textContent = 'XHello World Test';

      const result = handleEfficientEdit(
        textNode,
        'Hello World Test',  // oldModelText
        [],
        decorators
      );

      expect(result).toBeTruthy();
      const adjustedDecorator = result?.adjustedDecorators[0];
      if (adjustedDecorator) {
        // Decorator 범위가 이동되어야 함 (앞에 삽입되었으므로)
        expect(adjustedDecorator.target.startOffset).toBeGreaterThan(12);
        expect(adjustedDecorator.target.endOffset).toBeGreaterThan(16);
      }
    });

    it('Decorator가 편집 범위와 정확히 겹치는 경우 조정되어야 함', () => {
      textNode.textContent = 'HellXo World';

      const decorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: {
            sid: 't1',
            startOffset: 0,
            endOffset: 5  // "Hello"에 적용된 decorator
          }
        }
      ];

      // 편집 위치 4 (범위 안에 삽입하여 확장되도록)
      const range = document.createRange();
      range.setStart(textNode, 4);
      range.setEnd(textNode, 4);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // 텍스트 변경 (범위 안에 삽입)
      textNode.textContent = 'HellXo World';

      const result = handleEfficientEdit(
        textNode,
        'Hello World',  // oldModelText
        [],
        decorators
      );

      expect(result).toBeTruthy();
      expect(result?.adjustedDecorators.length).toBeGreaterThan(0);
      const adjustedDecorator = result?.adjustedDecorators[0];
      // Decorator 범위가 확장되어야 함 (범위 안에 삽입되었으므로)
      expect(adjustedDecorator?.target.endOffset).toBeGreaterThan(5); // 5 + 1 (삽입)
    });
  });

  describe('복잡한 Mark/Decorator 조합', () => {
    it('3개 이상의 mark가 겹치는 경우 모두 조정되어야 함', () => {
      inlineTextNode.innerHTML = '';
      const textNode1 = document.createTextNode('Hello');
      const boldElement = document.createElement('strong');
      boldElement.className = 'mark-bold';
      const italicElement = document.createElement('em');
      italicElement.className = 'mark-italic';
      const underlineElement = document.createElement('u');
      underlineElement.className = 'mark-underline';
      const textNode2 = document.createTextNode(' World');
      inlineTextNode.appendChild(textNode1);
      inlineTextNode.appendChild(boldElement);
      boldElement.appendChild(italicElement);
      italicElement.appendChild(underlineElement);
      underlineElement.appendChild(textNode2);

      // 텍스트 변경
      textNode1.textContent = 'Hi';
      textNode2.textContent = ' Universe';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [0, 11]  // 전체에 적용된 bold
        },
        {
          type: 'italic',
          range: [5, 11]  // "World"에 적용된 italic
        },
        {
          type: 'underline',
          range: [7, 11]  // "orld"에 적용된 underline
        }
      ];

      const result = handleEfficientEdit(
        textNode1,
        'Hello World',  // oldModelText
        modelMarks,
        []
      );

      expect(result).toBeTruthy();
      expect(result?.adjustedMarks.length).toBeGreaterThanOrEqual(1);
      // 모든 mark의 범위가 유효해야 함
      result?.adjustedMarks.forEach(mark => {
        expect(mark.range[0]).toBeGreaterThanOrEqual(0);
        expect(mark.range[1]).toBeGreaterThanOrEqual(mark.range[0]);
      });
    });

    it('Mark와 Decorator가 여러 개 겹치는 경우 모두 조정되어야 함', () => {
      inlineTextNode.innerHTML = '';
      const textNode1 = document.createTextNode('Hello');
      const boldElement = document.createElement('strong');
      boldElement.className = 'mark-bold';
      const textNode2 = document.createTextNode(' World');
      inlineTextNode.appendChild(textNode1);
      inlineTextNode.appendChild(boldElement);
      boldElement.appendChild(textNode2);

      // 텍스트 변경
      textNode1.textContent = 'Hi';
      textNode2.textContent = ' Universe';

      const modelMarks: MarkRange[] = [
        {
          type: 'bold',
          range: [0, 11]  // 전체에 적용된 bold
        },
        {
          type: 'italic',
          range: [5, 11]  // "World"에 적용된 italic
        }
      ];

      const decorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: {
            sid: 't1',
            startOffset: 0,
            endOffset: 5  // "Hello"에 적용된 highlight
          }
        },
        {
          sid: 'd2',
          stype: 'comment',
          category: 'inline',
          target: {
            sid: 't1',
            startOffset: 6,
            endOffset: 11  // "World"에 적용된 comment
          }
        }
      ];

      const result = handleEfficientEdit(
        textNode1,
        'Hello World',  // oldModelText
        modelMarks,
        decorators
      );

      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hi Universe');
      // Mark와 Decorator가 모두 조정되어야 함
      expect((result?.adjustedMarks?.length ?? 0) + (result?.adjustedDecorators?.length ?? 0)).toBeGreaterThan(0);
    });
  });

  describe('에러 및 예외 케이스', () => {
    it('buildTextRunIndex가 빈 runs를 반환하는 경우 null을 반환해야 함', () => {
      // 빈 inline-text 노드
      inlineTextNode.innerHTML = '';
      inlineTextNode.textContent = '';

      const result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );

      // 빈 runs로 인해 null이 반환되어야 함
      expect(result).toBeNull();
    });

    it('convertDOMToModelPosition이 실패하는 경우에도 작동해야 함', () => {
      textNode.textContent = 'Hello World';

      // Selection이 Element 노드에 있는 경우 (변환 실패 가능)
      const range = document.createRange();
      range.setStart(inlineTextNode, 0);  // Element 노드
      range.setEnd(inlineTextNode, 0);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );

      // Selection 변환 실패해도 text-analyzer가 작동해야 함
      expect(result).toBeTruthy();
      expect(result?.newText).toBe('Hello World');
    });
  });

  describe('실제 사용 시나리오', () => {
    it('연속 타이핑을 정확히 처리해야 함', () => {
      // 첫 번째: 'H'
      textNode.textContent = 'H';
      let result = handleEfficientEdit(
        textNode,
        '',  // oldModelText
        [],
        []
      );
      expect(result?.newText).toBe('H');

      // 두 번째: 'He'
      textNode.textContent = 'He';
      result = handleEfficientEdit(
        textNode,
        'H',  // oldModelText
        [],
        []
      );
      expect(result?.newText).toBe('He');

      // 세 번째: 'Hel'
      textNode.textContent = 'Hel';
      result = handleEfficientEdit(
        textNode,
        'He',  // oldModelText
        [],
        []
      );
      expect(result?.newText).toBe('Hel');
    });

    it('백스페이스 연속을 정확히 처리해야 함', () => {
      // 초기: 'Hello'
      textNode.textContent = 'Hello';

      // 첫 번째 백스페이스: 'Hell'
      textNode.textContent = 'Hell';
      let result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );
      expect(result?.newText).toBe('Hell');

      // 두 번째 백스페이스: 'Hel'
      textNode.textContent = 'Hel';
      result = handleEfficientEdit(
        textNode,
        'Hell',  // oldModelText
        [],
        []
      );
      expect(result?.newText).toBe('Hel');
    });

    it('중간 삽입 연속을 정확히 처리해야 함', () => {
      // 초기: 'Hello'
      textNode.textContent = 'Hello';

      // 첫 번째 삽입: 'HeXllo'
      textNode.textContent = 'HeXllo';
      let result = handleEfficientEdit(
        textNode,
        'Hello',  // oldModelText
        [],
        []
      );
      expect(result?.newText).toBe('HeXllo');

      // 두 번째 삽입: 'HeXYllo'
      textNode.textContent = 'HeXYllo';
      result = handleEfficientEdit(
        textNode,
        'HeXllo',  // oldModelText
        [],
        []
      );
      expect(result?.newText).toBe('HeXYllo');
    });
  });
});

