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
     * **스타일 문도 진입점이다.**
     *
     * `package.json` 이 `"./text.css": "./dist/text.css"` 를 발행하는데 `vite` 는 `.ts` 진입점이
     * `import` 하지 않는 `.css` 를 **복사하지 않는다.** 워크스페이스에서는 `exports` 가
     * `src/text.css` 를 직접 가리키므로 보이지 않고, 발행된 뒤에만 깨진다 — 코드 문에 대해 바로
     * 위 주석이 말하는 것과 **같은 결함**이다.
     *
     * 그래서 같은 곳에 적는다: `lib.entry` 의 키가 나오는 파일 이름이므로 `'text.css'` 라고 쓰면
     * `dist/text.css` 가 그대로 나오고, CSS 만 든 진입점은 빈 JS 청크를 남기지 않는다. 문 하나가
     * 한 줄이고, 코드 문과 스타일 문이 **한 목록**에 있다 — 검사가 둘을 같은 자리에서 셀 수 있다.
     */
    /*
     * 라이브러리 빌드는 기본이 `cssCodeSplit: false` 이고, 그러면 CSS 진입점이 거부된다
     * ("rollupOptions.input should not include CSS files"). 켜도 JS 출력은 바뀌지 않는다 — 이
     * 패키지의 `.ts` 진입점 중 CSS 를 `import` 하는 것이 하나도 없기 때문이다.
     */
    cssCodeSplit: true,
    lib: {
      entry: {
        index: 'src/index.ts',
        'text.css': 'src/text.css',
      },
      name: 'BarocssOfficeText',
      formats: ['es'],
    },
    rollupOptions: {
      external: [],
    },
  },
});
