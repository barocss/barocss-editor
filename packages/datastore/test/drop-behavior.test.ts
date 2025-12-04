import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema, createSchema } from '@barocss/schema';
import { defineDropBehavior, globalDropBehaviorRegistry } from '../src/operations/drop-behavior-registry';
import type { DropContext } from '../src/types/drop-behavior';

describe('Drop Behavior', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    // 기본 스키마 생성
    schema = createSchema('test', {
      topNode: 'document',
      nodes: {
        'document': {
          name: 'document',
          group: 'document',
          content: 'block+'
        },
        'paragraph': {
          name: 'paragraph',
          group: 'block',
          content: 'inline*'
        },
        'heading': {
          name: 'heading',
          group: 'block',
          content: 'inline*'
        },
        'inline-text': {
          name: 'inline-text',
          group: 'inline'
        },
        'inline-image': {
          name: 'inline-image',
          group: 'inline',
          atom: true
        }
      }
    });

    dataStore = new DataStore(undefined, schema);
    
    // 기본 문서 구조 생성
    const docId = 'doc';
    const para1Id = 'para-1';
    const para2Id = 'para-2';
    const text1Id = 'text-1';
    const text2Id = 'text-2';
    const imageId = 'image-1';

    dataStore.setNode({ sid: docId, stype: 'document', content: [], attributes: {} }, false);
    dataStore.setNode({ sid: para1Id, stype: 'paragraph', content: [], parentId: docId, attributes: {} }, false);
    dataStore.setNode({ sid: para2Id, stype: 'paragraph', content: [], parentId: docId, attributes: {} }, false);
    dataStore.setNode({ sid: text1Id, stype: 'inline-text', text: 'Hello', parentId: para1Id, attributes: {} }, false);
    dataStore.setNode({ sid: text2Id, stype: 'inline-text', text: 'World', parentId: para2Id, attributes: {} }, false);
    dataStore.setNode({ sid: imageId, stype: 'inline-image', parentId: para2Id, attributes: { src: 'test.jpg' } }, false);

    dataStore.addChild(docId, para1Id);
    dataStore.addChild(docId, para2Id);
    dataStore.addChild(para1Id, text1Id);
    dataStore.addChild(para2Id, text2Id);
    dataStore.addChild(para2Id, imageId);

    dataStore.setRootNodeId(docId);
  });

  afterEach(() => {
    // Registry 초기화
    globalDropBehaviorRegistry.clear();
  });

  describe('getDropBehavior - 기본 규칙', () => {
    it('기본값: 내부 드래그는 move', () => {
      const para1Id = dataStore.findNodesByType('paragraph')[0].sid!;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;

      const behavior = dataStore.getDropBehavior(para1Id, para2Id);
      expect(behavior).toBe('move');
    });

    it('외부 드래그는 insert', () => {
      const para1Id = dataStore.findNodesByType('paragraph')[0].sid!;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;

      const context: DropContext = {
        sourceOrigin: 'external'
      };

      const behavior = dataStore.getDropBehavior(para1Id, para2Id, context);
      expect(behavior).toBe('insert');
    });

    it('Ctrl/Cmd + 드래그는 copy', () => {
      const para1Id = dataStore.findNodesByType('paragraph')[0].sid!;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;

      const context: DropContext = {
        modifiers: {
          ctrlKey: true
        }
      };

      const behavior = dataStore.getDropBehavior(para1Id, para2Id, context);
      expect(behavior).toBe('copy');
    });

    it('Meta (Cmd) + 드래그는 copy', () => {
      const para1Id = dataStore.findNodesByType('paragraph')[0].sid!;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;

      const context: DropContext = {
        modifiers: {
          metaKey: true
        }
      };

      const behavior = dataStore.getDropBehavior(para1Id, para2Id, context);
      expect(behavior).toBe('copy');
    });
  });

  describe('getDropBehavior - 타입 조합 기본 규칙', () => {
    it('텍스트 노드 → 텍스트 노드: merge', () => {
      const text1Id = dataStore.findNodesByType('inline-text')[0].sid!;
      const text2Id = dataStore.findNodesByType('inline-text')[1].sid!;

      const behavior = dataStore.getDropBehavior(text1Id, text2Id);
      expect(behavior).toBe('merge');
    });

    it('같은 타입의 block: move', () => {
      const para1Id = dataStore.findNodesByType('paragraph')[0].sid!;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;

      const behavior = dataStore.getDropBehavior(para1Id, para2Id);
      expect(behavior).toBe('move');
    });
  });

  describe('getDropBehavior - 스키마 dropBehaviorRules', () => {
    beforeEach(() => {
      // dropBehaviorRules가 있는 스키마 생성
      schema = createSchema('test', {
        topNode: 'document',
        nodes: {
          'document': {
            name: 'document',
            group: 'document',
            content: 'block+'
          },
          'paragraph': {
            name: 'paragraph',
            group: 'block',
            content: 'inline*',
            dropBehaviorRules: {
              'inline-text': 'merge',
              'inline-image': 'copy',
              '*': 'move'
            }
          },
          'heading': {
            name: 'heading',
            group: 'block',
            content: 'inline*',
            dropBehaviorRules: {
              'inline-text': 'merge',
              '*': 'move'
            }
          },
          'inline-text': {
            name: 'inline-text',
            group: 'inline'
          },
          'inline-image': {
            name: 'inline-image',
            group: 'inline',
            atom: true
          }
        }
      });

      dataStore = new DataStore(undefined, schema);
      
      const docId = 'doc';
      const paraId = 'para';
      const headingId = 'heading';
      const textId = 'text';
      const imageId = 'image';

      dataStore.setNode({ sid: docId, stype: 'document', content: [], attributes: {} }, false);
      dataStore.setNode({ sid: paraId, stype: 'paragraph', content: [], parentId: docId, attributes: {} }, false);
      dataStore.setNode({ sid: headingId, stype: 'heading', content: [], parentId: docId, attributes: {} }, false);
      dataStore.setNode({ sid: textId, stype: 'inline-text', text: 'Hello', parentId: paraId, attributes: {} }, false);
      dataStore.setNode({ sid: imageId, stype: 'inline-image', parentId: paraId, attributes: { src: 'test.jpg' } }, false);

      dataStore.addChild(docId, paraId);
      dataStore.addChild(docId, headingId);
      dataStore.addChild(paraId, textId);
      dataStore.addChild(paraId, imageId);

      dataStore.setRootNodeId(docId);
    });

    it('스키마 규칙: inline-text → paragraph는 merge', () => {
      const paraId = dataStore.findNodesByType('paragraph')[0].sid!;
      const textId = dataStore.findNodesByType('inline-text')[0].sid!;

      const behavior = dataStore.getDropBehavior(paraId, textId);
      expect(behavior).toBe('merge');
    });

    it('스키마 규칙: inline-image → paragraph는 copy', () => {
      const paraId = dataStore.findNodesByType('paragraph')[0].sid!;
      const imageId = dataStore.findNodesByType('inline-image')[0].sid!;

      const behavior = dataStore.getDropBehavior(paraId, imageId);
      expect(behavior).toBe('copy');
    });

    it('스키마 규칙: 와일드카드 규칙 적용', () => {
      const paraId = dataStore.findNodesByType('paragraph')[0].sid!;
      const headingId = dataStore.findNodesByType('heading')[0].sid!;

      // paragraph에 heading에 대한 명시적 규칙이 없으므로 와일드카드 규칙 적용
      const behavior = dataStore.getDropBehavior(paraId, headingId);
      expect(behavior).toBe('move');
    });

    it('스키마 규칙 우선순위: 소스 타입 > 와일드카드', () => {
      const paraId = dataStore.findNodesByType('paragraph')[0].sid!;
      const textId = dataStore.findNodesByType('inline-text')[0].sid!;

      // inline-text에 대한 명시적 규칙(merge)이 와일드카드(move)보다 우선
      const behavior = dataStore.getDropBehavior(paraId, textId);
      expect(behavior).toBe('merge');
    });
  });

  describe('defineDropBehavior - 동적 규칙', () => {
    beforeEach(() => {
      globalDropBehaviorRegistry.clear();
    });

    it('기본 규칙 등록', () => {
      defineDropBehavior('paragraph', 'copy');

      const para1Id = dataStore.findNodesByType('paragraph')[0].sid!;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;

      const behavior = dataStore.getDropBehavior(para1Id, para2Id);
      expect(behavior).toBe('copy');
    });

    it('동적 함수 규칙', () => {
      defineDropBehavior(
        'paragraph',
        (target, source, context) => {
          if (source.stype === 'inline-text') {
            return 'merge';
          }
          return 'move';
        },
        { priority: 100 }
      );

      const paraId = dataStore.findNodesByType('paragraph')[0].sid!;
      const textId = dataStore.findNodesByType('inline-text')[0].sid!;
      const imageId = dataStore.findNodesByType('inline-image')[0].sid!;

      expect(dataStore.getDropBehavior(paraId, textId)).toBe('merge');
      expect(dataStore.getDropBehavior(paraId, imageId)).toBe('move');
    });

    it('함수 규칙에서 null 반환 시 다음 우선순위 확인', () => {
      defineDropBehavior(
        'paragraph',
        (target, source, context) => {
          // 조건에 맞지 않으면 null 반환
          if (context?.modifiers?.shiftKey) {
            return 'copy';
          }
          return null; // 다음 우선순위 확인
        },
        { priority: 200 }
      );

      const paraId = dataStore.findNodesByType('paragraph')[0].sid!;
      const textId = dataStore.findNodesByType('inline-text')[0].sid!;

      // shiftKey가 없으면 null 반환 → 다음 우선순위(기본 규칙) 확인
      expect(dataStore.getDropBehavior(paraId, textId)).toBe('merge');

      // shiftKey가 있으면 copy 반환
      const context: DropContext = {
        modifiers: { shiftKey: true }
      };
      expect(dataStore.getDropBehavior(paraId, textId, context)).toBe('copy');
    });

    it('우선순위 기반 규칙 매칭', () => {
      // 낮은 우선순위 규칙
      defineDropBehavior('paragraph', 'move', { priority: 10 });
      
      // 높은 우선순위 규칙
      defineDropBehavior('paragraph', 'copy', { priority: 100 });

      const para1Id = dataStore.findNodesByType('paragraph')[0].sid!;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;

      // 높은 우선순위 규칙이 적용됨
      const behavior = dataStore.getDropBehavior(para1Id, para2Id);
      expect(behavior).toBe('copy');
    });

    it('소스 타입 필터링', () => {
      defineDropBehavior(
        'paragraph',
        'merge',
        { sourceType: 'inline-text', priority: 200 }
      );

      defineDropBehavior(
        'paragraph',
        'copy',
        { sourceType: 'inline-image', priority: 200 }
      );

      const paraId = dataStore.findNodesByType('paragraph')[0].sid!;
      const textId = dataStore.findNodesByType('inline-text')[0].sid!;
      const imageId = dataStore.findNodesByType('inline-image')[0].sid!;

      expect(dataStore.getDropBehavior(paraId, textId)).toBe('merge');
      expect(dataStore.getDropBehavior(paraId, imageId)).toBe('copy');
    });

    it('여러 타겟 타입에 대한 규칙', () => {
      defineDropBehavior(
        ['paragraph', 'heading'],
        'copy',
        { priority: 150 }
      );

      const paraId = dataStore.findNodesByType('paragraph')[0].sid!;
      const headingId = dataStore.findNodesByType('heading')[0]?.sid;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;

      expect(dataStore.getDropBehavior(paraId, para2Id)).toBe('copy');
      
      if (headingId) {
        expect(dataStore.getDropBehavior(headingId, paraId)).toBe('copy');
      }
    });

    it('와일드카드 타겟 타입', () => {
      defineDropBehavior('*', 'copy', { priority: 50 });

      const para1Id = dataStore.findNodesByType('paragraph')[0].sid!;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;
      const text1Id = dataStore.findNodesByType('inline-text')[0].sid!;
      const text2Id = dataStore.findNodesByType('inline-text')[1].sid!;

      // 모든 조합에 대해 copy 적용
      expect(dataStore.getDropBehavior(para1Id, para2Id)).toBe('copy');
      expect(dataStore.getDropBehavior(text1Id, text2Id)).toBe('copy');
    });
  });

  describe('getDropBehavior - 우선순위', () => {
    beforeEach(() => {
      // 스키마에 dropBehaviorRules 정의
      schema = createSchema('test', {
        topNode: 'document',
        nodes: {
          'document': {
            name: 'document',
            group: 'document',
            content: 'block+'
          },
          'paragraph': {
            name: 'paragraph',
            group: 'block',
            content: 'inline*',
            dropBehaviorRules: {
              'inline-text': 'merge',
              '*': 'move'
            }
          },
          'inline-text': {
            name: 'inline-text',
            group: 'inline'
          }
        }
      });

      dataStore = new DataStore(undefined, schema);
      
      const docId = 'doc';
      const paraId = 'para';
      const textId = 'text';

      dataStore.setNode({ sid: docId, stype: 'document', content: [], attributes: {} }, false);
      dataStore.setNode({ sid: paraId, stype: 'paragraph', content: [], parentId: docId, attributes: {} }, false);
      dataStore.setNode({ sid: textId, stype: 'inline-text', text: 'Hello', parentId: paraId, attributes: {} }, false);

      dataStore.addChild(docId, paraId);
      dataStore.addChild(paraId, textId);

      dataStore.setRootNodeId(docId);
    });

    it('우선순위: UI 컨텍스트 > defineDropBehavior > 스키마 규칙', () => {
      const paraId = dataStore.findNodesByType('paragraph')[0].sid!;
      const textId = dataStore.findNodesByType('inline-text')[0].sid!;

      // defineDropBehavior 규칙 등록 (스키마 규칙보다 우선)
      defineDropBehavior('paragraph', 'copy', { 
        sourceType: 'inline-text',
        priority: 200 
      });

      // 1. UI 컨텍스트가 없으면 defineDropBehavior 규칙 적용
      expect(dataStore.getDropBehavior(paraId, textId)).toBe('copy');

      // 2. UI 컨텍스트(Ctrl)가 있으면 UI 컨텍스트가 최우선
      const context: DropContext = {
        modifiers: { ctrlKey: true }
      };
      expect(dataStore.getDropBehavior(paraId, textId, context)).toBe('copy'); // 이미 copy이므로 동일

      // 3. defineDropBehavior 규칙 제거 후 스키마 규칙 확인
      globalDropBehaviorRegistry.clear();
      expect(dataStore.getDropBehavior(paraId, textId)).toBe('merge'); // 스키마 규칙
    });

    it('우선순위: defineDropBehavior > 스키마 규칙 > 기본 규칙', () => {
      const paraId = dataStore.findNodesByType('paragraph')[0].sid!;
      const textId = dataStore.findNodesByType('inline-text')[0].sid!;

      // defineDropBehavior 규칙이 없으면 스키마 규칙 적용
      expect(dataStore.getDropBehavior(paraId, textId)).toBe('merge');

      // defineDropBehavior 규칙 등록
      defineDropBehavior('paragraph', 'copy', { 
        sourceType: 'inline-text',
        priority: 200 
      });

      // defineDropBehavior 규칙이 우선
      expect(dataStore.getDropBehavior(paraId, textId)).toBe('copy');
    });
  });

  describe('getDropBehavior - 엣지 케이스', () => {
    it('존재하지 않는 노드 ID는 기본값 반환', () => {
      const behavior = dataStore.getDropBehavior('nonexistent-1', 'nonexistent-2');
      expect(behavior).toBe('move');
    });

    it('null/undefined 컨텍스트 처리', () => {
      const para1Id = dataStore.findNodesByType('paragraph')[0].sid!;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;

      const behavior = dataStore.getDropBehavior(para1Id, para2Id, undefined);
      expect(behavior).toBe('move');
    });

    it('빈 컨텍스트 처리', () => {
      const para1Id = dataStore.findNodesByType('paragraph')[0].sid!;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;

      const behavior = dataStore.getDropBehavior(para1Id, para2Id, {});
      expect(behavior).toBe('move');
    });

    it('복잡한 컨텍스트 정보', () => {
      const para1Id = dataStore.findNodesByType('paragraph')[0].sid!;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;

      const context: DropContext = {
        modifiers: {
          ctrlKey: true,
          shiftKey: true,
          altKey: false
        },
        position: 5,
        dropZone: 'inside',
        sourceOrigin: 'internal'
      };

      // Ctrl 키가 있으면 copy
      const behavior = dataStore.getDropBehavior(para1Id, para2Id, context);
      expect(behavior).toBe('copy');
    });
  });

  describe('defineDropBehavior - Registry 동작', () => {
    beforeEach(() => {
      globalDropBehaviorRegistry.clear();
    });

    it('규칙 등록 및 조회', () => {
      defineDropBehavior('paragraph', 'copy');

      const para1Id = dataStore.findNodesByType('paragraph')[0].sid!;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;

      const behavior = globalDropBehaviorRegistry.get(
        'paragraph',
        'paragraph',
        dataStore.getNode(para1Id),
        dataStore.getNode(para2Id)
      );

      expect(behavior).toBe('copy');
    });

    it('규칙 제거 (clear)', () => {
      defineDropBehavior('paragraph', 'copy');
      
      globalDropBehaviorRegistry.clear();

      const para1Id = dataStore.findNodesByType('paragraph')[0].sid!;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;

      const behavior = dataStore.getDropBehavior(para1Id, para2Id);
      // 규칙이 제거되었으므로 기본 규칙 적용
      expect(behavior).toBe('move');
    });

    it('여러 규칙 등록 시 우선순위 정렬', () => {
      defineDropBehavior('paragraph', 'move', { priority: 10 });
      defineDropBehavior('paragraph', 'copy', { priority: 100 });
      defineDropBehavior('paragraph', 'merge', { priority: 50 });

      const para1Id = dataStore.findNodesByType('paragraph')[0].sid!;
      const para2Id = dataStore.findNodesByType('paragraph')[1].sid!;

      // 가장 높은 우선순위 규칙 적용
      const behavior = dataStore.getDropBehavior(para1Id, para2Id);
      expect(behavior).toBe('copy');
    });
  });

  describe('기본 규칙 등록', () => {
    it('DataStore 초기화 시 기본 규칙이 등록됨', () => {
      // 새로운 DataStore 생성 (기본 규칙 자동 등록)
      const newDataStore = new DataStore(undefined, schema);
      
      const docId = 'doc';
      const paraId = 'para';
      const text1Id = 'text-1';
      const text2Id = 'text-2';

      newDataStore.setNode({ sid: docId, stype: 'document', content: [], attributes: {} }, false);
      newDataStore.setNode({ sid: paraId, stype: 'paragraph', content: [], parentId: docId, attributes: {} }, false);
      newDataStore.setNode({ sid: text1Id, stype: 'inline-text', text: 'Hello', parentId: paraId, attributes: {} }, false);
      newDataStore.setNode({ sid: text2Id, stype: 'inline-text', text: 'World', parentId: paraId, attributes: {} }, false);

      newDataStore.addChild(docId, paraId);
      newDataStore.addChild(paraId, text1Id);
      newDataStore.addChild(paraId, text2Id);
      newDataStore.setRootNodeId(docId);

      // 텍스트 노드 → 텍스트 노드: merge (기본 규칙)
      const behavior = newDataStore.getDropBehavior(text1Id, text2Id);
      expect(behavior).toBe('merge');
    });
  });
});

