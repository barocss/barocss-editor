/**
 * 플랫폼 감지 유틸리티
 * 
 * 브라우저 환경에서 실행 중인 OS를 감지합니다.
 */

/**
 * macOS 여부
 */
export const IS_MAC: boolean = (() => {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform.toUpperCase();
  const userAgent = navigator.userAgent.toUpperCase();
  return platform.indexOf('MAC') >= 0 || userAgent.indexOf('MAC') >= 0;
})();

/**
 * Linux 여부
 */
export const IS_LINUX: boolean = (() => {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform.toUpperCase();
  return platform.indexOf('LINUX') >= 0;
})();

/**
 * Windows 여부
 */
export const IS_WINDOWS: boolean = (() => {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform.toUpperCase();
  const userAgent = navigator.userAgent.toUpperCase();
  return platform.indexOf('WIN') >= 0 || userAgent.indexOf('WIN') >= 0;
})();

