/**
 * Type Check Utilities
 * 
 * General type checking utility functions
 */

/**
 * 함수인지 확인합니다.
 */
export function isFunction(value: any): value is Function {
  return typeof value === 'function';
}

/**
 * 문자열인지 확인합니다.
 */
export function isString(value: any): value is string {
  return typeof value === 'string';
}

/**
 * 숫자인지 확인합니다.
 */
export function isNumber(value: any): value is number {
  return typeof value === 'number';
}

/**
 * 문자열 또는 숫자인지 확인합니다.
 */
export function isStringOrNumber(value: any): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

/**
 * 객체인지 확인합니다 (null 제외).
 */
export function isObject(value: any): value is object {
  return typeof value === 'object' && value !== null;
}

/**
 * 불리언인지 확인합니다.
 */
export function isBoolean(value: any): value is boolean {
  return typeof value === 'boolean';
}

/**
 * 정의된 값인지 확인합니다 (undefined와 null이 아님).
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

/**
 * null 또는 undefined인지 확인합니다.
 */
export function isNullOrUndefined(value: any): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * 비어있지 않은 배열인지 확인합니다.
 */
export function isNonEmptyArray<T>(value: any): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * 이벤트 핸들러인지 확인합니다 (on으로 시작하는 키이고 함수인 경우).
 */
export function isEventHandler(key: string, value: any): value is Function {
  return key.startsWith('on') && isFunction(value);
}

/**
 * 스타일 객체인지 확인합니다 (객체이고 배열이 아닌 경우).
 */
export function isStyleObject(value: any): value is Record<string, any> {
  return isObject(value) && !Array.isArray(value);
}

