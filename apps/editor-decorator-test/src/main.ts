import { DataStore } from '@barocss/datastore';
import { Editor, createBasicExtensions } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createSchema } from '@barocss/schema';
import { define, element, slot, data, defineMark, getGlobalRegistry, defineDecorator, portal, text, attr } from '@barocss/dsl';

function bootstrap() {
  console.log('[editor-decorator-test] bootstrap:start');
  const container = document.getElementById('editor-container');
  if (!container) {
    throw new Error('Missing #editor-container');
  }

  // 스키마 생성 (데코레이터 포함)
  const schema = createSchema("decorator-test", {
    topNode: "document",
    nodes: {
      document: { name: "document", group: "document", content: "block+" },
      heading: { name: "heading", group: "block", content: "inline*", attrs: { level: { type: "number", required: true } } },
      paragraph: { name: "paragraph", group: "block", content: "inline*" },
      'inline-text': { name: 'inline-text', group: 'inline' },
      'portal-test': { name: 'portal-test', group: 'block', content: '' },
    },
    marks: {
      bold: { name: "bold", group: "text-style" },
      italic: { name: "italic", group: "text-style" },
      link: { name: "link", group: "text-style", attrs: { href: { type: "string", required: true } } },
      highlight: { name: "highlight", group: "text-style", attrs: { color: { type: "string", default: "#ffff00" } } },
    },
    decorators: {
      comment: {
        name: 'comment',
        category: 'layer',
        dataSchema: {
          content: { type: 'string', required: true },
          author: { type: 'string', required: true }
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
          reason: { type: 'string', required: false }
        },
        render: {
          position: 'overlay'
        }
      },
      linkDecorator: {
        name: 'linkDecorator',
        category: 'inline',
        dataSchema: {
          href: { type: 'string', required: true },
          title: { type: 'string', required: false }
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
          position: 'after'
        }
      }
    }
  });

  const dataStore = new DataStore(undefined, schema);
  const initialTree = {
    sid: 'doc-1',
    stype: 'document',
    content: [
      {
        sid: 'h-1',
        stype: 'heading',
        attributes: { level: 1 },
        content: [
          { sid: 'text-h1', stype: 'inline-text', text: 'BaroCSS 데코레이터 테스트' }
        ]
      },
      {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          { sid: 'text-1', stype: 'inline-text', text: '이 텍스트는 ' },
          { sid: 'text-bold', stype: 'inline-text', text: '굵은 글씨', marks: [{ type: 'bold', range: [0, 4] }] },
          { sid: 'text-2', stype: 'inline-text', text: '와 ' },
          { sid: 'text-italic', stype: 'inline-text', text: '이탤릭체', marks: [{ type: 'italic', range: [0, 4] }] },
          { sid: 'text-3', stype: 'inline-text', text: '를 포함합니다.' }
        ]
      },
      {
        sid: 'p-2',
        stype: 'paragraph',
        content: [
          { sid: 'text-4', stype: 'inline-text', text: '여기에 다양한 데코레이터를 추가할 수 있습니다.' }
        ]
      },
      {
        sid: 'p-3',
        stype: 'paragraph',
        content: [
          { sid: 'text-5', stype: 'inline-text', text: '링크와 ' },
          { sid: 'text-6', stype: 'inline-text', text: '강조 마크', marks: [{ type: 'bold', range: [0, 5] }, { type: 'highlight', range: [0, 5], attrs: { color: '#ffee58' } } as any] },
          { sid: 'text-7', stype: 'inline-text', text: ' 그리고 ' },
          { sid: 'text-8', stype: 'inline-text', text: '이탤릭', marks: [{ type: 'italic', range: [0, 3] }] },
          { sid: 'text-9', stype: 'inline-text', text: ' 예시입니다.' }
        ]
      },
      {
        sid: 'p-4',
        stype: 'paragraph',
        content: [
          { sid: 'text-10', stype: 'inline-text', text: '하이라이트와 댓글이 ' },
          { sid: 'text-11', stype: 'inline-text', text: '겹쳐지는 경우', marks: [{ type: 'bold', range: [0, 5] }] },
          { sid: 'text-12', stype: 'inline-text', text: '를 확인합니다.' }
        ]
      },
      {
        sid: 'p-5',
        stype: 'paragraph',
        content: [
          { sid: 'text-13', stype: 'inline-text', text: 'Pattern decorator 테스트: https://example.com 및 user@example.com 그리고 #ff0000 색상 코드' }
        ]
      },
      {
        sid: 'p-6',
        stype: 'paragraph',
        content: [
          { sid: 'text-14', stype: 'inline-text', text: 'Inline before/after 테스트: Hello World' }
        ]
      },
      {
        sid: 'portal-test-1',
        stype: 'portal-test',
        content: []
      }
    ]
  } as any;

  const editor = new Editor({ editable: true, schema, dataStore });
  editor.loadDocument(initialTree, 'decorator-test');
  
  // 디버깅: loadDocument 후 상태 확인
  const rootId = (editor as any).getRootId();
  const rootNode = dataStore.getRootNode();
  const proxyBeforeView = editor.getDocumentProxy?.();
  console.log('[main.ts] After loadDocument:', {
    rootId,
    rootNodeSid: rootNode?.sid,
    proxySid: proxyBeforeView?.sid,
    hasDataStore: !!editor.dataStore,
    hasSchema: !!schema,
    dataStoreRootNodeId: (dataStore as any).rootNodeId
  });
  
  const extensions = createBasicExtensions();
  extensions.forEach((ext) => editor.use(ext));

  // 노드 렌더러 정의
  define('document', element('div', {className: 'document'}, [slot('content')]));
  define('heading', element((model: { attributes: { level?: number } }) => `h${model.attributes.level || 1}`, { className: 'heading' }, [slot('content')]));
  define('paragraph', element('p', {className: 'paragraph'}, [slot('content')]));
  define('inline-text', element('span', { className: (d: any) => {
    const classes: any[] = ['text'];
    if (Array.isArray(d.marks)) {
      for (const m of d.marks) {
        if (m && m.type) classes.push(`mark-${m.type}`);
      }
    }
    return classes;
  } }, [data('text', '')]));

  // 마크 렌더러 정의
  defineMark('bold', element('span', { 
    className: 'custom-bold',
    'data-mark-type': 'bold',
    style: { 
      fontWeight: 'bold',
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('italic', element('span', { 
    className: 'custom-italic',
    'data-mark-type': 'italic',
    style: { 
      fontStyle: 'italic',
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));

  defineMark('link', element('a', { 
    className: 'custom-link',
    'data-mark-type': 'link',
    href: attr('href', '#'),
    title: attr('title', ''),
    target: '_blank',
    rel: 'noopener noreferrer',
    style: { 
      color: '#007bff',
      textDecoration: 'underline',
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));

  defineMark('highlight', element('span', { 
    className: 'custom-highlight',
    'data-mark-type': 'highlight',
    'data-highlight-color': attr('color', '#ffff00'),
    style: { 
      backgroundColor: attr('color', '#ffff00'),
      padding: '1px 2px',
      borderRadius: '2px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }
  }, [data('text')]));

  // Portal을 사용하는 컴포넌트 정의
  define('portal-test', (_props, ctx) => {
    ctx.initState('showTooltip', false);
    ctx.initState('showModal', false);
    
    return element('div', {
      style: {
        padding: '20px',
        border: '2px solid #ccc',
        borderRadius: '8px',
        margin: '10px 0'
      }
    }, [
      element('h3', {}, [text('Portal 테스트')]),
      element('button', {
        style: {
          margin: '5px',
          padding: '8px 16px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        },
        onMouseEnter: () => ctx.setState('showTooltip', true),
        onMouseLeave: () => ctx.setState('showTooltip', false)
      }, [text('Hover for Tooltip')]),
      
      element('button', {
        style: {
          margin: '5px',
          padding: '8px 16px',
          backgroundColor: '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        },
        onClick: () => ctx.toggleState('showModal')
      }, [text('Toggle Modal')]),
      
      // Portal Tooltip
      portal(document.body, element('div', {
        style: {
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          zIndex: 1000,
          opacity: ctx.getState('showTooltip') ? 1 : 0,
          transition: 'opacity 0.2s ease',
          pointerEvents: 'none'
        }
      }, [text('This is a tooltip!')])),
      
      // Portal Modal
      portal(document.body, element('div', {
        style: {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          border: '1px solid #ccc',
          borderRadius: '8px',
          padding: '20px',
          zIndex: 1001,
          opacity: ctx.getState('showModal') ? 1 : 0,
          transition: 'opacity 0.2s ease',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }
      }, [
        element('h3', { style: { margin: '0 0 10px 0' } }, [text('Modal Title')]),
        element('p', { style: { margin: '0 0 15px 0' } }, [text('This is a modal content!')]),
        element('button', {
          style: {
            padding: '8px 16px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          },
          onClick: () => ctx.setState('showModal', false)
        }, [text('Close')])
      ]))
    ]);
  });

  // 데코레이터 템플릿 정의
  // Comment 인디케이터 (항상 표시)
  defineDecorator('comment', element('div', {
    className: 'barocss-comment-indicator',
    style: {
      position: 'absolute',
      width: '18px',
      height: '18px',
      backgroundColor: 'rgba(33, 150, 243, 0.1)',
      borderRadius: '4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '11px',
      color: '#2196F3',
      zIndex: '1000',
      cursor: 'pointer',
      userSelect: 'none',
      pointerEvents: 'auto'
    },
    onMouseEnter: (e: MouseEvent) => {
      const commentId = (e.target as HTMLElement).closest('[data-decorator-sid]')?.getAttribute('data-decorator-sid');
      if (commentId && (window as any).showCommentTooltip) {
        (window as any).showCommentTooltip(e);
      }
    },
    onMouseLeave: (e: MouseEvent) => {
      const commentId = (e.target as HTMLElement).closest('[data-decorator-sid]')?.getAttribute('data-decorator-sid');
      if (commentId && (window as any).hideCommentTooltip) {
        (window as any).hideCommentTooltip(e);
      }
    },
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      const commentId = (e.target as HTMLElement).closest('[data-decorator-sid]')?.getAttribute('data-decorator-sid');
      if (commentId && (window as any).toggleCommentPopup) {
        (window as any).toggleCommentPopup(e);
      }
    }
  }, [text('💬')]));

  // Comment 툴팁 (hover 시)
  defineDecorator('comment-tooltip', element('div', {
    className: 'barocss-comment-tooltip',
    style: {
      position: 'absolute',
      backgroundColor: 'rgba(0,0,0,0.9)',
      color: 'white',
      padding: '8px 12px',
      borderRadius: '6px',
      fontSize: '12px',
      maxWidth: '250px',
      wordWrap: 'break-word',
      zIndex: '1001',
      pointerEvents: 'none',
      opacity: '0',
      transform: 'translateY(-5px)',
      transition: 'all 0.2s ease',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    }
  }, [
    element('div', { style: { 
      fontWeight: 'bold',
      marginBottom: '4px',
      fontSize: '11px',
      color: '#ccc'
    } }, [
      data('data.author', '작성자'),
      element('span', { style: { margin: '0 6px' } }, ['•']),
      data('data.timestamp', '시간')
    ]),
    element('div', { style: { 
      fontSize: '12px',
      lineHeight: '1.3'
    } }, [
      data('data.content', '댓글 내용')
    ])
  ]));

  // Comment 팝업 (클릭 시)
  defineDecorator('comment-popup', element('div', {
    className: 'barocss-comment-popup',
    style: {
      position: 'fixed',
      backgroundColor: 'white',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '16px',
      fontSize: '14px',
      maxWidth: '400px',
      maxHeight: '300px',
      wordWrap: 'break-word',
      zIndex: '1002',
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      opacity: '0',
      transform: 'scale(0.9)',
      transition: 'all 0.2s ease',
      overflow: 'auto'
    }
  }, [
    element('div', { style: { 
      display: 'flex', 
      alignItems: 'center', 
      marginBottom: '12px',
      paddingBottom: '8px',
      borderBottom: '1px solid #f0f0f0'
    } }, [
      element('span', { style: { 
        marginRight: '8px',
        fontSize: '16px'
      } }, ['💬']),
      element('div', { style: { flex: '1' } }, [
        element('div', { style: { 
          fontWeight: 'bold',
          fontSize: '13px',
          color: '#333'
        } }, [data('data.author', '작성자')]),
        element('div', { style: { 
          fontSize: '11px',
          color: '#666',
          marginTop: '2px'
        } }, [data('data.timestamp', '시간')])
      ])
    ]),
    element('div', { style: { 
      fontSize: '14px',
      lineHeight: '1.5',
      color: '#333'
    } }, [
      data('data.content', '댓글 내용')
    ])
  ]));

  defineDecorator('highlight', element('div', {
    className: 'barocss-overlay-decorator barocss-decorator-highlight',
    style: {
      position: 'absolute',
      backgroundColor: 'rgba(255, 235, 59, 0.3)',
      borderRadius: '2px',
      padding: '0',
      zIndex: '1000',
      pointerEvents: 'none',
      width: '100%',
      height: '100%',
      display: 'block'
    }
  }, ['\u00A0']));

  defineDecorator('linkDecorator', element('a', {
    className: 'barocss-inline-decorator barocss-decorator-link',
    contenteditable: 'false',
    href: attr('data.href', '#'),
    title: attr('data.title', ''),
    target: '_blank',
    rel: 'noopener noreferrer',
    style: {
      backgroundColor: 'transparent',
      color: '#0b66d0',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
      borderRadius: '3px',
      padding: '0 1px',
      margin: '0 1px',
      display: 'inline',
      cursor: 'pointer',
      fontSize: 'inherit'
    }
  }, [
    element('span', { style: { opacity: '0.75', marginRight: '2px' } }, ['🔗 ']),
    data('data.title', '')
  ]));

  defineDecorator('status', element('div', {
    className: (d: any) => `barocss-block-decorator barocss-decorator-status status-${(d?.data?.status || 'default').toString().toLowerCase()}`,
    contenteditable: 'false',
    style: {
      backgroundColor: '#f7fbf7',
      border: '1px solid #e0f0e0',
      borderRadius: '8px',
      padding: '10px 12px',
      margin: '10px 0',
      display: 'block',
      cursor: 'default',
      fontSize: '13px',
      lineHeight: '1.4',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      borderLeft: '4px solid #4caf50'
    }
  }, [
    element('div', { 
      style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }
    }, [
      element('span', { style: { opacity: '0.8' } }, ['📌']),
      element('strong', { style: { fontSize: '12px' } }, ['Status']),
      element('span', { style: { opacity: '0.5' } }, ['·']),
      data('data.status', 'unknown')
    ]),
    element('div', {
      style: { display: (d: any) => (typeof d?.data?.progress === 'number' ? 'block' : 'none'), marginTop: '2px' }
    }, [
      element('div', { style: { fontSize: '12px' } }, ['Progress: ', data('data.progress', 0) as any, '%'])
    ]),
    element('div', {
      style: { display: (d: any) => (d?.data?.assignee ? 'block' : 'none'), marginTop: '2px' }
    }, [
      element('div', { style: { fontSize: '12px' } }, ['Assignee: ', data('data.assignee', '') as any])
    ])
  ]));

  // Pattern decorator용 템플릿들
  defineDecorator('url-link', element('a', {
    className: 'pattern-url-link',
    href: attr('data.url', '#'),
    target: '_blank',
    rel: 'noopener noreferrer',
    style: {
      color: '#0066cc',
      textDecoration: 'underline',
      fontWeight: '500'
    }
  }, [slot('text')]));

  defineDecorator('email-link', element('a', {
    className: 'pattern-email-link',
    href: attr('data.email', '#'),
    style: {
      color: '#d63384',
      textDecoration: 'underline'
    }
  }, [slot('text')]));

  defineDecorator('color-chip', element('span', {
    className: 'pattern-color-chip',
    style: {
      display: 'inline-block',
      width: '16px',
      height: '16px',
      borderRadius: '3px',
      border: '1px solid #ccc',
      marginRight: '4px',
      verticalAlign: 'middle',
      backgroundColor: attr('data.color', '#000')
    }
  }, []));

  // Inline before/after 테스트용
  defineDecorator('chip', element('span', {
    className: 'chip',
    style: {
      display: 'inline-block',
      backgroundColor: '#e3f2fd',
      color: '#1976d2',
      padding: '2px 6px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: '500',
      margin: '0 2px'
    }
  }, [text('CHIP')]));

  const view = new EditorViewDOM(editor, { container, registry: getGlobalRegistry() });
  
  // 디버깅: render() 호출 전 상태 확인
  const proxyBeforeRender = editor.getDocumentProxy?.();
  console.log('[main.ts] Before view.render():', {
    rootId: (editor as any).getRootId(),
    proxySid: proxyBeforeRender?.sid,
    proxyIsNull: proxyBeforeRender === null,
    hasDataStore: !!editor.dataStore,
    dataStoreRootNodeId: (dataStore as any).rootNodeId
  });
  
  view.render();
  
  // 디버깅: render() 호출 후 상태 확인
  console.log('[main.ts] After view.render():', {
    contentLayerChildren: view.layers.content.children.length,
    hasLastRenderedModelData: !!(view as any)._lastRenderedModelData
  });

  // Comment 상호작용 관리
  class CommentManager {
    private tooltips = new Map<string, HTMLElement>();
    private popups = new Map<string, HTMLElement>();
    private activePopup: string | null = null;
    private commentData = new Map<string, any>();

    setCommentData(commentId: string, data: any) {
      this.commentData.set(commentId, data);
    }

    getCommentData(commentId: string) {
      return this.commentData.get(commentId);
    }

    showTooltip(commentId: string, event: MouseEvent) {
      const indicator = event.target as HTMLElement;
      const rect = indicator.getBoundingClientRect();
      
      // 툴팁 생성 또는 업데이트
      let tooltip = this.tooltips.get(commentId);
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'barocss-comment-tooltip';
        tooltip.style.position = 'fixed';
        tooltip.style.backgroundColor = 'rgba(0,0,0,0.9)';
        tooltip.style.color = 'white';
        tooltip.style.padding = '8px 12px';
        tooltip.style.borderRadius = '6px';
        tooltip.style.fontSize = '12px';
        tooltip.style.maxWidth = '250px';
        tooltip.style.wordWrap = 'break-word';
        tooltip.style.zIndex = '1001';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        tooltip.style.transition = 'all 0.2s ease';
        document.body.appendChild(tooltip);
        this.tooltips.set(commentId, tooltip);
      }

      // comment 데이터 가져오기 (실제로는 dataStore에서 가져와야 함)
      const commentData = this.getCommentData(commentId);
      if (commentData) {
        tooltip.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 4px; font-size: 11px; color: #ccc;">
            ${commentData.author} • ${commentData.timestamp}
          </div>
          <div style="font-size: 12px; line-height: 1.3;">
            ${commentData.content.substring(0, 100)}${commentData.content.length > 100 ? '...' : ''}
          </div>
        `;
      }

      // 위치 설정
      tooltip.style.left = `${rect.right + 8}px`;
      tooltip.style.top = `${rect.top - 8}px`;
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateY(0)';
    }

    hideTooltip(commentId: string) {
      const tooltip = this.tooltips.get(commentId);
      if (tooltip) {
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translateY(-5px)';
      }
    }

    togglePopup(commentId: string, event: MouseEvent) {
      // 기존 팝업 닫기
      if (this.activePopup && this.activePopup !== commentId) {
        this.closePopup(this.activePopup);
      }

      if (this.activePopup === commentId) {
        this.closePopup(commentId);
        return;
      }

      const indicator = event.target as HTMLElement;
      const rect = indicator.getBoundingClientRect();
      
      // 팝업 생성 또는 업데이트
      let popup = this.popups.get(commentId);
      if (!popup) {
        popup = document.createElement('div');
        popup.className = 'barocss-comment-popup';
        popup.style.position = 'fixed';
        popup.style.backgroundColor = 'white';
        popup.style.border = '1px solid #e0e0e0';
        popup.style.borderRadius = '8px';
        popup.style.padding = '16px';
        popup.style.fontSize = '14px';
        popup.style.maxWidth = '400px';
        popup.style.maxHeight = '300px';
        popup.style.wordWrap = 'break-word';
        popup.style.zIndex = '1002';
        popup.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
        popup.style.transition = 'all 0.2s ease';
        popup.style.overflow = 'auto';
        document.body.appendChild(popup);
        this.popups.set(commentId, popup);
      }

      // comment 데이터 표시
      const commentData = this.getCommentData(commentId);
      if (commentData) {
        popup.innerHTML = `
          <div style="display: flex; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0;">
            <span style="margin-right: 8px; font-size: 16px;">💬</span>
            <div style="flex: 1;">
              <div style="font-weight: bold; font-size: 13px; color: #333;">${commentData.author}</div>
              <div style="font-size: 11px; color: #666; margin-top: 2px;">${commentData.timestamp}</div>
            </div>
          </div>
          <div style="font-size: 14px; line-height: 1.5; color: #333;">${commentData.content}</div>
        `;
      }

      // 위치 설정 (화면 중앙 또는 인디케이터 근처)
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      popup.style.left = `${centerX - 200}px`;
      popup.style.top = `${centerY - 150}px`;
      popup.style.opacity = '1';
      popup.style.transform = 'scale(1)';
      
      this.activePopup = commentId;

      // 외부 클릭으로 닫기
      const closeOnOutsideClick = (e: MouseEvent) => {
        if (!popup?.contains(e.target as Node)) {
          this.closePopup(commentId);
          document.removeEventListener('click', closeOnOutsideClick);
        }
      };
      setTimeout(() => document.addEventListener('click', closeOnOutsideClick), 0);
    }

    closePopup(commentId: string) {
      const popup = this.popups.get(commentId);
      if (popup) {
        popup.style.opacity = '0';
        popup.style.transform = 'scale(0.9)';
        setTimeout(() => {
          if (popup.parentNode) {
            popup.parentNode.removeChild(popup);
          }
          this.popups.delete(commentId);
        }, 200);
      }
      if (this.activePopup === commentId) {
        this.activePopup = null;
      }
    }
  }

  const commentManager = new CommentManager();

  // 전역 이벤트 핸들러 등록
  (window as any).showCommentTooltip = (event: MouseEvent) => {
    const commentId = (event.target as HTMLElement).closest('[data-decorator-sid]')?.getAttribute('data-decorator-sid');
    if (commentId) commentManager.showTooltip(commentId, event);
  };

  (window as any).hideCommentTooltip = (event: MouseEvent) => {
    const commentId = (event.target as HTMLElement).closest('[data-decorator-sid]')?.getAttribute('data-decorator-sid');
    if (commentId) commentManager.hideTooltip(commentId);
  };

  (window as any).toggleCommentPopup = (event: MouseEvent) => {
    event.stopPropagation();
    const commentId = (event.target as HTMLElement).closest('[data-decorator-sid]')?.getAttribute('data-decorator-sid');
    if (commentId) commentManager.togglePopup(commentId, event);
  };

  // 데코레이터 추가
  const addDecorators = async () => {
    // 1. Target decorators (기존 방식)
    const targetDecorators = [
      {
        sid: 'comment-1',
        stype: 'comment',
        category: 'layer' as const,
        target: { sid: 'p-1' },
        position: 'after' as const,
        data: { 
          content: '이 문단에 대한 전체 댓글입니다. 이 부분은 정말 중요한 내용이므로 모든 팀원들이 검토해야 합니다.', 
          author: 'user1',
          timestamp: '2024-01-15 14:30:00',
          margin: 4
        }
      },
      {
        sid: 'highlight-1',
        stype: 'highlight',
        category: 'layer' as const,
        target: { sid: 'text-bold', startOffset: 0, endOffset: 4 },
        data: { color: 'yellow', reason: '중요한 부분' }
      },
      {
        sid: 'link-1',
        stype: 'linkDecorator',
        category: 'inline' as const,
        target: { sid: 'text-italic', startOffset: 0, endOffset: 4 },
        data: { href: 'https://example.com', title: '예시 링크' }
      },
      {
        sid: 'status-1',
        stype: 'status',
        category: 'block' as const,
        target: { sid: 'p-1' },
        data: { status: 'review', progress: 50, assignee: 'user2' }
      },
      {
        sid: 'highlight-2',
        stype: 'highlight',
        category: 'layer' as const,
        target: { sid: 'text-6', startOffset: 0, endOffset: 5 },
        data: { color: '#ffee58', reason: '강조 마크와 중첩' }
      },
      {
        sid: 'comment-2',
        stype: 'comment',
        category: 'layer' as const,
        target: { sid: 'p-3' },
        position: 'after' as const,
        data: { 
          content: '링크/마크 조합 확인 바랍니다.', 
          author: 'reviewer',
          timestamp: '2024-01-15 16:20:00',
          margin: 4
        }
      },
      {
        sid: 'link-2',
        stype: 'linkDecorator',
        category: 'inline' as const,
        target: { sid: 'text-5', startOffset: 0, endOffset: 2 },
        data: { href: 'https://barocss.dev', title: 'BaroCSS' }
      },
      {
        sid: 'status-2',
        stype: 'status',
        category: 'block' as const,
        target: { sid: 'p-3' },
        data: { status: 'in-progress', progress: 70, assignee: 'alice' }
      },
      {
        sid: 'highlight-3',
        stype: 'highlight',
        category: 'layer' as const,
        target: { sid: 'text-11', startOffset: 0, endOffset: 5 },
        data: { color: 'orange', reason: '겹침 테스트' }
      },
      {
        sid: 'comment-3',
        stype: 'comment',
        category: 'layer' as const,
        target: { sid: 'text-11', startOffset: 0, endOffset: 5 },
        position: 'after' as const,
        data: { content: '겹침에서도 잘 보이는지?', author: 'user2', timestamp: '2024-01-15 17:00:00', margin: 4 }
      }
    ];
    
    // 2. Pattern decorators (URL, Email, Color)
    const patternDecorators = [
      {
        sid: 'url-pattern',
        stype: 'url-link',
        category: 'inline' as const,
        decoratorType: 'pattern' as const,
        data: {
          pattern: /https?:\/\/[^\s]+/g,
          extractData: (match: RegExpMatchArray) => ({ url: match[0] }),
          createDecorator: (nodeId: string, start: number, end: number, data: any) => ({
            sid: `pattern-url-${nodeId}-${start}-${end}`,
            target: { sid: nodeId, startOffset: start, endOffset: end },
            data: { url: data.url }
          }),
          priority: 10
        }
      },
      {
        sid: 'email-pattern',
        stype: 'email-link',
        category: 'inline' as const,
        decoratorType: 'pattern' as const,
        data: {
          pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
          extractData: (match: RegExpMatchArray) => ({ email: match[0] }),
          createDecorator: (nodeId: string, start: number, end: number, data: any) => ({
            sid: `pattern-email-${nodeId}-${start}-${end}`,
            target: { sid: nodeId, startOffset: start, endOffset: end },
            data: { email: data.email }
          }),
          priority: 20
        }
      },
      {
        sid: 'color-pattern',
        stype: 'color-chip',
        category: 'inline' as const,
        decoratorType: 'pattern' as const,
        data: {
          pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,
          extractData: (match: RegExpMatchArray) => ({ color: match[0] }),
          createDecorator: (nodeId: string, start: number, end: number, data: any) => ({
            sid: `pattern-color-${nodeId}-${start}-${end}`,
            target: { sid: nodeId, startOffset: start, endOffset: end },
            data: { color: data.color },
            position: 'before' // 색상 코드 앞에 칩 표시
          }),
          priority: 30
        }
      }
    ];

    // 3. Custom decorator generator
    const customGenerator = {
      sid: 'ai-status-generator',
      generate: (model: any, text: string | null): any[] => {
        const decorators: any[] = [];
        // "테스트"라는 단어가 있으면 AI 상태 표시
        if (text && text.includes('테스트')) {
          const index = text.indexOf('테스트');
          decorators.push({
            sid: `ai-status-${model.sid}`,
            stype: 'chip',
            category: 'inline',
            target: {
              sid: model.sid,
              startOffset: index,
              endOffset: index + 3
            },
            data: {
              status: 'processing',
              message: 'AI is analyzing...'
            },
            position: 'after' // 텍스트 뒤에 표시
          });
        }
        return decorators;
      }
    };

    // 4. Inline before/after 테스트용 decorator
    // text-14 실제 문자열에서 오프셋 계산
    const findNodeBySid = (node: any, sid: string): any | null => {
      if (!node) return null;
      if (node.sid === sid) return node;
      const children = node.content || node.children || [];
      for (const ch of children) {
        const found = findNodeBySid(ch, sid);
        if (found) return found;
      }
      return null;
    };
    const t14Node = findNodeBySid(initialTree, 'text-14');
    const t14Text: string = (t14Node && typeof t14Node.text === 'string') ? t14Node.text : '';
    const helloStart = t14Text.indexOf('Hello');
    const worldStart = t14Text.indexOf('World');
    const inlinePositionDecorators = [
      ...(helloStart >= 0 ? [{
        sid: 'chip-before',
        stype: 'chip',
        category: 'inline' as const,
        target: { sid: 'text-14', startOffset: helloStart, endOffset: helloStart + 'Hello'.length },
        data: {},
        position: 'before' as const
      }] as const : []),
      ...(worldStart >= 0 ? [{
        sid: 'chip-after',
        stype: 'chip',
        category: 'inline' as const,
        target: { sid: 'text-14', startOffset: worldStart, endOffset: worldStart + 'World'.length },
        data: {},
        position: 'after' as const
      }] as const : [])
    ];
    
    // Target decorators 추가
    for (const decorator of targetDecorators) {
      try {
        if (decorator.stype === 'comment') {
          commentManager.setCommentData(decorator.sid, decorator.data);
        }
        view.addDecorator(decorator);
        console.log(`[editor-decorator-test] Added target decorator: ${decorator.sid}`);
      } catch (error) {
        console.error(`[editor-decorator-test] Failed to add decorator ${decorator.sid}:`, error);
      }
    }

    // Pattern decorators 추가
    for (const decorator of patternDecorators) {
      try {
        view.addDecorator(decorator);
        console.log(`[editor-decorator-test] Added pattern decorator: ${decorator.sid}`);
      } catch (error) {
        console.error(`[editor-decorator-test] Failed to add pattern decorator ${decorator.sid}:`, error);
      }
    }

    // Custom generator 추가
    try {
      view.addDecorator(customGenerator);
      console.log(`[editor-decorator-test] Added custom generator: ${customGenerator.sid}`);
    } catch (error) {
      console.error(`[editor-decorator-test] Failed to add custom generator:`, error);
    }

    // Inline before/after decorators 추가
    for (const decorator of inlinePositionDecorators) {
      try {
        view.addDecorator(decorator);
        console.log(`[editor-decorator-test] Added inline position decorator: ${decorator.sid}`);
      } catch (error) {
        console.error(`[editor-decorator-test] Failed to add inline position decorator ${decorator.sid}:`, error);
      }
    }
  };

  // 데코레이터 추가 (자동 실행)
  addDecorators().then(() => {
    console.log('[editor-decorator-test] All decorators added');
    // render()는 addDecorator() 내부에서 자동 호출됨
  }).catch(console.error);

  // 디버깅을 위해 에디터 인스턴스를 전역에 노출
  (window as any).editor = editor;
  (window as any).editorView = view;
  (window as any).dataStore = dataStore;
  (window as any).addDecorators = addDecorators; // 수동으로도 호출 가능

  console.log('[editor-decorator-test] bootstrap:done');
}

bootstrap();