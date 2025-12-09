/**
 * Vitest 테스트 설정 파일
 * 
 * 모든 테스트가 실행되기 전에 이 파일이 실행됩니다.
 * FiberScheduler가 동기 모드로 작동하도록 환경을 설정합니다.
 */

// Explicitly set Vitest environment variables
if (typeof process !== 'undefined') {
  process.env.VITEST = 'true';
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
}

// Set vitest flag on globalThis
if (typeof globalThis !== 'undefined') {
  (globalThis as any).vitest = true;
  (globalThis as any).__vitest__ = true;
}

