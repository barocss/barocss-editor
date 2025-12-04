import { DataStore } from '@barocss/datastore';
import { Editor } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { 
  addDecorator, 
  removeDecorator, 
  updateDecorator,
  getDecorator,
  getAllDecorators,
  getDecoratorsByNode,
  getDecoratorsByType,
  getDecoratorsByCategory
} from '@barocss/model';
import type { IDecorator } from '@barocss/datastore';

// 데코레이터 샘플 데이터
export const decoratorSamples = {
  // 댓글 데코레이터들
  comments: [
    {
      id: 'comment-1',
      type: 'comment',
      category: 'layer' as const,
      target: { nodeId: 'text-1', startOffset: 0, endOffset: 4 },
      data: { content: '이 부분을 수정해야 합니다', author: 'alice', priority: 'high' },
      createdAt: Date.now() - 3600000, // 1시간 전
      updatedAt: Date.now() - 1800000, // 30분 전
      author: 'alice',
      version: 2
    },
    {
      id: 'comment-2',
      type: 'comment',
      category: 'layer' as const,
      target: { nodeId: 'text-bold', startOffset: 0, endOffset: 9 },
      data: { content: '굵은 글씨가 적절한지 검토 필요', author: 'bob', priority: 'medium' },
      createdAt: Date.now() - 7200000, // 2시간 전
      updatedAt: Date.now() - 7200000,
      author: 'bob',
      version: 1
    },
    {
      id: 'comment-3',
      type: 'comment',
      category: 'layer' as const,
      target: { nodeId: 'text-italic', startOffset: 0, endOffset: 11 },
      data: { content: '이탤릭체 스타일 확인', author: 'charlie', priority: 'low' },
      createdAt: Date.now() - 1800000, // 30분 전
      updatedAt: Date.now() - 1800000,
      author: 'charlie',
      version: 1
    }
  ],

  // 하이라이트 데코레이터들
  highlights: [
    {
      id: 'highlight-1',
      type: 'highlight',
      category: 'layer' as const,
      target: { nodeId: 'text-red', startOffset: 0, endOffset: 8 },
      data: { color: '#ffeb3b', reason: '중요한 내용', author: 'alice' },
      createdAt: Date.now() - 900000, // 15분 전
      author: 'alice',
      version: 1
    },
    {
      id: 'highlight-2',
      type: 'highlight',
      category: 'layer' as const,
      target: { nodeId: 'text-yellow-bg', startOffset: 0, endOffset: 16 },
      data: { color: '#e3f2fd', reason: '검토 필요', author: 'bob' },
      createdAt: Date.now() - 600000, // 10분 전
      author: 'bob',
      version: 1
    }
  ],

  // 링크 데코레이터들
  links: [
    {
      id: 'link-1',
      type: 'link',
      category: 'inline' as const,
      target: { nodeId: 'text-link', startOffset: 0, endOffset: 12 },
      data: { href: 'https://google.com', title: 'Google Search', status: 'verified' },
      createdAt: Date.now() - 1200000, // 20분 전
      author: 'alice',
      version: 1
    }
  ],

  // 상태 데코레이터들
  statuses: [
    {
      id: 'status-1',
      type: 'status',
      category: 'block' as const,
      target: { nodeId: 'h-1', startOffset: 0, endOffset: 0 },
      data: { status: 'draft', progress: 75, assignee: 'alice' },
      createdAt: Date.now() - 14400000, // 4시간 전
      updatedAt: Date.now() - 3600000, // 1시간 전
      author: 'alice',
      version: 3
    },
    {
      id: 'status-2',
      type: 'status',
      category: 'block' as const,
      target: { nodeId: 'p-1', startOffset: 0, endOffset: 0 },
      data: { status: 'review', progress: 50, assignee: 'bob' },
      createdAt: Date.now() - 10800000, // 3시간 전
      updatedAt: Date.now() - 1800000, // 30분 전
      author: 'bob',
      version: 2
    }
  ],

  // 태그 데코레이터들
  tags: [
    {
      id: 'tag-1',
      type: 'tag',
      category: 'inline' as const,
      target: { nodeId: 'text-complex1', startOffset: 0, endOffset: 20 },
      data: { tags: ['code', 'typescript', 'important'], color: '#4caf50' },
      createdAt: Date.now() - 300000, // 5분 전
      author: 'charlie',
      version: 1
    },
    {
      id: 'tag-2',
      type: 'tag',
      category: 'inline' as const,
      target: { nodeId: 'text-complex2', startOffset: 0, endOffset: 13 },
      data: { tags: ['link', 'external'], color: '#2196f3' },
      createdAt: Date.now() - 240000, // 4분 전
      author: 'alice',
      version: 1
    }
  ],

  // 교차 노드 데코레이터들
  crossNode: [
    {
      id: 'cross-1',
      type: 'comment',
      category: 'layer' as const,
      target: { 
        startNodeId: 'text-1', 
        startOffset: 5, 
        endNodeId: 'text-bold', 
        endOffset: 4 
      },
      data: { content: '여러 노드에 걸친 댓글', author: 'alice', priority: 'high' },
      createdAt: Date.now() - 180000, // 3분 전
      author: 'alice',
      version: 1
    }
  ]
};

// 데코레이터 시나리오 실행 함수들
export class DecoratorScenarioRunner {
  constructor(private editor: Editor, private dataStore: DataStore) {}

  // 1. 기본 CRUD 시나리오
  async runBasicCRUDScenario() {
    console.log('=== 기본 CRUD 시나리오 시작 ===');
    
    // 댓글 추가
    const comment = decoratorSamples.comments[0];
    const addResult = await this.editor.transaction([addDecorator(comment)]).commit();
    console.log('댓글 추가:', addResult.success ? '성공' : '실패');
    
    // 댓글 조회
    const retrieved = this.dataStore.getDecorator(comment.sid);
    console.log('댓글 조회:', retrieved ? '성공' : '실패');
    
    // 댓글 수정
    const updateResult = await this.editor.transaction([
      updateDecorator(comment.sid, { 
        data: { ...comment.data, content: '수정된 댓글 내용' } 
      })
    ]).commit();
    console.log('댓글 수정:', updateResult.success ? '성공' : '실패');
    
    // 댓글 삭제
    const deleteResult = await this.editor.transaction([removeDecorator(comment.sid)]).commit();
    console.log('댓글 삭제:', deleteResult.success ? '성공' : '실패');
    
    console.log('=== 기본 CRUD 시나리오 완료 ===');
  }

  // 2. 배치 작업 시나리오
  async runBatchOperationScenario() {
    console.log('=== 배치 작업 시나리오 시작 ===');
    
    // 여러 데코레이터 한 번에 추가
    const batchDecorators = [
      ...decoratorSamples.comments.slice(0, 2),
      ...decoratorSamples.highlights.slice(0, 2),
      ...decoratorSamples.tags.slice(0, 1)
    ];
    
    const batchResult = await this.editor.transaction(
      batchDecorators.map(d => addDecorator(d))
    ).commit();
    console.log('배치 추가:', batchResult.success ? '성공' : '실패');
    
    // 전체 데코레이터 조회
    const allDecorators = this.dataStore.getAllDecorators();
    console.log(`전체 데코레이터 수: ${allDecorators.length}`);
    
    // 특정 노드의 데코레이터 조회
    const nodeDecorators = this.dataStore.getDecoratorsByNode('text-1');
    console.log(`text-1 노드의 데코레이터 수: ${nodeDecorators.length}`);
    
    // 특정 타입의 데코레이터 조회
    const commentDecorators = this.dataStore.getDecoratorsByType('comment');
    console.log(`댓글 데코레이터 수: ${commentDecorators.length}`);
    
    // 특정 카테고리의 데코레이터 조회
    const layerDecorators = this.dataStore.getDecoratorsByCategory('layer');
    console.log(`레이어 데코레이터 수: ${layerDecorators.length}`);
    
    console.log('=== 배치 작업 시나리오 완료 ===');
  }

  // 3. 교차 노드 데코레이터 시나리오
  async runCrossNodeScenario() {
    console.log('=== 교차 노드 데코레이터 시나리오 시작 ===');
    
    const crossNodeDecorator = decoratorSamples.crossNode[0];
    const result = await this.editor.transaction([addDecorator(crossNodeDecorator)]).commit();
    console.log('교차 노드 데코레이터 추가:', result.success ? '성공' : '실패');
    
    if (result.success) {
      const retrieved = this.dataStore.getDecorator(crossNodeDecorator.sid);
      console.log('교차 노드 데코레이터 조회:', retrieved ? '성공' : '실패');
      console.log('타겟 정보:', retrieved?.target);
    }
    
    console.log('=== 교차 노드 데코레이터 시나리오 완료 ===');
  }

  // 4. 실시간 협업 시나리오
  async runCollaborationScenario() {
    console.log('=== 실시간 협업 시나리오 시작 ===');
    
    // 사용자별 데코레이터 추가
    const aliceDecorator = {
      id: 'collab-alice-1',
      type: 'comment',
      category: 'layer' as const,
      target: { nodeId: 'text-1', startOffset: 0, endOffset: 4 },
      data: { content: 'Alice의 댓글', author: 'alice', timestamp: Date.now() },
      createdAt: Date.now(),
      author: 'alice',
      version: 1
    };
    
    const bobDecorator = {
      id: 'collab-bob-1',
      type: 'highlight',
      category: 'layer' as const,
      target: { nodeId: 'text-bold', startOffset: 0, endOffset: 9 },
      data: { color: '#ffcdd2', reason: 'Bob의 하이라이트', author: 'bob' },
      createdAt: Date.now() - 1000,
      author: 'bob',
      version: 1
    };
    
    // 동시에 추가
    const result = await this.editor.transaction([
      addDecorator(aliceDecorator),
      addDecorator(bobDecorator)
    ]).commit();
    console.log('협업 데코레이터 추가:', result.success ? '성공' : '실패');
    
    // 사용자별 데코레이터 조회
    const aliceDecorators = this.dataStore.getAllDecorators().filter(d => d.author === 'alice');
    const bobDecorators = this.dataStore.getAllDecorators().filter(d => d.author === 'bob');
    console.log(`Alice의 데코레이터 수: ${aliceDecorators.length}`);
    console.log(`Bob의 데코레이터 수: ${bobDecorators.length}`);
    
    console.log('=== 실시간 협업 시나리오 완료 ===');
  }

  // 5. 성능 테스트 시나리오
  async runPerformanceScenario() {
    console.log('=== 성능 테스트 시나리오 시작 ===');
    
    const startTime = performance.now();
    
    // 대량의 데코레이터 생성
    const largeBatch = [];
    for (let i = 0; i < 100; i++) {
      largeBatch.push({
        id: `perf-${i}`,
        type: 'comment',
        category: 'layer' as const,
        target: { nodeId: 'text-1', startOffset: 0, endOffset: 4 },
        data: { content: `성능 테스트 댓글 ${i}`, author: 'perf-test' },
        createdAt: Date.now(),
        author: 'perf-test',
        version: 1
      });
    }
    
    // 배치 추가
    const result = await this.editor.transaction(
      largeBatch.map(d => addDecorator(d))
    ).commit();
    
    const endTime = performance.now();
    console.log(`100개 데코레이터 추가: ${result.success ? '성공' : '실패'}`);
    console.log(`소요 시간: ${(endTime - startTime).toFixed(2)}ms`);
    
    // 조회 성능 테스트
    const queryStartTime = performance.now();
    const allDecorators = this.dataStore.getAllDecorators();
    const queryEndTime = performance.now();
    console.log(`전체 조회 시간: ${(queryEndTime - queryStartTime).toFixed(2)}ms`);
    console.log(`총 데코레이터 수: ${allDecorators.length}`);
    
    console.log('=== 성능 테스트 시나리오 완료 ===');
  }

  // 6. 에러 처리 시나리오
  async runErrorHandlingScenario() {
    console.log('=== 에러 처리 시나리오 시작 ===');
    
    // 잘못된 타겟 노드
    const invalidTargetDecorator = {
      id: 'error-1',
      type: 'comment',
      category: 'layer' as const,
      target: { nodeId: 'nonexistent-node', startOffset: 0, endOffset: 5 },
      data: { content: '잘못된 타겟', author: 'error-test' }
    };
    
    const invalidResult = await this.editor.transaction([addDecorator(invalidTargetDecorator)]).commit();
    console.log('잘못된 타겟 데코레이터:', invalidResult.success ? '성공 (예상치 못함)' : '실패 (예상됨)');
    
    // 잘못된 스키마 데이터
    const invalidDataDecorator = {
      id: 'error-2',
      type: 'comment',
      category: 'layer' as const,
      target: { nodeId: 'text-1', startOffset: 0, endOffset: 4 },
      data: { content: '', author: '' } // 필수 필드가 비어있음
    };
    
    const invalidDataResult = await this.editor.transaction([addDecorator(invalidDataDecorator)]).commit();
    console.log('잘못된 데이터 데코레이터:', invalidDataResult.success ? '성공 (예상치 못함)' : '실패 (예상됨)');
    
    // 중복 ID
    const duplicateIdDecorator = {
      id: 'duplicate-test',
      type: 'comment',
      category: 'layer' as const,
      target: { nodeId: 'text-1', startOffset: 0, endOffset: 4 },
      data: { content: '중복 ID 테스트', author: 'test' }
    };
    
    // 첫 번째 추가
    const firstAdd = await this.editor.transaction([addDecorator(duplicateIdDecorator)]).commit();
    console.log('첫 번째 추가:', firstAdd.success ? '성공' : '실패');
    
    // 두 번째 추가 (중복 ID)
    const secondAdd = await this.editor.transaction([addDecorator(duplicateIdDecorator)]).commit();
    console.log('중복 ID 추가:', secondAdd.success ? '성공 (덮어쓰기)' : '실패 (예상됨)');
    
    console.log('=== 에러 처리 시나리오 완료 ===');
  }

  // 7. 복합 시나리오 (모든 기능 통합)
  async runComplexScenario() {
    console.log('=== 복합 시나리오 시작 ===');
    
    // 1. 다양한 타입의 데코레이터 추가
    const complexDecorators = [
      ...decoratorSamples.comments,
      ...decoratorSamples.highlights,
      ...decoratorSamples.links,
      ...decoratorSamples.statuses,
      ...decoratorSamples.tags,
      ...decoratorSamples.crossNode
    ];
    
    const addResult = await this.editor.transaction(
      complexDecorators.map(d => addDecorator(d))
    ).commit();
    console.log('복합 데코레이터 추가:', addResult.success ? '성공' : '실패');
    
    // 2. 통계 정보 출력
    const allDecorators = this.dataStore.getAllDecorators();
    const stats = {
      total: allDecorators.length,
      byType: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      byAuthor: {} as Record<string, number>
    };
    
    allDecorators.forEach(d => {
      stats.byType[d.type] = (stats.byType[d.type] || 0) + 1;
      stats.byCategory[d.category] = (stats.byCategory[d.category] || 0) + 1;
      if (d.author) {
        stats.byAuthor[d.author] = (stats.byAuthor[d.author] || 0) + 1;
      }
    });
    
    console.log('데코레이터 통계:', stats);
    
    // 3. 특정 조건으로 필터링
    const recentDecorators = allDecorators.filter(d => 
      d.createdAt && (Date.now() - d.createdAt) < 3600000 // 1시간 이내
    );
    console.log(`최근 1시간 내 데코레이터 수: ${recentDecorators.length}`);
    
    const highPriorityComments = allDecorators.filter(d => 
      d.type === 'comment' && d.data?.priority === 'high'
    );
    console.log(`높은 우선순위 댓글 수: ${highPriorityComments.length}`);
    
    // 4. 일부 데코레이터 수정
    const updatePromises = recentDecorators.slice(0, 3).map(d => 
      this.editor.transaction([
        updateDecorator(d.sid, { 
          data: { ...d.data, updated: true },
          updatedAt: Date.now()
        })
      ]).commit()
    );
    
    const updateResults = await Promise.all(updatePromises);
    const successCount = updateResults.filter(r => r.success).length;
    console.log(`데코레이터 수정: ${successCount}/${updatePromises.length} 성공`);
    
    // 5. 일부 데코레이터 삭제
    const deletePromises = allDecorators.slice(0, 5).map(d => 
      this.editor.transaction([removeDecorator(d.sid)]).commit()
    );
    
    const deleteResults = await Promise.all(deletePromises);
    const deleteSuccessCount = deleteResults.filter(r => r.success).length;
    console.log(`데코레이터 삭제: ${deleteSuccessCount}/${deletePromises.length} 성공`);
    
    // 6. 최종 상태 확인
    const finalDecorators = this.dataStore.getAllDecorators();
    console.log(`최종 데코레이터 수: ${finalDecorators.length}`);
    
    console.log('=== 복합 시나리오 완료 ===');
  }

  // 모든 시나리오 실행
  async runAllScenarios() {
    console.log('🚀 데코레이터 시나리오 테스트 시작');
    
    try {
      await this.runBasicCRUDScenario();
      await this.runBatchOperationScenario();
      await this.runCrossNodeScenario();
      await this.runCollaborationScenario();
      await this.runPerformanceScenario();
      await this.runErrorHandlingScenario();
      await this.runComplexScenario();
      
      console.log('✅ 모든 시나리오 완료');
    } catch (error) {
      console.error('❌ 시나리오 실행 중 오류:', error);
    }
  }
}

// 데코레이터 스키마 생성
export function createDecoratorSchema() {
  return new Schema('decorator-test', {
    topNode: 'doc',
    nodes: {
      doc: { content: 'paragraph+' },
      paragraph: { content: '(inline-text|image)*' },
      'inline-text': { inline: true, text: true },
      image: { inline: true, attributes: { src: { type: 'string' } } }
    },
    marks: {
      bold: {},
      italic: {},
      link: { attributes: { href: { type: 'string' } } }
    },
    decorators: {
      comment: {
        name: 'comment',
        category: 'layer',
        dataSchema: {
          content: { type: 'string', required: true },
          author: { type: 'string', required: true },
          priority: { type: 'string', required: false },
          timestamp: { type: 'number', required: false }
        },
        render: {
          position: 'overlay'
        }
      },
      highlight: {
        name: 'highlight',
        category: 'layer',
        dataSchema: {
          color: { type: 'string', required: true },
          reason: { type: 'string', required: false },
          author: { type: 'string', required: false }
        },
        render: {
          position: 'overlay'
        }
      },
      link: {
        name: 'link',
        category: 'inline',
        dataSchema: {
          href: { type: 'string', required: true },
          title: { type: 'string', required: false },
          status: { type: 'string', required: false }
        },
        render: {
          position: 'inside-start'
        }
      },
      status: {
        name: 'status',
        category: 'block',
        dataSchema: {
          status: { type: 'string', required: true },
          progress: { type: 'number', required: false },
          assignee: { type: 'string', required: false }
        },
        render: {
          position: 'absolute'
        }
      },
      tag: {
        name: 'tag',
        category: 'inline',
        dataSchema: {
          tags: { type: 'array', required: true },
          color: { type: 'string', required: false }
        },
        render: {
          position: 'inside-start'
        }
      },
      interactiveWidget: {
        name: 'interactiveWidget',
        category: 'inline',
        dataSchema: {
          widgetType: { type: 'string', required: true },
          action: { type: 'string', required: false },
          config: { type: 'object', required: false }
        },
        render: {
          position: 'inside-start',
          insertionMode: 'replace'
        }
      },
      mathFormula: {
        name: 'mathFormula',
        category: 'inline',
        dataSchema: {
          formula: { type: 'string', required: true },
          format: { type: 'string', required: false }
        },
        render: {
          position: 'inside-start',
          insertionMode: 'insert-after'
        }
      },
      embed: {
        name: 'embed',
        category: 'block',
        dataSchema: {
          url: { type: 'string', required: true },
          type: { type: 'string', required: true },
          title: { type: 'string', required: false }
        },
        render: {
          position: 'after',
          insertionMode: 'insert-after'
        }
      }
    }
  });
}
