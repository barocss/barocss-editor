import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

/**
 * **이 패키지는 빌드된 적이 없었다.**
 *
 * `package.json` 은 `"build": "vite build"` 를 적고 `publishConfig` 는 `./dist/index.js` 와
 * `./dist/tokens.css` 를 발행한다고 말하는데, `vite.config.ts` 가 **없었다.** 설정 없는
 * `vite build` 는 앱 빌드로 떨어져 `index.html` 을 찾다가 죽는다:
 *
 * ```
 * error during build:
 * Could not resolve entry module "index.html".
 * ```
 *
 * 그래서 `@barocss/office-ui` 는 발행되면 `dist` 가 통째로 없다 — 코드도, 토큰도. 워크스페이스
 * 안에서는 `exports` 가 `src/*` 를 직접 가리키므로 아무도 몰랐고, `pnpm -r build` 는 이 패키지에서
 * 빨간 줄을 내면서도 나머지가 초록이라 묻혔다.
 *
 * 형제 넷(`office-note`·`office-site`·`office-slides`·`office-word`)과 같은 모양으로 적는다.
 */
export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    /*
     * 라이브러리 빌드는 기본이 `cssCodeSplit: false` 이고, 그러면 CSS 진입점이 거부된다
     * ("rollupOptions.input should not include CSS files"). 켜도 JS 출력은 바뀌지 않는다 — 이
     * 패키지의 `.ts` 진입점 중 CSS 를 `import` 하는 것이 하나도 없기 때문이다.
     */
    cssCodeSplit: true,
    /*
     * **진입점 전부를 빌드한다** — 코드 문과 스타일 문을 한 목록에.
     *
     * `vite` 는 `.ts` 진입점이 `import` 하지 않는 `.css` 를 복사하지 않으므로, `./tokens.css` 는
     * 여기 적혀야 `dist` 에 들어간다. `lib.entry` 의 키가 곧 나오는 파일 이름이라 `'tokens.css'` 는
     * `dist/tokens.css` 로 나오고, CSS 만 든 진입점은 빈 JS 청크를 남기지 않는다.
     */
    lib: {
      entry: {
        index: 'src/index.ts',
        'tokens.css': 'src/tokens.css',
      },
      name: 'BarocssOfficeUi',
      formats: ['es'],
    },
    rollupOptions: {
      external: [],
    },
  },
});
