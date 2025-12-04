/**
 * 고정된 모니터링 대상 목록
 * 
 * 새로운 패키지/클래스를 모니터링하려면 여기에 명시적으로 추가해야 합니다.
 * 이 목록을 기반으로 AutoTracer가 자동으로 함수를 래핑하여 추적합니다.
 */

export interface InstrumentationTarget {
  /** 패키지 이름 (예: '@barocss/editor-core') */
  package: string;
  /** 클래스 이름 (예: 'Editor', 'InputHandlerImpl') */
  className: string;
  /** 계측할 메서드 이름 목록 */
  methods: string[];
  /** 입력 인자 직렬화 함수 (선택 사항) */
  inputSerializer?: (methodName: string, args: any[]) => any;
  /** 출력 결과 직렬화 함수 (선택 사항) */
  outputSerializer?: (methodName: string, result: any) => any;
}

// 데이터 요약 헬퍼 함수
const summarizeModelData = (data: any): any => {
  if (!data) return data;
  if (Array.isArray(data)) return `Array(${data.length})`;
  if (typeof data === 'object') {
     const { sid, stype, content, children } = data;
     const summary: any = { sid, stype };
     if (content) summary.content = `Array(${content.length})`;
     if (children) summary.children = `Array(${children.length})`;
     return summary;
  }
  return data;
};

const summarizeVNode = (vnode: any): any => {
  if (!vnode) return vnode;
  if (typeof vnode === 'object') {
     const { tag, sid, stype, children, props } = vnode;
     const summary: any = { tag, sid, stype };
     if (children) summary.children = `Array(${children.length})`;
     if (props && props.content) {
       summary.props = { ...props, content: `Array(${props.content.length})` };
     }
     return summary;
  }
  return vnode;
};

/**
 * 고정된 모니터링 대상 목록
 */
export const INSTRUMENTATION_TARGETS: InstrumentationTarget[] = [
  // Editor Core
  {
    package: '@barocss/editor-core',
    className: 'Editor',
    methods: ['executeCommand', 'updateSelection'],
    inputSerializer: (methodName, args) => {
      if (methodName === 'executeCommand') {
        return {
          command: args[0],
          payload: args[1]
        };
      }
      if (methodName === 'updateSelection' && args[0]) {
        const sel = args[0];
        // type: 'range' 형식 (startNodeId/endNodeId)
        if (sel.type === 'range') {
          return [{
            type: sel.type,
            startNodeId: sel.startNodeId,
            startOffset: sel.startOffset,
            endNodeId: sel.endNodeId,
            endOffset: sel.endOffset,
            collapsed: sel.collapsed
          }];
        }
        // 기타 형식
        return [sel];
      }
      return args;
    }
  },
  
  // Editor View DOM
  {
    package: '@barocss/editor-view-dom',
    className: 'EditorViewDOM',
    methods: ['render', 'convertModelSelectionToDOM', 'convertDOMSelectionToModel'],
    inputSerializer: (methodName, args) => {
      if (methodName === 'convertModelSelectionToDOM' && args[0]) {
        const sel = args[0];
        return [{
          anchor: sel.anchor ? `${sel.anchor.nodeId}:${sel.anchor.offset}` : 'null',
          head: sel.head ? `${sel.head.nodeId}:${sel.head.offset}` : 'null',
          empty: sel.empty
        }];
      }
      if (methodName === 'convertDOMSelectionToModel' && args[0]) {
        const sel = args[0];
        return [{
          anchorNode: sel.anchorNode?.nodeName || 'null',
          anchorOffset: sel.anchorOffset,
          focusNode: sel.focusNode?.nodeName || 'null',
          focusOffset: sel.focusOffset,
          isCollapsed: sel.isCollapsed
        }];
      }
      return args;
    }
  },
  {
    package: '@barocss/editor-view-dom',
    className: 'DOMSelectionHandlerImpl',
    methods: ['convertModelSelectionToDOM', 'convertDOMSelectionToModel', 'handleSelectionChange'],
    inputSerializer: (methodName, args) => {
      if (methodName === 'convertModelSelectionToDOM' && args[0]) {
        const sel = args[0];
        return [{
          anchor: sel.anchor ? `${sel.anchor.nodeId}:${sel.anchor.offset}` : 'null',
          head: sel.head ? `${sel.head.nodeId}:${sel.head.offset}` : 'null',
          empty: sel.empty
        }];
      }
      if (methodName === 'convertDOMSelectionToModel' && args[0]) {
        const sel = args[0];
        return [{
          anchorNode: sel.anchorNode?.nodeName || 'null',
          anchorOffset: sel.anchorOffset,
          focusNode: sel.focusNode?.nodeName || 'null',
          focusOffset: sel.focusOffset,
          isCollapsed: sel.isCollapsed
        }];
      }
      return args;
    },
    outputSerializer: (methodName, result) => {
      if (methodName === 'convertDOMSelectionToModel' && result) {
        return {
          anchor: result.anchor ? `${result.anchor.nodeId}:${result.anchor.offset}` : 'null',
          head: result.head ? `${result.head.nodeId}:${result.head.offset}` : 'null',
          empty: result.empty
        };
      }
      return result;
    }
  },
  {
    package: '@barocss/editor-view-dom',
    className: 'InputHandlerImpl',
    methods: [
      'handleDelete',
      'handleC1',
      'handleC2',
      'handleC3',
      'handleTextContentChange',
      'handleDomMutations'
    ]
  },
  
  // DataStore
  {
    package: '@barocss/datastore',
    className: 'CoreOperations',
    methods: ['setNode', 'updateNode', 'deleteNode', 'createNodeWithChildren']
  },
  {
    package: '@barocss/datastore',
    className: 'RangeOperations',
    methods: ['replaceText', 'deleteText', 'insertText']
  },
  {
    package: '@barocss/datastore',
    className: 'MarkOperations',
    methods: ['setMarks', 'removeMark', 'updateMark', 'toggleMark']
  },
  
  // Model
  {
    package: '@barocss/model',
    className: 'TransactionManager',
    methods: ['execute'],
    outputSerializer: (methodName, result) => {
      if (methodName === 'execute' && result) {
        // TransactionResult의 selectionBefore/After를 간결하게 표시
        return {
          success: result.success,
          errors: result.errors,
          operationsCount: result.operations?.length || 0,
          selectionBefore: result.selectionBefore ? {
            startNodeId: result.selectionBefore.startNodeId,
            startOffset: result.selectionBefore.startOffset,
            endNodeId: result.selectionBefore.endNodeId,
            endOffset: result.selectionBefore.endOffset
          } : null,
          selectionAfter: result.selectionAfter ? {
            startNodeId: result.selectionAfter.startNodeId,
            startOffset: result.selectionAfter.startOffset,
            endNodeId: result.selectionAfter.endNodeId,
            endOffset: result.selectionAfter.endOffset
          } : null
        };
      }
      return result;
    }
  },
  
  // Renderer DOM
  {
    package: '@barocss/renderer-dom',
    className: 'DOMRenderer',
    methods: ['render'],
    inputSerializer: (methodName, args) => {
      if (methodName === 'render' && args[0]) {
        return [summarizeModelData(args[0]), args[1]];
      }
      return args;
    }
  },
  {
    package: '@barocss/renderer-dom',
    className: 'Reconciler',
    methods: ['reconcile'],
    inputSerializer: (methodName, args) => {
      if (methodName === 'reconcile' && args[1]) {
        // args[0] is container, args[1] is vnode
        return [args[0], summarizeVNode(args[1])]; 
      }
      return args;
    }
  },
  {
    package: '@barocss/renderer-dom',
    className: 'VNodeBuilder',
    methods: ['build']
  },
  // DOM Operations (Reconcile 세부 동작 확인용)
  {
    package: '@barocss/renderer-dom',
    className: 'DOMOperations',
    methods: ['updateAttributes', 'createElement', 'updateTextContent'],
    inputSerializer: (methodName, args) => {
      if (methodName === 'updateAttributes' && args[0]) {
        // args[0]: element, args[1]: prevAttrs, args[2]: nextAttrs
        const element = args[0];
        return [
          {
            nodeName: element.nodeName,
            sid: element.getAttribute?.('data-bc-sid') || '(no-sid)',
            className: element.className || '(no-class)'
          },
          args[1], // prevAttrs
          args[2]  // nextAttrs
        ];
      }
      if (methodName === 'updateTextContent' && args[0]) {
        // args[0]: textNode, args[1]: prevText, args[2]: nextText
        const textNode = args[0];
        const parent = textNode.parentElement;
        return [
          {
            nodeType: 'Text',
            parentSid: parent?.getAttribute?.('data-bc-sid') || '(no-parent-sid)',
            parentTag: parent?.nodeName || '(no-parent)'
          },
          args[1], // prevText
          args[2]  // nextText
        ];
      }
      return args;
    }
  }
];
