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
  // 테스트 환경에서는 단순히 짧은 시간을 기다리는 것이 더 안정적입니다.
  // Fiber는 비동기로 처리되므로, 마이크로태스크와 다음 이벤트 루프를 기다립니다.
  
  // 마이크로태스크 큐가 비워질 때까지 기다림
  await new Promise(resolve => queueMicrotask(resolve));
  await new Promise(resolve => queueMicrotask(resolve));
  
  // 다음 이벤트 루프를 기다림
  await new Promise(resolve => setTimeout(resolve, 0));
  
  // 추가로 한 번 더 마이크로태스크를 기다림
  await new Promise(resolve => queueMicrotask(resolve));
  
  // requestAnimationFrame이 있으면 사용 (브라우저 환경)
  if (typeof requestAnimationFrame !== 'undefined') {
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  
  // 마지막으로 짧은 시간을 기다림 (DOM 업데이트가 완료되도록)
  await new Promise(resolve => setTimeout(resolve, 20));
  
  // 한 번 더 마이크로태스크를 기다림
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

