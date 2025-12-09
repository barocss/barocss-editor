/**
 * VNodeBuilder Portal 처리 검증
 * 
 * Portal은 다른 DOM target에 렌더링하기 위한 메커니즘입니다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { define, element, data, portal, getGlobalRegistry, slot } from '@barocss/dsl';
import { VNodeBuilder } from '../../src/vnode/factory';
import { isPortal } from '../../src/vnode/utils/vnode-guards';

describe('VNodeBuilder Portal Handling', () => {
  let builder: VNodeBuilder;
  let registry: ReturnType<typeof getGlobalRegistry>;
  let portalTarget: HTMLElement;

  beforeEach(() => {
    registry = getGlobalRegistry();
    builder = new VNodeBuilder(registry);
    
    // Create DOM element for Portal testing
    portalTarget = document.createElement('div');
    portalTarget.id = 'portal-target';
    document.body.appendChild(portalTarget);
  });

  afterEach(() => {
    // Cleanup
    if (portalTarget && portalTarget.parentNode) {
      portalTarget.parentNode.removeChild(portalTarget);
    }
  });

  describe('Basic portal creation', () => {
    it('should build portal VNode with HTMLElement target', () => {
      define('container', element('div', {}, [
        portal(portalTarget, element('div', { className: 'portal-content' }, [data('text')]))
      ]));
      
      const model = { stype: 'container', sid: 'c1', text: 'Portal content' };
      const vnode = builder.build('container', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.children).toBeTruthy();
      expect(vnode.children.length).toBeGreaterThan(0);
      
      const portalVNode = (vnode.children as any[]).find((child: any) => child.tag === 'portal');
      expect(portalVNode).toBeTruthy();
      expect(isPortal(portalVNode)).toBe(true);
      expect(portalVNode.portal).toBeTruthy();
      expect(portalVNode.portal.target).toBe(portalTarget);
      expect(portalVNode.portal.template).toBeTruthy();
    });

    it('should build portal VNode with selector string target', () => {
      define('container', element('div', {}, [
        portal('#portal-target', element('div', { className: 'portal-content' }, [data('text')]))
      ]));
      
      const model = { stype: 'container', sid: 'c1', text: 'Portal content' };
      const vnode = builder.build('container', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.children).toBeTruthy();
      
      const portalVNode = (vnode.children as any[]).find((child: any) => child.tag === 'portal');
      expect(portalVNode).toBeTruthy();
      expect(isPortal(portalVNode)).toBe(true);
      expect(portalVNode.portal.target).toBe(portalTarget);
    });

    it('should build portal VNode with body target', () => {
      define('container', element('div', {}, [
        portal('body', element('div', { className: 'portal-content' }, [data('text')]))
      ]));
      
      const model = { stype: 'container', sid: 'c1', text: 'Portal content' };
      const vnode = builder.build('container', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.children).toBeTruthy();
      
      const portalVNode = (vnode.children as any[]).find((child: any) => child.tag === 'portal');
      expect(portalVNode).toBeTruthy();
      expect(isPortal(portalVNode)).toBe(true);
      expect(portalVNode.portal.target).toBe(document.body);
    });

    it('should build portal VNode with function target', () => {
      define('container', element('div', {}, [
        portal(
          (data: any) => document.getElementById('portal-target'),
          element('div', { className: 'portal-content' }, [data('text')])
        )
      ]));
      
      const model = { stype: 'container', sid: 'c1', text: 'Portal content' };
      const vnode = builder.build('container', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.children).toBeTruthy();
      
      const portalVNode = (vnode.children as any[]).find((child: any) => child.tag === 'portal');
      expect(portalVNode).toBeTruthy();
      expect(isPortal(portalVNode)).toBe(true);
      expect(portalVNode.portal.target).toBe(portalTarget);
    });

    it('should build portal VNode with custom portalId', () => {
      define('container', element('div', {}, [
        portal(
          portalTarget,
          element('div', { className: 'portal-content' }, [data('text')]),
          'custom-portal-id'
        )
      ]));
      
      const model = { stype: 'container', sid: 'c1', text: 'Portal content' };
      const vnode = builder.build('container', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.children).toBeTruthy();
      
      const portalVNode = (vnode.children as any[]).find((child: any) => child.tag === 'portal');
      expect(portalVNode).toBeTruthy();
      expect(portalVNode.portal.portalId).toBe('custom-portal-id');
    });
  });

  describe('Portal content building', () => {
    it('should build portal content VNode from element template', () => {
      define('container', element('div', {}, [
        portal(portalTarget, element('div', { className: 'portal-content' }, [data('text')]))
      ]));
      
      const model = { stype: 'container', sid: 'c1', text: 'Portal content' };
      const vnode = builder.build('container', model);
      
      const portalVNode = (vnode.children as any[]).find((child: any) => child.tag === 'portal');
      expect(portalVNode).toBeTruthy();
      expect(portalVNode.children).toBeTruthy();
      expect(portalVNode.children.length).toBeGreaterThan(0);
      
      const contentVNode = portalVNode.children[0] as any;
      expect(contentVNode.tag).toBe('div');
      expect(contentVNode.attrs?.className).toBe('portal-content');
    });

    it('should build portal content with component template', () => {
      define('portalContent', element('div', { className: 'portal-content' }, [data('text')]));
      define('container', element('div', {}, [
        portal(portalTarget, {
          type: 'component',
          name: 'portalContent',
          props: {}
        } as any)
      ]));
      
      const model = { stype: 'container', sid: 'c1', text: 'Portal content' };
      const vnode = builder.build('container', model);
      
      const portalVNode = (vnode.children as any[]).find((child: any) => child.tag === 'portal');
      expect(portalVNode).toBeTruthy();
      expect(portalVNode.children).toBeTruthy();
    });
  });

  describe('Portal error handling', () => {
    it('should return null for invalid selector', () => {
      define('container', element('div', {}, [
        portal('#non-existent-element', element('div', {}, [data('text')]))
      ]));
      
      const model = { stype: 'container', sid: 'c1', text: 'Portal content' };
      const vnode = builder.build('container', model);
      
      expect(vnode).toBeTruthy();
      // Invalid target returns null, so portal VNode is not created
      const portalVNode = (vnode.children as any[]).find((child: any) => child.tag === 'portal');
      expect(portalVNode).toBeFalsy();
    });

    it('should return null for null target', () => {
      define('container', element('div', {}, [
        portal(null as any, element('div', {}, [data('text')]))
      ]));
      
      const model = { stype: 'container', sid: 'c1', text: 'Portal content' };
      const vnode = builder.build('container', model);
      
      expect(vnode).toBeTruthy();
      const portalVNode = (vnode.children as any[]).find((child: any) => child.tag === 'portal');
      expect(portalVNode).toBeFalsy();
    });

    it('should handle function target returning null', () => {
      define('container', element('div', {}, [
        portal(
          () => null,
          element('div', {}, [data('text')])
        )
      ]));
      
      const model = { stype: 'container', sid: 'c1', text: 'Portal content' };
      const vnode = builder.build('container', model);
      
      expect(vnode).toBeTruthy();
      const portalVNode = (vnode.children as any[]).find((child: any) => child.tag === 'portal');
      expect(portalVNode).toBeFalsy();
    });
  });

  describe('Portal with nested structures', () => {
    it('should handle portal with slot content', () => {
      define('portalContent', element('div', { className: 'portal-content' }, [slot('content')]));
      define('container', element('div', {}, [
        portal(portalTarget, {
          type: 'component',
          name: 'portalContent',
          props: {}
        } as any)
      ]));
      
      const model = {
        stype: 'container',
        sid: 'c1',
        content: [{
          stype: 'text',
          sid: 't1',
          text: 'Nested content'
        }]
      };
      
      const vnode = builder.build('container', model);
      
      const portalVNode = (vnode.children as any[]).find((child: any) => child.tag === 'portal');
      expect(portalVNode).toBeTruthy();
    });

    it('should handle multiple portals in same container', () => {
      const target1 = document.createElement('div');
      target1.id = 'portal-target-1';
      document.body.appendChild(target1);
      
      const target2 = document.createElement('div');
      target2.id = 'portal-target-2';
      document.body.appendChild(target2);
      
      define('container', element('div', {}, [
        portal(target1, element('div', {}, [data('text')]), 'portal-1'),
        portal(target2, element('div', {}, [data('text')]), 'portal-2')
      ]));
      
      const model = { stype: 'container', sid: 'c1', text: 'Content' };
      const vnode = builder.build('container', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.children).toBeTruthy();
      
      const portalVNodes = (vnode.children as any[]).filter((child: any) => child.tag === 'portal');
      expect(portalVNodes.length).toBe(2);
      expect(portalVNodes[0].portal.portalId).toBe('portal-1');
      expect(portalVNodes[1].portal.portalId).toBe('portal-2');
      
      // Cleanup
      if (target1.parentNode) target1.parentNode.removeChild(target1);
      if (target2.parentNode) target2.parentNode.removeChild(target2);
    });
  });
});

