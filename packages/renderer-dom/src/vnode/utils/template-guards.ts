/**
 * Template Type Guards
 * 
 * Type guard functions for checking template types (ElementTemplate, ComponentTemplate, etc.)
 */

import { 
  ComponentTemplate, 
  DataTemplate, 
  EachTemplate, 
  ConditionalTemplate, 
  PortalTemplate,
  ElementTemplate,
  SlotTemplate,
  ExternalComponent
} from '@barocss/dsl';

/**
 * ElementTemplate인지 확인 (타입 가드)
 */
export function isElementTemplate(c: any): c is ElementTemplate {
  return c && typeof c === 'object' && 'type' in c && c.type === 'element';
}

/**
 * ComponentTemplate인지 확인 (타입 가드)
 */
export function isComponentTemplate(c: any): c is ComponentTemplate {
  return c && typeof c === 'object' && 'type' in c && c.type === 'component';
}

/**
 * DataTemplate인지 확인 (타입 가드)
 */
export function isDataTemplate(c: any): c is DataTemplate {
  return c && typeof c === 'object' && 'type' in c && c.type === 'data';
}

/**
 * ExternalTemplate인지 확인
 * ExternalTemplate은 type이 'external'이거나 mount 함수를 가진 객체입니다.
 */
export function isExternalTemplate(tmpl: any): boolean {
  return !!(tmpl && ((tmpl as any).type === 'external' || typeof (tmpl as any).mount === 'function'));
}

/**
 * SlotTemplate인지 확인 (타입 가드)
 */
export function isSlotTemplate(c: any): c is SlotTemplate {
  return c && typeof c === 'object' && 'type' in c && c.type === 'slot';
}

/**
 * EachTemplate인지 확인 (타입 가드)
 */
export function isEachTemplate(c: any): c is EachTemplate {
  return c && typeof c === 'object' && 'type' in c && c.type === 'each';
}

/**
 * ConditionalTemplate인지 확인 (타입 가드)
 */
export function isConditionalTemplate(c: any): c is ConditionalTemplate {
  return c && typeof c === 'object' && 'type' in c && c.type === 'conditional';
}

/**
 * PortalTemplate인지 확인 (타입 가드)
 */
export function isPortalTemplate(c: any): c is PortalTemplate {
  return c && typeof c === 'object' && 'type' in c && c.type === 'portal';
}

/**
 * ComponentTemplate with component function인지 확인 (타입 가드)
 */
export function isComponentTemplateWithFunc(t: any): t is ComponentTemplate {
  return t && typeof t === 'object' && 'type' in t && t.type === 'component' && typeof t.component === 'function';
}

/**
 * ExternalComponent인지 확인 (타입 가드)
 * ExternalComponent는 mount 함수를 가진 객체입니다.
 */
export function isExternalComponent(t: any): t is ExternalComponent {
  return t && typeof t.mount === 'function';
}

