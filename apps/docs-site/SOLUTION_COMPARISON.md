# 모노레포 문서 도구 비교

## Storybook vs Docusaurus vs VitePress

### Storybook이 가능한 이유
- **완전한 webpack 커스터마이징**: `.storybook/main.js`에서 webpack 설정을 자유롭게 수정 가능
- **TypeScript 소스 직접 처리**: 설정만 잘 하면 모노레포 TypeScript 소스를 직접 사용 가능
- **유연한 설정**: 모든 빌드 도구 설정을 제어할 수 있음

### Docusaurus가 어려운 이유 (하지만 가능함!)
- **제한적인 webpack 설정**: `docusaurus.config.ts`의 webpack 설정이 제한적
- **하지만 해결책 존재**: `tsconfig-paths-webpack-plugin` 사용
- **최신 버전 제약**: Docusaurus 3.x에서는 webpack 설정 방식이 변경됨

### VitePress가 쉬운 이유
- **Vite 기반**: Vite는 모노레포 TypeScript를 기본적으로 잘 처리
- **간단한 설정**: `vite.config.ts`에서 alias만 설정하면 됨
- **빠른 개발**: HMR이 빠르고 설정이 간단

## 해결 방법

### 방법 1: Docusaurus + tsconfig-paths-webpack-plugin (추천)

```bash
pnpm add -D tsconfig-paths-webpack-plugin
```

```typescript
// docusaurus.config.ts
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';

export default {
  webpack: {
    jsLoader: (isServer) => ({
      loader: require.resolve('esbuild-loader'),
      options: {
        loader: 'tsx',
        target: isServer ? 'node12' : 'es2017',
      },
    }),
    configure: (webpackConfig) => {
      webpackConfig.resolve.plugins = [
        ...(webpackConfig.resolve.plugins || []),
        new TsconfigPathsPlugin({
          configFile: path.resolve(__dirname, './tsconfig.json'),
        }),
      ];
      return webpackConfig;
    },
  },
};
```

### 방법 2: VitePress로 전환 (가장 간단)

VitePress는 Vite 기반이라 모노레포 TypeScript를 기본적으로 잘 처리합니다.

```typescript
// .vitepress/config.ts
import { defineConfig } from 'vitepress';
import { resolve } from 'path';

export default defineConfig({
  vite: {
    resolve: {
      alias: {
        '@barocss/datastore': resolve(__dirname, '../../packages/datastore/src'),
        // ... 다른 패키지들
      },
    },
  },
});
```

## 권장 사항

**현재 상황에서는:**
1. **Docusaurus 유지 + 플러그인 사용** (이미 Docusaurus로 시작했으므로)
2. **또는 VitePress로 전환** (더 간단하지만 처음부터 다시 시작)

어떤 방식을 선호하시나요?
