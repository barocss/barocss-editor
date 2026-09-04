import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **셋이 선언하고 하나가 안 하는 명령.**
 *
 * ## 이 검사가 찾는 결함
 *
 * The suite's dominant failure this year has not been *missing* — it has been **present and
 * unreachable**. Six table operations sat in `@barocss/model` while a note had no way to run them;
 * `Control` in this very package carried a header saying *a product extends it rather than copying
 * it* while two of four copied it; `useEditorRevision` named the condition for extracting itself and
 * six more hand-written copies existed anyway.
 *
 * Every one of those was found by hand, late. This is the cheapest of those questions asked as a
 * check: **when three products declare a command and the fourth does not, say so.**
 *
 * ## 왜 셋인가
 *
 * Two is a coincidence and four is unanimity. Three is the number at which *this is what a product
 * of this suite offers* has stopped being one product's opinion — and the fourth is either behind or
 * deliberately different, which are exactly the two answers worth writing down.
 *
 * ## 무엇을 잡았나 — 이 검사를 쓴 그 날의 것
 *
 * `office-note` grew `addNoteRow` · `removeNoteRow` · `addNoteColumn` · `removeNoteColumn` on the
 * day this was written, while `insertRowAbove` · `insertRowBelow` · `deleteRow` · `insertColumnLeft`
 * · `insertColumnRight` · `deleteColumn` already existed in `@barocss/extensions` and **all three
 * other products already declared them**. Four new commands over six that were there, found by
 * hand two hours later and only because the sweep was run.
 *
 * ## 선언만 읽습니다
 *
 * A product's `*-model.ts` files — the toolbar, the menus, the panel, the keys. Not its command
 * registrations: what this asks is *what does this product offer a reader*, and a command a product
 * registers and never surfaces is `every-command-can-be-reached`'s question, not this one.
 */
const MODELS = ['toolbar-model', 'menu-model', 'panel-model', 'keys', 'block-model'];

const declaredBy = (pkg: string): Set<string> => {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'test') continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!MODELS.some((one) => entry.includes(one))) continue;
      for (const hit of readFileSync(path, 'utf8').matchAll(/command:\s*'([a-zA-Z]+)'/g)) out.add(hit[1]);
    }
  };
  walk(join(__dirname, '..', '..', pkg, 'src'));
  return out;
};

/**
 * What a product may be missing on purpose, with the reason — the same shape the conformance
 * harness uses, and for the same reason: an exemption is a claim, and a claim that goes stale is a
 * finding the day it does.
 */
const EXEMPT: Record<string, string> = {
  /*
   * Word has neither, and it is a decision rather than a gap: a Word document's picture is inserted
   * through the file dialog its own ribbon owns, and a document that cannot play a film has no word
   * for one — the same argument `office-schema` makes for leaving `mediaVideo` out entirely.
   */
  'office-word:insertPicture': '문서의 그림은 리본의 파일 대화상자가 넣습니다 — 다른 셋과 다른 제스처',
  'office-word:insertVideo': '재생할 수 없는 문서에는 영상이라는 말이 없습니다 — office 스키마의 결정',
  /*
   * **여기 있던 면제 둘이 지워졌습니다 — 그리고 그것이 이 검사의 값입니다.**
   *
   * 적힌 이유는 *"본문은 셀을 두 개 고를 수 없다 — 나머지 셋은 표 아래에 캔버스나 페이지가 있고 셀을
   * 가로지르는 마퀴가 있지만 본문에는 둘 다 없다"* 였습니다. 두 문장 다 틀렸습니다.
   *
   * 셀을 가로질러 끄는 제스처는 379줄로 쓰여 있었고 마퀴가 아니라 표 안의 드래그였습니다 —
   * `installCellSelection`. 마퀴가 필요하다고 본 것이 착각이고, 그것 때문에 *캔버스가 없으니 못
   * 한다* 는 결론이 나왔습니다. 진짜 이유는 그 제스처가 **`office-word` 안에 있었다**는 것뿐입니다.
   *
   * 그리고 그것을 옮기고 나서도 안 됐습니다: `extensions/table.ts` 의 `_selectedCellRange` 가
   * `cell` 선택을 못 알아봤습니다 — `cell` 은 이 명령 하나를 위해 있는 선택 종류인데. Word 에서
   * 되던 것은 `office-word/table-commands.ts` 가 양 끝 셀 id 를 따로 넘겨 준 덕이었습니다.
   *
   * 면제는 주장이고, 주장이 상하면 그날이 발견입니다 — 이 파일의 머리에 적힌 그대로입니다.
   */
};

describe('셋이 선언하고 하나가 안 하는 명령', () => {
  it('names a product that is behind the other three, or the reason it is not', () => {
    const products = ['office-word', 'office-slides', 'office-site', 'office-note'];
    const declared = new Map(products.map((one) => [one, declaredBy(one)]));

    const every = new Set<string>();
    for (const one of declared.values()) for (const command of one) every.add(command);

    const found: string[] = [];
    for (const command of [...every].sort()) {
      const has = products.filter((one) => declared.get(one)!.has(command));
      if (has.length !== 3) continue;
      const missing = products.find((one) => !has.includes(one))!;
      if (EXEMPT[`${missing}:${command}`]) continue;
      found.push(`${missing} 에 ${command} 이 없습니다 — 나머지 셋은 선언합니다`);
    }

    expect(found, found.join('\n')).toEqual([]);
  });

  it('keeps the exemptions honest — one that has stopped being true is a finding', () => {
    /*
     * The failure mode an exemption list has: a product grows the thing, nobody removes the note, and
     * the list becomes a place where claims go to stop being read. So the list is checked from the
     * other side too.
     */
    const products = ['office-word', 'office-slides', 'office-site', 'office-note'];
    const declared = new Map(products.map((one) => [one, declaredBy(one)]));

    const stale = Object.keys(EXEMPT).filter((key) => {
      const [product, command] = key.split(':');
      return declared.get(product)?.has(command) === true;
    });
    expect(stale, `${stale.join(', ')} — 이제 선언합니다, 면제를 지우세요`).toEqual([]);
  });
});
