import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    /*
     * **진입점 전부를 빌드한다.** `package.json` 의 `exports` 가 문을 둘 이상 열어 두는데 빌드가
     * `index.ts` 하나만 내면, **발행된 패키지에서 그 문들이 아무 데도 안 닿는다.** 소스로 쓰는
     * 워크스페이스 안에서는 보이지 않는다 — `exports` 가 `src/*.ts` 를 직접 가리키기 때문이다.
     */
    lib: {
      entry: {
        index: 'src/index.ts',
        ui: 'src/ui.ts',
      },
      name: 'BarocssOfficeWord',
      formats: ['es'],
    },
    rollupOptions: {
      external: [],
    },
  },
});
