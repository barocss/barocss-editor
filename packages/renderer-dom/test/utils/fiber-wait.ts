/**
 * Fiber 작업이 완료될 때까지 기다리는 유틸리티
 * 
 * Fiber는 비동기로 처리되므로, 테스트에서 DOM을 확인하기 전에
 * Fiber 작업이 완료될 때까지 기다려야 합니다.
 */

/**
 * Fiber 작업이 완료될 때까지 기다립니다.
 * 
 * @param timeout - 최대 대기 시간 (ms). 기본값: 200ms
 * @returns Promise that resolves when Fiber work is complete
 */
export async function waitForFiber(timeout: number = 200): Promise<void> {
  // In test environment, simply waiting for a short time is more stable.
  // Since Fiber is processed asynchronously, wait for microtasks and next event loop.
  
  // Wait until microtask queue is empty
  await new Promise(resolve => queueMicrotask(resolve));
  await new Promise(resolve => queueMicrotask(resolve));
  
  // Wait for next event loop
  await new Promise(resolve => setTimeout(resolve, 0));
  
  // Wait for microtasks one more time
  await new Promise(resolve => queueMicrotask(resolve));
  
  // Use requestAnimationFrame if available (browser environment)
  if (typeof requestAnimationFrame !== 'undefined') {
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  
  // Finally wait for a short time (to ensure DOM updates are complete)
  await new Promise(resolve => setTimeout(resolve, 20));
  
  // Wait for microtasks one more time
  await new Promise(resolve => queueMicrotask(resolve));
}

/**
 * DOM이 업데이트될 때까지 기다립니다.
 * 
 * @param container - DOM 컨테이너
 * @param condition - 조건 함수 (true를 반환하면 대기 종료)
 * @param timeout - 최대 대기 시간 (ms). 기본값: 100ms
 * @returns Promise that resolves when condition is met
 */
export async function waitForDOMUpdate(
  container: HTMLElement,
  condition: (container: HTMLElement) => boolean,
  timeout: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (condition(container)) {
      return;
    }
    await new Promise(resolve => {
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(resolve);
      } else {
        setTimeout(resolve, 10);
      }
    });
  }
}

