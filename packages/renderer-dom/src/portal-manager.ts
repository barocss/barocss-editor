/**
 * Portal Manager: Portal rendering and management utilities
 * - Process portal VNodes
 * - Create portal containers and placeholders
 * - Handle portal updates and cleanup
 */
import { VNode, VNodeTag } from './vnode/types';
import { isPortal } from './vnode/utils/vnode-guards';
import { 
  setAttributeWithNamespace, 
  shouldSkipAttribute
} from './namespace-utils';
import { ReconcileContext } from './types';
import { DOMWorkInProgress } from './work-in-progress';

export class PortalManager {
  // Internal mapping: persist portal identity without touching DOM
  private vnodeToPortalId: WeakMap<VNode, string> = new WeakMap();
  private portalRegistry: Map<string, { target: HTMLElement; container: HTMLElement; host: HTMLElement }> = new Map();
  private targetToPortalId: WeakMap<HTMLElement, string> = new WeakMap();

  /**
   * Process portal node
   */
  public processPortalNode(wip: DOMWorkInProgress, context: ReconcileContext): void {
    const { vnode } = wip;
    
    
    
    // Check if this is a portal VNode (don't use isPortal strict check for missing targets)
    if (vnode.tag !== VNodeTag.PORTAL) {
      
      return;
    }

    // Create portal placeholder (kept minimal and internal)
    this.createPortalPlaceholder(wip, context);
    
    // Insert or update portal content using internal ID/registry
    this.insertPortal(vnode, context, wip);
    
  }

  /**
   * Create portal placeholder
   */
  public createPortalPlaceholder(wip: DOMWorkInProgress, context: ReconcileContext): void {
    // Minimal placeholder to keep DOM pipeline stable; no public attributes
    const placeholder = document.createElement('div');
    placeholder.style.display = 'none';
    
    wip.domNode = placeholder;
    this.insertDOMNode(placeholder, wip, this.currentContainer || undefined);
  }

  /**
   * Insert portal content
   */
  public insertPortal(vnode: VNode, context: ReconcileContext, wip: DOMWorkInProgress): void {
    const portalId = this.getOrAssignPortalId(vnode, wip.previousVNode || undefined);
    
    // Get target element - use portal.target first, then attrs.target (fallback for compatibility)
    const rawTarget = (vnode.portal?.target || vnode.attrs?.target);
    const template = vnode.portal?.template || vnode.attrs?.template;
    
    // Convert string selector to HTMLElement, or use rawTarget if it's already an HTMLElement
    let target: HTMLElement | null = null;
    if (rawTarget instanceof HTMLElement) {
      target = rawTarget;
    } else if (typeof rawTarget === 'string') {
      // Try to find element by selector or id/sid
      if (rawTarget === 'body') {
        target = document.body;
      } else {
        // Support #id, and fallback to [sid] or [data-bc-sid]
        const sel = String(rawTarget);
        if (sel.startsWith('#')) {
          const idToken = sel.slice(1);
          target = (document.getElementById(idToken) as HTMLElement) || (document.querySelector(sel) as HTMLElement);
          if (!target) {
            // Final fallback: scan for element with JS property 'sid' matching idToken
            const all = document.querySelectorAll('*');
            for (const el of Array.from(all)) {
              if ((el as any).sid && String((el as any).sid) === idToken) {
                target = el as HTMLElement;
                // Ensure it's addressable by CSS #id queries used in tests
                if (!(target as HTMLElement).id) {
                  (target as HTMLElement).id = idToken;
                }
                break;
              }
            }
          }
        } else {
          target = document.querySelector(sel) as HTMLElement;
        }
      }
    }
    
    
    
    if (!target) {
      const providedTarget = typeof rawTarget !== 'undefined' ? rawTarget : (template && (template as any).target);
      if (typeof providedTarget === 'string') {
        console.warn('Portal target is not a valid DOM element', { rawTarget: providedTarget, target, template, vnode });
      } else {
        console.warn('Portal missing target or template', { target: providedTarget ?? rawTarget, template, children: vnode.children, vnode });
      }
      return;
    }
    
    // If no template but has children, use children as portal content
    if (!template && (!vnode.children || vnode.children.length === 0)) {
      console.warn('Portal missing target or template', { target, template, children: vnode.children, vnode });
      return;
    }
    
    // Use internal registry to find/create the container
    const existing = this.portalRegistry.get(portalId);
    const targetChanged = !!existing && existing.target !== target;

    if (existing && targetChanged) {
      // Move existing container to new target instead of recreating
      if (existing.container.parentNode) {
        existing.container.parentNode.removeChild(existing.container);
      }
      target.appendChild(existing.container);
      this.portalRegistry.set(portalId, { target, container: existing.container, host: (wip.parent?.domNode as HTMLElement) || (this.currentContainer as HTMLElement) });
      // Update content in the moved container
      this.updatePortalContent(wip, vnode, template, existing.container);
      return;
    }

    let portalContainer: HTMLElement;
    if (!existing) {
      portalContainer = document.createElement('div');
      portalContainer.style.position = 'relative';
      target.appendChild(portalContainer);
      this.portalRegistry.set(portalId, { target, container: portalContainer, host: (wip.parent?.domNode as HTMLElement) || (this.currentContainer as HTMLElement) });
      // Initial render
      portalContainer.innerHTML = '';
      this.renderPortalContent(vnode, template, portalContainer);
    } else {
      portalContainer = existing.container;
      const isUpdate = wip.previousVNode !== null;
      if (isUpdate) {
        this.updatePortalContent(wip, vnode, template, portalContainer);
      } else {
        portalContainer.innerHTML = '';
        this.renderPortalContent(vnode, template, portalContainer);
      }
    }

    
  }
  
  /**
   * Render from template object
   */
  private renderFromTemplate(template: any, container: HTMLElement): void {
    if (!template || typeof template !== 'object') {
      console.warn('[PortalManager] Invalid template:', template);
      return;
    }
    
    if (template.tag) {
      const element = document.createElement(template.tag);
      
      // Set attributes
      if (template.attrs) {
        for (const [key, value] of Object.entries(template.attrs)) {
          if (key === 'className') {
            element.setAttribute('class', String(value));
          } else {
            element.setAttribute(key, String(value));
          }
        }
      }
      
      // Set text content
      if (template.text !== undefined) {
        element.textContent = String(template.text);
      }
      
      container.appendChild(element);
      
    }
  }

  /**
   * Update portal
   */
  public updatePortal(prevVNode: VNode, nextVNode: VNode, container: HTMLElement, context: ReconcileContext, wip: DOMWorkInProgress): void {
    // Delegate to insertPortal which handles both create and update via registry
    this.insertPortal(nextVNode, context, wip);
  }

  /**
   * Cleanup portal - only use registry-based cleanup for precise removal
   */
  public cleanupPortal(vnode: VNode, context: ReconcileContext): void {
    const portalId = this.vnodeToPortalId.get(vnode);
    if (!portalId) {
      return;
    }
    
    const entry = this.portalRegistry.get(portalId);
    if (!entry) {
      this.vnodeToPortalId.delete(vnode);
      return;
    }
    
    
    if (entry.container.parentNode) {
      entry.container.parentNode.removeChild(entry.container);
    }
    
    this.portalRegistry.delete(portalId);
    this.vnodeToPortalId.delete(vnode);
  }

  /**
   * Render portal content into container
   */
  private renderPortalContent(vnode: VNode, template: any, portalContainer: HTMLElement): void {
    
    
    if (vnode.children && vnode.children.length > 0) {
      for (const child of vnode.children) {
        if (typeof child === 'object' && child !== null) {
          const contentVNode = child as VNode;
          
          
          if (contentVNode.tag) {
            const portalElement = this.createElement(contentVNode, portalContainer);
            if (portalElement) {
              portalContainer.appendChild(portalElement);
              
              // 텍스트 처리와 자식 렌더링을 함께 처리
              if (contentVNode.children && contentVNode.children.length > 0) {
                this.renderPortalChildren(portalElement, contentVNode.children);
              } else {
                // 자식이 없으면 텍스트만 처리
                this.processTextContent(contentVNode, portalElement);
              }
            }
          } else if (contentVNode.text !== undefined) {
            const textNode = document.createTextNode(String(contentVNode.text));
            portalContainer.appendChild(textNode);
          }
        } else if (typeof child === 'string' || typeof child === 'number') {
          const textNode = document.createTextNode(String(child));
          portalContainer.appendChild(textNode);
        }
      }
    }
    
    if ((!vnode.children || vnode.children.length === 0) && template) {
      
      this.renderFromTemplate(template, portalContainer);
    }
  }

  /**
   * Update portal content (only this portal's content, not other portals in same target)
   */
  private updatePortalContent(wip: DOMWorkInProgress, vnode: VNode, template: any, portalContainer: HTMLElement): void {
    const prevVNode = wip.previousVNode;
    const hasChildrenChanged = JSON.stringify(prevVNode?.children) !== JSON.stringify(vnode.children);
    const prevTemplate = prevVNode?.portal?.template || prevVNode?.attrs?.template;
    const hasTemplateChanged = JSON.stringify(prevTemplate) !== JSON.stringify(template);
    
    
    
    if (hasChildrenChanged || hasTemplateChanged) {
      
      portalContainer.innerHTML = '';
      this.renderPortalContent(vnode, template, portalContainer);
    } else {
      
    }
  }

  // Assign or reuse a stable internal portal ID without relying on DOM
  private getOrAssignPortalId(nextVNode: VNode, prevVNode?: VNode): string {
    // Reuse if already assigned for this vnode
    const existingForNext = this.vnodeToPortalId.get(nextVNode);
    if (existingForNext) return existingForNext;

    // If linked to previous vnode (matched by reconcile), reuse its id
    if (prevVNode) {
      const prevId = this.vnodeToPortalId.get(prevVNode);
      if (prevId) {
        this.vnodeToPortalId.set(nextVNode, prevId);
        return prevId;
      }
    }

    // Prefer explicit portalId from vnode if provided
    const providedId = nextVNode.portal?.portalId as string | undefined;
    if (providedId) {
      this.vnodeToPortalId.set(nextVNode, providedId);
      return providedId;
    }

    // Derive from target when available to ensure different targets don't collide
    const rawTarget: any = (nextVNode.portal?.target || (nextVNode as any).attrs?.target);
    if (typeof rawTarget === 'string' && rawTarget) {
      const safe = String(rawTarget).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
      const idFromTarget = `portal-${safe}`;
      this.vnodeToPortalId.set(nextVNode, idFromTarget);
      return idFromTarget;
    }
    if (rawTarget && typeof rawTarget === 'object' && (rawTarget as HTMLElement) instanceof HTMLElement) {
      const el = rawTarget as HTMLElement;
      const existing = this.targetToPortalId.get(el);
      if (existing) {
        this.vnodeToPortalId.set(nextVNode, existing);
        return existing;
      }
      const newId = `portal-el-${Math.random().toString(36).slice(2, 10)}`;
      this.targetToPortalId.set(el, newId);
      this.vnodeToPortalId.set(nextVNode, newId);
      return newId;
    }

    // Create stable ID based on template content (not target, since target can change)
    const template = nextVNode.portal?.template || nextVNode.attrs?.template;
    if (template && typeof template === 'object') {
      // Avoid JSON.stringify on potential circular structures; use a shallow stable descriptor
      try {
        const shallowKeys = Object.keys(template).sort();
        const descriptor = shallowKeys.map(k => `${k}`).join('|');
        const stableId = `portal-${descriptor.slice(0, 32)}`;
        this.vnodeToPortalId.set(nextVNode, stableId);
        return stableId;
      } catch {
        // fall through to counter-based id
      }
    }

    // Final fallback - use a simple counter
    const newId = `portal-${Math.random().toString(36).slice(2, 10)}`;
    this.vnodeToPortalId.set(nextVNode, newId);
    return newId;
  }

  /**
   * Create DOM element from VNode
   */
  private createElement(vnode: VNode, parentElement?: HTMLElement): HTMLElement | null {
    if (!vnode.tag) {
      return null;
    }

    const element = document.createElement(vnode.tag);
    
    // Set attributes
    if (vnode.attrs) {
      for (const [key, value] of Object.entries(vnode.attrs)) {
        if (shouldSkipAttribute(element, key)) {
          continue;
        }
        
        if (value !== null && value !== undefined) {
          // Handle className specially
          if (key === 'className') {
            element.className = String(value);
          } else {
            // Use namespace-aware attribute setting
            setAttributeWithNamespace(element, key, value);
          }
        }
      }
    }
    
    // Set styles
    if (vnode.style) {
      for (const [key, value] of Object.entries(vnode.style)) {
        const cssProperty = key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
        element.style.setProperty(cssProperty, String(value));
      }
    }
    
    return element;
  }

  /**
   * Process text content for VNode
   */
  private processTextContent(vnode: VNode, domNode: HTMLElement): void {
    let textContent = '';

    // 1. vnode.text 속성이 있으면 우선 사용
    if (vnode.text !== undefined) {
      textContent = String(vnode.text);
    }
    // 2. children에서 텍스트 노드들 찾기 (직접적인 텍스트 노드만)
    else if (vnode.children) {
      const textChildren = vnode.children.filter(child =>
        typeof child === 'string' || typeof child === 'number' ||
        (typeof child === 'object' && child !== null && child.text !== undefined && !child.tag)
      );

      if (textChildren.length > 0) {
        textContent = textChildren
          .map(child => {
            if (typeof child === 'string' || typeof child === 'number') {
              return String(child);
            } else if (typeof child === 'object' && child !== null && child.text !== undefined && !child.tag) {
              return String(child.text);
            }
            return '';
          })
          .join('');
      }
    }

    // 텍스트 콘텐츠가 있으면 DOM 요소에 설정
    if (textContent) {
      domNode.textContent = textContent;
    }
  }

  /**
   * Render portal children
   */
  private renderPortalChildren(parentElement: HTMLElement, children: (VNode | string | number)[]): void {
    for (const child of children) {
      if (typeof child === 'object' && child !== null) {
        const childVNode = child as VNode;
        
        if (childVNode.tag) {
          const childElement = this.createElement(childVNode, parentElement);
          if (childElement) {
            this.processTextContent(childVNode, childElement);
            parentElement.appendChild(childElement);
            
            // Recursively render children
            if (childVNode.children && childVNode.children.length > 0) {
              this.renderPortalChildren(childElement, childVNode.children);
            }
          }
        } else if (childVNode.text !== undefined) {
          const textNode = document.createTextNode(String(childVNode.text));
          parentElement.appendChild(textNode);
        }
      } else if (typeof child === 'string' || typeof child === 'number') {
        const textNode = document.createTextNode(String(child));
        parentElement.appendChild(textNode);
      }
    }
  }

  /**
   * Insert DOM node into the tree
   */
  private insertDOMNode(node: Node, wip: DOMWorkInProgress, container?: HTMLElement): void {
    // DOM 노드를 WIP에만 설정하고, 실제 DOM 추가는 finalizeDOMUpdate에서 처리
    wip.domNode = node;
  }

  /**
   * Current container reference (should be injected from DOMReconcile)
   */
  private currentContainer: HTMLElement | null = null;

  /**
   * Set current container
   */
  public setCurrentContainer(container: HTMLElement | null): void {
    this.currentContainer = container;
  }
}
