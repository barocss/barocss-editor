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
     *
     * **스타일 문도 마찬가지다.** `vite` 는 `.ts` 진입점이 `import` 하지 않는 `.css` 를 복사하지
     * 않으므로, `./ui.css` 도 여기 적혀야 발행된 패키지에 들어간다. `lib.entry` 의 키가 곧 나오는
     * 파일 이름이라 `'ui.css'` 는 `dist/ui.css` 로 나오고, CSS 만 든 진입점은 빈 JS 청크를 남기지
     * 않는다. 라이브러리 빌드의 기본값 `cssCodeSplit: false` 는 CSS 진입점을 거부하므로 켠다 —
     * 이 패키지의 `.ts` 진입점 중 CSS 를 `import` 하는 것이 없어서 JS 출력은 그대로다.
     */
    cssCodeSplit: true,
    lib: {
      entry: {
        index: 'src/index.ts',
        ui: 'src/ui.ts',
        'ui.css': 'src/ui.css',
      },
      name: 'BarocssOfficeSite',
      formats: ['es'],
    },
    rollupOptions: {
      external: [],
    },
  },
});
