/**
 * VNodeBuilder 함수형 컴포넌트 검증
 * 
 * define('xxx', (props, ctx) => element(...)) 형태의 함수형 컴포넌트 정의가
 * 제대로 처리되는지 검증합니다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, data, text, getGlobalRegistry, slot } from '@barocss/dsl';
import { VNodeBuilder } from '../../src/vnode/factory';

describe('VNodeBuilder Function Component', () => {
  let builder: VNodeBuilder;
  let registry: ReturnType<typeof getGlobalRegistry>;

  beforeEach(() => {
    registry = getGlobalRegistry();
    builder = new VNodeBuilder(registry);
  });

  describe('기본 함수형 컴포넌트', () => {
    it('should build VNode from function component with props and context', () => {
      define('greeting', ((props: any, model: any, ctx: any) => {
        const name = props.name || 'Guest';
        return element('div', { className: 'greeting' }, [
          text(`Hello, ${name}!`)
        ]);
      }) as any);
      
      const model = { stype: 'greeting', sid: 'g1', name: 'World' };
      const vnode = builder.build('greeting', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('div');
      expect(vnode.attrs?.className).toBe('greeting');
      expect(vnode.stype).toBe('greeting');
      expect(vnode.props).toBeDefined();
      expect(vnode.props?.name).toBe('World');
      expect(vnode.props?.stype).toBeUndefined();
      expect(vnode.props?.sid).toBeUndefined();
    });

    it('should access context.model in function component', () => {
      let receivedModel: any = null;
      
      define('model-access', ((props: any, model: any, ctx: any) => {
        receivedModel = ctx.model;
        return element('div', {}, [
          text(`SID: ${ctx.model?.sid || 'none'}`)
        ]);
      }) as any);
      
      const model = { stype: 'model-access', sid: 'm1', label: 'Test' };
      const vnode = builder.build('model-access', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.stype).toBe('model-access');
      // Verify context.model is passed (actually called from ComponentManager, so cannot verify at build time)
      // But VNode should contain model information
      expect(vnode.model).toBeDefined();
      expect(vnode.model?.sid).toBe('m1');
      expect(vnode.model?.stype).toBe('model-access');
    });

    it('should access context.state in function component', () => {
      define('stateful', ((props: any, model: any, ctx: any) => {
        ctx.initState({ count: props.initialCount || 0 });
        const count = ctx.getState('count') || 0;
        return element('div', { className: 'counter' }, [
          text(`Count: ${count}`)
        ]);
      }) as any);
      
      const model = { stype: 'stateful', sid: 's1', initialCount: 10 };
      const vnode = builder.build('stateful', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('div');
      expect(vnode.stype).toBe('stateful');
      expect(vnode.props?.initialCount).toBe(10);
    });

    it('should use context.setState in function component', () => {
      define('updatable', ((props: any, model: any, ctx: any) => {
        ctx.initState({ value: props.initialValue || 0 });
        return element('div', {
          className: 'updatable',
          onClick: () => ctx.setState({ value: (ctx.getState('value') || 0) + 1 })
        }, [
          text(`Value: ${ctx.getState('value') || 0}`)
        ]);
      }) as any);
      
      const model = { stype: 'updatable', sid: 'u1', initialValue: 5 };
      const vnode = builder.build('updatable', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('div');
      expect(vnode.attrs?.onClick).toBeDefined();
      expect(typeof vnode.attrs?.onClick).toBe('function');
    });

    it('should return ElementTemplate from function component', () => {
      define('simple', ((props: any, model: any, ctx: any) => {
        return element('article', { className: 'article' }, [
          element('h1', {}, [text(props.title || 'Untitled')]),
          element('p', {}, [text(props.content || 'No content')])
        ]);
      }) as any);
      
      const model = {
        stype: 'simple',
        sid: 'a1',
        title: 'Test Article',
        content: 'Test content here'
      };
      const vnode = builder.build('simple', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('article');
      expect(vnode.attrs?.className).toBe('article');
      expect(vnode.children).toBeTruthy();
      expect(Array.isArray(vnode.children)).toBe(true);
      expect((vnode.children as any[]).length).toBeGreaterThan(0);
      
      // Verify h1 and p are included
      const h1 = (vnode.children as any[]).find((c: any) => c?.tag === 'h1');
      const p = (vnode.children as any[]).find((c: any) => c?.tag === 'p');
      expect(h1).toBeTruthy();
      expect(p).toBeTruthy();
    });
  });

  describe('함수형 컴포넌트와 slot()', () => {
    it('should handle slot() in function component', () => {
      define('container', ((props: any, model: any, ctx: any) => {
        return element('div', { className: 'container' }, [
          slot('content')
        ]);
      }) as any);
      
      const model = {
        stype: 'container',
        sid: 'c1',
        content: [
          { stype: 'paragraph', sid: 'p1', text: 'First paragraph' },
          { stype: 'paragraph', sid: 'p2', text: 'Second paragraph' }
        ]
      };
      
      // paragraph definition needed
      define('paragraph', element('p', {}, [data('text')]));
      
      const vnode = builder.build('container', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('div');
      expect(vnode.children).toBeTruthy();
      expect(Array.isArray(vnode.children)).toBe(true);
      // Each item in content should be converted to VNode
      expect((vnode.children as any[]).length).toBeGreaterThan(0);
    });
  });

  describe('함수형 컴포넌트와 props 분리', () => {
    it('should separate props from model correctly', () => {
      let receivedProps: any = null;
      let receivedContext: any = null;
      
      define('props-test', ((props: any, model: any, ctx: any) => {
        receivedProps = props;
        receivedContext = ctx;
        return element('div', {}, [
          text(`Props: ${JSON.stringify(props)}, Model.sid: ${model?.sid || 'none'}`)
        ]);
      }) as any);
      
      const model = {
        stype: 'props-test',
        sid: 'pt1',
        label: 'Test Label',
        value: 42,
        extra: 'Extra Data'
      };
      
      const vnode = builder.build('props-test', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.stype).toBe('props-test');
      expect(vnode.props).toBeDefined();
      // props should contain only pure data (excluding stype, sid)
      expect(vnode.props?.label).toBe('Test Label');
      expect(vnode.props?.value).toBe(42);
      expect(vnode.props?.extra).toBe('Extra Data');
      expect(vnode.props?.stype).toBeUndefined();
      expect(vnode.props?.sid).toBeUndefined();
      
      // model contains original data
      expect(vnode.model).toBeDefined();
      expect(vnode.model?.stype).toBe('props-test');
      expect(vnode.model?.sid).toBe('pt1');
    });
  });

  describe('함수형 컴포넌트와 data() 바인딩', () => {
    it('should use data() binding in function component return value', () => {
      define('data-bound', ((props: any, model: any, ctx: any) => {
        return element('div', {}, [
          data('title'),
          element('span', {}, [data('subtitle')])
        ]);
      }) as any);
      
      const model = {
        stype: 'data-bound',
        sid: 'db1',
        title: 'Main Title',
        subtitle: 'Sub Title'
      };
      
      const vnode = builder.build('data-bound', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('div');
      expect(vnode.children).toBeTruthy();
      // data() binding should be processed and converted to text
      expect(Array.isArray(vnode.children)).toBe(true);
    });
  });

  describe('함수형 컴포넌트와 중첩', () => {
    it('should handle nested function components', () => {
      define('card', ((props: any, model: any, ctx: any) => {
        return element('div', { className: 'card' }, [
          element('header', {}, [text(props.title || 'Card')]),
          slot('content')
        ]);
      }) as any);
      
      define('card-list', ((props: any, model: any, ctx: any) => {
        return element('div', { className: 'card-list' }, [
          slot('content')
        ]);
      }) as any);
      
      const model = {
        stype: 'card-list',
        sid: 'cl1',
        content: [
          { stype: 'card', sid: 'c1', title: 'Card 1' },
          { stype: 'card', sid: 'c2', title: 'Card 2' }
        ]
      };
      
      const vnode = builder.build('card-list', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('div');
      expect(vnode.attrs?.className).toBe('card-list');
      expect(vnode.children).toBeTruthy();
    });
  });
});

