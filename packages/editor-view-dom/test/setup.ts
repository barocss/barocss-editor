import { vi } from 'vitest';

// 실제 Selection API를 사용하도록 설정
// jsdom 환경에서는 기본적으로 Selection API가 제공되므로 mock을 제거

// Mock document.execCommand
Object.defineProperty(document, 'execCommand', {
  writable: true,
  value: vi.fn(() => true)
});

// requestAnimationFrame 폴리필 (테스트 환경용)
// setTimeout을 사용하여 비동기적으로 실행 (테스트에서 await new Promise(resolve => requestAnimationFrame(resolve)) 사용 가능)
if (typeof global.requestAnimationFrame === 'undefined') {
  let rafId = 0;
  global.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    // setTimeout을 사용하여 비동기적으로 실행 (테스트 환경)
    // 0ms로 설정하여 가능한 한 빨리 실행
    const id = setTimeout(() => {
      callback(performance.now());
    }, 0);
    return id as any;
  }) as typeof requestAnimationFrame;
  
  global.cancelAnimationFrame = ((id: number) => {
    clearTimeout(id);
  }) as typeof cancelAnimationFrame;
}

// Mock DataTransfer
global.DataTransfer = class DataTransfer {
  private data = new Map<string, string>();

  setData(format: string, data: string): void {
    this.data.set(format, data);
  }

  getData(format: string): string {
    return this.data.get(format) || '';
  }
} as any;

// Mock ClipboardEvent
global.ClipboardEvent = class ClipboardEvent extends Event {
  public clipboardData: DataTransfer;

  constructor(type: string, eventInitDict?: ClipboardEventInit) {
    super(type, eventInitDict);
    this.clipboardData = eventInitDict?.clipboardData || new DataTransfer();
  }
} as any;
