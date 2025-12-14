# 모노레포 + Docusaurus 근본 문제 분석

## 현재 상황

### 1. 패키지 구조
- 모든 패키지가 `main: "./src/index.ts"`로 설정 (개발 중 소스 직접 사용)
- `publishConfig`에는 `dist/index.js`로 설정 (배포 시 빌드된 파일)
- **문제**: Docusaurus는 개발 중에도 빌드된 파일을 기대하거나, TypeScript를 직접 처리해야 함

### 2. Docusaurus의 한계
- Docusaurus는 webpack을 사용
- webpack이 모노레포의 TypeScript 소스를 직접 번들링하는 것은 복잡함
- 특히 `.js` 확장자로 import하지만 실제로는 `.ts` 파일인 경우 해석 실패

## 모노레포에서 Docusaurus 사용 가능 여부

**답: 가능하지만, 올바른 설정이 필요함**

### 일반적인 해결 방법들

#### 옵션 1: 모든 패키지를 먼저 빌드 (권장)
```bash
# 1. 모든 패키지 빌드
pnpm build

# 2. Docusaurus가 dist 파일을 사용하도록 설정
# package.json에서 main을 dist로 변경하거나
# tsconfig.json에서 path mapping 설정
```

**장점:**
- 가장 안정적
- 배포 환경과 동일
- webpack 설정 불필요

**단점:**
- 개발 중에도 빌드 필요
- 변경 시 재빌드 필요

#### 옵션 2: TypeScript Path Mapping + webpack 설정
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@barocss/*": ["../packages/*/src"]
    }
  }
}

// docusaurus.config.ts
webpack: {
  configure: (webpackConfig) => {
    // 복잡한 webpack 설정...
  }
}
```

**장점:**
- 소스 직접 사용 가능
- 빠른 개발 사이클

**단점:**
- 복잡한 설정
- webpack 버전 호환성 문제
- `.js` 확장자 import 문제 해결 어려움

#### 옵션 3: 데모를 별도 번들로 빌드 (현재 시도 중)
```bash
# 에디터 데모만 Vite로 별도 빌드
pnpm build:demo  # → static/editor-demo.iife.js

# Docusaurus는 이 번들을 정적 파일로 로드
```

**장점:**
- Docusaurus와 분리
- 에디터만 별도로 관리
- 간단한 구조

**단점:**
- 두 가지 빌드 시스템
- React 컴포넌트에서 동적 로딩 필요

## 권장 해결책

### 방법 A: 패키지 빌드 후 사용 (가장 안정적)

1. **개발 워크플로우:**
   ```bash
   # 패키지 변경 시
   pnpm build
   
   # Docusaurus 실행
   pnpm dev
   ```

2. **package.json 수정:**
   - 개발 중에도 `dist`를 사용하도록 설정
   - 또는 빌드 스크립트에서 자동으로 처리

### 방법 B: 에디터 데모만 별도 번들 (현재 접근)

1. **에디터 데모를 Vite로 빌드**
2. **Docusaurus는 정적 파일로 로드**
3. **React 컴포넌트에서 동적 스크립트 로딩**

## 결론

**모노레포에서 Docusaurus 사용은 가능하지만:**
- TypeScript 소스를 직접 사용하는 것은 복잡함
- **가장 실용적인 방법**: 패키지를 빌드하고 `dist` 사용
- **또는**: 데모/예제를 별도 번들로 분리

## 다음 단계 제안

1. **단기**: 에디터 데모를 별도 번들로 빌드하는 방식 완성
2. **장기**: 모든 패키지를 빌드하고 `dist`를 사용하도록 전환

어떤 방식을 선호하시나요?
