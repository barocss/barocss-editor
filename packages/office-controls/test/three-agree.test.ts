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
   * **본문은 셀을 두 개 고를 수 없습니다.** Merging needs a *range of cells*, and a note's click has
   * two answers — a caret in a cell, or the table held as one block — with no third for *these two
   * cells*. Splitting needs a merged cell, which follows.
   *
   * The other three have a canvas or a page under the table and a marquee that can cross cells; a
   * body has neither. Offering the command anyway would be a button that is never enabled, which is
   * the failure this suite has recorded as *guard says yes, then does nothing* three times over.
   */
  'office-note:mergeCells': '본문에는 셀 두 개를 고르는 제스처가 없습니다 — 켜지지 않을 단추',
  'office-note:splitCell': '합친 셀이 없으면 나눌 것도 없습니다 — mergeCells 와 한 쌍'
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
